const { test, expect } = require("@playwright/test");
const { readFileSync } = require("node:fs");
const { publicSite, adminSite, fixtureContent } = require("./helpers");

const description = { en: "Independent dashboard overview.", ar: "وصف مستقل للوحة التحكم." };
const image = (name) => `https://images.example.test/${name}.svg`;
const list = (page, group) => page.locator(`[data-gallery-list="${group}"]`);
const scope = (page) => page.locator("#projectGalleryLanguage");
const openEditor = (page, index = 0) => page.locator(".project-card").nth(index).getByRole("button", { name: "تعديل", exact: true }).click();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const files = (...names) => names.map((name) => ({ name, mimeType: "image/png", buffer: png }));

function localizedContent() {
  const content = fixtureContent();
  const project = content.work.items[0];
  project.dashboardCopy = { ...description };
  project.galleryByLanguage = {
    ar: { site: [image("ar-home"), image("ar-mobile")], dashboard: [image("ar-orders"), image("ar-analytics")] },
    en: { site: [image("en-home"), image("en-product")], dashboard: [image("en-orders")] }
  };
  project.imageByLanguage = { ar: image("ar-mobile"), en: image("en-product") };
  return content;
}

async function projectsPanel(page) {
  if (await page.locator("#sidebarToggle").isVisible()) await page.locator("#sidebarToggle").click();
  await page.locator('.admin-nav__item[data-panel="projects"]').click();
}

async function addLink(page, group, url) {
  await page.locator(`[data-gallery-url="${group}"]`).fill(url);
  await page.locator(`[data-gallery-add-url="${group}"]`).click();
}

