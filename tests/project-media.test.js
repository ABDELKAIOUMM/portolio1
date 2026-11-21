const assert = require("node:assert/strict");
const test = require("node:test");
const media = require("../project-media.js");

test("existing single-image projects keep their cover and gain a website gallery", () => {
  const project = { image: "assets/uploads/cover.jpg" };
  assert.deepEqual(media.normalize(project), { site: [project.image], dashboard: [] });
  assert.equal(media.cover(project), project.image);
  assert.equal(media.count(project), 1);
  assert.equal(project.gallery, undefined, "Reading must not mutate persisted project data");
});

test("website and dashboard collections keep order and remove duplicate/invalid entries", () => {
  const project = {
    image: "cover.jpg",
    gallery: { site: ["detail.jpg", "detail.jpg", null, "", " cover.jpg "], dashboard: ["orders.png", "metrics.png"] }
  };
  assert.deepEqual(media.normalize(project), { site: ["detail.jpg", "cover.jpg"], dashboard: ["orders.png", "metrics.png"] });
  assert.equal(media.count(project), 4);
});

test("a dashboard cover is not duplicated in the website gallery", () => {
  const project = { image: "admin.png", gallery: { site: ["home.png"], dashboard: ["admin.png"] } };
  assert.deepEqual(media.normalize(project), { site: ["home.png"], dashboard: ["admin.png"] });
  assert.equal(media.cover(project), "admin.png");
});

test("cover falls back to the first website image, then dashboard image", () => {
  assert.equal(media.cover({ gallery: { site: ["home.png"], dashboard: ["admin.png"] } }), "home.png");
  assert.equal(media.cover({ gallery: { dashboard: ["admin.png"] } }), "admin.png");
  assert.equal(media.cover({}), "");
  assert.deepEqual(media.normalize(null), { site: [], dashboard: [] });
});

test("website and dashboard descriptions use independent bilingual fields without mutating projects", () => {
  const project = {
    copy: { en: "Website overview", ar: "وصف الموقع" },
    dashboardCopy: { en: "Dashboard overview", ar: "وصف لوحة التحكم" },
    image: "home.png",
    gallery: { site: ["home.png"], dashboard: ["orders.png", "settings.png"] }
  };
  const before = structuredClone(project);
  assert.equal(media.description(project, "site", "en"), project.copy.en);
  assert.equal(media.description(project, "site", "ar"), project.copy.ar);
  assert.equal(media.description(project, "dashboard", "en"), project.dashboardCopy.en);
  assert.equal(media.description(project, "dashboard", "ar"), project.dashboardCopy.ar);
  assert.deepEqual(media.normalize(project), project.gallery);
  assert.deepEqual(project, before);
});

test("missing dashboard descriptions never fall back to the website copy", () => {
  const project = { copy: { en: "Website only", ar: "وصف الموقع فقط" } };
  for (const dashboardCopy of [undefined, null, "", {}, { en: " ", ar: "\n" }, { en: 42, ar: false }]) {
    const value = { ...project, dashboardCopy };
    assert.equal(media.description(value, "dashboard", "en"), "");
    assert.equal(media.description(value, "dashboard", "ar"), "");
    assert.equal(media.description(value, "site", "en"), project.copy.en);
  }
  assert.equal(media.description(null, "dashboard", "ar"), "");
});

test("a missing translation uses the other dashboard language for display only", () => {
  const project = { dashboardCopy: { ar: "  وصف الإدارة\nسطر ثانٍ  ", en: " " } };
  const before = structuredClone(project);
  assert.equal(media.description(project, "dashboard", "en"), "وصف الإدارة\nسطر ثانٍ");
  assert.equal(media.description(project, "dashboard", "ar"), "وصف الإدارة\nسطر ثانٍ");
  assert.equal(media.description({ dashboardCopy: { en: "English only" } }, "dashboard", "ar"), "English only");
  assert.deepEqual(project, before, "fallback must not write into an empty translation");
});

test("plain string descriptions stay compatible and markup remains plain text", () => {
  const text = 'Manage orders\n<img src="x" onerror="alert(1)">';
  const project = { copy: "Legacy website text", dashboardCopy: text };
  assert.equal(media.description(project, "site", "ar"), project.copy);
  assert.equal(media.description(project, "dashboard", "ar"), text);
  assert.equal(media.description(project, "dashboard", "en"), text);
});

test("invalid or executable source schemes are not rendered", () => {
  ["javascript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "file:///secret", "blob:temporary", "x\n.jpg"].forEach((src) => {
    assert.equal(media.source(src), "");
  });
  ["assets/uploads/صورة.jpg", "https://example.com/image.webp", "data:image/png;base64,aGVsbG8="].forEach((src) => {
    assert.equal(media.source(src), src);
  });
});
