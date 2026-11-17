/* ============================================================
   GitHub publishing layer for the dashboard.
   Lets the dashboard save content/site.json, content/site-data.js and
   uploaded images straight into the repository — no local server, no
   CLI. A fine-grained token is stored in this browser only.

   Exposes: window.GitHubPublish
   ============================================================ */
(function () {
  "use strict";

  var TOKEN_KEY = "portfolio-github-token";
  var SETTINGS_KEY = "portfolio-github-settings";
  var API = "https://api.github.com";

  var state = {
    token: "",
    owner: "",
    repo: "",
    branch: "main",
    defaultOwner: "",
    defaultRepo: ""
  };

  /* ---------- storage ---------- */

  function readStore(key) {
    try {
      return window.localStorage.getItem(key) || "";
    } catch (error) {
      return "";
    }
  }

  function writeStore(key, value) {
    try {
      if (value) window.localStorage.setItem(key, value);
      else window.localStorage.removeItem(key);
    } catch (error) { /* private mode */ }
  }

  function detectRepo() {
    // GitHub Pages project site: https://<owner>.github.io/<repo>/
    var host = window.location.hostname || "";
    var path = window.location.pathname || "";
    var match = host.match(/^([^.]+)\.github\.io$/i);
    if (match) {
      var first = path.split("/").filter(Boolean)[0] || "";
      state.defaultOwner = match[1];
      state.defaultRepo = first;
    }
  }

  function load() {
    detectRepo();
    var saved = {};
    try {
      saved = JSON.parse(readStore(SETTINGS_KEY) || "{}");
    } catch (error) {
      saved = {};
    }
    state.token = readStore(TOKEN_KEY);
    state.owner = saved.owner || state.defaultOwner;
    state.repo = saved.repo || state.defaultRepo;
    state.branch = saved.branch || "main";
    return state;
  }

  function persist(settings) {
    if (settings.token !== undefined) {
      state.token = String(settings.token || "").trim();
      writeStore(TOKEN_KEY, state.token);
    }
    if (settings.owner !== undefined) state.owner = String(settings.owner || "").trim();
    if (settings.repo !== undefined) state.repo = String(settings.repo || "").trim();
    if (settings.branch !== undefined) state.branch = String(settings.branch || "main").trim() || "main";
    writeStore(SETTINGS_KEY, JSON.stringify({
      owner: state.owner,
      repo: state.repo,
      branch: state.branch
    }));
  }

  function configured() {
    return Boolean(state.token && state.owner && state.repo);
  }

  /* ---------- helpers ---------- */

  function utf8ToBase64(text) {
    // TextEncoder is the fast path; the manual branch keeps older WebKit happy.
    if (typeof TextEncoder === "function") {
      var bytes = new TextEncoder().encode(text);
      var binary = "";
      var chunk = 0x8000;
      for (var i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    }
    return btoa(unescape(encodeURIComponent(text)));
  }

  function base64ToUtf8(base64) {
    var binary = atob(String(base64 || "").replace(/\s/g, ""));
    if (typeof TextDecoder === "function") {
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder("utf-8").decode(bytes);
    }
    return decodeURIComponent(escape(binary));
  }

  function dataUrlToBase64(dataUrl) {
    var match = String(dataUrl || "").match(/^data:([^;]+);base64,(.*)$/);
    return match ? { mime: match[1], data: match[2] } : null;
  }

  async function request(path, options) {
    var response = await fetch(API + path, Object.assign({
      headers: {
        Authorization: "Bearer " + state.token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    }, options || {}));

    if (response.status === 404) {
      var missing = new Error("Not found");
      missing.code = 404;
      throw missing;
    }
    if (!response.ok) {
      var detail = {};
      try { detail = await response.json(); } catch (error) { detail = {}; }
      var failure = new Error(detail.message || "GitHub " + response.status);
      failure.code = response.status;
      throw failure;
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function repoPath() {
    return "/repos/" + encodeURIComponent(state.owner) + "/" + encodeURIComponent(state.repo);
  }

  /* ---------- connection ---------- */

  async function verify() {
    load();
    if (!configured()) throw new Error("أدخل الـ token واسم المستخدم والريبو");
    var repo = await request(repoPath());
    if (!repo.permissions || !repo.permissions.push) {
      throw new Error("التوكن لا يملك صلاحية الكتابة (Contents: Read and write)");
    }
    return { owner: repo.owner.login, repo: repo.name, branch: state.branch, private: repo.private };
  }

  async function readFile(path) {
    var url = repoPath() + "/contents/" + path.split("/").map(encodeURIComponent).join("/") +
      "?ref=" + encodeURIComponent(state.branch);
    try {
      var file = await request(url);
      if (Array.isArray(file)) throw new Error("المسار مجلد مش ملف");
      return { text: base64ToUtf8(file.content), sha: file.sha };
    } catch (error) {
      if (error.code === 404) return null;
      throw error;
    }
  }

  async function writeFile(path, base64Content, message, sha) {
    var body = {
      message: message || ("Update " + path),
      content: base64Content,
      branch: state.branch
    };
    if (sha) body.sha = sha;
    return request(repoPath() + "/contents/" + path.split("/").map(encodeURIComponent).join("/"), {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + state.token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  }

  /* ---------- i18n map (mirrors what server.js generates) ---------- */

  function buildI18n(content) {
    var en = {};
    var ar = {};
    function add(key, value) {
      if (!value || typeof value !== "object") return;
      if (typeof value.en === "string") en[key] = value.en;
      if (typeof value.ar === "string") ar[key] = value.ar;
    }

    add("meta.title", content.meta && content.meta.title);
    add("meta.description", content.meta && content.meta.description);

    var nav = content.nav || {};
    ["home", "services", "work", "approach", "skills", "contact"].forEach(function (key) {
      add("nav." + key, nav[key]);
    });

    var hero = content.hero || {};
    ["eyebrow", "title", "role", "cta", "portraitAlt"].forEach(function (key) {
      add("hero." + key, hero[key]);
    });
    (Array.isArray(hero.lines) ? hero.lines : []).forEach(function (line, index) {
      add("hero.line" + (index + 1), line);
    });

    var services = content.services || {};
    ["eyebrow", "title", "intro"].forEach(function (key) { add("services." + key, services[key]); });

    var work = content.work || {};
    ["eyebrow", "title", "intro"].forEach(function (key) { add("work." + key, work[key]); });
    add("work.empty", work.emptyLabel);
    add("project.visit", work.visitLabel);

    var story = content.story || {};
    ["eyebrow", "title", "intro"].forEach(function (key) { add("story." + key, story[key]); });
    add("story.stages", story.stagesLabel);
    add("story.scroll", story.scrollLabel);

    var skills = content.skills || {};
    add("skills.title", skills.title);
    add("skills.intro", skills.intro);
    add("skills.list", skills.listLabel);

    var contact = content.contact || {};
    ["eyebrow", "title", "copy", "whatsappLabel", "whatsappShort", "emailLabel", "emailShort", "footerRights"]
      .forEach(function (key) { add("contact." + key, contact[key]); });

    return { en: en, ar: ar };
  }

  function snapshotSource(content) {
    var payload = Object.assign({}, content, { _i18n: buildI18n(content) });
    return "/* Auto-generated fallback snapshot of content/site.json.\n" +
      "   The dashboard regenerates this file on every save — edit content via admin.html. */\n" +
      "window.__SITE_CONTENT__ = " + JSON.stringify(payload, null, 2) + ";\n";
  }

  /* ---------- publish ---------- */

  async function publish(content, onStep) {
    if (!configured()) throw new Error("إعدادات GitHub غير مكتملة");
    var step = onStep || function () {};
    var stamp = new Date().toISOString();
    var payload = Object.assign({}, content, { updatedAt: stamp });
    var json = JSON.stringify(payload, null, 2) + "\n";
    var snapshot = snapshotSource(payload);

    step("قراءة الملف الحالي من GitHub…");
    var currentJson = await readFile("content/site.json");

    step("رفع content/site.json…");
    var result = await writeFile(
      "content/site.json",
      utf8ToBase64(json),
      "content: update site content from dashboard",
      currentJson ? currentJson.sha : null
    );

    step("رفع content/site-data.js…");
    var currentSnapshot = await readFile("content/site-data.js");
    await writeFile(
      "content/site-data.js",
      utf8ToBase64(snapshot),
      "content: refresh bundled snapshot from dashboard",
      currentSnapshot ? currentSnapshot.sha : null
    );

    return { updatedAt: stamp, commit: result && result.commit ? result.commit.html_url : "" };
  }

  async function uploadImage(file, dataUrl) {
    if (!configured()) throw new Error("إعدادات GitHub غير مكتملة");
    var parsed = dataUrlToBase64(dataUrl);
    if (!parsed) throw new Error("صورة غير صالحة");
    var ext = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "image/svg+xml": ".svg"
    }[parsed.mime];
    if (!ext) throw new Error("نوع الصورة غير مدعوم");

    var stem = String(file && file.name ? file.name : "image")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-") || "image";
    var path = "assets/uploads/" + stem + "-" + Date.now().toString(36) + ext;

    await writeFile(path, parsed.data, "assets: add " + path.split("/").pop());
    return path;
  }

  window.GitHubPublish = {
    load: load,
    persist: persist,
    configured: configured,
    verify: verify,
    publish: publish,
    uploadImage: uploadImage,
    state: state,
    buildI18n: buildI18n
  };
})();
