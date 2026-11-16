#!/usr/bin/env node
/* ============================================================
   Portfolio dev/preview server (zero dependencies)

   Serves the static site and gives the dashboard a tiny save API:

     GET  /api/content        -> content/site.json
     POST /api/content        -> writes content/site.json, regenerates
                                 content/site-data.js and keeps a
                                 timestamped backup in content/backups/
     POST /api/upload         -> saves an image into assets/uploads/
     GET  /api/backups        -> list + restore earlier content versions

   Run:  node server.js            (defaults to port 4173)
         PORT=8080 node server.js
   ============================================================ */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONTENT_DIR = path.join(ROOT, "content");
const CONTENT_FILE = path.join(CONTENT_DIR, "site.json");
const SNAPSHOT_FILE = path.join(CONTENT_DIR, "site-data.js");
const BACKUP_DIR = path.join(CONTENT_DIR, "backups");
const UPLOAD_DIR = path.join(ROOT, "assets", "uploads");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_BODY = 12 * 1024 * 1024; // 12 MB — comfortably above a compressed hero shot

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

/* ---------- helpers ---------- */

function ensureDirs() {
  [CONTENT_DIR, BACKUP_DIR, UPLOAD_DIR].forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true });
  });
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/* Build the i18n key map the published site consumes for its static
   data-i18n hooks, so dashboard edits win everywhere. */
function buildI18n(content) {
  const en = {};
  const ar = {};
  const add = (key, value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.en === "string") en[key] = value.en;
    if (typeof value.ar === "string") ar[key] = value.ar;
  };

  add("meta.title", content.meta && content.meta.title);
  add("meta.description", content.meta && content.meta.description);

  const nav = content.nav || {};
  ["home", "services", "work", "approach", "skills", "contact"].forEach((key) => {
    add("nav." + key, nav[key]);
  });

  const hero = content.hero || {};
  ["eyebrow", "title", "role", "cta", "portraitAlt"].forEach((key) => add("hero." + key, hero[key]));
  (Array.isArray(hero.lines) ? hero.lines : []).forEach((line, index) => add("hero.line" + (index + 1), line));

  const services = content.services || {};
  ["eyebrow", "title", "intro"].forEach((key) => add("services." + key, services[key]));
  // Item-level keys are only used by the static fallback markup; the live
  // renderer reads content/site.json directly.
  (services.items || []).forEach((item, index) => {
    add("service.item" + index + ".title", item.title);
    add("service.item" + index + ".copy", item.copy);
  });

  const work = content.work || {};
  ["eyebrow", "title", "intro"].forEach((key) => add("work." + key, work[key]));
  add("work.empty", work.emptyLabel);
  add("project.visit", work.visitLabel);

  const story = content.story || {};
  ["eyebrow", "title", "intro"].forEach((key) => add("story." + key, story[key]));
  add("story.stages", story.stagesLabel);
  add("story.scroll", story.scrollLabel);
  (story.items || []).forEach((item, index) => {
    add("step.item" + index + ".title", item.title);
    add("step.item" + index + ".copy", item.copy);
    add("step.item" + index + ".phase", item.phase);
  });

  const skills = content.skills || {};
  add("skills.title", skills.title);
  add("skills.intro", skills.intro);
  add("skills.list", skills.listLabel);

  const contact = content.contact || {};
  ["eyebrow", "title", "copy", "whatsappLabel", "whatsappShort", "emailLabel", "emailShort", "footerRights"]
    .forEach((key) => add("contact." + key, contact[key]));
  // Legacy keys still present in the static markup.
  if (contact.copy) { en["contact.copy"] = contact.copy.en || en["contact.copy"]; ar["contact.copy"] = contact.copy.ar || ar["contact.copy"]; }
  if (contact.footerRights) {
    en["footer.rights"] = contact.footerRights.en || en["footer.rights"];
    ar["footer.rights"] = contact.footerRights.ar || ar["footer.rights"];
  }

  return { en, ar };
}

function writeSnapshot(content) {
  const payload = Object.assign({}, content, { _i18n: buildI18n(content) });
  const body =
    "/* Auto-generated fallback snapshot of content/site.json.\n" +
    "   The dashboard regenerates this file on every save — edit content via admin.html. */\n" +
    "window.__SITE_CONTENT__ = " +
    JSON.stringify(payload, null, 2) +
    ";\n";
  fs.writeFileSync(SNAPSHOT_FILE, body, "utf8");
}

function saveContent(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("Invalid content payload");
  }
  content.updatedAt = new Date().toISOString();
  content.version = Number(content.version) || 1;

  if (fs.existsSync(CONTENT_FILE)) {
    const backupName = "site-" + timestamp() + ".json";
    fs.copyFileSync(CONTENT_FILE, path.join(BACKUP_DIR, backupName));
    pruneBackups(40);
  }

  fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2) + "\n", "utf8");
  writeSnapshot(content);
  return content;
}

