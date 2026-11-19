const { test, expect } = require("@playwright/test");
const { publicSite, adminSite, fixtureContent } = require("./helpers");
const { alignWorkScene, expectWholeSceneVisible } = require("./work-layout");

const screens = [
  [320, 568], [375, 667], [390, 844], [414, 587], [425, 586], [452, 586], [500, 586], [502, 651],
  [768, 1024], [841, 593], [981, 583], [1024, 768], [1366, 694],
  [1440, 900], [1920, 1080], [812, 375], [844, 390]
];

for (const language of ["en", "ar"]) {
  test(`the whole work scene and gallery fit seventeen viewport sizes in ${language}`, async ({ page }) => {
    test.setTimeout(120000);
    const { errors } = await publicSite(page, { language });
    await expect(page.locator(".project-gallery-trigger").first()).toHaveText(language === "ar" ? "عرض الصور والتفاصيل" : "Photos & details");
    for (const [width, height] of screens) {
      await test.step(`${width}×${height}`, async () => {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(260);
        await alignWorkScene(page);
        // Check the whole section before clicking: click's automatic scrolling
        // must not hide a clipped title, primary action or carousel control.
        await expectWholeSceneVisible(page);
        const layout = await page.locator(".project").first().evaluate((card) => {
          const media = card.querySelector(".project-media").getBoundingClientRect();
          const body = card.querySelector(".project-body").getBoundingClientRect();
          const heading = card.querySelector("h3");
          return {
            width: media.width, height: media.height,
            separated: document.getElementById("workStage").classList.contains("is-landscape")
              ? body.left >= media.right - 1 || body.right <= media.left + 1 : body.top >= media.bottom - 1,
            landscape: document.getElementById("workStage").classList.contains("is-landscape"),
            imageFit: getComputedStyle(card.querySelector(".project-media img")).objectFit,
            titleHeight: heading.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(heading).lineHeight),
            opacity: parseFloat(getComputedStyle(card).opacity),
            contentWidth: card.scrollWidth, cardWidth: card.clientWidth,
            pageWidth: document.documentElement.scrollWidth, viewport: innerWidth
          };
        });
        if (layout.landscape) {
          expect(layout.imageFit).toBe("contain");
          expect(layout.height).toBeGreaterThanOrEqual(120);
        } else expect(Math.abs(layout.height - layout.width * 10 / 16)).toBeLessThan(2);
        expect(layout.separated).toBe(true);
        expect(layout.titleHeight).toBeLessThanOrEqual(layout.lineHeight * 2 + 1);
        expect(layout.opacity).toBeGreaterThan(0.98);
        expect(layout.contentWidth).toBeLessThanOrEqual(layout.cardWidth + 1);
        expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport + 1);
        await page.locator(".project-gallery-trigger").first().click();
        await expect(page.locator("#projectGallery")).toBeVisible();
        const modal = await page.locator("#projectGallery").boundingBox();
        expect(modal.x).toBeGreaterThanOrEqual(-1);
        expect(modal.y).toBeGreaterThanOrEqual(-1);
        expect(modal.x + modal.width).toBeLessThanOrEqual(width + 1);
        expect(modal.y + modal.height).toBeLessThanOrEqual(height + 1);
        await expect(page.locator("#galleryImage")).toHaveJSProperty("complete", true);
        await page.keyboard.press("Escape");
        await expect(page.locator("#projectGallery")).not.toBeVisible();
        expect(errors).toEqual([]);
      });
    }
  });
}

