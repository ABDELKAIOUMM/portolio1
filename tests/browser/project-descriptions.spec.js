const { test, expect } = require("@playwright/test");
const { readFileSync } = require("node:fs");
const { publicSite, adminSite, fixtureContent } = require("./helpers");

const dashboardCopy = {
  en: "Manage products, orders and delivery settings.\nA separate overview of the admin experience.",
  ar: "إدارة المنتجات والطلبات وإعدادات التوصيل.\nوصف مستقل لتجربة لوحة التحكم."
};

function withDescriptions() {
  const content = fixtureContent();
  content.work.items[0].dashboardCopy = { ...dashboardCopy };
  return content;
}

const field = (page, language) => page.locator(`#projectForm [name="dashboardCopy_${language}"]`);
const openEditor = (page, index = 0) => page.locator(".project-card").nth(index).getByRole("button", { name: "تعديل", exact: true }).click();

async function projectsPanel(page) {
  if (await page.locator("#sidebarToggle").isVisible()) await page.locator("#sidebarToggle").click();
  await page.locator('.admin-nav__item[data-panel="projects"]').click();
}

async function fillDescription(page, copy = dashboardCopy) {
  await field(page, "ar").fill(copy.ar);
  await field(page, "en").fill(copy.en);
}

async function expectDescriptionFields(page, copy = dashboardCopy) {
  await expect(field(page, "ar")).toHaveValue(copy.ar);
  await expect(field(page, "en")).toHaveValue(copy.en);
}

test("gallery tabs select independent descriptions and preserve the chosen section across language changes", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const content = withDescriptions();
  const original = structuredClone(content.work.items[0]);
  const { errors } = await publicSite(page, { content });
  await page.locator(".project-gallery-trigger").first().click();
  await expect(page.locator("#galleryDescription")).toHaveText(original.copy.en);
  await expect(page.locator("#galleryDescriptionHeading")).toHaveText("Website overview");
  await page.locator("#galleryDashboardTab").click();
  await expect(page.locator("#galleryDescription")).toHaveJSProperty("textContent", dashboardCopy.en);
  await expect(page.locator("#galleryDescriptionHeading")).toHaveText("Dashboard overview");
  await expect(page.locator("#galleryDescriptionSection")).not.toHaveClass(/is-empty/);
  await expect(page.locator("#galleryDashboardTab")).toHaveAttribute("aria-controls", "galleryPanel galleryDescriptionSection");
  await page.locator("[data-gallery-next]").click();
  await page.evaluate(() => window.siteI18n.setLanguage("ar"));
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("#galleryDashboardTab")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", /analytics\.svg$/);
  await expect(page.locator("#galleryDescription")).toHaveJSProperty("textContent", dashboardCopy.ar);
  await expect(page.locator("#galleryDescriptionHeading")).toHaveText("وصف لوحة التحكم");
  await page.locator("#galleryDashboardTab").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#gallerySiteTab")).toBeFocused();
  await expect(page.locator("#galleryDescription")).toHaveText(original.copy.ar);
  await page.keyboard.press("End");
  await expect(page.locator("#galleryDashboardTab")).toBeFocused();
  await expect(page.locator("#galleryDescription")).toHaveJSProperty("textContent", dashboardCopy.ar);
  await page.evaluate(() => window.siteI18n.setLanguage("en"));
  await expect(page.locator("#galleryDescription")).toHaveJSProperty("textContent", dashboardCopy.en);
  expect(await page.evaluate(() => window.siteContent.get().work.items[0])).toEqual(original);
  await page.keyboard.press("Escape");
  await expect(page.locator(".project-gallery-trigger").first()).toBeFocused();
  await expect(page.locator(".project-summary").first()).toHaveText(original.copy.en);
  expect(errors).toEqual([]);
});