for (const [language, width] of [["en", 390], ["ar", 1440]]) {
  test(`the ${language} site loads its own cover and lazy screenshot collections at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const content = localizedContent();
    const project = content.work.items[0];
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    const { errors } = await publicSite(page, { content, language });
    await expect(page.locator(".project-media img").first()).toHaveAttribute("src", project.imageByLanguage[language]);
    await expect(page.locator(".project-photo-count").first()).toHaveText(language === "ar" ? "٤ صور" : "3 photos");
    expect(requests.some((url) => url.includes(language === "ar" ? "/en-" : "/ar-"))).toBe(false);
    expect(requests.some((url) => url.includes(`/${language}-orders`))).toBe(false);
    await page.locator(".project-gallery-trigger").first().click();
    await expect(page.locator("#galleryImage")).toHaveAttribute("src", project.galleryByLanguage[language].site[0]);
    await expect(page.locator("#galleryThumbnails button")).toHaveCount(2);
    await page.locator("#galleryDashboardTab").click();
    await expect(page.locator("#galleryImage")).toHaveAttribute("src", project.galleryByLanguage[language].dashboard[0]);
    await expect(page.locator("#galleryThumbnails button")).toHaveCount(language === "ar" ? 2 : 1);
    await expect(page.locator("#galleryDescription")).toHaveText(description[language]);
    expect(requests.some((url) => url.includes(language === "ar" ? "/en-" : "/ar-"))).toBe(false);
    expect(await page.evaluate(() => window.siteContent.get().work.items[0])).toEqual(project);
    expect(errors).toEqual([]);
  });
}

test("changing language while a gallery is open selects its images, counts, description and cover together", async ({ page }) => {
  const content = localizedContent();
  const { errors } = await publicSite(page, { content, language: "ar" });
  await page.locator(".project-gallery-trigger").first().click();
  await page.locator("#galleryDashboardTab").click();
  await page.locator("[data-gallery-next]").click();
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", image("ar-analytics"));
  await page.evaluate(() => window.siteI18n.setLanguage("en"));
  await expect(page.locator("#galleryDashboardTab")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", image("en-orders"));
  await expect(page.locator("#galleryCounter")).toHaveText("Image 1 of 1");
  await expect(page.locator("#galleryDescription")).toHaveText(description.en);
  await expect(page.locator(".project-media img").first()).toHaveAttribute("src", image("en-product"));
  await expect(page.locator("[data-gallery-next]")).toBeHidden();
  await page.evaluate(() => window.siteI18n.setLanguage("ar"));
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", image("ar-orders"));
  await page.locator("#galleryDashboardTab").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#gallerySiteTab")).toBeFocused();
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", image("ar-home"));
  await expect(page.locator("#galleryDescription")).toHaveText(content.work.items[0].copy.ar);
  expect(errors).toEqual([]);
});

test("a missing language/category uses only that category's shared screenshots", async ({ page }) => {
  const content = localizedContent();
  content.work.items[0].galleryByLanguage.en.site = [];
  content.work.items[0].galleryByLanguage.ar.dashboard = [];
  const { errors } = await publicSite(page, { content });
  await page.locator(".project-gallery-trigger").first().click();
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", content.work.items[0].gallery.site[0]);
  await expect(page.locator("#galleryThumbnails button")).toHaveCount(3);
  await page.locator("#galleryDashboardTab").click();
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", image("en-orders"));
  await page.evaluate(() => window.siteI18n.setLanguage("ar"));
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", content.work.items[0].gallery.dashboard[0]);
  await expect(page.locator("#galleryThumbnails button")).toHaveCount(2);
  await page.locator("#gallerySiteTab").click();
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", image("ar-home"));
  expect(errors).toEqual([]);
});

test("Arabic-only images do not leak into an empty English gallery or cover", async ({ page }) => {
  const content = localizedContent();
  const project = content.work.items[0];
  project.image = "";
  project.gallery = { site: [], dashboard: [] };
  delete project.galleryByLanguage.en;
  delete project.imageByLanguage.en;
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  const { errors } = await publicSite(page, { content });
  await expect(page.locator(".project-media img").first()).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await page.locator(".project-gallery-trigger").first().click();
  await expect(page.locator("#galleryEmpty")).toBeVisible();
  await expect(page.locator("#galleryImage")).not.toHaveAttribute("src");
  await page.locator("#galleryDashboardTab").click();
  await expect(page.locator("#galleryDescription")).toHaveText(description.en);
  await expect(page.locator("#galleryEmpty")).toBeVisible();
  expect(requests.some((url) => url.includes("/ar-"))).toBe(false);
  await page.evaluate(() => window.siteI18n.setLanguage("ar"));
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", image("ar-orders"));
  await expect(page.locator("#galleryEmpty")).toBeHidden();
  await page.evaluate(() => window.siteI18n.setLanguage("en"));
  await expect(page.locator("#galleryImage")).not.toHaveAttribute("src");
  await expect(page.locator("#galleryZoom")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("legacy shared images retain the image position across languages and need no content migration", async ({ page }) => {
  const { content, errors } = await publicSite(page);
  await page.locator(".project-gallery-trigger").first().click();
  await page.locator("[data-gallery-next]").click();
  const selected = await page.locator("#galleryImage").getAttribute("src");
  await page.evaluate(() => window.siteI18n.setLanguage("ar"));
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", selected);
  await expect(page.locator("#galleryThumbnails button")).toHaveCount(3);
  const stored = await page.evaluate(() => window.siteContent.get().work.items[0]);
  expect(stored.gallery).toEqual(content.work.items[0].gallery);
  expect(stored.galleryByLanguage).toBeUndefined();
  expect(stored.imageByLanguage).toBeUndefined();
  expect(errors).toEqual([]);
});

test("a broken localized image does not break the next language's images", async ({ page }) => {
  const content = localizedContent();
  // Keep the deliberately broken screenshot out of the already-loaded cover's
  // decoded image cache, so the gallery really receives the mocked 404.
  content.work.items[0].imageByLanguage.en = image("en-home");
  const { errors } = await publicSite(page, { content });
  await page.route(image("en-product"), (route) => route.fulfill({ status: 404, body: "Not found" }));
  await page.locator(".project-gallery-trigger").first().click();
  await page.locator("[data-gallery-next]").click();
  await expect(page.locator("#galleryEmpty")).toHaveText(/could not be loaded/);
  await page.evaluate(() => window.siteI18n.setLanguage("ar"));
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", image("ar-home"));
  await expect(page.locator("#galleryImage")).toBeVisible();
  await expect(page.locator("#galleryEmpty")).toBeHidden();
  await expect(page.locator("#galleryZoom")).toBeEnabled();
  expect(errors).toEqual([]);
});

for (const width of [320, 768, 1440]) {
  test(`each language has independent upload, cover, order and save controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const content = fixtureContent();
    content.work.items[0].dashboardCopy = { ...description };
    const original = structuredClone(content.work.items[0]);
    const app = await adminSite(page, { content });
    await openEditor(page);
    await expect(scope(page)).toHaveValue("shared");
    await expect(list(page, "site").locator(".gallery-editor-image")).toHaveCount(3);
    await scope(page).selectOption("ar");
    await expect(list(page, "site").locator(".gallery-editor-image")).toHaveCount(0);
    await expect(page.locator('[data-gallery-empty="site"]')).toContainText("ستُعرض الصور المشتركة");
    expect(await page.evaluate(() => localStorage.getItem("portfolio-admin-draft"))).toBeNull();
    await page.locator('[data-gallery-upload="site"]').setInputFiles(files("ar-home.png", "ar-mobile.png"));
    await expect(list(page, "site").locator(".gallery-editor-image")).toHaveCount(2);
    await page.locator('[data-gallery-upload="dashboard"]').setInputFiles(files("ar-orders.png"));
    await expect(list(page, "dashboard").locator(".gallery-editor-image")).toHaveCount(1);
    await list(page, "site").locator(".gallery-set-cover").nth(1).click();
    await list(page, "site").locator('[data-move="earlier"]').nth(1).click();
    await scope(page).selectOption("en");
    await expect(list(page, "site").locator(".gallery-editor-image")).toHaveCount(0);
    await expect(page.locator("#projectGalleryLanguageStatus")).toContainText("الإنجليزية");
    await page.locator('[data-gallery-upload="site"]').setInputFiles(files("en-home.png"));
    await expect(list(page, "site").locator(".gallery-editor-image")).toHaveCount(1);
    await page.locator('[data-gallery-upload="dashboard"]').setInputFiles(files("en-orders.png", "en-analytics.png"));
    await expect(list(page, "dashboard").locator(".gallery-editor-image")).toHaveCount(2);
    await list(page, "dashboard").locator(".gallery-set-cover").nth(1).click();
    await list(page, "dashboard").locator('[data-move="earlier"]').nth(1).click();
    await list(page, "dashboard").locator(".gallery-remove-image").nth(1).click();
    await page.locator('#projectForm [type="submit"]').click();
    await page.locator("#saveBtn").click();
    await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
    const saved = app.saved().work.items[0];
    expect(saved.gallery).toEqual(original.gallery);
    expect(saved.image).toBe(original.image);
    expect(saved.copy).toEqual(original.copy);
    expect(saved.dashboardCopy).toEqual(original.dashboardCopy);
    expect(saved.galleryByLanguage).toEqual({
      ar: { site: ["assets/uploads/test-2.svg", "assets/uploads/test-1.svg"], dashboard: ["assets/uploads/test-3.svg"] },
      en: { site: ["assets/uploads/test-4.svg"], dashboard: ["assets/uploads/test-6.svg"] }
    });
    expect(saved.imageByLanguage).toEqual({ ar: "assets/uploads/test-2.svg", en: "assets/uploads/test-6.svg" });
    expect(app.saved().work.items.slice(1)).toEqual(content.work.items.slice(1));
    await page.reload();
    await projectsPanel(page);
    await openEditor(page);
    await expect(scope(page)).toHaveValue("shared");
    await expect(list(page, "site").locator(".gallery-editor-image")).toHaveCount(3);
    await scope(page).selectOption("en");
    await expect(list(page, "dashboard").locator(".gallery-editor-image.is-cover img")).toHaveAttribute("src", "assets/uploads/test-6.svg");
    await scope(page).selectOption("ar");
    await expect(list(page, "site").locator(".gallery-editor-image.is-cover img")).toHaveAttribute("src", "assets/uploads/test-2.svg");
    await expect(page.locator("#projectGalleryTotal")).toContainText("10");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await scope(page).evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(app.uploads()).toBe(6);
    expect(app.errors).toEqual([]);
  });
}