for (const mode of ["smooth navigation", "reduced motion", "unavailable motion libraries"]) {
  test(`Work links keep the complete scene visible with ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width: 841, height: 593 });
    if (mode === "reduced motion") await page.emulateMedia({ reducedMotion: "reduce" });
    const { errors } = await publicSite(page, { url: "/#work", motionLibraries: mode !== "unavailable motion libraries" });
    // A fresh fragment URL must work too, not only manual scrolling in tests.
    await expectWholeSceneVisible(page);
    for (const [width, height] of [[1440, 900], [841, 593], [452, 586], [502, 651], [812, 375]]) {
      await test.step(`${width}×${height}`, async () => {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(260);
        await page.evaluate(() => window.writeScroll ? window.writeScroll(0) : window.scrollTo(0, 0));
        await page.locator('.site-header a[href="#work"]').click();
        await expect.poll(() => page.evaluate(() => {
          const header = document.getElementById("siteHeader");
          const offset = ["sticky", "fixed"].includes(getComputedStyle(header).position) ? header.getBoundingClientRect().height : 0;
          return Math.abs(document.getElementById("workStage").getBoundingClientRect().top - offset);
        })).toBeLessThan(1.5);
        await expectWholeSceneVisible(page);
        await expect(page).toHaveURL(/#work$/);
      });
    }
    expect(errors).toEqual([]);
  });
}

test("very short zoomed windows keep natural scrolling instead of clipping project actions", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  const { errors } = await publicSite(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    window.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator("#workStage")).not.toHaveClass(/is-fitted|is-coverflow/);
  const card = await page.locator(".project").first().evaluate((node) => ({
    height: node.clientHeight, contentHeight: node.scrollHeight,
    bodyHeight: node.querySelector(".project-body").clientHeight,
    bodyContent: node.querySelector(".project-body").scrollHeight
  }));
  expect(card.contentHeight).toBeLessThanOrEqual(card.height + 1);
  expect(card.bodyContent).toBeLessThanOrEqual(card.bodyHeight + 1);
  await page.locator(".project-gallery-trigger").first().click();
  await expect(page.locator("#projectGallery")).toBeVisible();
  expect(errors).toEqual([]);
});

test("gallery loads collections on demand, changes categories, inspects tall images and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 694 });
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  const { content, errors } = await publicSite(page);
  expect(requests.some((url) => url.includes("orders.svg"))).toBe(false);
  expect(requests.some((url) => url.includes("long-page.svg"))).toBe(false);
  const opener = page.locator(".project-gallery-trigger").first();
  await opener.click();
  await expect(page.locator("#galleryDescription")).toHaveText(content.work.items[0].copy.en);
  await expect(page.locator("#galleryThumbnails button")).toHaveCount(3);
  await expect(page.locator(".gallery-canvas")).toHaveAttribute("aria-busy", "false");
  await page.locator("[data-gallery-next]").click();
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", /product\.svg$/);
  await page.keyboard.press("End");
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", /long-page\.svg$/);
  await page.locator("#galleryZoom").click();
  await expect(page.locator("#galleryZoom")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.locator("#galleryImageScroll").evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await page.locator("#galleryDashboardTab").click();
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", /orders\.svg$/);
  await expect(page.locator("#galleryThumbnails button")).toHaveCount(2);
  await page.locator("[data-gallery-previous]").click();
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", /analytics\.svg$/);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(page.locator("#galleryImage")).not.toHaveAttribute("src");
  expect(errors).toEqual([]);
});

test("Arabic labels and tab keyboard navigation stay correct after a language change", async ({ page }) => {
  const { errors } = await publicSite(page);
  await page.locator(".project-gallery-trigger").first().click();
  await page.evaluate(() => window.siteI18n.setLanguage("ar"));
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("#galleryTitle")).toContainText("متجر حلويات");
  await expect(page.locator("#gallerySiteTab")).toContainText("الموقع");
  await page.locator("#gallerySiteTab").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#galleryDashboardTab")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#galleryDashboardTab")).toBeFocused();
  await expect(page.locator("#galleryImage")).toHaveAttribute("alt", /لوحة التحكم/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".project-gallery-trigger").first()).toBeFocused();
  expect(errors).toEqual([]);
});

test("a legacy project with one image still opens and a project with no images shows details", async ({ page }) => {
  const content = fixtureContent();
  delete content.work.items[0].gallery;
  const { errors } = await publicSite(page, { content });
  await page.locator(".project-gallery-trigger").first().click();
  await expect(page.locator("#galleryThumbnails button")).toHaveCount(1);
  await expect(page.locator("#galleryDashboardTab")).toBeDisabled();
  await expect(page.locator("[data-gallery-next]")).toBeHidden();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const project = window.siteContent.get().work.items[0];
    project.image = "";
    project.gallery = { site: [], dashboard: [] };
    window.siteContent.render();
  });
  await page.locator(".project-gallery-trigger").first().click();
  await expect(page.locator("#galleryEmpty")).toBeVisible();
  await expect(page.locator("#galleryDescription")).not.toBeEmpty();
  await expect(page.locator("#galleryZoom")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("missing screenshots show a useful error without breaking navigation", async ({ page }) => {
  const { errors } = await publicSite(page);
  await page.route("https://images.example.test/product.svg", (route) => route.fulfill({ status: 404, body: "Not found" }));
  await page.locator(".project-gallery-trigger").first().click();
  await page.locator("[data-gallery-next]").click();
  await expect(page.locator("#galleryEmpty")).toHaveText(/could not be loaded/);
  await page.locator("[data-gallery-next]").click();
  await expect(page.locator("#galleryImage")).toBeVisible();
  await expect(page.locator("#galleryEmpty")).toBeHidden();
  expect(errors).toEqual([]);
});

test("roomy desktops keep coverflow, while short screens and reduced motion use native scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const { errors } = await publicSite(page);
  await expect(page.locator("#workStage")).toHaveClass(/is-coverflow/);
  await page.evaluate(() => window.writeScroll(window.ScrollTrigger.getById("workCoverflow").start));
  await page.locator("#workNext").click();
  await expect(page.locator(".work-dot").nth(1)).toHaveAttribute("aria-current", "true");
  await page.locator(".project-gallery-trigger").nth(1).click();
  const scrollY = await page.evaluate(() => scrollY);
  await page.locator("#galleryDescription").hover();
  await page.mouse.wheel(0, 300);
  expect(Math.abs((await page.evaluate(() => scrollY)) - scrollY)).toBeLessThan(2);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 650 });
  await expect(page.locator("#workStage")).not.toHaveClass(/is-coverflow/);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await expect(page.locator("#workStage")).toHaveClass(/is-coverflow/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#workStage")).not.toHaveClass(/is-coverflow/);
  const current = await page.locator(".work-dot").evaluateAll((nodes) => nodes.findIndex((node) => node.getAttribute("aria-current") === "true"));
  await page.locator("#workNext").click();
  await expect(page.locator(".work-dot").nth(current + 1)).toHaveAttribute("aria-current", "true");
  expect(errors).toEqual([]);
});

test("coverflow buttons remain clickable between project snap points", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const { content, errors } = await publicSite(page);
  await expect(page.locator("#workStage")).toHaveClass(/is-coverflow/);
  const projects = content.work.items.filter((item) => item.visible !== false);
  expect(await page.evaluate(() => {
    const work = window.ScrollTrigger.getById("workCoverflow");
    const story = window.ScrollTrigger.getAll().find((trigger) => trigger.trigger.id === "storyline");
    return story.start >= work.end;
  })).toBe(true);
  for (const progress of [0.0001, 0.23, 0.61]) {
    const index = Math.round(progress * (projects.length - 1));
    await page.evaluate((fraction) => {
      const trigger = window.ScrollTrigger.getById("workCoverflow");
      window.writeScroll(trigger.start + fraction * (trigger.end - trigger.start));
    }, progress);
    await expect(page.locator(".work-dot").nth(index)).toHaveAttribute("aria-current", "true");
    await page.locator(".project-gallery-trigger").nth(index).click();
    await expect(page.locator("#projectGallery")).toBeVisible();
    await expect(page.locator("#galleryTitle")).toHaveText(projects[index].title.en);
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
});

test("zero and one visible project do not leave an empty pinned stage", async ({ page }) => {
  const content = fixtureContent();
  content.work.items = [content.work.items[0]];
  const { errors } = await publicSite(page, { content });
  await expect(page.locator("#workControls")).toBeHidden();
  await expect(page.locator("#workStage")).not.toHaveClass(/is-coverflow/);
  await page.evaluate(() => { window.siteContent.get().work.items = []; window.siteContent.render(); });
  await expect(page.locator(".work-empty")).toBeVisible();
  await expect(page.locator("#workControls")).toBeHidden();
  await page.evaluate(() => {
    window.siteContent.get().work.items = [{ id: "new-project", title: { en: "New project" }, gallery: { site: ["https://images.example.test/storefront.svg"] } }];
    window.siteContent.render();
  });
  await expect(page.locator(".project-gallery-trigger")).toHaveCount(1);
  await page.locator(".project-gallery-trigger").click();
  await expect(page.locator("#galleryTitle")).toHaveText("New project");
  expect(errors).toEqual([]);
});

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const files = (names) => names.map((name) => ({ name, mimeType: "image/png", buffer: png }));

for (const width of [320, 768, 1440]) {
  test(`dashboard uploads, covers, ordering and persistence work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const app = await adminSite(page);
    await page.locator(".project-card").first().getByRole("button", { name: "تعديل", exact: true }).click();
    const site = page.locator('[data-gallery-list="site"]');
    const dashboard = page.locator('[data-gallery-list="dashboard"]');
    await expect(site.locator(".gallery-editor-image")).toHaveCount(3);
    await page.locator('[data-gallery-upload="site"]').setInputFiles(files(["home.png", "mobile.png"]));
    await expect(site.locator(".gallery-editor-image")).toHaveCount(5);
    await page.locator('[data-gallery-upload="dashboard"]').setInputFiles(files(["settings.png", "orders.png"]));
    await expect(dashboard.locator(".gallery-editor-image")).toHaveCount(4);
    await expect(page.locator("#projectForm")).toHaveAttribute("aria-busy", "false");
    await dashboard.locator(".gallery-editor-image").nth(3).locator(".gallery-set-cover").click();
    await dashboard.locator(".gallery-editor-image").nth(3).locator('[data-move="earlier"]').click();
    await site.locator(".gallery-editor-image").nth(1).locator(".gallery-remove-image").click();
    await page.locator('#projectForm [name="title_ar"]').fill("متجر حلويات ومعرض صور متكامل");
    await page.locator('#projectForm [type="submit"]').click();
    await page.locator("#saveBtn").click();
    await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
    const saved = app.saved().work.items[0];
    expect(saved.gallery.site).toHaveLength(4);
    expect(saved.gallery.dashboard).toHaveLength(4);
    expect(saved.image).toBe("assets/uploads/test-4.svg");
    expect(saved.gallery.dashboard[2]).toBe(saved.image);
    expect(saved.gallery.site).toContain("https://images.example.test/storefront.svg");
    expect(saved.title.ar).toBe("متجر حلويات ومعرض صور متكامل");
    expect(app.uploads()).toBe(4);
    await page.reload();
    if (await page.locator("#sidebarToggle").isVisible()) await page.locator("#sidebarToggle").click();
    await page.locator('.admin-nav__item[data-panel="projects"]').click();
    await page.locator(".project-card").first().getByRole("button", { name: "تعديل", exact: true }).click();
    await expect(page.locator('[data-gallery-list="site"] .gallery-editor-image')).toHaveCount(4);
    await expect(page.locator('[data-gallery-list="dashboard"] .gallery-editor-image')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(app.errors).toEqual([]);
  });
}