test("older screenshots without a dashboard description show an honest localized empty state, not the website copy", async ({ page }) => {
  const content = fixtureContent();
  delete content.work.items[0].dashboardCopy;
  const { errors } = await publicSite(page, { content });
  await page.locator(".project-gallery-trigger").first().click();
  await page.locator("#galleryDashboardTab").click();
  await expect(page.locator("#galleryDescription")).toHaveText("A dashboard description has not been added yet.");
  await expect(page.locator("#galleryDescriptionSection")).toHaveClass(/is-empty/);
  await expect(page.locator("#galleryThumbnails button")).toHaveCount(2);
  await page.evaluate(() => window.siteI18n.setLanguage("ar"));
  await expect(page.locator("#galleryDescription")).toHaveText("لم تتم إضافة وصف للوحة التحكم بعد.");
  await page.locator("#gallerySiteTab").click();
  await expect(page.locator("#galleryDescription")).toHaveText(content.work.items[0].copy.ar);
  expect(await page.evaluate(() => Object.hasOwn(window.siteContent.get().work.items[0], "dashboardCopy"))).toBe(false);
  expect(errors).toEqual([]);
});

for (const siteImages of [true, false]) {
  test(`a text-only dashboard stays available ${siteImages ? "with website screenshots" : "without any screenshots"}`, async ({ page }) => {
    const content = fixtureContent();
    const project = content.work.items[0];
    project.dashboardCopy = { en: "", ar: dashboardCopy.ar };
    project.gallery.dashboard = [];
    if (!siteImages) {
      project.image = "";
      project.gallery.site = [];
    }
    const { errors } = await publicSite(page, { content });
    await page.locator(".project-gallery-trigger").first().click();
    await expect(page.locator("#gallerySiteTab")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#galleryDashboardTab")).toBeEnabled();
    await expect(page.locator('#galleryDashboardTab [data-gallery-tab-count]')).toHaveText("0");
    await page.locator("#galleryDashboardTab").click();
    await expect(page.locator("#galleryDescription")).toHaveJSProperty("textContent", dashboardCopy.ar);
    await expect(page.locator("#galleryDescription")).toHaveCSS("direction", "rtl");
    await expect(page.locator("#galleryPanel")).toHaveAttribute("aria-labelledby", "galleryDashboardTab");
    await expect(page.locator("#galleryEmpty")).toHaveText("No screenshots have been added for this section yet.");
    await expect(page.locator("#galleryImage")).not.toHaveAttribute("src");
    await expect(page.locator("#galleryZoom")).toBeDisabled();
    await expect(page.locator("#galleryThumbnails")).toBeHidden();
    await expect(page.locator("[data-gallery-next]")).toBeHidden();
    await expect(page.locator(".gallery-canvas")).toHaveAttribute("aria-busy", "false");
    await page.locator("#galleryDashboardTab").focus();
    await page.keyboard.press("Home");
    await expect(page.locator("#galleryDescription")).toHaveText(project.copy.en);
    await page.keyboard.press("End");
    await page.evaluate(() => window.siteI18n.setLanguage("ar"));
    await expect(page.locator("#galleryEmpty")).toHaveText("لم تتم إضافة صور لهذا القسم بعد.");
    await expect(page.locator("#galleryDashboardTab")).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => window.siteContent.get().work.items[0].dashboardCopy.en)).toBe("");
    expect(errors).toEqual([]);
  });
}

