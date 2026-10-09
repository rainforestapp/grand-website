const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

// The About page ships deliberately unreachable from the website: no link from
// any other page, out of the sitemap, noindexed. Each of those is one careless
// edit away from pointing visitors at an unapproved story, so each gets its own
// assertion. DELETE THIS WHOLE FILE in the change that publishes the page --
// the durable content checks live in about-team.test.cjs and stay.
//
// What this does NOT guard: the repo is public and the site deploys from it, so
// the page is world-readable at /about.html regardless. These tests keep it
// unadvertised, not private.

const about = fs.readFileSync("about.html", "utf8");

// Walk the whole tree rather than a fixed list of directories: a link added
// from a page in a new subdirectory would otherwise slip past the guard.
function textFilesToScan(dir = ".", out = []) {
  const skip = new Set([".git", "node_modules", "docs", "tests", ".github", ".context", ".gstack"]);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const rel = path.join(dir, entry.name).replace(/^\.\//, "");
    if (entry.isDirectory()) textFilesToScan(rel, out);
    else if (/\.(html|js|xml|css)$/.test(entry.name) && rel !== "about.html") out.push(rel);
  }
  return out;
}

test("about.html is noindexed", () => {
  assert.match(about, /<meta name="robots" content="noindex, nofollow">/);
});

test("about.html is absent from the sitemap", () => {
  const sitemap = fs.readFileSync("sitemap.xml", "utf8");
  assert.equal(/about/i.test(sitemap), false);
});

test("nothing anywhere in the site links to the About page", () => {
  // Match the stem, not the filename: Pages also serves the page at the
  // extensionless /about, so href="/about" would publish it just as well.
  const linking = textFilesToScan().filter((rel) =>
    /href\s*=\s*["'][^"']*\babout\b/i.test(fs.readFileSync(rel, "utf8")),
  );
  assert.deepEqual(linking, []);
});

test("the story is still holding copy, not the real story", () => {
  // If this fails, the approved story has landed -- which is the moment to
  // delete this file and link the page up.
  assert.match(about, /<div class="about-story">/);
  assert.match(about, /class="kicker">Placeholder</);
});
