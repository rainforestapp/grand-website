const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

// The About page carries an unapproved story, so it ships deliberately
// unreachable: no link from any other page, out of the sitemap, and noindexed.
// Each of those is one careless edit away from publishing the story early, so
// each gets its own assertion. Lifting the page is then an explicit decision —
// you have to come here and delete these tests on purpose.

const about = fs.readFileSync("about.html", "utf8");

function teamGrid() {
  const m = about.match(/<ul class="team-grid">[\s\S]*?<\/ul>/);
  assert.ok(m, "about.html no longer has a .team-grid");
  return m[0];
}

function siteHtmlFiles() {
  const roots = [".", "grace"];
  const files = [];
  for (const dir of roots) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".html")) continue;
      const rel = path.join(dir, name);
      if (rel === "about.html") continue;
      files.push(rel);
    }
  }
  assert.ok(files.length >= 4, "expected to find the other site pages");
  return files;
}

test("about.html is noindexed", () => {
  assert.match(about, /<meta name="robots" content="noindex, nofollow">/);
});

test("about.html is absent from the sitemap", () => {
  const sitemap = fs.readFileSync("sitemap.xml", "utf8");
  assert.equal(sitemap.includes("about"), false);
});

test("no other page links to about.html", () => {
  const linking = siteHtmlFiles().filter((rel) =>
    fs.readFileSync(rel, "utf8").includes("about.html"),
  );
  assert.deepEqual(linking, []);
});

test("the story is still holding copy, not the real story", () => {
  // If this fails, the approved story has landed — which is the moment to
  // delete this whole file and link the page up.
  assert.match(about, /<div class="about-story">/);
  assert.match(about, /class="kicker">Placeholder</);
});

test("the founding team is the six from the deck, in deck order", () => {
  const names = [...about.matchAll(/<p class="team-name">([^<]+)<\/p>/g)].map((m) => m[1]);
  assert.deepEqual(names, ["Fred", "Si", "James", "Keith", "AJ", "Billy"]);
});

test("Achille is not in the founding team", () => {
  // He is on the same deck slide, but under "Advisor" rather than the team
  // block. Excluding him was explicit, so it gets an explicit test. Scoped to
  // the grid, not the whole file, because the markup comment above the grid
  // names him to explain the omission.
  assert.equal(/achille/i.test(teamGrid()), false);
});

test("every portrait file the page asks for exists", () => {
  const srcs = [...about.matchAll(/<img [^>]*src="(assets\/team\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(srcs.length, 6);
  for (const src of srcs) {
    assert.ok(fs.existsSync(src), `${src} is referenced but missing`);
  }
});

test("every founding-team card has a name and a portrait", () => {
  const cards = about.match(/<li class="team-member">[\s\S]*?<\/li>/g) || [];
  assert.ok(cards.length > 0, "founding team grid is empty");
  for (const card of cards) {
    assert.match(card, /<img [^>]*class="[^"]*team-photo[^"]*"[^>]*>/, "card is missing its photo");
    assert.match(card, /<p class="team-name">[^<]+<\/p>/, "card is missing its name");
  }
});
