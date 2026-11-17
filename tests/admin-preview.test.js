const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const html = readFileSync(join(__dirname, "..", "admin.html"), "utf8");

function previewHref() {
  const link = html.match(/<a\b[^>]*href="([^"]+)"[^>]*>معاينة الموقع ↗<\/a>/);
  assert.ok(link, "The dashboard must have a site preview link");
  return link[1];
}

test("preview opens the project site instead of the GitHub Pages account root", () => {
  const target = new URL(previewHref(), "https://abdelkaioumm.github.io/portolio1/admin.html");
  assert.equal(target.href, "https://abdelkaioumm.github.io/portolio1/index.html");
});

test("preview stays on the current site when running the local server", () => {
  const target = new URL(previewHref(), "http://localhost:4173/admin.html");
  assert.equal(target.href, "http://localhost:4173/index.html");
});
