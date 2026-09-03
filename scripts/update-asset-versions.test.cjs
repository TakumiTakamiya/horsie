"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const script = path.resolve(__dirname, "update-asset-versions.cjs");
const hook = path.resolve(__dirname, "../.githooks/pre-commit");

function fixture(t) {
  const prefix = path.join(os.tmpdir(), "horsie-cache-hook-test-");
  const root = fs.mkdtempSync(prefix);
  t.after(() => {
    // Delete only the exact disposable directory created by this test.
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith("horsie-cache-hook-test-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  const write = (file, text) => fs.writeFileSync(path.join(root, file), text);
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const run = () => spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  git("init");
  git("config", "user.name", "Hook Test");
  git("config", "user.email", "hook-test@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  fs.mkdirSync(path.join(root, "docs"));
  write("docs/index.html", '<link href="style.css" rel="stylesheet">\n<script src="app.js" defer></script>\n');
  write("docs/style.css", "body { color: green; }\n");
  write("docs/app.js", "console.log('first');\n");
  git("add", ".");
  return { root, git, write, read, run };
}

test("versions staged CSS and JS, is idempotent, and ignores unrelated commits", (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const html = f.read("docs/index.html");
  assert.ok(html.includes(`style.css?v=${f.git("rev-parse", ":docs/style.css").slice(0, 12)}`));
  assert.ok(html.includes(`app.js?v=${f.git("rev-parse", ":docs/app.js").slice(0, 12)}`));
  assert.equal(f.git("show", ":docs/index.html"), html.trim());
  assert.equal(f.run().status, 0);
  assert.equal(f.read("docs/index.html"), html);
  f.git("commit", "-m", "initial");
  f.write("README.md", "Unrelated change\n");
  f.git("add", "README.md");
  assert.equal(f.run().status, 0);
  assert.equal(f.git("diff", "--cached", "--name-only"), "README.md");
});

test("uses staged asset contents without including unstaged edits", (t) => {
  const f = fixture(t);
  const hash = f.git("rev-parse", ":docs/app.js").slice(0, 12);
  f.write("docs/app.js", "console.log('unstaged');\n");
  assert.equal(f.run().status, 0);
  assert.ok(f.read("docs/index.html").includes(`app.js?v=${hash}`));
  assert.equal(f.git("show", ":docs/app.js"), "console.log('first');");
  assert.ok(f.read("docs/app.js").includes("unstaged"));
});

test("refuses partial HTML edits without changing either version", (t) => {
  const f = fixture(t);
  const staged = f.git("show", ":docs/index.html");
  const edited = f.read("docs/index.html") + "<!-- not staged -->\n";
  f.write("docs/index.html", edited);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unstaged edits/);
  assert.equal(f.read("docs/index.html"), edited);
  assert.equal(f.git("show", ":docs/index.html"), staged);
});

test("changes only the affected version, preserving query parameters and fragments", (t) => {
  const f = fixture(t);
  f.write("docs/index.html", '<script src="app.js?theme=dark&amp;v=old#entry"></script>\n<link href="style.css">\n<script src="https://example.invalid/lib.js"></script>\n');
  f.git("add", "docs/index.html");
  assert.equal(f.run().status, 0);
  const oldHtml = f.read("docs/index.html");
  f.git("commit", "-m", "initial");
  f.write("docs/app.js", "console.log('second');\n");
  f.git("add", "docs/app.js");
  assert.equal(f.run().status, 0);
  const html = f.read("docs/index.html");
  assert.notEqual(html, oldHtml);
  assert.match(html, /app\.js\?theme=dark&amp;v=[a-f0-9]{12}#entry/);
  assert.equal(html.match(/style\.css\?v=\w+/)[0], oldHtml.match(/style\.css\?v=\w+/)[0]);
  assert.ok(html.includes('src="https://example.invalid/lib.js"'));
});

test("missing staged asset fails before mutating HTML", (t) => {
  const f = fixture(t);
  f.git("rm", "--cached", "docs/app.js");
  const original = f.read("docs/index.html");
  assert.equal(f.run().status, 1);
  assert.equal(f.read("docs/index.html"), original);
});

test("real pre-commit supports normal/-a commits and safely rejects --only", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, "scripts"));
  fs.mkdirSync(path.join(f.root, ".githooks"));
  fs.copyFileSync(script, path.join(f.root, "scripts/update-asset-versions.cjs"));
  fs.copyFileSync(hook, path.join(f.root, ".githooks/pre-commit"));
  fs.chmodSync(path.join(f.root, ".githooks/pre-commit"), 0o755);
  f.git("config", "core.hooksPath", ".githooks");
  f.git("add", ".");
  f.git("commit", "-m", "initial via hook");
  for (const mode of ["-a"]) {
    f.write("docs/app.js", `console.log('${mode}');\n`);
    const args = ["commit", mode, "-m", `hook ${mode}`];
    f.git(...args);
    const hash = f.git("rev-parse", "HEAD:docs/app.js").slice(0, 12);
    assert.ok(f.git("show", "HEAD:docs/index.html").includes(`app.js?v=${hash}`));
    assert.equal(f.git("status", "--porcelain"), "");
  }
  const html = f.read("docs/index.html");
  f.write("docs/app.js", "console.log('partial commit');\n");
  assert.throws(() => f.git("commit", "--only", "-m", "partial", "--", "docs/app.js"), /Selective\/alternate-index/);
  assert.equal(f.read("docs/index.html"), html);
  assert.equal(f.git("diff", "--cached", "--name-only"), "");
  assert.equal(f.git("diff", "--name-only"), "docs/app.js");
});
