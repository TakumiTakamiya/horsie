"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const calculator = require("../docs/calculator.js");

const docs = path.resolve(__dirname, "../docs");
const dataContext = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(docs, "odds-data.js"), "utf8"), dataContext);
const data = vm.runInContext("ODDS_DATA", dataContext);
const appContext = { window: { addEventListener() {} } };
vm.runInNewContext(fs.readFileSync(path.join(docs, "app.js"), "utf8"), appContext);
const { applyRounding, formatOdds, formatTableTitle, getOddsFractionDigits } = appContext.window.HorsieApp;

test("table titles localize only the distance prefix", () => {
  assert.equal(formatTableTitle("SD2J"), "短距離D2J");
  assert.equal(formatTableTitle("MDDJJ"), "中距離DDJJ");
  assert.equal(formatTableTitle("LD2"), "長距離D2");
  assert.equal(formatTableTitle("XDD"), "XDD");
});

test("accepts only nonnegative safe integers and treats empty input separately", () => {
  for (const [raw, value] of [["0", 0n], ["00025", 25n], ["9007199254740991", 9007199254740991n]]) {
    assert.deepEqual(calculator.parseAmount(raw), { status: "valid", value });
  }
  assert.equal(calculator.parseAmount("").status, "empty");
  for (const raw of ["-1", "+1", "1.5", "2.0", "1e3", " 25", "25 ", "abc", "１２", "9007199254740992", "9".repeat(100)]) {
    assert.equal(calculator.parseAmount(raw).status, "invalid", raw);
  }
});

test("adds all chips, starts empty input at zero, and refuses invalid input/overflow", () => {
  let amount = "";
  for (const chip of [1, 5, 10, 25, 100]) amount = calculator.addChip(amount, chip);
  assert.equal(amount, "141");
  assert.equal(calculator.addChip("0004", 1), "5");
  assert.equal(calculator.addChip("9007199254740990", 1), "9007199254740991");
  assert.equal(calculator.addChip("9007199254740991", 1), null);
  assert.equal(calculator.addChip("1.5", 5), null);
  assert.equal(calculator.addChip("0", -1), null);
});

test("rounds exact products half-up to one decimal, including very large amounts", () => {
  const cases = [
    ["25", "3.53", "88.3"], ["1", "0.05", "0.1"], ["1", "0.04", "0.0"],
    ["1", "0.15", "0.2"], ["10", "3.5", "35.0"], ["10", "4", "40.0"], ["0", "99.99", "0.0"],
    ["9007199254740991", "99.99", "900629853481551690.1"],
  ];
  for (const [amount, odds, expected] of cases) assert.equal(calculator.multiplyToTenths(amount, odds), expected);
  for (const amount of ["", "-1", "1.2"]) assert.equal(calculator.multiplyToTenths(amount, "3.53"), null);
  for (const odds of [null, "NaN", "1.234", "-1.00", ".5", "1."]) assert.equal(calculator.multiplyToTenths("25", odds), null);
});

test("supports 0.1, 0.5, and integer rounding with matching display precision", () => {
  const cases = [
    ["raw", 3.58, "3.58", 2],
    ["floor-tenth", 3.58, "3.5", 1],
    ["round-tenth", 3.55, "3.6", 1],
    ["floor-half", 3.76, "3.5", 1],
    ["round-half", 3.76, "4.0", 1],
    ["floor-integer", 3.99, "3", 0],
    ["round-integer", 3.5, "4", 0],
  ];
  for (const [mode, value, displayed, digits] of cases) {
    assert.equal(formatOdds(value, 0, mode), displayed, mode);
    assert.equal(getOddsFractionDigits(mode), digits, mode);
  }
  assert.equal(applyRounding(3.58, "floor-tenth"), 3.5);
  assert.equal(applyRounding(3.55, "round-tenth"), 3.6);
});

