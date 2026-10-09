const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");

// Content checks for the About page's team section. These stay valid after the
// page is published -- unlike about-unlisted.test.cjs, which is deleted then.

const about = fs.readFileSync("about.html", "utf8");

function teamGrid() {
  const m = about.match(/<ul class="team-grid">[\s\S]*?<\/ul>/);
  assert.ok(m, "about.html no longer has a .team-grid");
  return m[0];
}

// One pass over the cards, so the portrait and the name are read as a pair.
// Asserting two independent lists would let two people's photos be swapped
// without failing anything.
function cards() {
  return (teamGrid().match(/<li class="team-member">[\s\S]*?<\/li>/g) || []).map((card) => {
    const src = card.match(/<img [^>]*src="(assets\/team\/[^"]+)"/);
    const name = card.match(/<p class="team-name">([^<]+)<\/p>/);
    assert.ok(src, "a team card has no portrait");
    assert.ok(name, "a team card has no name");
    // The double-barrelled surnames are written with a non-breaking hyphen
    // entity so they cannot split mid-surname; compare on what a reader sees.
    return { src: src[1], name: name[1].replace(/&#8209;/g, "-") };
  });
}

test("the team is the six people, each with the right portrait, in order", () => {
  assert.deepEqual(cards(), [
    { src: "assets/team/fred.webp", name: "Fred Stevens-Smith" },
    { src: "assets/team/si.webp", name: "Si Stephens-Manassiev" },
    { src: "assets/team/james.webp", name: "James Palmer" },
    { src: "assets/team/keith.webp", name: "Keith Johnson" },
    { src: "assets/team/aj.webp", name: "AJ Funk" },
    { src: "assets/team/billy.webp", name: "Billy Goudy" },
  ]);
});

test("Achille is not in the team", () => {
  // He is an advisor, not a member of the team. Excluding him was explicit, so
  // it gets an explicit test. Scoped to the grid because the markup comment
  // above it names him to explain the omission.
  assert.equal(/achille/i.test(teamGrid()), false);
});

test("every portrait file the page asks for exists", () => {
  for (const { src } of cards()) {
    assert.ok(fs.existsSync(src), `${src} is referenced but missing`);
  }
});

test("every portrait declares its real intrinsic size", () => {
  // The markup comment says Fred's and Keith's files get replaced when better
  // ones turn up. A drop-in at a different size would otherwise mis-declare the
  // aspect ratio and reintroduce layout shift, silently.
  const declared = [...about.matchAll(
    /<img [^>]*src="(assets\/team\/[^"]+)" width="(\d+)" height="(\d+)"/g,
  )];
  assert.equal(declared.length, 6);
  for (const [, src, w, h] of declared) {
    const buf = fs.readFileSync(src);
    // WebP VP8X extended header: canvas size is 24-bit little-endian, minus one.
    assert.equal(buf.toString("ascii", 12, 16), "VP8X", `${src} is not an extended WebP`);
    const realW = (buf.readUIntLE(24, 3) + 1).toString();
    const realH = (buf.readUIntLE(27, 3) + 1).toString();
    assert.equal(w, realW, `${src} declares width ${w} but is ${realW}`);
    assert.equal(h, realH, `${src} declares height ${h} but is ${realH}`);
  }
});

test("about.html loads its own stylesheet", () => {
  // The placeholder panel's deliberately-unfinished look lives entirely in
  // about.css; without it the holding copy reads as finished prose.
  assert.match(about, /<link rel="stylesheet" href="about\.css">/);
  assert.ok(fs.existsSync("about.css"));
});
