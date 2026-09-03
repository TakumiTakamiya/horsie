"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const path = require("node:path");

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

function main() {
  process.chdir(git("rev-parse", "--show-toplevel").trim());
  const htmlPath = "docs/index.html";
  // Read the commit's index, never unstaged asset contents.
  if (!git("ls-files", "--stage", "--", htmlPath).trim()) return;
  const stagedHtml = git("show", `:${htmlPath}`);
  const versionedHtml = stagedHtml.replace(/<(?:script|link)\b[^>]*>/gi, (tag) =>
    tag.replace(/\b(src|href)=(['"])([^'"?#]+)(\?[^'"#]*)?(#[^'"]*)?\2/gi,
      (attribute, name, quote, urlPath, query = "", fragment = "") => {
        if (!/\.(css|js)$/i.test(urlPath) || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(urlPath)) {
          return attribute;
        }
        const assetPath = path.posix.normalize(`docs/${decodeURIComponent(urlPath)}`);
        if (!assetPath.startsWith("docs/")) {
          throw new Error(`Asset must be inside docs/: ${urlPath}`);
        }
        // A staged blob ID is stable and ignores unstaged edits to the asset.
        const version = git("rev-parse", "--verify", `:${assetPath}`).trim().slice(0, 12);
        const params = new URLSearchParams(query.replace(/^\?/, "").replace(/&amp;/g, "&"));
        params.set("v", version);
        const encodedQuery = params.toString().replace(/&/g, "&amp;");
        return `${name}=${quote}${urlPath}?${encodedQuery}${fragment}${quote}`;
      })
  );
  if (versionedHtml === stagedHtml) return;

  // --only/path-limited commits maintain a second index that Git later restores.
  // Updating it here would leave staged reversions after the commit. Fail safely.
  const normalIndex = path.join(git("rev-parse", "--absolute-git-dir").trim(), "index");
  const activeIndex = path.resolve(process.env.GIT_INDEX_FILE || normalIndex);
  if (activeIndex !== normalIndex && activeIndex !== `${normalIndex}.lock`) {
    throw new Error("Selective/alternate-index commits cannot update asset versions safely. Stage the desired files and run git commit without file paths. No files were changed.");
  }

  const diff = spawnSync("git", ["diff", "--quiet", "--", htmlPath]);
  if (diff.status !== 0) {
    throw new Error("docs/index.html has unstaged edits. Stage it fully or stash those edits, then retry the commit. No files were changed.");
  }
  writeFileSync(htmlPath, versionedHtml, "utf8");
  git("add", "--", htmlPath);
  console.log("Updated staged CSS/JS cache versions in docs/index.html.");
}

try {
  main();
} catch (error) {
  console.error(`Cache-version hook failed: ${error.message}`);
  process.exitCode = 1;
}