test("failed uploads retain successful images and never publish while an upload is pending", async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const app = await adminSite(page, { upload: async (route, count) => {
    if (count === 1) {
      await gate;
      return route.fulfill({ json: { ok: true, path: "assets/uploads/test-1.svg" } });
    }
    return route.fulfill({ status: 500, json: { error: "Upload unavailable" } });
  } });
  await page.locator(".project-card").first().getByRole("button", { name: "تعديل", exact: true }).click();
  await page.locator('[data-gallery-upload="site"]').setInputFiles(files(["ok.png", "failed.png"]));
  await expect(page.locator("#saveBtn")).toBeDisabled();
  release();
  await expect(page.locator("#saveBtn")).toBeEnabled();
  await expect(page.locator('[data-gallery-list="site"] .gallery-editor-image')).toHaveCount(4);
  await expect(page.locator("#projectUploadStatus")).toContainText("تعذّر رفع 1");
  await page.locator("#saveBtn").click();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  expect(app.saved().work.items[0].gallery.site).toContain("assets/uploads/test-1.svg");
  expect(app.errors).toEqual([]);
});

test("relative cover links are valid and partially typed URLs do not become gallery images", async ({ page }) => {
  const app = await adminSite(page);
  await page.locator(".project-card").first().getByRole("button", { name: "تعديل", exact: true }).click();
  await page.locator('#projectForm [name="image"]').pressSequentially("assets/uploads/test-cover.svg");
  await page.locator('#projectForm [name="image"]').fill("assets/uploads/test-cover.svg");
  await page.locator('#projectForm [type="submit"]').click();
  await page.locator("#saveBtn").click();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  const saved = app.saved().work.items[0];
  expect(saved.gallery.site).toHaveLength(4);
  expect(saved.gallery.site[0]).toBe("assets/uploads/test-cover.svg");
  expect(saved.image).toBe("assets/uploads/test-cover.svg");
  expect(app.errors).toEqual([]);
});

