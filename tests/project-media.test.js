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

test("invalid or executable source schemes are not rendered", () => {
  ["javascript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "file:///secret", "blob:temporary", "x\n.jpg"].forEach((src) => {
    assert.equal(media.source(src), "");
  });
  ["assets/uploads/صورة.jpg", "https://example.com/image.webp", "data:image/png;base64,aGVsbG8="].forEach((src) => {
    assert.equal(media.source(src), src);
  });
});