test("all 18 keys provide a fixed outcome order and the correct three prefix multipliers", () => {
  assert.equal(Object.keys(data).length, 18);
  for (const [key, rows] of Object.entries(data)) {
    const expected = key.includes("D2")
      ? ["D@@", "@D@", "@@D", "@@@"]
      : ["DD@", "D@D", "D@@", "@DD", "@D@", "@@D"];
    assert.deepEqual(calculator.getOutcomes(rows), expected);
    for (const outcome of expected) {
      for (const tax of [0, 20, 100]) {
        for (const mode of ["raw", "floor-tenth", "floor-half", "floor-integer", "round-tenth", "round-half", "round-integer"]) {
          const calculated = calculator.calculateRows(rows, outcome, "25", (odds) => formatOdds(odds, tax, mode));
          calculated.forEach((result, index) => {
            const type = ["Win", "Exacta", "Trifecta"][index];
            const row = rows.find((item) => item.wagerType === type && item.selection === outcome.slice(0, index + 1));
            assert.ok(row, `${key}/${outcome}/${type}`);
            assert.equal(result.multiplier, formatOdds(row.decimalOdds, tax, mode));
            assert.equal(result.result, calculator.multiplyToTenths("25", result.multiplier));
            if (tax === 100) assert.equal(result.result, "0.0");
          });
        }
      }
    }
  }
});

test("retains only valid outcomes and leaves missing multipliers blank", () => {
  assert.equal(calculator.retainOutcome(data.MDD, "D@@"), "D@@");
  assert.equal(calculator.retainOutcome(data.MD2, "D@@"), "D@@");
  assert.equal(calculator.retainOutcome(data.MD2, "DD@"), null);
  assert.equal(calculator.retainOutcome([], "D@@"), null);
  for (const outcome of [null, "DDD"]) {
    const results = calculator.calculateRows(data.MDD, outcome, "25", (odds) => formatOdds(odds, 0, "raw"));
    assert.ok(results.every((row) => row.multiplier === null && row.result === null));
  }
  const incomplete = data.MDD.filter((row) => row.wagerType !== "Exacta");
  const results = calculator.calculateRows(incomplete, "D@D", "25", (odds) => formatOdds(odds, 0, "raw"));
  assert.equal(results[1].multiplier, null);
  assert.equal(results[1].result, null);
  assert.notEqual(results[0].result, null);
});

// Test event wiring without a browser dependency; real visual QA is separate.
function createApp() {
  class Element {
    constructor(dataset = {}) { this.dataset = dataset; this.children = []; this.events = {}; this.attrs = {}; this.value = ""; }
    addEventListener(name, callback) { this.events[name] = callback; }
    setAttribute(name, value) { this.attrs[name] = value; }
    querySelectorAll() { return this.children; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    scrollIntoView() { this.scrolled = true; }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.events.close(); }
  }
  const html = fs.readFileSync(path.join(docs, "index.html"), "utf8");
  const nodes = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map((m) => [`#${m[1]}`, new Element()]));
  nodes[".rounding-options"] = new Element();
  nodes["#r-control"].children = Array.from({ length: 12 }, (_, i) => new Element({ r: String(i + 1) }));
  nodes["#y-control"].children = ["D2", "DD"].map((value) => new Element({ value }));
  nodes["#z-control"].children = ["", "J", "JJ"].map((value) => new Element({ value }));
  nodes["#chip-control"].children = [1, 5, 10, 25, 100].map((chip) => new Element({ chip: String(chip) }));
  nodes["#tax-rate-win"].dataset.wager = "Win";
  nodes["#tax-rate-exacta"].dataset.wager = "Exacta";
  nodes["#tax-rate-trifecta"].dataset.wager = "Trifecta";
  const events = {};
  const sandbox = {
    addEventListener(name, callback) { events[name] = callback; },
    document: {
      querySelector(selector) {
        if (selector.startsWith("[data-r=")) return nodes["#r-control"].children.find((button) => button.dataset.r === selector.match(/"(\d+)"/)[1]);
        assert.ok(nodes[selector], selector);
        return nodes[selector];
      },
      querySelectorAll(selector) { assert.equal(selector, "button[data-chip]"); return nodes["#chip-control"].children; },
      createElement() { return new Element(); },
    },
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const file of ["data.js", "odds-data.js", "calculator.js", "app.js"]) {
    vm.runInContext(fs.readFileSync(path.join(docs, file), "utf8"), context);
  }
  events.DOMContentLoaded();
  const click = (id, value) => {
    const group = nodes[id];
    const button = group.children.find((item) => Object.values(item.dataset).includes(String(value)));
    assert.ok(button, `${id}/${value}`);
    group.events.click({ target: { closest() { return button; } } });
  };
  const input = (id, value) => { nodes[id].value = value; nodes[id].events.input({ target: nodes[id] }); };
  const changeRounding = (name, value) => {
    nodes[".rounding-options"].events.change({ target: { name, value } });
  };
  return { nodes, events, click, input, changeRounding };
}

