(function () {
  "use strict";

  const state = {
    r: 1,
    y: "DD",
    z: "",
    rounding: "raw",
    taxRate: 0,
  };

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
    return normalizeNumber(applyRounding(taxAppliedValue, mode));
  }

  function formatSelection(selection) {
    return selection.split("").join(" → ");
  }

  function getKey() {
    return `${R_TO_X[state.r]}${state.y}${state.z}`;
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

    document.querySelector("#current-key").textContent = key;
    document.querySelector("#current-r").textContent = `${state.r}R`;
    document.querySelector("#current-x").textContent = R_TO_X[state.r];
    setPressedButton(document.querySelector("#r-control"), "r", state.r);
    setPressedButton(document.querySelector("#y-control"), "value", state.y);
    setPressedButton(document.querySelector("#z-control"), "value", state.z);

    body.replaceChildren(...rows.map((item) => {
      const row = document.createElement("tr");
      const wagerCell = document.createElement("td");
      const selectionCell = document.createElement("td");
      const ticketsCell = document.createElement("td");
      const probabilityCell = document.createElement("td");
      const oddsCell = document.createElement("td");
      wagerCell.textContent = item.wagerType;
      selectionCell.textContent = formatSelection(item.selection);
      ticketsCell.textContent = item.equivalentTickets;
      probabilityCell.textContent = `${item.probabilityPercent.toFixed(4)}%`;
      oddsCell.textContent = formatOdds(item.decimalOdds, state.taxRate, state.rounding);
      row.append(wagerCell, selectionCell, ticketsCell, probabilityCell, oddsCell);
      return row;
    }));

    document.querySelector("#empty-state").hidden = rows.length > 0;
  }

  function selectR(nextR, scrollIntoView) {
    state.r = ((nextR - 1 + 12) % 12) + 1;
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

    window.addEventListener("keydown", (event) => {
      if (event.code !== "Space" || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      selectR(state.r + (event.altKey ? -1 : 1), true);
    });

    render();
  }

  window.HorsieApp = Object.freeze({ applyRounding, formatOdds, formatSelection, normalizeNumber });
  window.addEventListener("DOMContentLoaded", init);
})();
