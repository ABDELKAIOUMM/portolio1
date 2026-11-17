const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "..", "admin-github.js"), "utf8");

function createPublisher(fetch) {
  const storage = new Map();
  const context = {
    window: {
      location: { hostname: "example.github.io", pathname: "/portfolio/admin.html" },
      localStorage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: (key) => storage.delete(key)
      }
    },
    fetch,
    atob,
    btoa,
    TextEncoder,
    TextDecoder
  };
  vm.runInNewContext(source, context, { filename: "admin-github.js" });
  const github = context.window.GitHubPublish;
  github.load();
  github.persist({ token: "test-token", branch: "content/updates" });
  return github;
}

test("exposes the readFile method used by the dashboard", () => {
  const github = createPublisher(() => {
    throw new Error("No network request expected");
  });
  assert.equal(typeof github.readFile, "function");
});

test("reads UTF-8 site content from the configured repository and branch", async () => {
  const text = JSON.stringify({ title: "معرض الأعمال", description: "My portfolio" });
  const github = createPublisher(async (url, options) => {
    assert.equal(url, "https://api.github.com/repos/example/portfolio/contents/content/site.json?ref=content%2Fupdates");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: Buffer.from(text, "utf8").toString("base64").match(/.{1,20}/g).join("\n"),
        sha: "site-content-sha"
      })
    };
  });

  const file = await github.readFile("content/site.json");
  assert.equal(file.text, text);
  assert.equal(file.sha, "site-content-sha");
});

test("returns null for missing content so the dashboard can use its fallback", async () => {
  const github = createPublisher(async () => ({ ok: false, status: 404 }));
  assert.equal(await github.readFile("content/site.json"), null);
});

test("preserves GitHub API errors for the dashboard to report", async () => {
  const github = createPublisher(async () => ({
    ok: false,
    status: 403,
    json: async () => ({ message: "Resource not accessible" })
  }));
  await assert.rejects(github.readFile("content/site.json"), {
    message: "Resource not accessible",
    code: 403
  });
});
