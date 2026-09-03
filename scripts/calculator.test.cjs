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
const { formatOdds } = appContext.window.HorsieApp;

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
    ["1", "0.15", "0.2"], ["10", "3.50", "35.0"], ["0", "99.99", "0.0"],
    ["9007199254740991", "99.99", "900629853481551690.1"],
  ];
  for (const [amount, odds, expected] of cases) assert.equal(calculator.multiplyToTenths(amount, odds), expected);
  for (const amount of ["", "-1", "1.2"]) assert.equal(calculator.multiplyToTenths(amount, "3.53"), null);
  for (const odds of [null, "NaN", "1.5", "-1.00"]) assert.equal(calculator.multiplyToTenths("25", odds), null);
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
        for (const mode of ["raw", "floor-half", "floor-integer", "round-half", "round-integer"]) {
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
  return { nodes, events, click, input };
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
  assert.ok(nodes["#outcome-help"].textContent.includes("D@D"));
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
  const { nodes, events, click, input } = createApp();
  input("#chip-amount", "25");
  click("#outcome-control", "D@D");
  click("#r-control", 2);
  assert.equal(nodes["#win-multiplier"].textContent, "—");
  click("#outcome-control", "D@D");
  click("#z-control", "J");
  assert.equal(nodes["#chip-amount"].value, "25");
  assert.ok(nodes["#outcome-help"].textContent.includes("D@D"));
  input("#tax-rate", "20");
  const odds = data.LDDJ.find((row) => row.wagerType === "Win" && row.selection === "D").decimalOdds;
  assert.equal(nodes["#win-multiplier"].textContent, formatOdds(odds, 20, "raw"));
  for (const mode of ["raw", "floor-half", "floor-integer", "round-half", "round-integer"]) {
    nodes[".rounding-options"].events.change({ target: { matches() { return true; }, value: mode } });
    assert.equal(nodes["#win-multiplier"].textContent, formatOdds(odds, 20, mode));
  }
  input("#tax-rate", "100");
  assert.equal(nodes["#win-result"].textContent, "0.0");
  click("#y-control", "D2");
  assert.equal(nodes["#win-multiplier"].textContent, "—");
  assert.equal(nodes["#chip-amount"].value, "25");
  click("#outcome-control", "D@@");
  click("#y-control", "DD");
  assert.ok(nodes["#outcome-help"].textContent.includes("D@@"));
  click("#r-control", 12);
  let prevented = false;
  events.keydown({ code: "Space", preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(nodes["#current-r"].textContent, "1R");
  events.keydown({ code: "Space", altKey: true, preventDefault() {} });
  assert.equal(nodes["#current-r"].textContent, "12R");
  assert.equal(nodes["#chip-amount"].value, "25");
});

function textOf(node) {
  return node.textContent ?? node.children.map(textOf).join("");
}

test("table has no Tickets column and probability is visible by default", () => {
  const html = fs.readFileSync(path.join(docs, "index.html"), "utf8");
  assert.doesNotMatch(html, /Tickets/);
  assert.equal((html.match(/<th\b/g) || []).length, 3);
  const { nodes } = createApp();
  assert.equal(nodes["#show-probability"].checked, true);
  assert.equal(nodes["#probability-heading"].hidden, false);
  assert.equal(nodes["#odds-table"].dataset.showProbability, "true");
  nodes["#result-body"].children.forEach((row, index) => {
    assert.equal(row.children.length, 3);
    assert.equal(textOf(row.children[0]), data.MDD[index].selection);
    assert.equal(row.children[1].textContent, `${data.MDD[index].probabilityPercent.toFixed(2)}%`);
    assert.equal(row.children[1].hidden, false);
    assert.equal(row.children[2].textContent, formatOdds(data.MDD[index].decimalOdds, 0, "raw"));
  });
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
  assert.equal(nodes["#probability-heading"].hidden, true);
  assert.equal(nodes["#odds-table"].dataset.showProbability, "false");
  assert.ok(nodes["#result-body"].children.every((row) => row.children[1].hidden));
  assert.equal(nodes["#trifecta-result"].textContent, previousResult);
  nodes["#close-settings"].events.click();
  click("#r-control", 2);
  click("#y-control", "D2");
  click("#z-control", "J");
  input("#tax-rate", "20");
  assert.equal(toggle.checked, false);
  assert.ok(nodes["#result-body"].children.every((row) => row.children[1].hidden));
  click("#r-control", 1);
  assert.match(nodes["#outcome-help"].textContent, /D@D/);
  assert.equal(nodes["#chip-amount"].value, "25");
  const taxedResult = nodes["#trifecta-result"].textContent;
  nodes["#open-settings"].events.click();
  toggle.checked = true;
  toggle.events.change({ target: toggle });
  assert.equal(nodes["#probability-heading"].hidden, false);
  assert.ok(nodes["#result-body"].children.every((row) => !row.children[1].hidden));
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
  assert.equal(nodes["#current-key"].textContent, "LDDJJ");
  assert.equal(nodes["#win-result"].textContent, "—");
  click("#y-control", "D2");
  click("#z-control", "J");
  click("#outcome-control", "@@@");
  click("#r-control", 1);
  assert.equal(nodes["#current-key"].textContent, "MDDJJ");
  assert.match(nodes["#outcome-help"].textContent, /D@D/);
  assert.equal(nodes["#chip-amount"].value, "25");
  assert.ok(buttons.every((button) => button.children.length === 1));
  click("#r-control", 2);
  assert.equal(nodes["#current-key"].textContent, "LD2J");
  assert.match(nodes["#outcome-help"].textContent, /@@@/);
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

test("all 12 independent records survive Space/Alt+Space wraparound", () => {
  const { nodes, click, events } = createApp();
  const saved = [];
  for (let r = 1; r <= 12; r++) {
    click("#r-control", r);
    click("#y-control", r % 2 ? "DD" : "D2");
    click("#z-control", ["", "J", "JJ"][r % 3]);
    const outcome = r % 2 ? "DD@" : "@@@";
    click("#outcome-control", outcome);
    saved.push({ key: nodes["#current-key"].textContent, outcome });
  }
  events.keydown({ code: "Space", preventDefault() {} });
  assert.equal(nodes["#current-r"].textContent, "1R");
  assert.equal(nodes["#current-key"].textContent, saved[0].key);
  assert.ok(nodes["#r-control"].children.every((button) => button.children.length === 1));
  events.keydown({ code: "Space", altKey: true, preventDefault() {} });
  assert.equal(nodes["#current-key"].textContent, saved[11].key);
  assert.match(nodes["#outcome-help"].textContent, /@@@/);
  for (let i = 0; i < 11; i++) {
    assert.deepEqual(nodes["#r-control"].children[i].children.map(textOf), [`${i + 1}R`, saved[i].key, saved[i].outcome]);
  }
  for (let r = 11; r >= 1; r--) {
    events.keydown({ code: "Space", altKey: true, preventDefault() {} });
    assert.equal(nodes["#current-key"].textContent, saved[r - 1].key);
    assert.ok(nodes["#outcome-help"].textContent.includes(saved[r - 1].outcome));
    assert.equal(nodes["#r-control"].children.filter((button) => button.attrs["aria-pressed"] === "true").length, 1);
    assert.equal(nodes["#r-control"].children.filter((button) => button.children.length === 3).length, r - 1);
  }
});
