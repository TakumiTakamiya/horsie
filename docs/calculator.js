(function (root) {
  "use strict";

  const MAX_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER);
  const OUTCOME_ORDER = ["DD@", "D@D", "D@@", "@DD", "@D@", "@@D", "@@@"];
  const WAGERS = [
    { type: "Win", length: 1 },
    { type: "Exacta", length: 2 },
    { type: "Trifecta", length: 3 },
  ];

  function parseAmount(raw) {
    if (raw === "") return { status: "empty", value: null };
    if (!/^[0-9]+$/.test(raw)) return { status: "invalid", value: null };
    const digits = raw.replace(/^0+/, "") || "0";
    if (digits.length > 16) return { status: "invalid", value: null };
    const value = BigInt(digits);
    return value <= MAX_AMOUNT
      ? { status: "valid", value }
      : { status: "invalid", value: null };
  }

  function addChip(raw, chip) {
    const amount = parseAmount(raw);
    if (amount.status === "invalid" || ![1, 5, 10, 25, 100].includes(chip)) return null;
    const next = (amount.value ?? 0n) + BigInt(chip);
    return next <= MAX_AMOUNT ? next.toString() : null;
  }

  function getOutcomes(rows) {
    const available = new Set(rows.filter((row) => row.wagerType === "Trifecta").map((row) => row.selection));
    return OUTCOME_ORDER.filter((outcome) => available.has(outcome));
  }

  function retainOutcome(rows, outcome) {
    return getOutcomes(rows).includes(outcome) ? outcome : null;
  }

  function multiplyToTenths(rawAmount, displayedOdds) {
    const amount = parseAmount(rawAmount);
    if (amount.status !== "valid" || typeof displayedOdds !== "string" || !/^\d+\.\d{2}$/.test(displayedOdds)) return null;
    // Multipliers have exactly two decimals. Keep the full product in hundredths,
    // then round half-up to tenths without floating-point arithmetic.
    const hundredths = BigInt(displayedOdds.replace(".", ""));
    const tenths = (amount.value * hundredths + 5n) / 10n;
    return `${tenths / 10n}.${tenths % 10n}`;
  }

  function calculateRows(rows, outcome, rawAmount, formatOdds) {
    const selected = retainOutcome(rows, outcome);
    return WAGERS.map(({ type, length }) => {
      const selection = selected ? selected.slice(0, length) : null;
      const row = selected && rows.find((item) => item.wagerType === type && item.selection === selection);
      const multiplier = row && Number.isFinite(row.decimalOdds) && row.decimalOdds >= 0
        ? formatOdds(row.decimalOdds)
        : null;
      return { type, selection, multiplier, result: multiplyToTenths(rawAmount, multiplier) };
    });
  }

  const api = Object.freeze({ parseAmount, addChip, getOutcomes, retainOutcome, multiplyToTenths, calculateRows });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HorsieCalculator = api;
})(globalThis);