test("replacing a legacy cover URL preserves the existing screenshot", async ({ page }) => {
  const content = fixtureContent();
  delete content.work.items[0].gallery;
  const oldCover = content.work.items[0].image;
  const app = await adminSite(page, { content });
  await page.locator(".project-card").first().getByRole("button", { name: "تعديل", exact: true }).click();
  await page.locator('#projectForm [name="image"]').fill("assets/uploads/test-new-cover.svg");
  await page.locator("#saveBtn").click();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  const saved = app.saved().work.items[0];
  expect(saved.image).toBe("assets/uploads/test-new-cover.svg");
  expect(saved.gallery.site).toEqual([saved.image, oldCover]);
  await page.reload();
  await page.locator('.admin-nav__item[data-panel="projects"]').click();
  await page.locator(".project-card").first().getByRole("button", { name: "تعديل", exact: true }).click();
  await expect(page.locator('[data-gallery-list="site"] .gallery-editor-image')).toHaveCount(2);
  expect(app.errors).toEqual([]);
});

test("publishing locks the editor and undo restores the last saved gallery", async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const app = await adminSite(page);
  await page.route(/\/api\/content(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.fallback();
  });
  await page.locator(".project-card").first().getByRole("button", { name: "تعديل", exact: true }).click();
  const title = page.locator('#projectForm [name="title_ar"]');
  await title.fill("آخر عنوان محفوظ");
  await page.locator('[data-gallery-url="dashboard"]').fill("assets/uploads/test-saved.svg");
  await page.locator('[data-gallery-add-url="dashboard"]').click();
  await page.locator("#saveBtn").click();
  await expect(title).toBeDisabled();
  await expect(page.locator('[data-gallery-upload="site"]')).toBeDisabled();
  await expect(page.locator("#undoBtn")).toBeDisabled();
  release();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  await expect(title).toBeEnabled();
  await expect(page.locator("#undoBtn")).toBeEnabled();
  await expect(page.locator('[data-gallery-list="site"] [data-move="earlier"]').first()).toBeDisabled();
  await title.fill("عنوان غير محفوظ");
  await page.locator('[data-gallery-list="dashboard"] .gallery-remove-image').last().click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#undoBtn").click();
  await expect(page.locator("#projectEditor")).toBeHidden();
  await expect(page.locator("#saveState")).toContainText("كل التعديلات محفوظة");
  await expect(page.locator(".project-card").first()).toContainText("آخر عنوان محفوظ");
  await page.locator(".project-card").first().getByRole("button", { name: "تعديل", exact: true }).click();
  await expect(page.locator('[data-gallery-list="dashboard"] .gallery-editor-image')).toHaveCount(3);
  expect(await page.evaluate(() => localStorage.getItem("portfolio-admin-draft"))).toBeNull();
  expect(app.saved().work.items[0].gallery.dashboard).toContain("assets/uploads/test-saved.svg");
  expect(app.errors).toEqual([]);
});

