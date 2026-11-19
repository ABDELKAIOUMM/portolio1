const { test, expect } = require("@playwright/test");
const { publicSite } = require("./helpers");
const { expectWholeSceneVisible } = require("./work-layout");

async function expectCompactNavigation(page, width) {
  const layout = await page.locator(".nav").evaluate((nav) => {
    const bounds = (node) => {
      const { top, bottom, left, right, width, height } = node.getBoundingClientRect();
      return { top, bottom, left, right, width, height };
    };
    const links = nav.querySelector(".nav-links");
    const button = nav.querySelector(".language-switch");
    return {
      header: bounds(document.getElementById("siteHeader")),
      links: bounds(links), button: bounds(button),
      globe: bounds(button.querySelector("svg")),
      items: Array.from(links.querySelectorAll("a")).map(bounds),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    };
  });
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.items).toHaveLength(6);
  for (const link of layout.items) {
    expect(link.left).toBeGreaterThanOrEqual(-1);
    expect(link.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(link.top).toBeGreaterThanOrEqual(layout.header.top - 1);
    expect(link.bottom).toBeLessThanOrEqual(layout.header.bottom + 1);
  }
  // The button must be beside the link group, not below it on a second row.
  const centers = [layout.links, layout.button].map((box) => (box.top + box.bottom) / 2);
  expect(Math.abs(centers[0] - centers[1])).toBeLessThan(1);
  expect(layout.button.left >= layout.links.right + 6 || layout.button.right <= layout.links.left - 6).toBe(true);
  if (width <= 760) {
    expect(layout.button.width).toBe(44);
    expect(layout.button.height).toBe(44);
    expect(layout.globe.width).toBeLessThanOrEqual(22);
    expect(layout.globe.height).toBeLessThanOrEqual(22);
    expect(layout.header.height).toBeLessThanOrEqual(width >= 375 ? 60 : 90);
  } else expect(layout.header.height).toBeLessThanOrEqual(74);
}

for (const language of ["en", "ar"]) {
  test(`language control stays inline and usable in ${language} navigation`, async ({ page }) => {
    const { errors } = await publicSite(page, { language });
    const button = page.locator("#languageSwitch");
    // Let the initial hero/nav entrance finish before comparing alignment.
    await expect(button).toHaveCSS("transform", "none");
    for (const width of [320, 360, 375, 390, 414, 425, 444, 500, 600, 760, 768, 1440]) {
      await test.step(`${width}px`, async () => {
        await page.setViewportSize({ width, height: 600 });
        await page.waitForTimeout(230);
        await expectCompactNavigation(page, width);
      });
    }

    await page.setViewportSize({ width: 500, height: 586 });
    await page.waitForTimeout(260);
    const targetLanguage = language === "en" ? "ar" : "en";
    await button.click();
    await expect(page.locator("html")).toHaveAttribute("lang", targetLanguage);
    await expect(page.locator("html")).toHaveAttribute("dir", targetLanguage === "ar" ? "rtl" : "ltr");
    await expect(button).toHaveAttribute("aria-pressed", String(targetLanguage === "ar"));
    expect(await page.evaluate(() => localStorage.getItem("portfolio-language"))).toBe(targetLanguage);
    await expectCompactNavigation(page, 500);
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expectCompactNavigation(page, 500);

    // The smaller header must still be measured by the one-screen work fit.
    await page.locator('.site-header a[href="#work"]').click();
    await expect(page).toHaveURL(/#work$/);
    await expectWholeSceneVisible(page);
    expect(errors).toEqual([]);
  });
}