test("removing a localized cover repairs only that language and an empty language returns to shared images", async ({ page }) => {
  const content = localizedContent();
  const original = structuredClone(content.work.items[0]);
  const app = await adminSite(page, { content });
  await openEditor(page);
  await scope(page).selectOption("en");
  await list(page, "site").locator(".gallery-remove-image").last().click();
  await expect(list(page, "site").locator(".gallery-editor-image.is-cover img")).toHaveAttribute("src", image("en-home"));
  await list(page, "site").locator(".gallery-remove-image").click();
  await expect(list(page, "dashboard").locator(".gallery-editor-image.is-cover img")).toHaveAttribute("src", image("en-orders"));
  await list(page, "dashboard").locator(".gallery-remove-image").click();
  await expect(page.locator('[data-gallery-empty="dashboard"]')).toBeVisible();
  await page.locator("#saveBtn").click();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  const saved = app.saved().work.items[0];
  expect(saved.galleryByLanguage.en).toEqual({ site: [], dashboard: [] });
  expect(saved.imageByLanguage.en).toBe("");
  expect(saved.galleryByLanguage.ar).toEqual(original.galleryByLanguage.ar);
  expect(saved.imageByLanguage.ar).toBe(original.imageByLanguage.ar);
  expect(saved.gallery).toEqual(original.gallery);
  expect(saved.image).toBe(original.image);
  const preview = await page.context().newPage();
  const { errors } = await publicSite(preview, { content: app.saved() });
  await expect(preview.locator(".project-media img").first()).toHaveAttribute("src", original.image);
  await preview.locator(".project-gallery-trigger").first().click();
  await expect(preview.locator("#galleryThumbnails button")).toHaveCount(3);
  expect(errors).toEqual([]);
  await preview.close();
  expect(app.errors).toEqual([]);
});