test("UI starts unselected, adds chips, preserves button focus targets, and clears amount only", () => {
  const { nodes, click, input } = createApp();
  assert.equal(nodes["#chip-amount"].value, "0");
  assert.equal(nodes["#win-multiplier"].textContent, "—");
  assert.equal(nodes["#win-result"].textContent, "—");
  const firstButton = nodes["#outcome-control"].children[0];
  click("#outcome-control", "D@D");
  for (const chip of [1, 5, 10, 25, 100]) click("#chip-control", chip);
  assert.equal(nodes["#chip-amount"].value, "141");
  assert.equal(nodes["#outcome-control"].children[0], firstButton);
  nodes["#clear-amount"].events.click();
  assert.equal(nodes["#chip-amount"].value, "0");
  assert.equal(nodes["#win-result"].textContent, "0.0");
  assert.equal(pressedValue(nodes["#outcome-control"]), "D@D");
  input("#chip-amount", "");
  assert.equal(nodes["#win-result"].textContent, "—");
  click("#chip-control", 25);
  assert.equal(nodes["#chip-amount"].value, "25");
});

test("UI enforces invalid/overflow inputs and recovers via clear", () => {
  const { nodes, click, input } = createApp();
  click("#outcome-control", "D@@");
  for (const invalid of ["-1", "1.5", "1e3", "9007199254740992"]) {
    input("#chip-amount", invalid);
    assert.equal(nodes["#chip-amount"].attrs["aria-invalid"], "true");
    assert.equal(nodes["#win-result"].textContent, "—");
    assert.ok(nodes["#chip-control"].children.every((button) => button.disabled));
    click("#chip-control", 1);
    assert.equal(nodes["#chip-amount"].value, invalid);
  }
  input("#chip-amount", "9007199254740990");
  assert.equal(nodes["#chip-control"].children[0].disabled, false);
  assert.equal(nodes["#chip-control"].children[1].disabled, true);
  click("#chip-control", 1);
  assert.ok(nodes["#chip-control"].children.every((button) => button.disabled));
  nodes["#clear-amount"].events.click();
  assert.equal(nodes["#chip-amount"].attrs["aria-invalid"], "false");
  assert.equal(nodes["#amount-error"].textContent, "");
  assert.ok(nodes["#chip-control"].children.every((button) => !button.disabled));
});