test("unsaved collections survive a reload and remain a draft", async ({ page }) => {
  const draft = fixtureContent();
  draft.work.items[0].gallery.dashboard.push("assets/uploads/test-draft.svg");
  const app = await adminSite(page, { draft });
  await expect(page.locator("#saveState")).toContainText("تعديلات غير محفوظة");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("portfolio-admin-draft")));
  expect(stored.work.items[0].gallery.dashboard).toContain("assets/uploads/test-draft.svg");
  await page.locator(".project-card").first().getByRole("button", { name: "تعديل", exact: true }).click();
  await expect(page.locator('[data-gallery-list="dashboard"] .gallery-editor-image')).toHaveCount(3);
  expect(app.errors).toEqual([]);
});

test("real touch gestures swipe projects and Arabic gallery images without trapping page scrolling", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const { errors } = await publicSite(page, { language: "ar" });
  await page.bringToFront();
  await page.locator(".project-media").first().scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const cdp = await context.newCDPSession(page);
  const swipe = async (fromX, toX, y) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fromX, y }] });
    // Let the compositor latch the touch before moving it. A deliberate swipe
    // is more reproducible than a fast fling under software GPU + tracing.
    await page.waitForTimeout(50);
    for (let step = 1; step <= 12; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: fromX + (toX - fromX) * step / 12, y }] });
      await page.waitForTimeout(50);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const cover = await page.locator(".project-media").first().boundingBox();
  // Raw CDP input has no Playwright hit-target auto-wait. Wait for any
  // scroll-trigger refresh to finish before touching the screenshot.
  await expect.poll(() => page.evaluate((y) => Boolean(document.elementFromPoint(330, y)?.closest("#workGrid")), cover.y + cover.height / 2)).toBe(true);
  await swipe(330, 60, cover.y + cover.height / 2);
  await expect.poll(() => page.locator(".work-dot").evaluateAll((nodes) => nodes.findIndex((node) => node.getAttribute("aria-current") === "true"))).toBe(1);
  await page.locator(".work-dot").first().tap();
  await expect(page.locator(".work-dot").first()).toHaveAttribute("aria-current", "true");
  await page.locator(".project-media").first().tap();
  const canvas = await page.locator("#galleryImageScroll").boundingBox();
  await swipe(60, 330, canvas.y + canvas.height / 2);
  await expect(page.locator("#galleryImage")).toHaveAttribute("src", /product\.svg$/);
  await page.locator("[data-gallery-close]").tap();
  await expect(page.locator("#projectGallery")).toBeHidden();
  expect(errors).toEqual([]);
  await context.close();
});

