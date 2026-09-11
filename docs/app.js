(function () {
  "use strict";

  const state = {
    r: 1,
    y: "DD",
    z: "",
    roundingKind: "raw",
    roundingUnit: "tenth",
    roundingDirection: "floor",
    taxRates: { Win: 0, Exacta: 0, Trifecta: 0 },
    amount: "0",
    outcome: null,
    showProbability: true,
  };
  const mobileState = {
    distance: "M",
    pattern: "DD",
    outcome: null,
  };
  // Per-race records last for the lifetime of this page; calculator input/settings
  // remain shared. Never carry a confirmed result into a previously unseen race.
  const raceRecords = new Map();
  const DISTANCE_LABELS = Object.freeze({ S: "短距離", M: "中距離", L: "長距離" });
  const PATTERNS = Object.freeze(["D2", "DD"]);
  const JOKERS = Object.freeze(["", "J", "JJ"]);
  const WAGER_TYPES = Object.freeze(["Win", "Exacta", "Trifecta"]);
  const TAX_INPUT_IDS = Object.freeze({ Win: "win", Exacta: "exacta", Trifecta: "trifecta" });
  const WAGER_LABELS = Object.freeze({ Win: "単勝", Exacta: "2連単", Trifecta: "三連単" });
  const mobileMedia = typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 600px)")
    : { matches: false, addEventListener() {} };

  const oddsFormatters = new Map();
  let payoutSource = null;
  let payoutPhase = "closed";
  let payoutAnimating = false;

  function normalizeNumber(value) {
    if (Object.is(value, -0)) return "0";
    return Number(value.toPrecision(12)).toString();
  }

  function applyRounding(value, mode) {
    switch (mode) {
      case "floor-tenth": return Math.floor(value * 10) / 10;
      case "floor-half": return Math.floor(value * 2) / 2;
      case "floor-integer": return Math.floor(value);
      case "round-tenth": return Math.round((value + Number.EPSILON) * 10) / 10;
      case "round-half": return Math.round((value + Number.EPSILON) * 2) / 2;
      case "round-integer": return Math.round(value + Number.EPSILON);
      case "raw": return value;
      default: throw new Error(`Unknown rounding mode: ${mode}`);
    }
  }

  function getRoundingMode() {
    return state.roundingKind === "raw" ? "raw" : `${state.roundingDirection}-${state.roundingUnit}`;
  }

  function getOddsFractionDigits(mode) {
    if (mode === "raw") return 2;
    return mode.endsWith("integer") ? 0 : 1;
  }

  function formatOdds(originalOdds, taxRate, mode) {
    const taxAppliedValue = originalOdds * (1 - taxRate / 100);
    const fractionDigits = getOddsFractionDigits(mode);
    if (!oddsFormatters.has(fractionDigits)) {
      oddsFormatters.set(fractionDigits, new Intl.NumberFormat("en-US", {
        useGrouping: false,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }));
    }
    return oddsFormatters.get(fractionDigits).format(Number(normalizeNumber(applyRounding(taxAppliedValue, mode))));
  }

  function formatSelection(selection) {
    const symbols = document.createElement("span");
    symbols.className = "selection-symbols";
    for (const symbol of selection) {
      const token = document.createElement("span");
      token.className = `selection-symbol selection-symbol--${symbol === "D" ? "d" : "other"}`;
      token.textContent = symbol;
      symbols.append(token);
    }
    return symbols;
  }

  function getKey() {
    return `${R_TO_X[state.r]}${state.y}${state.z}`;
  }

  function getMobileKey() {
    return `${mobileState.distance}${mobileState.pattern}`;
  }

  function isMobileLayout() {
    return mobileMedia.matches;
  }

  function getActiveOutcome() {
    return isMobileLayout() ? mobileState.outcome : state.outcome;
  }

  function setActiveOutcome(outcome) {
    if (isMobileLayout()) mobileState.outcome = outcome;
    else state.outcome = outcome;
  }

  function getActiveRows() {
    const key = isMobileLayout() ? getMobileKey() : getKey();
    return ODDS_DATA[key] || [];
  }

  function updateAmountInputMode(input) {
    if (isMobileLayout()) {
      input.readOnly = false;
      input.removeAttribute("readonly");
      input.removeAttribute("tabindex");
      input.setAttribute("inputmode", "numeric");
      return;
    }
    input.readOnly = true;
    input.setAttribute("readonly", "");
    input.setAttribute("tabindex", "-1");
    input.removeAttribute("inputmode");
    if (document.activeElement === input) input.blur();
  }

  function prefersReducedMotion() {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function fitPayoutValue(element, minimumSize) {
    if (typeof window.getComputedStyle !== "function" || !element.scrollWidth || !element.parentElement?.clientWidth) return;
    element.style.removeProperty("font-size");
    const currentSize = Number.parseFloat(window.getComputedStyle(element).fontSize);
    const availableWidth = element.parentElement.clientWidth - 24;
    if (element.scrollWidth > availableWidth) {
      element.style.fontSize = `${Math.max(minimumSize, currentSize * availableWidth / element.scrollWidth)}px`;
    }
  }

  function fitPayoutValues() {
    fitPayoutValue(document.querySelector("#payout-stake"), 28);
    fitPayoutValue(document.querySelector("#payout-multiplier"), 28);
    fitPayoutValue(document.querySelector("#payout-total"), 40);
    fitPayoutValue(document.querySelector("#payout-profit"), 32);
  }

  function waitForAnimations(animations, onFinish) {
    if (animations.length === 0) {
      onFinish();
      return;
    }
    Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(onFinish);
  }

  function openPayoutDialog(source) {
    if (!isMobileLayout() || source.getAttribute("role") !== "button" || payoutPhase !== "closed") return;
    const calculator = window.HorsieCalculator;
    const dialog = document.querySelector("#payout-dialog");
    const content = document.querySelector("#payout-dialog-content");
    const total = document.querySelector("#payout-total");
    const rawAmount = source.dataset.amount;
    const parsedAmount = calculator.parseAmount(rawAmount);
    if (parsedAmount.status !== "valid") return;

    const profit = calculator.subtractStakeFromResult(rawAmount, source.dataset.rawResult);
    const integerDisplay = source.dataset.displayResult !== source.dataset.rawResult;
    document.querySelector("#payout-dialog-title").textContent = `${WAGER_LABELS[source.dataset.wager]}の払戻結果`;
    document.querySelector("#payout-stake").textContent = parsedAmount.value.toString();
    document.querySelector("#payout-multiplier").textContent = source.dataset.multiplier;
    total.textContent = source.dataset.displayResult;
    const profitOutput = document.querySelector("#payout-profit");
    const showProfit = profit !== null && !profit.startsWith("-") && profit !== "0.0";
    profitOutput.hidden = !showProfit;
    profitOutput.textContent = showProfit
      ? `(+${integerDisplay ? profit.replace(/\.0$/, "") : profit})`
      : "";

    dialog.dataset.wager = source.dataset.wager.toLowerCase();
    content.dataset.orientation = "player";
    payoutSource = source;
    payoutPhase = "player";
    payoutAnimating = true;
    const sourceRect = source.getBoundingClientRect();
    dialog.showModal();
    dialog.focus();
    fitPayoutValues();

    if (prefersReducedMotion() || typeof total.animate !== "function") {
      payoutAnimating = false;
      return;
    }
    const destinationRect = total.getBoundingClientRect();
    const sourceCenterX = sourceRect.left + sourceRect.width / 2;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2;
    const destinationCenterX = destinationRect.left + destinationRect.width / 2;
    const destinationCenterY = destinationRect.top + destinationRect.height / 2;
    const scale = Math.max(0.12, Math.min(1, sourceRect.height / destinationRect.height));
    const timing = { duration: 500, easing: "cubic-bezier(.2,.8,.2,1)" };
    const animations = [
      total.animate([
        { transform: `translate(${sourceCenterX - destinationCenterX}px, ${sourceCenterY - destinationCenterY}px) scale(${scale})` },
        { transform: "translate(0, 0) scale(1)" },
      ], timing),
      content.animate([{ opacity: 0.25 }, { opacity: 1 }], timing),
    ];
    waitForAnimations(animations, () => { payoutAnimating = false; });
  }

  function rotatePayoutDialog() {
    if (payoutAnimating || payoutPhase !== "player") return;
    const content = document.querySelector("#payout-dialog-content");
    content.dataset.orientation = "dealer";
    payoutPhase = "dealer";
    if (prefersReducedMotion() || typeof content.animate !== "function") return;
    payoutAnimating = true;
    const animation = content.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(180deg)" }],
      { duration: 600, easing: "cubic-bezier(.4,0,.2,1)" },
    );
    waitForAnimations([animation], () => { payoutAnimating = false; });
  }

  function finishClosingPayoutDialog() {
    const dialog = document.querySelector("#payout-dialog");
    if (dialog.open) dialog.close();
    payoutPhase = "closed";
    payoutAnimating = false;
    const source = payoutSource;
    payoutSource = null;
    if (source?.isConnected && isMobileLayout()) source.focus();
  }

  function closePayoutDialog() {
    if (payoutAnimating || payoutPhase !== "dealer") return;
    const dialog = document.querySelector("#payout-dialog");
    if (prefersReducedMotion() || typeof dialog.animate !== "function") {
      finishClosingPayoutDialog();
      return;
    }
    payoutAnimating = true;
    const animation = dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: "ease-out" });
    waitForAnimations([animation], finishClosingPayoutDialog);
  }

  function updateResultInteraction(output, details) {
    const enabled = isMobileLayout() && details.result !== null && details.multiplier !== null;
    if (!enabled) {
      output.removeAttribute("role");
      output.removeAttribute("tabindex");
      output.setAttribute("aria-label", `${WAGER_LABELS[details.type]}の計算結果`);
      for (const key of ["amount", "multiplier", "rawResult", "displayResult", "wager"]) delete output.dataset[key];
      return;
    }
    output.setAttribute("role", "button");
    output.setAttribute("tabindex", "0");
    output.setAttribute("aria-label", `${WAGER_LABELS[details.type]}の計算結果 ${details.displayResult}。払戻結果を全画面表示`);
    output.dataset.amount = state.amount;
    output.dataset.multiplier = details.multiplier;
    output.dataset.rawResult = details.result;
    output.dataset.displayResult = details.displayResult;
    output.dataset.wager = details.type;
  }

  function formatTableTitle(key) {
    return `${DISTANCE_LABELS[key.charAt(0)] ?? key.charAt(0)}${key.slice(1)}`;
  }

  function nextValue(values, current) {
    return values[(values.indexOf(current) + 1) % values.length];
  }

  function usesNativeNumberInput(target) {
    return typeof target?.matches === "function" && target.matches('input[type="number"]');
  }

  function appendAmountDigit(digit) {
    state.amount = state.amount === "0" ? digit : `${state.amount}${digit}`;
    renderCalculator();
  }

  function clearAmount() {
    state.amount = "0";
    renderCalculator();
  }

  function removeAmountDigit() {
    state.amount = state.amount.length > 1 ? state.amount.slice(0, -1) : "0";
    renderCalculator();
  }

  function saveCurrentRace() {
    raceRecords.set(state.r, { y: state.y, z: state.z, key: getKey(), outcome: state.outcome });
  }

  function renderRaceButtons() {
    document.querySelector("#r-control").querySelectorAll("button").forEach((button) => {
      const r = Number(button.dataset.r);
      const past = r < state.r;
      const record = raceRecords.get(r);
      const phase = past ? "past" : r === state.r ? "current" : "future";
      const key = past ? record?.key ?? "—" : "";
      const outcome = past ? record?.outcome ?? "—" : "";
      button.dataset.phase = phase;
      button.setAttribute("aria-pressed", String(r === state.r));
      const label = past
        ? `${r}R、キー ${record?.key ?? "未記録"}、結果 ${record ? record.outcome ?? "未選択" : "未記録"}`
        : `${r}R`;
      button.setAttribute("aria-label", label);
      button.title = label;
      const signature = `${phase}:${key}:${outcome}`;
      if (button.dataset.summary === signature) return;
      const raceLabel = document.createElement("span");
      raceLabel.className = "race-label";
      raceLabel.textContent = `${r}R`;
      const content = [raceLabel];
      if (past) {
        const keyLabel = document.createElement("span");
        keyLabel.className = "race-key";
        keyLabel.textContent = key;
        const outcomeLabel = document.createElement("span");
        outcomeLabel.className = "race-outcome";
        if (record?.outcome) outcomeLabel.append(formatSelection(outcome));
        else outcomeLabel.textContent = "—";
        content.push(keyLabel, outcomeLabel);
      }
      // Preserve the actual button so click/keyboard focus remains stable.
      button.replaceChildren(...content);
      button.dataset.summary = signature;
    });
  }

  function setPressedButton(container, attribute, value) {
    container.querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset[attribute] === String(value)));
    });
  }

  function render() {
    const key = getKey();
    const rows = ODDS_DATA[key] || [];
    const roundingMode = getRoundingMode();
    const body = document.querySelector("#result-body");
    document.querySelector("#odds-table").dataset.showProbability = String(state.showProbability);
    document.querySelector("#show-probability").checked = state.showProbability;

    document.querySelector("#current-title").textContent = formatTableTitle(key);
    setPressedButton(document.querySelector("#y-control"), "value", state.y);
    setPressedButton(document.querySelector("#z-control"), "value", state.z);
    setPressedButton(document.querySelector("#distance-control"), "value", mobileState.distance);
    setPressedButton(document.querySelector("#mobile-pattern-control"), "value", mobileState.pattern);

    body.replaceChildren(...rows.map((item, index) => {
      const row = document.createElement("tr");
      const selectionCell = document.createElement("td");
      const probabilityCell = document.createElement("td");
      const oddsCell = document.createElement("td");
      const startsWagerGroup = index === 0 || rows[index - 1].wagerType !== item.wagerType;
      row.dataset.wagerGroup = item.wagerType.toLowerCase();
      if (startsWagerGroup) row.dataset.wagerGroupStart = "true";
      selectionCell.className = "selection-cell";
      oddsCell.className = "odds-cell";
      probabilityCell.className = "probability-cell";
      selectionCell.setAttribute("aria-label", "Selection");
      oddsCell.setAttribute("aria-label", "Odds");
      probabilityCell.setAttribute("aria-label", "Probability");
      selectionCell.append(formatSelection(item.selection));
      probabilityCell.textContent = `${item.probabilityPercent.toFixed(2)}%`;
      probabilityCell.hidden = !state.showProbability;
      oddsCell.textContent = `${formatOdds(item.decimalOdds, state.taxRates[item.wagerType], roundingMode)}倍`;
      row.append(selectionCell, oddsCell, probabilityCell);
      return row;
    }));

    document.querySelector("#empty-state").hidden = rows.length > 0;
    renderCalculator(isMobileLayout() ? getActiveRows() : rows);
  }

  function renderCalculator(rows = getActiveRows()) {
    const calculator = window.HorsieCalculator;
    const outcomes = calculator.getOutcomes(rows);
    const outcome = calculator.retainOutcome(rows, getActiveOutcome());
    setActiveOutcome(outcome);
    if (!isMobileLayout()) {
      saveCurrentRace();
      renderRaceButtons();
    }
    const controls = document.querySelector("#outcome-control");
    const signature = outcomes.join(",");
    // Keep existing buttons/focus when only odds, the amount, or selection changes.
    if (controls.dataset.outcomes !== signature) {
      controls.replaceChildren(...outcomes.map((outcome) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.value = outcome;
        button.setAttribute("aria-label", `結果 ${outcome}`);
        button.append(formatSelection(outcome));
        return button;
      }));
      controls.dataset.outcomes = signature;
    }
    controls.dataset.count = String(outcomes.length);
    setPressedButton(controls, "value", outcome);

    const amount = calculator.parseAmount(state.amount);
    const input = document.querySelector("#chip-amount");
    updateAmountInputMode(input);
    if (input.value !== state.amount) input.value = state.amount;
    input.setAttribute("aria-invalid", String(amount.status === "invalid"));
    document.querySelector("#amount-error").textContent = amount.status === "invalid"
      ? "0〜9007199254740991の整数を入力してください（小数・負数・指数表記は使えません）。"
      : "";
    document.querySelectorAll("button[data-chip]").forEach((button) => {
      button.disabled = calculator.addChip(state.amount, Number(button.dataset.chip)) === null;
      button.title = button.disabled ? "入力が無効、または加算すると上限を超えます。" : "";
    });

    const roundingMode = getRoundingMode();
    const results = calculator.calculateRows(rows, outcome, state.amount,
      (odds, type) => formatOdds(odds, state.taxRates[type], roundingMode));
    results.forEach(({ type, multiplier, result }) => {
      const id = type.toLowerCase();
      document.querySelector(`#${id}-multiplier`).textContent = multiplier === null ? "—" : `${multiplier}倍`;
      const resultOutput = document.querySelector(`#${id}-result`);
      const displayResult = result === null
        ? "—"
        : roundingMode.endsWith("-integer") ? result.replace(/\.0$/, "") : result;
      resultOutput.textContent = displayResult;
      updateResultInteraction(resultOutput, { type, multiplier, result, displayResult });
    });
  }

  function selectR(nextR, scrollIntoView) {
    const r = ((nextR - 1 + 12) % 12) + 1;
    if (r !== state.r) {
      saveCurrentRace();
      const record = raceRecords.get(r);
      state.r = r;
      state.y = record?.y ?? state.y;
      state.z = record?.z ?? state.z;
      state.outcome = record?.outcome ?? null;
    }
    render();
    if (scrollIntoView) {
      document.querySelector(`[data-r="${state.r}"]`).scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }

  function validateTaxRate(input) {
    const raw = input.value.trim();
    const value = Number(raw);
    const valid = raw !== "" && Number.isFinite(value) && value >= 0 && value <= 100;
    const wagerType = input.dataset.wager;
    const suffix = TAX_INPUT_IDS[wagerType];
    input.setAttribute("aria-invalid", String(!valid));
    document.querySelector(`#tax-error-${suffix}`).textContent = valid ? "" : "0以上100以下の数値を入力してください。";
    if (valid) {
      state.taxRates[wagerType] = value;
      render();
    }
  }

  function updateRoundingDetails() {
    const rounded = state.roundingKind === "rounded";
    document.querySelector("#rounding-details").hidden = !rounded;
    document.querySelector("#rounding-unit-options").disabled = !rounded;
    document.querySelector("#rounding-direction-options").disabled = !rounded;
  }

  function init() {
    document.querySelector("#r-control").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-r]");
      if (button) selectR(Number(button.dataset.r), false);
    });

    document.querySelector("#y-control").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      state.y = button.dataset.value;
      render();
    });

    document.querySelector("#z-control").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      state.z = button.dataset.value;
      render();
    });

    document.querySelector("#distance-control").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      mobileState.distance = button.dataset.value;
      render();
    });

    document.querySelector("#mobile-pattern-control").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      mobileState.pattern = button.dataset.value;
      render();
    });

    document.querySelector(".rounding-options").addEventListener("change", (event) => {
      const { name, value } = event.target;
      if (name === "rounding-kind") state.roundingKind = value;
      else if (name === "rounding-unit") state.roundingUnit = value;
      else if (name === "rounding-direction") state.roundingDirection = value;
      else return;
      updateRoundingDetails();
      render();
    });

    WAGER_TYPES.forEach((type) => {
      document.querySelector(`#tax-rate-${TAX_INPUT_IDS[type]}`).addEventListener("input", (event) => validateTaxRate(event.target));
    });

    document.querySelector("#show-probability").addEventListener("change", (event) => {
      state.showProbability = event.target.checked;
      render();
    });

    document.querySelector("#outcome-control").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      setActiveOutcome(button.dataset.value);
      renderCalculator();
    });
    document.querySelector("#chip-amount").addEventListener("input", (event) => {
      state.amount = event.target.value;
      renderCalculator();
    });
    document.querySelector("#chip-amount").addEventListener("focus", (event) => {
      if (isMobileLayout() && event.target.value === "0") event.target.select();
    });
    document.querySelector("#chip-control").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-chip]");
      if (!button || button.disabled) return;
      const amount = window.HorsieCalculator.addChip(state.amount, Number(button.dataset.chip));
      if (amount === null) return;
      state.amount = amount;
      renderCalculator();
    });
    document.querySelector("#clear-amount").addEventListener("click", () => {
      clearAmount();
    });

    WAGER_TYPES.forEach((type) => {
      const result = document.querySelector(`#${type.toLowerCase()}-result`);
      result.addEventListener("click", () => openPayoutDialog(result));
      result.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.code !== "Space") return;
        event.preventDefault();
        openPayoutDialog(result);
      });
    });

    document.querySelector("#payout-dialog").addEventListener("click", () => {
      if (payoutPhase === "player") rotatePayoutDialog();
      else if (payoutPhase === "dealer") closePayoutDialog();
    });
    document.querySelector("#payout-dialog").addEventListener("cancel", (event) => {
      event.preventDefault();
      payoutAnimating = false;
      payoutPhase = "dealer";
      closePayoutDialog();
    });

    window.addEventListener("keydown", (event) => {
      if (isMobileLayout()) return;
      if (event.code === "Space" && !event.altKey && !event.metaKey) {
        event.preventDefault();
        selectR(state.r + (event.ctrlKey ? -1 : 1), true);
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (/^[0-9]$/.test(event.key) && !usesNativeNumberInput(event.target)) {
        event.preventDefault();
        appendAmountDigit(event.key);
        return;
      }
      if (event.code === "Backspace" && !usesNativeNumberInput(event.target)) {
        event.preventDefault();
        removeAmountDigit();
        return;
      }
      if (event.code === "KeyC") {
        event.preventDefault();
        clearAmount();
        return;
      }
      if (event.code === "KeyD") state.y = nextValue(PATTERNS, state.y);
      else if (event.code === "KeyJ") state.z = nextValue(JOKERS, state.z);
      else return;
      event.preventDefault();
      render();
    });

    mobileMedia.addEventListener("change", () => {
      if (!isMobileLayout() && payoutPhase !== "closed") {
        payoutAnimating = false;
        finishClosingPayoutDialog();
      }
      render();
    });

    render();
  }

  window.HorsieApp = Object.freeze({ applyRounding, formatOdds, formatSelection, formatTableTitle, getOddsFractionDigits, normalizeNumber, usesNativeNumberInput });
  window.addEventListener("DOMContentLoaded", init);
})();