test("UI retains amount across R, starts new outcomes blank, and applies Pattern/Joker/settings changes", () => {
  const { nodes, events, click, input, changeRounding } = createApp();
  input("#chip-amount", "25");
  click("#outcome-control", "D@D");
  click("#r-control", 2);
  assert.equal(nodes["#win-multiplier"].textContent, "—");
  click("#outcome-control", "D@D");
  click("#z-control", "J");
  assert.equal(nodes["#chip-amount"].value, "25");
  assert.equal(pressedValue(nodes["#outcome-control"]), "D@D");
  input("#tax-rate-win", "20");
  input("#tax-rate-exacta", "10");
  input("#tax-rate-trifecta", "40");
  const rows = data.LDDJ;
  const winOdds = rows.find((row) => row.wagerType === "Win" && row.selection === "D").decimalOdds;
  const exactaOdds = rows.find((row) => row.wagerType === "Exacta" && row.selection === "D@").decimalOdds;
  const trifectaOdds = rows.find((row) => row.wagerType === "Trifecta" && row.selection === "D@D").decimalOdds;
  assert.equal(nodes["#win-multiplier"].textContent, `${formatOdds(winOdds, 20, "raw")}倍`);
  assert.equal(nodes["#exacta-multiplier"].textContent, `${formatOdds(exactaOdds, 10, "raw")}倍`);
  assert.equal(nodes["#trifecta-multiplier"].textContent, `${formatOdds(trifectaOdds, 40, "raw")}倍`);
  const rowIndex = (type, selection) => rows.findIndex((row) => row.wagerType === type && row.selection === selection);
  assert.equal(nodes["#result-body"].children[rowIndex("Win", "D")].children[1].textContent, `${formatOdds(winOdds, 20, "raw")}倍`);
  assert.equal(nodes["#result-body"].children[rowIndex("Exacta", "D@")].children[1].textContent, `${formatOdds(exactaOdds, 10, "raw")}倍`);
  assert.equal(nodes["#result-body"].children[rowIndex("Trifecta", "D@D")].children[1].textContent, `${formatOdds(trifectaOdds, 40, "raw")}倍`);
  const validWinMultiplier = nodes["#win-multiplier"].textContent;
  input("#tax-rate-win", "101");
  assert.equal(nodes["#tax-rate-win"].attrs["aria-invalid"], "true");
  assert.match(nodes["#tax-error-win"].textContent, /0以上100以下/);
  assert.equal(nodes["#win-multiplier"].textContent, validWinMultiplier);
  assert.equal(nodes["#exacta-multiplier"].textContent, `${formatOdds(exactaOdds, 10, "raw")}倍`);
  input("#tax-rate-win", "20");
  assert.equal(nodes["#tax-error-win"].textContent, "");
  changeRounding("rounding-kind", "rounded");
  assert.equal(nodes["#rounding-details"].hidden, false);
  assert.equal(nodes["#rounding-unit-options"].disabled, false);
  const modes = [
    ["rounding-direction", "floor", "floor-tenth"],
    ["rounding-unit", "half", "floor-half"],
    ["rounding-direction", "round", "round-half"],
    ["rounding-unit", "integer", "round-integer"],
    ["rounding-unit", "tenth", "round-tenth"],
  ];
  for (const [name, value, mode] of modes) {
    changeRounding(name, value);
    assert.equal(nodes["#win-multiplier"].textContent, `${formatOdds(winOdds, 20, mode)}倍`);
  }
  changeRounding("rounding-kind", "raw");
  assert.equal(nodes["#rounding-details"].hidden, true);
  assert.equal(nodes["#rounding-direction-options"].disabled, true);
  input("#tax-rate-win", "100");
  assert.equal(nodes["#win-result"].textContent, "0.0");
  assert.notEqual(nodes["#exacta-result"].textContent, "0.0");
  click("#y-control", "D2");
  assert.equal(nodes["#win-multiplier"].textContent, "—");
  assert.equal(nodes["#chip-amount"].value, "25");
  click("#outcome-control", "D@@");
  click("#y-control", "DD");
  assert.equal(pressedValue(nodes["#outcome-control"]), "D@@");
  click("#r-control", 12);
  let altPrevented = false;
  events.keydown({ code: "Space", altKey: true, preventDefault() { altPrevented = true; } });
  assert.equal(altPrevented, false);
  assert.equal(nodes["#current-title"].textContent, "短距離DDJ");
  let prevented = false;
  events.keydown({ code: "Space", preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(nodes["#current-title"].textContent, "中距離DD");
  events.keydown({ code: "Space", ctrlKey: true, preventDefault() {} });
  assert.equal(nodes["#current-title"].textContent, "短距離DDJ");
  assert.equal(nodes["#chip-amount"].value, "25");
});

test("D and J keys cycle Pattern and Joker without modifier shortcuts", () => {
  const { nodes, events } = createApp();
  let prevented = 0;
  const press = (code, modifiers = {}) => events.keydown({
    code,
    ...modifiers,
    preventDefault() { prevented += 1; },
  });

  press("KeyD");
  assert.equal(nodes["#current-title"].textContent, "中距離D2");
  press("KeyD");
  assert.equal(nodes["#current-title"].textContent, "中距離DD");
  for (const expected of ["中距離DDJ", "中距離DDJJ", "中距離DD"]) {
    press("KeyJ");
    assert.equal(nodes["#current-title"].textContent, expected);
  }
  press("KeyD", { ctrlKey: true });
  press("KeyJ", { altKey: true });
  assert.equal(nodes["#current-title"].textContent, "中距離DD");
  assert.equal(prevented, 5);
  assert.equal(nodes["#y-control"].children.filter((button) => button.attrs["aria-pressed"] === "true").length, 1);
  assert.equal(nodes["#z-control"].children.filter((button) => button.attrs["aria-pressed"] === "true").length, 1);
});

test("number keys type globally, C clears, and the display never takes input focus", () => {
  const { nodes, events } = createApp();
  let prevented = 0;
  const press = (key, options = {}) => events.keydown({
    key,
    code: options.code ?? `Digit${key}`,
    target: options.target,
    ctrlKey: options.ctrlKey,
    altKey: options.altKey,
    metaKey: options.metaKey,
    preventDefault() { prevented += 1; },
  });

  press("5");
  press("0");
  press("7", { code: "Numpad7" });
  assert.equal(nodes["#chip-amount"].value, "507");
  assert.equal(nodes["#chip-amount"].focused, undefined);
  assert.equal(prevented, 3);

  press("x", { code: "KeyX" });
  assert.equal(nodes["#chip-amount"].value, "507");
  assert.equal(prevented, 3);

  press("9", { ctrlKey: true });
  assert.equal(nodes["#chip-amount"].value, "507");
  assert.equal(prevented, 3);

  const nativeInput = { matches(selector) { return selector.includes('input[type="number"]'); } };
  press("8", { target: nativeInput });
  assert.equal(nodes["#chip-amount"].value, "507");
  assert.equal(prevented, 3);

  press("c", { code: "KeyC" });
  assert.equal(nodes["#chip-amount"].value, "0");
  assert.equal(prevented, 4);
});

test("calculator amount is read-only and hides focus and caret interaction", () => {
  const html = fs.readFileSync(path.join(docs, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(docs, "style.css"), "utf8");
  assert.match(html, /id="chip-amount"[^>]*readonly[^>]*tabindex="-1"/);
  assert.doesNotMatch(html, /id="chip-amount"[^>]*(?:inputmode|pattern)=/);
  assert.match(css, /\.amount-field input\s*\{[^}]*caret-color:\s*transparent[^}]*pointer-events:\s*none[^}]*user-select:\s*none/);
});

function textOf(node) {
  return node.textContent ?? node.children.map(textOf).join("");
}

function pressedValue(node) {
  return node.children.find((button) => button.attrs["aria-pressed"] === "true")?.dataset.value ?? null;
}

test("table has no heading row and orders Selection, Odds, Probability", () => {
  const html = fs.readFileSync(path.join(docs, "index.html"), "utf8");
  assert.doesNotMatch(html, /Tickets/);
  assert.doesNotMatch(html, /result-note|同条件の馬をまとめた表記/);
  assert.doesNotMatch(html, /Horsie\s*<span>Race|CURRENT KEY|current-r|current-x/);
  assert.doesNotMatch(html, /<thead\b|<th\b|probability-heading/);
  const { nodes } = createApp();
  assert.equal(nodes["#show-probability"].checked, true);
  assert.equal(nodes["#odds-table"].dataset.showProbability, "true");
  nodes["#result-body"].children.forEach((row, index) => {
    assert.equal(row.children.length, 3);
    assert.equal(textOf(row.children[0]), data.MDD[index].selection);
    assert.equal(row.children[0].attrs["aria-label"], "Selection");
    assert.equal(row.children[1].textContent, `${formatOdds(data.MDD[index].decimalOdds, 0, "raw")}倍`);
    assert.equal(row.children[1].attrs["aria-label"], "Odds");
    assert.equal(row.children[2].textContent, `${data.MDD[index].probabilityPercent.toFixed(2)}%`);
    assert.equal(row.children[2].attrs["aria-label"], "Probability");
    assert.equal(row.children[2].hidden, false);
  });
});

test("settings use hierarchical rounding controls and separate tax rates", () => {
  const html = fs.readFileSync(path.join(docs, "index.html"), "utf8");
  assert.match(html, /name="rounding-kind"[^>]*value="raw"/);
  assert.match(html, /name="rounding-kind"[^>]*value="rounded"/);
  assert.match(html, /name="rounding-unit"[^>]*value="tenth"/);
  assert.match(html, /name="rounding-unit"[^>]*value="half"/);
  assert.match(html, /name="rounding-unit"[^>]*value="integer"/);
  assert.match(html, /name="rounding-direction"[^>]*value="floor"/);
  assert.match(html, /name="rounding-direction"[^>]*value="round"/);
  for (const [id, wager] of [["win", "Win"], ["exacta", "Exacta"], ["trifecta", "Trifecta"]]) {
    assert.match(html, new RegExp(`id="tax-rate-${id}"[^>]*data-wager="${wager}"`));
  }
});

test("race controls and the calculator keep their desktop layout", () => {
  const html = fs.readFileSync(path.join(docs, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(docs, "style.css"), "utf8");
  const controlPanel = html.match(/<section class="control-panel"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.ok(controlPanel.indexOf('id="r-control"') < controlPanel.indexOf('id="y-control"'));
  assert.ok(controlPanel.indexOf('id="y-control"') < controlPanel.indexOf('id="z-control"'));
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 2fr\)/);
  assert.match(css, /grid-template-areas:\s*"result controls"\s*"result calculator"/);
  assert.match(css, /grid-template-areas:\s*"controls" "result" "calculator"/);
  assert.match(css, /height:\s*calc\(100dvh - 32px\)/);
  assert.match(css, /\.result-panel[^}]*display:\s*flex/);
  assert.match(css, /\.table-wrap table\s*\{\s*height:\s*100%/);
  assert.match(css, /\.chip-buttons[^}]*grid-column:\s*1[^}]*grid-row:\s*2 \/ span 2[^}]*grid-template-columns:\s*repeat\(2[^}]*grid-template-rows:\s*repeat\(3/);
  const calculationGrid = html.match(/<div class="calculation-grid">[\s\S]*?<p id="amount-error"/)?.[0] ?? "";
  assert.ok(calculationGrid.indexOf('id="chip-amount"') < calculationGrid.indexOf('id="chip-control"'));
  assert.ok(calculationGrid.indexOf('id="chip-control"') < calculationGrid.indexOf('id="win-multiplier"'));
  assert.equal((calculationGrid.match(/data-chip=/g) ?? []).length, 5);
  assert.match(calculationGrid, /id="clear-amount"/);
  assert.equal(Math.max(...Object.values(data).map((rows) => rows.length)), 12);
});

