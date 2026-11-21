const assert = require("node:assert/strict");
const { readFileSync, statSync } = require("node:fs");
const { resolve, sep } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const media = require("../project-media.js");

const root = resolve(__dirname, "..");
const content = JSON.parse(readFileSync(resolve(root, "content/site.json"), "utf8"));

test("the published JSON and bundled fallback contain the same content and image languages", () => {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(resolve(root, "content/site-data.js"), "utf8"), context);
  const snapshot = JSON.parse(JSON.stringify(context.window.__SITE_CONTENT__));
  assert.ok(snapshot._i18n && snapshot._i18n.ar && snapshot._i18n.en);
  delete snapshot._i18n;
  assert.deepEqual(snapshot, content, "a failed JSON request must not restore an older gallery classification");
});

test("every local project screenshot and cover referenced by any language still exists", () => {
  const sources = new Set();
  for (const project of content.work.items) {
    for (const language of ["shared", "ar", "en"]) {
      const gallery = media.editable(project, language);
      gallery.site.concat(gallery.dashboard, [media.cover(project, language)]).filter(Boolean).forEach((src) => sources.add(src));
    }
  }
  for (const src of sources) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)) continue;
    const file = resolve(root, decodeURIComponent(src.split(/[?#]/)[0]));
    assert.ok(file.startsWith(root + sep), "local images must stay inside the site: " + src);
    assert.ok(statSync(file).isFile(), "missing project image: " + src);
  }
});