test("failed content saves preserve both new screenshots and pending title edits", async ({ page }) => {
  const app = await adminSite(page);
  await page.route(/\/api\/content(?:\?.*)?$/, (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 409, json: { error: "Content changed; reload before publishing" } }) : route.fallback());
  await page.locator(".project-card").first().getByRole("button", { name: "تعديل", exact: true }).click();
  await page.locator('#projectForm [name="title_ar"]').fill("عنوان محفوظ كمسودة");
  await page.locator('[data-gallery-url="dashboard"]').fill("assets/uploads/test-pending.svg");
  await page.locator('[data-gallery-add-url="dashboard"]').click();
  await page.locator("#saveBtn").click();
  await expect(page.locator("#toastStack")).toContainText("فشل الحفظ");
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem("portfolio-admin-draft")));
  expect(draft.work.items[0].title.ar).toBe("عنوان محفوظ كمسودة");
  expect(draft.work.items[0].gallery.dashboard).toContain("assets/uploads/test-pending.svg");
  await expect(page.locator("#saveState")).toContainText("تعديلات غير محفوظة");
  expect(app.errors).toEqual([]);
});

test("unsupported and oversized uploads are rejected without modifying existing collections", async ({ page }) => {
  const app = await adminSite(page);
  await page.locator(".project-card").first().getByRole("button", { name: "تعديل", exact: true }).click();
  await page.locator('[data-gallery-upload="site"]').setInputFiles([
    { name: "not-an-image.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") },
    { name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(6 * 1024 * 1024 + 1) }
  ]);
  await expect(page.locator("#projectUploadStatus")).toContainText("تعذّر رفع 2");
  await expect(page.locator('[data-gallery-list="site"] .gallery-editor-image')).toHaveCount(3);
  expect(app.uploads()).toBe(0);
  expect(app.errors).toEqual([]);
});

test("unavailable motion libraries still leave a functional, unpinned carousel", async ({ page }) => {
  const { errors } = await publicSite(page);
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
  await page.reload();
  await expect(page.locator(".project-gallery-trigger").first()).toBeVisible();
  await expect(page.locator("#workStage")).not.toHaveClass(/is-coverflow/);
  await page.locator("#workNext").click();
  await expect(page.locator(".work-dot").nth(1)).toHaveAttribute("aria-current", "true");
  await page.locator(".project-gallery-trigger").nth(1).click();
  await expect(page.locator("#projectGallery")).toBeVisible();
  expect(errors).toEqual([]);
});