test("a project with only a dashboard description opens that section without a disabled selected tab", async ({ page }) => {
  const content = fixtureContent();
  Object.assign(content.work.items[0], {
    copy: { en: "", ar: "" }, dashboardCopy: { en: dashboardCopy.en, ar: "" },
    image: "", gallery: { site: [], dashboard: [] }
  });
  const { errors } = await publicSite(page, { content });
  await page.locator(".project-gallery-trigger").first().click();
  await expect(page.locator("#gallerySiteTab")).toBeDisabled();
  await expect(page.locator("#galleryDashboardTab")).toBeEnabled();
  await expect(page.locator("#galleryDashboardTab")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#galleryDescription")).toHaveJSProperty("textContent", dashboardCopy.en);
  await page.locator("#galleryDashboardTab").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#galleryDashboardTab")).toBeFocused();
  await page.evaluate(() => window.siteI18n.setLanguage("ar"));
  await expect(page.locator("#galleryDescription")).toHaveJSProperty("textContent", dashboardCopy.en);
  await expect(page.locator("#galleryDescription")).toHaveCSS("direction", "ltr");
  expect(errors).toEqual([]);
});

test("switching description tabs and opening another project resets stale detail scroll positions", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const content = withDescriptions();
  for (const language of ["en", "ar"]) {
    content.work.items[0].copy[language] = (content.work.items[0].copy[language] + "\n\n").repeat(25).trim();
    content.work.items[0].dashboardCopy[language] = (dashboardCopy[language] + "\n\n").repeat(25).trim();
  }
  content.work.items[1].visible = true;
  content.work.items[1].dashboardCopy = { en: "A different project's dashboard", ar: "وصف لوحة تحكم مشروع آخر" };
  const { errors } = await publicSite(page, { content });
  await page.locator(".project-gallery-trigger").first().click();
  const details = page.locator(".gallery-details");
  await details.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await expect.poll(() => details.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
  await page.locator("#galleryDashboardTab").click();
  await expect.poll(() => details.evaluate((node) => node.scrollTop)).toBe(0);
  await expect(page.locator("#galleryDescription")).toHaveJSProperty("textContent", content.work.items[0].dashboardCopy.en);
  await details.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await page.keyboard.press("Escape");
  await page.locator(".work-dot").nth(1).click();
  await page.locator(".project-gallery-trigger").nth(1).click();
  await expect.poll(() => details.evaluate((node) => node.scrollTop)).toBe(0);
  await expect(page.locator("#galleryDescription")).toHaveText(content.work.items[1].copy.en);
  await page.locator("#galleryDashboardTab").click();
  await expect(page.locator("#galleryDescription")).toHaveText(content.work.items[1].dashboardCopy.en);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".work-dot").first().click();
  await page.locator(".project-gallery-trigger").first().click();
  const layout = page.locator(".gallery-layout");
  await layout.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await expect.poll(() => layout.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
  await page.locator("[data-gallery-close]").click();
  await page.locator(".project-gallery-trigger").first().click();
  await expect.poll(() => layout.evaluate((node) => node.scrollTop)).toBe(0);
  await expect(page.locator("#gallerySiteTab")).toBeInViewport();
  expect(errors).toEqual([]);
});

test("long multiline descriptions wrap and scroll safely on desktop, tablet and mobile without rendering HTML", async ({ page }) => {
  const content = withDescriptions();
  const markup = '<img src="x" onerror="window.__descriptionInjected=true">';
  for (const language of ["en", "ar"]) {
    content.work.items[0].dashboardCopy[language] = `${dashboardCopy[language]}\n\n${(dashboardCopy[language] + "\n\n").repeat(25)}${"unbrokentext".repeat(30)}\n${markup}`;
  }
  const { errors } = await publicSite(page, { content });
  await page.locator(".project-gallery-trigger").first().click();
  await page.locator("#galleryDashboardTab").click();
  for (const [width, height, language] of [[320, 568, "ar"], [768, 1024, "en"], [1440, 900, "ar"]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((value) => window.siteI18n.setLanguage(value), language);
    await expect(page.locator("#galleryDescription")).toHaveJSProperty("textContent", content.work.items[0].dashboardCopy[language]);
    await expect(page.locator("#galleryDescription")).toHaveCSS("white-space", "pre-line");
    await expect(page.locator("#galleryDescription img, #galleryDescription script")).toHaveCount(0);
    expect(await page.evaluate(() => Boolean(window.__descriptionInjected))).toBe(false);
    const widths = await page.locator("#galleryDescription").evaluate((node) => ({ width: node.clientWidth, contentWidth: node.scrollWidth }));
    expect(widths.contentWidth).toBeLessThanOrEqual(widths.width + 1);
    const scrolls = await page.locator("#projectGallery").evaluate((dialog) => {
      const node = dialog.querySelector(innerWidth <= 800 ? ".gallery-layout" : ".gallery-details");
      return node.scrollHeight > node.clientHeight;
    });
    expect(scrolls).toBe(true);
    await page.locator("#galleryVisit").scrollIntoViewIfNeeded();
    await expect(page.locator("#galleryVisit")).toBeInViewport();
    const modal = await page.locator("#projectGallery").boundingBox();
    expect(modal.x).toBeGreaterThanOrEqual(-1);
    expect(modal.x + modal.width).toBeLessThanOrEqual(width + 1);
    await expect(page.locator("[data-gallery-close]")).toBeInViewport();
  }
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

for (const width of [320, 1440]) {
  test(`the bilingual description survives project/global saves and reload without changing existing media at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const content = fixtureContent();
    const original = structuredClone(content.work.items[0]);
    const app = await adminSite(page, { content });
    await openEditor(page);
    await expectDescriptionFields(page, { en: "", ar: "" });
    await expect(field(page, "ar")).toHaveAttribute("dir", "rtl");
    await expect(field(page, "en")).toHaveAttribute("dir", "ltr");
    await fillDescription(page);
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem("portfolio-admin-draft")));
    expect(draft.work.items[0].dashboardCopy).toEqual(dashboardCopy);
    expect(draft.work.items[0].copy).toEqual(original.copy);
    expect(draft.work.items[0].gallery).toEqual(original.gallery);
    expect(draft.work.items[0].image).toBe(original.image);
    await page.locator('#projectForm [type="submit"]').click();
    await expect(page.locator("#projectEditor")).toBeHidden();
    await openEditor(page);
    await expectDescriptionFields(page);
    await page.locator("#saveBtn").click();
    await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
    const saved = app.saved().work.items[0];
    expect(saved.dashboardCopy).toEqual(dashboardCopy);
    expect(saved.copy).toEqual(original.copy);
    expect(saved.gallery).toEqual(original.gallery);
    expect(saved.image).toBe(original.image);
    expect(app.saved().work.items.slice(1)).toEqual(content.work.items.slice(1));
    await page.reload();
    await projectsPanel(page);
    await openEditor(page);
    await expectDescriptionFields(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("portfolio-admin-draft"))).toBeNull();
    expect(app.errors).toEqual([]);
  });
}

test("unsaved dashboard descriptions survive reload and a failed save; Undo restores the original content", async ({ page }) => {
  const content = fixtureContent();
  const app = await adminSite(page, { content });
  await openEditor(page);
  await fillDescription(page);
  await page.reload();
  await projectsPanel(page);
  await openEditor(page);
  await expectDescriptionFields(page);
  await expect(page.locator("#saveState")).toContainText("تعديلات غير محفوظة");
  await page.route(/\/api\/content(?:\?.*)?$/, (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 409, json: { error: "Content changed; reload before publishing" } }) : route.fallback());
  await page.locator("#saveBtn").click();
  await expect(page.locator("#toastStack")).toContainText("فشل الحفظ");
  await expect(field(page, "ar")).toBeEnabled();
  await expectDescriptionFields(page);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem("portfolio-admin-draft")));
  expect(draft.work.items[0].dashboardCopy).toEqual(dashboardCopy);
  expect(draft.work.items[0].gallery).toEqual(content.work.items[0].gallery);
  expect(app.saved().work.items[0].dashboardCopy).toBeUndefined();
  await page.reload();
  await projectsPanel(page);
  await openEditor(page);
  await expectDescriptionFields(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#undoBtn").click();
  await openEditor(page);
  await expectDescriptionFields(page, { en: "", ar: "" });
  await expect(page.locator('#projectForm [name="copy_ar"]')).toHaveValue(content.work.items[0].copy.ar);
  expect(await page.evaluate(() => localStorage.getItem("portfolio-admin-draft"))).toBeNull();
  expect(app.errors).toEqual([]);
});

test("publishing locks the new fields and Undo restores their last saved values after image edits", async ({ page }) => {
  const app = await adminSite(page);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route(/\/api\/content(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.fallback();
  });
  await openEditor(page);
  await fillDescription(page);
  await page.locator('[data-gallery-list="dashboard"] .gallery-editor-image').last().locator('[data-move="earlier"]').click();
  await page.locator("#saveBtn").click();
  await expect(field(page, "ar")).toBeDisabled();
  await expect(field(page, "en")).toBeDisabled();
  release();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  expect(app.saved().work.items[0].dashboardCopy).toEqual(dashboardCopy);
  expect(app.saved().work.items[0].gallery.dashboard[0]).toMatch(/analytics\.svg$/);
  await fillDescription(page, { en: "Unsaved edit", ar: "تعديل غير محفوظ" });
  await page.locator('[data-gallery-list="dashboard"] .gallery-remove-image').last().click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#undoBtn").click();
  await openEditor(page);
  await expectDescriptionFields(page);
  await expect(page.locator('[data-gallery-list="dashboard"] .gallery-editor-image')).toHaveCount(2);
  expect(app.errors).toEqual([]);
});

test("a missing translation remains empty in the editor and clearing both languages removes the dashboard copy", async ({ page }) => {
  const content = withDescriptions();
  content.work.items[0].dashboardCopy.ar = "";
  const app = await adminSite(page, { content });
  await openEditor(page);
  await expectDescriptionFields(page, { en: dashboardCopy.en, ar: "" });
  await page.locator('#projectForm [name="title_en"]').fill("A project with one translation");
  await page.locator('#projectForm [type="submit"]').click();
  await openEditor(page);
  await expectDescriptionFields(page, { en: dashboardCopy.en, ar: "" });
  await field(page, "en").fill("");
  await page.locator("#saveBtn").click();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  expect(app.saved().work.items[0].dashboardCopy).toEqual({ en: "", ar: "" });
  expect(app.saved().work.items[0].copy).toEqual(content.work.items[0].copy);
  await page.reload();
  await projectsPanel(page);
  await openEditor(page);
  await expectDescriptionFields(page, { en: "", ar: "" });
  expect(app.errors).toEqual([]);
});

test("descriptions belong to each project and a new project never inherits the previous editor values", async ({ page }) => {
  const content = fixtureContent();
  const app = await adminSite(page, { content });
  await openEditor(page);
  await fillDescription(page);
  await page.locator("[data-close-editor]").click();
  await openEditor(page, 1);
  await expectDescriptionFields(page, { en: "", ar: "" });
  const second = { en: "A different dashboard", ar: "لوحة تحكم المشروع الثاني" };
  await fillDescription(page, second);
  await page.locator("[data-close-editor]").click();
  await openEditor(page);
  await expectDescriptionFields(page);
  await page.locator("[data-close-editor]").click();
  await page.locator("#newProjectBtn").click();
  await expectDescriptionFields(page, { en: "", ar: "" });
  await page.locator('#projectForm [name="title_ar"]').fill("مشروع جديد");
  const fresh = { en: "Dashboard before screenshots", ar: "" };
  await fillDescription(page, fresh);
  await page.locator('#projectForm [type="submit"]').click();
  await page.locator("#saveBtn").click();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  const items = app.saved().work.items;
  expect(items[0].dashboardCopy).toEqual(fresh);
  expect(items[0].gallery).toEqual({ site: [], dashboard: [] });
  expect(items.find((item) => item.id === content.work.items[0].id).dashboardCopy).toEqual(dashboardCopy);
  expect(items.find((item) => item.id === content.work.items[1].id).dashboardCopy).toEqual(second);
  expect(app.errors).toEqual([]);
});

test("description drafts are included in exported content and survive importing it again", async ({ page }) => {
  const app = await adminSite(page);
  await openEditor(page);
  await fillDescription(page);
  await page.locator("[data-close-editor]").click();
  await page.locator('.admin-nav__item[data-panel="settings"]').click();
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#exportBtn").click();
  const download = await downloadEvent;
  const exported = JSON.parse(readFileSync(await download.path(), "utf8"));
  expect(exported.work.items[0].dashboardCopy).toEqual(dashboardCopy);
  exported.work.items[0].dashboardCopy.en = "Imported dashboard description";
  await page.locator("#importInput").setInputFiles({ name: "site.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(page.locator("#toastStack")).toContainText("تم استيراد المحتوى");
  await page.locator('.admin-nav__item[data-panel="projects"]').click();
  await openEditor(page);
  await expectDescriptionFields(page, exported.work.items[0].dashboardCopy);
  await page.locator("#saveBtn").click();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  expect(app.saved().work.items[0].dashboardCopy).toEqual(exported.work.items[0].dashboardCopy);
  expect(app.errors).toEqual([]);
});
