const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { readFileSync, readdirSync } = require("node:fs");
const net = require("node:net");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

test("work layout styles and scripts share a cache-busting version", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  const files = ["style.css", "work.css", "script.js", "work-carousel.js"];
  const versions = files.map((file) => {
    const reference = Array.from(html.matchAll(/(?:href|src)="([^"]+)"/g))
      .map((match) => new URL(match[1], "https://preview.test/"))
      .find((url) => url.pathname === "/" + file);
    assert.ok(reference, file + " must be loaded by the page");
    assert.ok(reference.searchParams.get("v"), file + " must bypass the old unversioned browser cache");
    return reference.searchParams.get("v");
  });
  assert.equal(new Set(versions).size, 1, "the scene CSS and JS must be updated together");
});

test("the preview server does not retain stale CSS, HTML, JS or content", { timeout: 15000 }, async (t) => {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));

  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const stopped = once(child, "exit");
    child.kill();
    await stopped;
  });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error("Preview server exited before startup: " + code)));
    child.stdout.on("data", (data) => { if (String(data).includes("Site:")) resolve(); });
  });

  for (const path of ["/index.html", "/style.css", "/work.css?v=work-viewport-4", "/work-carousel.js", "/script.js", "/content/site.json"]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "HEAD" });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path + " must update immediately in an existing preview");
  }
  const image = readdirSync(join(root, "assets", "uploads")).find((file) => /\.(png|jpe?g|webp|svg)$/i.test(file));
  assert.ok(image, "the existing project images must remain available");
  const response = await fetch(`http://127.0.0.1:${port}/assets/uploads/${encodeURIComponent(image)}`, { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600", "image caching should not be disabled unnecessarily");
});
