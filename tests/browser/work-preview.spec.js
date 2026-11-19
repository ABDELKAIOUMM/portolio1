const { test, expect } = require("@playwright/test");
const { browserAssets, publicSite, fixtureContent } = require("./helpers");
const { expectWholeSceneVisible } = require("./work-layout");
const { createServer } = require("node:http");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

async function clickWorkLink(page) {
  await page.locator('.site-header a[href="#work"]').click();
  await expect.poll(() => page.evaluate(() => {
    const header = document.getElementById("siteHeader");
    const offset = ["sticky", "fixed"].includes(getComputedStyle(header).position) ? header.getBoundingClientRect().height : 0;
    return Math.abs(document.getElementById("workStage").getBoundingClientRect().top - offset);
  })).toBeLessThan(1.5);
}

test("versioned stylesheet URLs bypass a genuinely warm browser cache", async ({ browser }) => {
  // No page.route here: Playwright routing disables the browser HTTP cache.
  // Reproduce the original one-hour CSS caching independently of app mocks.
  const html = readFileSync(join(__dirname, "..", "..", "index.html"), "utf8");
  const stylesheet = html.match(/href="(work\.css\?[^"]+)"/)[1];
  let changed = false;
  let versioned = false;
  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://preview.test");
    if (url.pathname === "/work.css") {
      requests.push(request.url);
      response.writeHead(200, { "Content-Type": "text/css", "Cache-Control": "public, max-age=3600" });
      return response.end(`#layoutVersion { color: ${changed ? "#00ff00" : "#ff0000"}; }`);
    }
    response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    response.end(`<!doctype html><link rel="stylesheet" href="${versioned ? stylesheet : "work.css"}"><p id="layoutVersion">Preview layout</p>`);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", resolve);
  });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin + "/?load=old");
    await expect(page.locator("#layoutVersion")).toHaveCSS("color", "rgb(255, 0, 0)");
    changed = true;
    await page.goto(origin + "/?load=updated");
    // Fresh HTML alone still keeps the previous, unversioned CSS.
    await expect(page.locator("#layoutVersion")).toHaveCSS("color", "rgb(255, 0, 0)");
    expect(requests).toEqual(["/work.css"]);
    versioned = true;
    await page.goto(origin + "/?load=versioned");
    await expect(page.locator("#layoutVersion")).toHaveCSS("color", "rgb(0, 255, 0)");
    expect(requests).toEqual(["/work.css", "/" + stylesheet]);
  } finally {
    await context.close();
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  }
});

test("a refreshed preview cannot mix unversioned old styles with new layout code", async ({ page }) => {
  const legacyRequests = [];
  // Stand in for the old unversioned resources already held by a browser.
  // A fresh test context otherwise hides this problem by having no cache.
  await page.route(/\/(?:style\.css|work\.css|script\.js|work-carousel\.js)$/, (route) => {
    legacyRequests.push(route.request().url());
    return route.fulfill({
      contentType: route.request().url().endsWith(".css") ? "text/css" : "application/javascript",
      headers: { "Cache-Control": "public, max-age=3600" },
      body: "/* Previously cached, unversioned layout. */"
    });
  });
  await page.setViewportSize({ width: 425, height: 586 });
  const { errors } = await publicSite(page);
  for (const [width, height] of [[425, 586], [414, 587]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(260);
    await page.evaluate(() => window.writeScroll(0));
    await clickWorkLink(page);
    await expectWholeSceneVisible(page);
  }
  expect(legacyRequests).toEqual([]);
  expect(errors).toEqual([]);
});

for (const language of ["en", "ar"]) {
  test(`a tall wrapped sticky navbar does not clip the ${language} work scene`, async ({ page }) => {
    await page.setViewportSize({ width: 414, height: 587 });
    const { errors } = await publicSite(page, { language });
    // Keep a deliberately wrapped header as a worst-case height regression,
    // even though the normal compact navbar now fits these labels inline.
    await page.addStyleTag({ content: ".site-header { position: sticky !important; top: 0 !important; } .nav-links { max-width: 220px; }" });
    for (const font of ["system-ui, sans-serif", "Arial, sans-serif"]) {
      await page.addStyleTag({ content: `body { font-family: ${font}; }` });
      await page.evaluate(() => window.dispatchEvent(new Event("resize")));
      await page.waitForTimeout(260);
      await page.evaluate(() => window.writeScroll(0));
      await clickWorkLink(page);
      await expectWholeSceneVisible(page);
      const before = await page.evaluate(() => scrollY);
      await page.locator(".project-gallery-trigger").first().click();
      await expect(page.locator("#projectGallery")).toBeVisible();
      await page.keyboard.press("Escape");
      expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(2);
    }
    expect(errors).toEqual([]);
  });

  test(`a scaled embedded preview keeps the whole ${language} work scene on screen`, async ({ page }) => {
    test.setTimeout(90000);
    const errors = await browserAssets(page, language);
    await page.route(/\/content\/site\.json(?:\?.*)?$/, (route) => route.fulfill({ json: fixtureContent() }));
    let scale = 1;
    await page.route("**/work-preview-frame.html", (route) => route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body { margin:0; height:100%; overflow:hidden; background:#000; }
        iframe { position:absolute; inset:0; display:block; width:calc(100% / ${scale}); height:calc(100% / ${scale}); border:0; transform:scale(${scale}); transform-origin:top left; }</style>
        <iframe id="workPreview" title="Website preview" src="/?embeddedScale=${scale}"></iframe>`
    }));
    for (const [width, height] of [[425, 586], [414, 587]]) {
      for (scale of [0.85, 1, 1.25]) {
        await test.step(`${width}×${height} at ${Math.round(scale * 100)}%`, async () => {
          await page.setViewportSize({ width, height });
          await page.goto("/work-preview-frame.html");
          await page.frameLocator("#workPreview").locator(".project-gallery-trigger").first().waitFor();
          const frame = page.frames().find((candidate) => candidate.url().includes("/?embeddedScale="));
          await frame.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(260);
          await clickWorkLink(frame);
          await expectWholeSceneVisible(frame);
          const outer = await page.locator("#workPreview").boundingBox();
          const inner = await frame.evaluate(() => ({
            width: innerWidth,
            titleTop: document.querySelector(".work-heading").getBoundingClientRect().top,
            controlsBottom: document.getElementById("workControls").getBoundingClientRect().bottom
          }));
          const renderedScale = outer.width / inner.width;
          expect(outer.y + inner.titleTop * renderedScale).toBeGreaterThanOrEqual(-1);
          expect(outer.y + inner.controlsBottom * renderedScale).toBeLessThanOrEqual(height + 1);
        });
      }
    }
    expect(errors).toEqual([]);
  });
}