test("localized images, covers and descriptions survive a failed save and reload; Undo restores all scopes", async ({ page }) => {
  const content = localizedContent();
  const app = await adminSite(page, { content });
  await openEditor(page);
  await scope(page).selectOption("en");
  await addLink(page, "dashboard", image("en-draft-orders"));
  await list(page, "dashboard").locator(".gallery-set-cover").last().click();
  await page.locator('#projectForm [name="dashboardCopy_en"]').fill("Draft English dashboard description");
  await page.reload();
  await projectsPanel(page);
  await openEditor(page);
  await scope(page).selectOption("en");
  await expect(list(page, "dashboard").locator(".gallery-editor-image")).toHaveCount(2);
  await expect(list(page, "dashboard").locator(".gallery-editor-image.is-cover img")).toHaveAttribute("src", image("en-draft-orders"));
  await page.route(/\/api\/content(?:\?.*)?$/, (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 409, json: { error: "Content changed; reload before publishing" } }) : route.fallback());
  await page.locator("#saveBtn").click();
  await expect(page.locator("#toastStack")).toContainText("فشل الحفظ");
  await expect(scope(page)).toBeEnabled();
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem("portfolio-admin-draft")));
  expect(draft.work.items[0].galleryByLanguage.en.dashboard).toContain(image("en-draft-orders"));
  expect(draft.work.items[0].imageByLanguage.en).toBe(image("en-draft-orders"));
  expect(draft.work.items[0].galleryByLanguage.ar).toEqual(content.work.items[0].galleryByLanguage.ar);
  expect(draft.work.items[0].dashboardCopy.en).toBe("Draft English dashboard description");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#undoBtn").click();
  await openEditor(page);
  await scope(page).selectOption("en");
  await expect(list(page, "dashboard").locator(".gallery-editor-image")).toHaveCount(1);
  await expect(page.locator('#projectForm [name="dashboardCopy_en"]')).toHaveValue(description.en);
  expect(app.saved().work.items[0]).toEqual(content.work.items[0]);
  expect(await page.evaluate(() => localStorage.getItem("portfolio-admin-draft"))).toBeNull();
  expect(app.errors).toEqual([]);
});

test("uploads and publishing lock the language selector and keep partial successes in the correct collection", async ({ page }) => {
  let releaseUpload;
  const uploadGate = new Promise((resolve) => { releaseUpload = resolve; });
  const app = await adminSite(page, { upload: async (route, count) => {
    if (count === 1) {
      await uploadGate;
      return route.fulfill({ json: { ok: true, path: "assets/uploads/test-english.svg" } });
    }
    return route.fulfill({ status: 500, json: { error: "Upload unavailable" } });
  } });
  await openEditor(page);
  await scope(page).selectOption("en");
  await page.locator('[data-gallery-upload="site"]').setInputFiles(files("en-ok.png", "en-failed.png"));
  await expect(scope(page)).toBeDisabled();
  await expect(page.locator("#saveBtn")).toBeDisabled();
  await scope(page).evaluate((node) => { node.value = "ar"; node.dispatchEvent(new Event("change", { bubbles: true })); });
  await expect(scope(page)).toHaveValue("en");
  releaseUpload();
  await expect(scope(page)).toBeEnabled();
  await expect(page.locator("#projectUploadStatus")).toContainText("تعذّر رفع 1");
  await expect(list(page, "site").locator(".gallery-editor-image")).toHaveCount(1);
  let releaseSave;
  const saveGate = new Promise((resolve) => { releaseSave = resolve; });
  await page.route(/\/api\/content(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") await saveGate;
    await route.fallback();
  });
  await page.locator("#saveBtn").click();
  await expect(scope(page)).toBeDisabled();
  releaseSave();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  await expect(scope(page)).toBeEnabled();
  const saved = app.saved().work.items[0];
  expect(saved.galleryByLanguage.en.site).toEqual(["assets/uploads/test-english.svg"]);
  expect(saved.galleryByLanguage.ar).toBeUndefined();
  expect(saved.gallery).toEqual(fixtureContent().work.items[0].gallery);
  expect(app.errors).toEqual([]);
});

