const { test, expect } = require("@playwright/test");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { browserAssets, adminSite } = require("./helpers");
const media = require("../../project-media.js");
const content = JSON.parse(readFileSync(join(__dirname, "../../content/site.json"), "utf8"));
const firstIndex = content.work.items.findIndex((item) => item.visible !== false);
const project = content.work.items[firstIndex];

for (const language of ["ar", "en"]) {
  test(`actual published ${language} media is selected without mixing project languages`, async ({ page }) => {
    const errors = await browserAssets(page, language);
    // Do not replace content/site.json here: exercise the real files that will
    // be deployed, including the Arabic migration and the real uploaded JPGs.
    await page.goto("/");
    await page.locator(".project-gallery-trigger").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const cover = media.cover(project, language);
    if (cover) await expect(page.locator(".project-media img").first()).toHaveAttribute("src", cover);
    else await expect(page.locator(".project-media img").first()).toHaveAttribute("src", /^data:image\/svg\+xml/);
    await page.locator(".project-gallery-trigger").first().click();
    const gallery = media.normalize(project, language);
    await expect(page.locator("#galleryThumbnails button")).toHaveCount(gallery.site.length);
    if (gallery.site.length) await expect(page.locator("#galleryImage")).toHaveAttribute("src", gallery.site[0]);
    else {
      await expect(page.locator("#galleryEmpty")).toBeVisible();
      await expect(page.locator("#galleryImage")).not.toHaveAttribute("src");
    }
    if (gallery.dashboard.length || media.description(project, "dashboard", language)) {
      await page.locator("#galleryDashboardTab").click();
      await expect(page.locator("#galleryThumbnails button")).toHaveCount(gallery.dashboard.length);
      if (gallery.dashboard.length) {
        await expect(page.locator("#galleryImage")).toHaveAttribute("src", gallery.dashboard[0]);
        await expect.poll(() => page.locator("#galleryImage").evaluate((node) => node.naturalHeight)).toBeGreaterThan(0);
      }
    } else await expect(page.locator("#galleryDashboardTab")).toBeDisabled();
    expect(await page.evaluate(() => window.siteContent.get().work.items)).toEqual(content.work.items);
    expect(errors).toEqual([]);
  });
}

test("the actual bundled snapshot preserves image languages when the JSON request fails", async ({ page }) => {
  const errors = await browserAssets(page, "ar");
  await page.route(/\/content\/site\.json(?:\?.*)?$/, (route) => route.fulfill({ status: 404, body: "JSON unavailable" }));
  await page.goto("/");
  await page.locator(".project-gallery-trigger").first().waitFor();
  expect(await page.evaluate(() => window.siteContent.get().work.items)).toEqual(content.work.items);
  await page.locator(".project-gallery-trigger").first().click();
  await expect(page.locator("#galleryThumbnails button")).toHaveCount(media.normalize(project, "ar").site.length);
  expect(errors).toEqual([]);
});

test("the dashboard edits the actual published collections and does not resurrect a shared cover on save", async ({ page }) => {
  const app = await adminSite(page, { content });
  // The API is mocked to prevent this regression test from saving to disk.
  await page.locator(".project-card").nth(firstIndex).getByRole("button", { name: "تعديل", exact: true }).click();
  await expect(page.locator('#projectForm [name="dashboardCopy_ar"]')).toBeAttached();
  await expect(page.locator('#projectForm [name="dashboardCopy_en"]')).toBeAttached();
  for (const language of ["shared", "ar", "en"]) {
    await page.locator("#projectGalleryLanguage").selectOption(language);
    const expected = media.editable(project, language);
    await expect(page.locator('[data-gallery-list="site"] .gallery-editor-image')).toHaveCount(expected.site.length);
    await expect(page.locator('[data-gallery-list="dashboard"] .gallery-editor-image')).toHaveCount(expected.dashboard.length);
  }
  await page.locator("#saveBtn").click();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  const saved = app.saved().work.items[firstIndex];
  expect(saved.image).toBe(project.image);
  expect(saved.gallery).toEqual(project.gallery);
  expect(saved.galleryByLanguage).toEqual(project.galleryByLanguage);
  expect(saved.imageByLanguage).toEqual(project.imageByLanguage);
  expect(app.errors).toEqual([]);
});
