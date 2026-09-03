(function () {
  "use strict";

  const state = {
    r: 1,
    y: "DD",
    z: "",
    rounding: "raw",
    taxRate: 0,
    amount: "0",
    outcome: null,
    showProbability: true,
  };
  // Per-race records last for the lifetime of this page; calculator input/settings
  // remain shared. Never carry a confirmed result into a previously unseen race.
  const raceRecords = new Map();

  const decimalFormatter = new Intl.NumberFormat("en-US", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function normalizeNumber(value) {
    if (Object.is(value, -0)) return "0";
    return Number(value.toPrecision(12)).toString();
  }

  function applyRounding(value, mode) {
    switch (mode) {
      case "floor-half": return Math.floor(value * 2) / 2;
      case "floor-integer": return Math.floor(value);
      case "round-half": return Math.round((value + Number.EPSILON) * 2) / 2;
      case "round-integer": return Math.round(value + Number.EPSILON);
      case "raw": return value;
      default: throw new Error(`Unknown rounding mode: ${mode}`);
    }
  }

  function formatOdds(originalOdds, taxRate, mode) {
    const taxAppliedValue = originalOdds * (1 - taxRate / 100);
    return decimalFormatter.format(Number(normalizeNumber(applyRounding(taxAppliedValue, mode))));
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
    const body = document.querySelector("#result-body");
    document.querySelector("#probability-heading").hidden = !state.showProbability;
    document.querySelector("#odds-table").dataset.showProbability = String(state.showProbability);
    document.querySelector("#show-probability").checked = state.showProbability;

    document.querySelector("#current-key").textContent = key;
    document.querySelector("#current-r").textContent = `${state.r}R`;
    document.querySelector("#current-x").textContent = R_TO_X[state.r];
    setPressedButton(document.querySelector("#y-control"), "value", state.y);
    setPressedButton(document.querySelector("#z-control"), "value", state.z);

    body.replaceChildren(...rows.map((item) => {
      const row = document.createElement("tr");
      const selectionCell = document.createElement("td");
      const probabilityCell = document.createElement("td");
      const oddsCell = document.createElement("td");
      selectionCell.append(formatSelection(item.selection));
      probabilityCell.textContent = `${item.probabilityPercent.toFixed(2)}%`;
      probabilityCell.hidden = !state.showProbability;
      oddsCell.textContent = formatOdds(item.decimalOdds, state.taxRate, state.rounding);
      row.append(selectionCell, probabilityCell, oddsCell);
      return row;
    }));

    document.querySelector("#empty-state").hidden = rows.length > 0;
    renderCalculator(rows);
  }

  function renderCalculator(rows = ODDS_DATA[getKey()] || []) {
    const calculator = window.HorsieCalculator;
    const outcomes = calculator.getOutcomes(rows);
    state.outcome = calculator.retainOutcome(rows, state.outcome);
    saveCurrentRace();
    renderRaceButtons();
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
    setPressedButton(controls, "value", state.outcome);
    document.querySelector("#outcome-help").textContent = outcomes.length === 0
      ? "この条件の結果データはありません。"
      : state.outcome ? `選択中：${state.outcome}` : "三連単の結果を選択してください。";

    const amount = calculator.parseAmount(state.amount);
    const input = document.querySelector("#chip-amount");
    if (input.value !== state.amount) input.value = state.amount;
    input.setAttribute("aria-invalid", String(amount.status === "invalid"));
    document.querySelector("#amount-error").textContent = amount.status === "invalid"
      ? "0〜9007199254740991の整数を入力してください（小数・負数・指数表記は使えません）。"
      : "";
    document.querySelectorAll("button[data-chip]").forEach((button) => {
      button.disabled = calculator.addChip(state.amount, Number(button.dataset.chip)) === null;
      button.title = button.disabled ? "入力が無効、または加算すると上限を超えます。" : "";
    });

    const results = calculator.calculateRows(rows, state.outcome, state.amount,
      (odds) => formatOdds(odds, state.taxRate, state.rounding));
    results.forEach(({ type, multiplier, result }) => {
      const id = type.toLowerCase();
      document.querySelector(`#${id}-multiplier`).textContent = multiplier ?? "—";
      document.querySelector(`#${id}-result`).textContent = result ?? "—";
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
    input.setAttribute("aria-invalid", String(!valid));
    document.querySelector("#tax-error").textContent = valid ? "" : "0以上100以下の数値を入力してください。";
    if (valid) {
      state.taxRate = value;
      render();
    }
  }

  function init() {
    const settingsDialog = document.querySelector("#settings-dialog");
    const settingsButton = document.querySelector("#open-settings");
    settingsButton.addEventListener("click", () => settingsDialog.showModal());
    document.querySelector("#close-settings").addEventListener("click", () => settingsDialog.close());
    // Native dialog handles Escape and keeps keyboard focus inside while open.
    settingsDialog.addEventListener("close", () => settingsButton.focus());

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

    document.querySelector(".rounding-options").addEventListener("change", (event) => {
      if (event.target.matches('input[name="rounding"]')) {
        state.rounding = event.target.value;
        render();
      }
    });

    document.querySelector("#tax-rate").addEventListener("input", (event) => validateTaxRate(event.target));

    document.querySelector("#show-probability").addEventListener("change", (event) => {
      state.showProbability = event.target.checked;
      render();
    });

    document.querySelector("#outcome-control").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      state.outcome = button.dataset.value;
      renderCalculator();
    });
    document.querySelector("#chip-amount").addEventListener("input", (event) => {
      state.amount = event.target.value;
      renderCalculator();
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
      state.amount = "0";
      renderCalculator();
    });

    window.addEventListener("keydown", (event) => {
      if (event.code !== "Space" || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      selectR(state.r + (event.altKey ? -1 : 1), !settingsDialog.open);
    });

    render();
  }

  window.HorsieApp = Object.freeze({ applyRounding, formatOdds, formatSelection, normalizeNumber });
  window.addEventListener("DOMContentLoaded", init);
})();