test("changing the editor scope clears unsubmitted image URLs without modifying shared data", async ({ page }) => {
  const app = await adminSite(page);
  await openEditor(page);
  await scope(page).selectOption("ar");
  await page.locator('[data-gallery-url="site"]').fill(image("ar-not-submitted"));
  await scope(page).selectOption("en");
  await expect(page.locator('[data-gallery-url="site"]')).toBeEmpty();
  await expect(list(page, "site").locator(".gallery-editor-image")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("portfolio-admin-draft"))).toBeNull();
  await addLink(page, "site", "javascript:alert(1)");
  await expect(page.locator("#toastStack")).toContainText("أدخل رابط صورة صالحًا");
  await scope(page).selectOption("shared");
  await expect(list(page, "site").locator(".gallery-editor-image")).toHaveCount(3);
  expect(app.errors).toEqual([]);
});

test("all image languages and covers survive export, import and publishing serialization", async ({ page }) => {
  const content = localizedContent();
  const app = await adminSite(page, { content });
  await page.locator('.admin-nav__item[data-panel="settings"]').click();
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#exportBtn").click();
  const exported = JSON.parse(readFileSync(await (await downloadEvent).path(), "utf8"));
  expect(exported.work.items[0].galleryByLanguage).toEqual(content.work.items[0].galleryByLanguage);
  expect(exported.work.items[0].imageByLanguage).toEqual(content.work.items[0].imageByLanguage);
  exported.work.items[0].galleryByLanguage.en.site.push(image("en-imported"));
  await page.locator("#importInput").setInputFiles({ name: "site.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(page.locator("#toastStack")).toContainText("تم استيراد المحتوى");
  await page.locator('.admin-nav__item[data-panel="projects"]').click();
  await openEditor(page);
  await scope(page).selectOption("en");
  await expect(list(page, "site").locator(".gallery-editor-image")).toHaveCount(3);
  await page.locator("#saveBtn").click();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  const saved = app.saved().work.items[0];
  expect(saved.galleryByLanguage).toEqual(exported.work.items[0].galleryByLanguage);
  expect(saved.imageByLanguage).toEqual(exported.work.items[0].imageByLanguage);
  expect(saved.dashboardCopy).toEqual(description);
  expect(app.errors).toEqual([]);
});

test("a new project never inherits another project's language-specific images or cover", async ({ page }) => {
  const content = localizedContent();
  const app = await adminSite(page, { content });
  await openEditor(page);
  await scope(page).selectOption("ar");
  await page.locator("#newProjectBtn").click();
  await expect(scope(page)).toHaveValue("shared");
  await scope(page).selectOption("en");
  await expect(list(page, "site").locator(".gallery-editor-image")).toHaveCount(0);
  await addLink(page, "site", image("en-new-project"));
  await list(page, "site").locator(".gallery-set-cover").click();
  await page.locator('#projectForm [name="title_ar"]').fill("مشروع بصور إنجليزية");
  await page.locator("#saveBtn").click();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  const fresh = app.saved().work.items[0];
  expect(fresh.image).toBe("");
  expect(fresh.gallery).toEqual({ site: [], dashboard: [] });
  expect(fresh.galleryByLanguage).toEqual({ en: { site: [image("en-new-project")], dashboard: [] } });
  expect(fresh.imageByLanguage).toEqual({ en: image("en-new-project") });
  expect(app.saved().work.items[1]).toEqual(content.work.items[0]);
  expect(app.errors).toEqual([]);
});
