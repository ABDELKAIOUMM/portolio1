const assert = require("node:assert/strict");
const test = require("node:test");
const media = require("../project-media.js");

function project() {
  return {
    image: "shared-home.png",
    gallery: { site: ["shared-home.png", "shared-mobile.png"], dashboard: ["shared-orders.png"] },
    galleryByLanguage: {
      ar: { site: ["ar-home.png", "ar-mobile.png"], dashboard: ["ar-orders.png"] },
      en: { site: ["en-home.png"], dashboard: ["en-orders.png", "en-settings.png"] }
    },
    imageByLanguage: { ar: "ar-mobile.png", en: "en-settings.png" },
    copy: { en: "Website", ar: "الموقع" },
    dashboardCopy: { en: "Dashboard", ar: "لوحة التحكم" }
  };
}

test("old screenshots remain shared fallbacks in both languages, without a migration", () => {
  const value = { image: "legacy.png", gallery: { dashboard: ["admin.png"] } };
  const expected = { site: ["legacy.png"], dashboard: ["admin.png"] };
  const before = structuredClone(value);
  for (const language of [undefined, "ar", "en"]) {
    assert.deepEqual(media.normalize(value, language), expected);
    assert.equal(media.cover(value, language), value.image);
    assert.equal(media.count(value, language), 2);
  }
  assert.deepEqual(value, before);
});

test("six independent screenshot collections keep their own ordering and covers", () => {
  const value = project();
  const before = structuredClone(value);
  assert.deepEqual(media.normalize(value), value.gallery);
  for (const language of ["ar", "en"]) {
    assert.deepEqual(media.normalize(value, language), value.galleryByLanguage[language]);
    assert.deepEqual(media.editable(value, language), value.galleryByLanguage[language]);
    assert.equal(media.cover(value, language), value.imageByLanguage[language]);
  }
  assert.equal(media.cover(value), value.image);
  assert.deepEqual(value, before);
});

test("fallback is per category and uses shared images, never the other language", () => {
  const value = project();
  value.galleryByLanguage.en.site = [];
  value.galleryByLanguage.ar.dashboard = [];
  assert.deepEqual(media.normalize(value, "en"), { site: value.gallery.site, dashboard: value.galleryByLanguage.en.dashboard });
  assert.deepEqual(media.normalize(value, "ar"), { site: value.galleryByLanguage.ar.site, dashboard: value.gallery.dashboard });
  assert.deepEqual(media.editable(value, "en").site, [], "the editor must not edit a fallback collection");
  assert.deepEqual(media.editable(value, "ar").dashboard, []);
});

test("a project with only Arabic screenshots never silently shows them in English", () => {
  const value = {
    galleryByLanguage: { ar: { site: ["ar-home.png"], dashboard: ["ar-orders.png"] } },
    imageByLanguage: { ar: "ar-home.png" }
  };
  assert.deepEqual(media.normalize(value, "en"), { site: [], dashboard: [] });
  assert.equal(media.cover(value, "en"), "");
  assert.equal(media.count(value, "en"), 0);
  assert.equal(media.count(value), 2, "the admin total still includes Arabic images");
});

test("shared covers never get inserted into localized collections", () => {
  const value = project();
  value.image = "old-legacy-cover.png";
  assert.deepEqual(media.normalize(value, "ar"), value.galleryByLanguage.ar);
  assert.deepEqual(media.normalize(value, "en"), value.galleryByLanguage.en);
  assert.deepEqual(media.editable(value).site, [value.image, ...value.gallery.site]);
  assert.equal(media.cover(value, "en"), "en-settings.png");
  assert.equal(media.cover(value), "old-legacy-cover.png");
});

test("missing or stale localized covers use the first local image, then the shared cover", () => {
  const value = project();
  value.imageByLanguage = { ar: "removed.png", en: "javascript:alert(1)" };
  assert.equal(media.cover(value, "ar"), "ar-home.png");
  assert.equal(media.cover(value, "en"), "en-home.png");
  value.galleryByLanguage.en.site = [];
  assert.equal(media.cover(value, "en"), "en-orders.png");
  value.galleryByLanguage.en.dashboard = [];
  assert.equal(media.cover(value, "en"), value.image);
});

test("public counts reflect the selected language while admin counts include every collection", () => {
  const value = project();
  assert.equal(media.count(value, "ar"), 3);
  assert.equal(media.count(value, "en"), 3);
  assert.equal(media.count(value), 9);
  value.galleryByLanguage.en.site.push("en-product.png");
  assert.equal(media.count(value, "en"), 4);
  assert.equal(media.count(value, "ar"), 3);
  assert.equal(media.count(value), 10);
});

test("localized galleries sanitize invalid entries and do not mutate any persisted arrays or descriptions", () => {
  const value = project();
  value.galleryByLanguage.en.site = [null, "", "javascript:alert(1)", " en-home.png ", "en-home.png", "en-product.png"];
  value.galleryByLanguage.ar.dashboard = null;
  const before = structuredClone(value);
  const result = media.normalize(value, "en");
  assert.deepEqual(result.site, ["en-home.png", "en-product.png"]);
  result.site.push("a-temporary-view-only.png");
  assert.deepEqual(media.normalize(value, "ar").dashboard, value.gallery.dashboard);
  assert.equal(media.description(value, "dashboard", "ar"), "لوحة التحكم");
  assert.deepEqual(value, before);
  assert.deepEqual(media.editable(null, "ar"), { site: [], dashboard: [] });
});