function pruneBackups(keep) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((name) => name.endsWith(".json"))
      .sort();
    files.slice(0, Math.max(0, files.length - keep)).forEach((name) => {
      fs.unlinkSync(path.join(BACKUP_DIR, name));
    });
  } catch (error) { /* backups are best-effort */ }
}

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeName(name) {
  const base = path.basename(String(name || "image"));
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return cleaned || "image";
}

/* ---------- API ---------- */

async function handleApi(req, res, url) {
  ensureDirs();

  if (url.pathname === "/api/content" && req.method === "GET") {
    if (!fs.existsSync(CONTENT_FILE)) return sendJSON(res, 404, { error: "No content file yet" });
    return sendJSON(res, 200, readJSON(CONTENT_FILE));
  }

  if (url.pathname === "/api/content" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const saved = saveContent(body.content || body);
      return sendJSON(res, 200, { ok: true, updatedAt: saved.updatedAt });
    } catch (error) {
      return sendJSON(res, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/upload" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const match = String(body.dataUrl || "").match(/^data:([\w/+.-]+);base64,(.+)$/);
      if (!match) return sendJSON(res, 400, { error: "Expected a base64 data URL" });

      const extFromMime = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/svg+xml": ".svg"
      }[match[1]];
      if (!extFromMime) return sendJSON(res, 400, { error: "Unsupported image type" });

      const provided = safeName(body.name || "image");
      const stem = provided.replace(/\.[^.]+$/, "") || "image";
      const fileName = stem + "-" + Date.now().toString(36) + extFromMime;
      fs.writeFileSync(path.join(UPLOAD_DIR, fileName), Buffer.from(match[2], "base64"));
      return sendJSON(res, 200, { ok: true, path: "assets/uploads/" + fileName });
    } catch (error) {
      return sendJSON(res, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/uploads" && req.method === "GET") {
    const files = fs.existsSync(UPLOAD_DIR)
      ? fs.readdirSync(UPLOAD_DIR).filter((name) => /\.(png|jpe?g|webp|gif|svg)$/i.test(name)).sort().reverse()
      : [];
    return sendJSON(res, 200, {
      files: files.map((name) => ({ name, path: "assets/uploads/" + name }))
    });
  }

  if (url.pathname === "/api/backups" && req.method === "GET") {
    const files = fs.existsSync(BACKUP_DIR)
      ? fs.readdirSync(BACKUP_DIR).filter((name) => name.endsWith(".json")).sort().reverse().slice(0, 40)
      : [];
    return sendJSON(res, 200, { backups: files });
  }

  if (url.pathname === "/api/restore" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const name = safeName(body.name || "");
      const file = path.join(BACKUP_DIR, name);
      if (!fs.existsSync(file)) return sendJSON(res, 404, { error: "Backup not found" });
      const content = readJSON(file);
      const saved = saveContent(content);
      return sendJSON(res, 200, { ok: true, updatedAt: saved.updatedAt });
    } catch (error) {
      return sendJSON(res, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/export" && req.method === "GET") {
    if (!fs.existsSync(CONTENT_FILE)) return sendJSON(res, 404, { error: "No content file yet" });
    const content = readJSON(CONTENT_FILE);
    const payload = Object.assign({}, content, { _i18n: buildI18n(content) });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="site.json"',
      "Cache-Control": "no-store"
    });
    return res.end(JSON.stringify(payload, null, 2));
  }

  return sendJSON(res, 404, { error: "Unknown API route" });
}

/* ---------- static files ---------- */

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (error) {
    res.writeHead(400).end("Bad request");
    return;
  }

  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/admin") pathname = "/admin.html";

  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }).end(
        "<!doctype html><meta charset='utf-8'><title>Not found</title>" +
        "<body style='font-family:system-ui;background:#07080b;color:#e8eaef;padding:3rem'>" +
        "<h1>404</h1><p>Nothing here: <code>" + pathname.replace(/[<>&]/g, "") + "</code></p>" +
        "<p><a style='color:#8ab4ff' href='/'>Back to the site</a></p></body>"
      );
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const noStore = /\.(json|js|html)$/.test(ext);
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": stats.size,
      "Cache-Control": noStore ? "no-cache" : "public, max-age=3600"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------- server ---------- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));

  // The dashboard talks to the API same-origin; allow a couple of common
  // dev origins so the preview iframe never trips on CORS.
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((error) => sendJSON(res, 500, { error: error.message }));
    return;
  }

  serveStatic(req, res, url);
});

ensureDirs();
server.listen(PORT, HOST, () => {
  console.log("Site:      http://localhost:" + PORT + "/");
  console.log("Dashboard: http://localhost:" + PORT + "/admin.html");
});