test("table title and calculator use the space freed by removed guidance", () => {
  const html = fs.readFileSync(path.join(docs, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(docs, "style.css"), "utf8");
  assert.doesNotMatch(html, /id="amount-help"|calculator-note|outcome-help|三連単の結果を選択してください/);
  assert.match(html, /id="chip-amount"[^>]*aria-describedby="amount-error"/);
  assert.match(css, /\.result-heading\s*\{[^}]*min-height:\s*104px/);
  assert.match(css, /\.result-heading h2\s*\{[^}]*font-size:\s*2\.3rem/);
  assert.match(css, /\.amount-field input\s*\{[^}]*font-size:\s*1\.75rem/);
  assert.match(css, /\.calculation-result\s*\{[^}]*font-size:\s*2rem/);
  assert.match(css, /\.outcome-buttons button\s*\{[^}]*min-height:\s*64px[^}]*font-size:\s*1\.35rem/);
});

test("D and @ use the approved high-contrast hierarchy", () => {
  const css = fs.readFileSync(path.join(docs, "style.css"), "utf8");
  assert.match(css, /\.selection-symbols\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*flex-end/);
  assert.match(css, /\.selection-symbol--d\s*\{[^}]*color:\s*#052e24[^}]*font-size:\s*1\.08em[^}]*font-weight:\s*900/);
  assert.match(css, /\.selection-symbol--other\s*\{[^}]*color:\s*#6b7280[^}]*font-size:\s*0\.9em[^}]*font-weight:\s*400[^}]*translateY\(-0\.04em\)/);
});

test("probability toggle updates header/body and survives condition/settings changes without changing calculator", () => {
  const { nodes, click, input } = createApp();
  click("#outcome-control", "D@D");
  input("#chip-amount", "25");
  const previousResult = nodes["#trifecta-result"].textContent;
  nodes["#open-settings"].events.click();
  const toggle = nodes["#show-probability"];
  toggle.checked = false;
  toggle.events.change({ target: toggle });
  assert.equal(nodes["#odds-table"].dataset.showProbability, "false");
  assert.ok(nodes["#result-body"].children.every((row) => row.children[2].hidden));
  assert.equal(nodes["#trifecta-result"].textContent, previousResult);
  nodes["#close-settings"].events.click();
  click("#r-control", 2);
  click("#y-control", "D2");
  click("#z-control", "J");
  input("#tax-rate-trifecta", "20");
  assert.equal(toggle.checked, false);
  assert.ok(nodes["#result-body"].children.every((row) => row.children[2].hidden));
  click("#r-control", 1);
  assert.equal(pressedValue(nodes["#outcome-control"]), "D@D");
  assert.equal(nodes["#chip-amount"].value, "25");
  const taxedResult = nodes["#trifecta-result"].textContent;
  nodes["#open-settings"].events.click();
  toggle.checked = true;
  toggle.events.change({ target: toggle });
  assert.ok(nodes["#result-body"].children.every((row) => !row.children[2].hidden));
  assert.equal(nodes["#trifecta-result"].textContent, taxedResult);
});

test("past R buttons show exactly three lines and revisiting restores that race's conditions/result", () => {
  const { nodes, click, input } = createApp();
  const buttons = nodes["#r-control"].children;
  assert.ok(buttons.every((button) => button.children.length === 1));
  click("#z-control", "JJ");
  click("#outcome-control", "D@D");
  input("#chip-amount", "25");
  click("#r-control", 2);
  assert.deepEqual(buttons[0].children.map(textOf), ["1R", "MDDJJ", "D@D"]);
  assert.equal(buttons[0].dataset.phase, "past");
  assert.equal(buttons[0].attrs["aria-pressed"], "false");
  assert.match(buttons[0].attrs["aria-label"], /MDDJJ.*D@D/);
  assert.equal(buttons[1].dataset.phase, "current");
  assert.equal(buttons[1].children.length, 1);
  assert.ok(buttons.slice(2).every((button) => button.dataset.phase === "future" && button.children.length === 1));
  assert.equal(nodes["#current-title"].textContent, "長距離DDJJ");
  assert.equal(nodes["#win-result"].textContent, "—");
  click("#y-control", "D2");
  click("#z-control", "J");
  click("#outcome-control", "@@@");
  click("#r-control", 1);
  assert.equal(nodes["#current-title"].textContent, "中距離DDJJ");
  assert.equal(pressedValue(nodes["#outcome-control"]), "D@D");
  assert.equal(nodes["#chip-amount"].value, "25");
  assert.ok(buttons.every((button) => button.children.length === 1));
  click("#r-control", 2);
  assert.equal(nodes["#current-title"].textContent, "長距離D2J");
  assert.equal(pressedValue(nodes["#outcome-control"]), "@@@");
  assert.equal(nodes["#r-control"].children[0], buttons[0]);
});

test("skipped races remain unrecorded and future records stay hidden without being lost", () => {
  const { nodes, click } = createApp();
  const buttons = nodes["#r-control"].children;
  click("#r-control", 5);
  assert.deepEqual(buttons[0].children.map(textOf), ["1R", "MDD", "—"]);
  for (let i = 1; i < 4; i++) {
    assert.deepEqual(buttons[i].children.map(textOf), [`${i + 1}R`, "—", "—"]);
    assert.match(buttons[i].attrs["aria-label"], /未記録/);
  }
  click("#z-control", "J");
  click("#outcome-control", "DD@");
  click("#r-control", 3);
  assert.equal(buttons[4].children.length, 1);
  assert.equal(buttons[4].dataset.phase, "future");
  click("#r-control", 6);
  assert.deepEqual(buttons[4].children.map(textOf), ["5R", "MDDJ", "DD@"]);
  assert.deepEqual(buttons[3].children.map(textOf), ["4R", "—", "—"]);
});

test("editing a past race updates only its own snapshot, including invalidated results", () => {
  const { nodes, click } = createApp();
  const buttons = nodes["#r-control"].children;
  click("#outcome-control", "D@D");
  click("#r-control", 2);
  click("#outcome-control", "DD@");
  click("#r-control", 1);
  click("#y-control", "D2");
  assert.equal(nodes["#win-result"].textContent, "—");
  click("#r-control", 3);
  assert.deepEqual(buttons[0].children.map(textOf), ["1R", "MD2", "—"]);
  assert.deepEqual(buttons[1].children.map(textOf), ["2R", "LDD", "DD@"]);
  click("#r-control", 1);
  click("#outcome-control", "@@@");
  click("#r-control", 3);
  assert.deepEqual(buttons[0].children.map(textOf), ["1R", "MD2", "@@@"]);
  assert.deepEqual(buttons[1].children.map(textOf), ["2R", "LDD", "DD@"]);
});

test("all 12 independent records survive Space/Ctrl+Space wraparound", () => {
  const { nodes, click, events } = createApp();
  const saved = [];
  for (let r = 1; r <= 12; r++) {
    click("#r-control", r);
    const x = r % 2 ? "M" : r % 4 === 0 ? "S" : "L";
    const y = r % 2 ? "DD" : "D2";
    const z = ["", "J", "JJ"][r % 3];
    click("#y-control", y);
    click("#z-control", z);
    const outcome = r % 2 ? "DD@" : "@@@";
    click("#outcome-control", outcome);
    const key = `${x}${y}${z}`;
    saved.push({ key, title: formatTableTitle(key), outcome });
    assert.equal(nodes["#current-title"].textContent, formatTableTitle(key));
  }
  events.keydown({ code: "Space", preventDefault() {} });
  assert.equal(nodes["#current-title"].textContent, saved[0].title);
  assert.ok(nodes["#r-control"].children.every((button) => button.children.length === 1));
  events.keydown({ code: "Space", ctrlKey: true, preventDefault() {} });
  assert.equal(nodes["#current-title"].textContent, saved[11].title);
  assert.equal(pressedValue(nodes["#outcome-control"]), "@@@");
  for (let i = 0; i < 11; i++) {
    assert.deepEqual(nodes["#r-control"].children[i].children.map(textOf), [`${i + 1}R`, saved[i].key, saved[i].outcome]);
  }
  for (let r = 11; r >= 1; r--) {
    events.keydown({ code: "Space", ctrlKey: true, preventDefault() {} });
    assert.equal(nodes["#current-title"].textContent, saved[r - 1].title);
    assert.equal(pressedValue(nodes["#outcome-control"]), saved[r - 1].outcome);
    assert.equal(nodes["#r-control"].children.filter((button) => button.attrs["aria-pressed"] === "true").length, 1);
    assert.equal(nodes["#r-control"].children.filter((button) => button.children.length === 3).length, r - 1);
  }
});
