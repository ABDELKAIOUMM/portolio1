const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const root = join(__dirname, "..", "..");
const initial = JSON.parse(readFileSync(join(root, "content/site.json"), "utf8"));

function fixtureContent() {
  const content = structuredClone(initial);
  content.updatedAt = "2026-11-17T23:59:00.000Z";
  const project = content.work.items[0];
  project.image = "https://images.example.test/storefront.svg";
  project.gallery = {
    site: [project.image, "https://images.example.test/product.svg", "https://images.example.test/long-page.svg"],
    dashboard: ["https://images.example.test/orders.svg", "https://images.example.test/analytics.svg"]
  };
  return content;
}

function screenshotSvg(url) {
  const dashboard = /orders|analytics/.test(url);
  const tall = /long-page/.test(url);
  const height = tall ? 2400 : 750;
  const accent = dashboard ? "#91c5f9" : "#ea8bac";
  const label = dashboard ? (/orders/.test(url) ? "Orders overview" : "Store analytics") : "Red Sweetie";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
    <rect width="1200" height="${height}" fill="${dashboard ? "#f0f4fa" : "#fff6f8"}"/>
    <rect width="1200" height="76" fill="${dashboard ? "#172439" : "#ed9bb8"}"/>
    <text x="65" y="50" font-family="sans-serif" font-size="30" font-weight="bold" fill="${dashboard ? "white" : "#682640"}">${label}</text>
    <text x="860" y="45" font-family="sans-serif" font-size="18" fill="${dashboard ? "white" : "#682640"}">Home　Shop　Contact</text>
    <rect x="60" y="135" width="1080" height="${dashboard ? 150 : 255}" rx="18" fill="${accent}" opacity=".35"/>
    <text x="100" y="210" font-family="sans-serif" font-size="46" font-weight="bold" fill="#263344">${dashboard ? "A clear view of your business." : "A little sweetness, beautifully made."}</text>
    <text x="100" y="260" font-family="sans-serif" font-size="22" fill="#526079">${dashboard ? "Orders, products and customers in one place." : "Fresh treats. Thoughtful details. Made with love."}</text>
    ${Array.from({ length: tall ? 15 : 3 }, (_, i) => `<rect x="${60 + i % 3 * 370}" y="${(dashboard ? 330 : 440) + Math.floor(i / 3) * 330}" width="340" height="260" rx="16" fill="white" stroke="#cbd3df"/><circle cx="${230 + i % 3 * 370}" cy="${(dashboard ? 410 : 520) + Math.floor(i / 3) * 330}" r="44" fill="${accent}"/><rect x="${90 + i % 3 * 370}" y="${(dashboard ? 490 : 610) + Math.floor(i / 3) * 330}" width="200" height="12" rx="6" fill="#b9c2cf"/>`).join("")}
  </svg>`;
}

const fontCSS = [
  ["Orbitron", "orbitron", "latin", 400],
  ["Noto Sans Arabic", "noto-sans-arabic", "arabic", 400],
  ["Noto Sans Arabic", "noto-sans-arabic", "arabic", 700]
].map(([name, slug, subset, weight]) => {
  const data = readFileSync(join(root, "node_modules", "@fontsource", slug, "files", `${slug}-${subset}-${weight}-normal.woff2`)).toString("base64");
  return `@font-face{font-family:'${name}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2');}`;
}).join("\n");

async function browserAssets(page, language = "en") {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((lang) => localStorage.setItem("portfolio-language", lang), language);
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: fontCSS }));
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("https://cdn.jsdelivr.net/**", (route) => {
    const url = route.request().url();
    let file;
    if (url.includes("ScrollTrigger")) file = "gsap/dist/ScrollTrigger.min.js";
    else if (url.includes("gsap")) file = "gsap/dist/gsap.min.js";
    else if (url.includes("lenis")) file = "lenis/dist/lenis.min.js";
    return file ? route.fulfill({ contentType: "application/javascript", path: join(root, "node_modules", file) }) : route.abort();
  });
  await page.route("https://image.thum.io/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: screenshotSvg(route.request().url()) }));
  await page.route("https://images.example.test/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: screenshotSvg(route.request().url()) }));
  await page.route("**/assets/uploads/test-*", (route) => route.fulfill({ contentType: "image/svg+xml", body: screenshotSvg(route.request().url()) }));
  return errors;
}

async function publicSite(page, { language = "en", content = fixtureContent(), url = "/", motionLibraries = true } = {}) {
  const errors = await browserAssets(page, language);
  if (!motionLibraries) await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
  await page.route(/\/content\/site\.json(?:\?.*)?$/, (route) => route.fulfill({ json: content }));
  await page.goto(url);
  await page.locator(".project-gallery-trigger").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  return { content, errors };
}

async function adminSite(page, { content = fixtureContent(), upload, language = "ar", draft } = {}) {
  const errors = await browserAssets(page, language);
  let saved = structuredClone(content);
  let uploads = 0;
  if (draft) await page.addInitScript((value) => localStorage.setItem("portfolio-admin-draft", JSON.stringify(value)), draft);
  await page.route(/\/api\/content(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") saved = route.request().postDataJSON().content;
    await route.fulfill({ json: route.request().method() === "POST" ? { ok: true, updatedAt: saved.updatedAt } : saved });
  });
  await page.route(/\/api\/backups(?:\?.*)?$/, (route) => route.fulfill({ json: { backups: [] } }));
  await page.route(/\/api\/upload$/, async (route) => {
    uploads += 1;
    if (upload) return upload(route, uploads);
    await route.fulfill({ json: { ok: true, path: `assets/uploads/test-${uploads}.svg` } });
  });
  await page.goto("/admin.html");
  await page.locator("#connBadge").filter({ hasText: "متصل" }).waitFor({ state: "attached" });
  if (await page.locator("#sidebarToggle").isVisible()) await page.locator("#sidebarToggle").click();
  await page.locator('[data-panel="projects"].admin-nav__item').click();
  return { errors, saved: () => saved, uploads: () => uploads };
}

module.exports = { browserAssets, publicSite, adminSite, fixtureContent };
