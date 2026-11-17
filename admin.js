/* ============================================================
   Dashboard logic — ABDELKAIOUM portfolio
   Loads content/site.json, lets you edit every section and add
   previous work, then saves back through the local server API.
   Falls back to localStorage when the API is not available.
   ============================================================ */
(function () {
  "use strict";

  const API = {
    content: "api/content",
    upload: "api/upload",
    backups: "api/backups",
    restore: "api/restore"
  };
  const LS_KEY = "portfolio-admin-draft";
  const LS_LAST_SAVE = "portfolio-admin-last-save";

  const el = (id) => document.getElementById(id);
  const q = (sel, scope) => (scope || document).querySelector(sel);
  const qa = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));

  const state = {
    content: null,
    original: null,
    online: false,
    saving: false,
    dirty: false,
    activePanel: "home",
    projectSearch: "",
    editingProjectId: null
  };

  /* ---------------- utilities ---------------- */

  const uid = (prefix) =>
    (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);

  const clone = (value) => JSON.parse(JSON.stringify(value == null ? null : value));

  const nowISO = () => new Date().toISOString();

  function bi(en, ar) {
    return { en: en == null ? "" : String(en), ar: ar == null ? "" : String(ar) };
  }

  function pickLang(value, lang) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    return value[lang] || value.en || value.ar || "";
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    try {
      return new Intl.DateTimeFormat("ar", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    } catch (error) {
      return date.toLocaleString();
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(message, kind) {
    const stack = el("toastStack");
    if (!stack) return;
    const node = document.createElement("div");
    node.className = "toast toast--" + (kind || "ok");
    node.textContent = message;
    stack.appendChild(node);
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(8px)";
      node.style.transition = "opacity .2s ease, transform .2s ease";
      setTimeout(() => node.remove(), 220);
    }, kind === "error" ? 5200 : 3200);
  }

  /* ---------------- data access ---------------- */

  function blankContent() {
    return {
      version: 1,
      updatedAt: nowISO(),
      defaultLanguage: "ar",
      meta: { title: bi("ABDELKAIOUM | Web Developer", "عبدالقيوم | مطور مواقع"), description: bi("", "") },
      nav: {
        home: bi("Home", "الرئيسية"),
        services: bi("Services", "الخدمات"),
        work: bi("Work", "الأعمال"),
        approach: bi("Approach", "نهجي"),
        skills: bi("Skills", "المهارات"),
        contact: bi("Contact", "تواصل")
      },
      hero: {
        eyebrow: bi("", ""),
        title: bi("I'm Abdelkaioum", "أنا عبدالقيوم"),
        role: bi("", ""),
        lines: [bi("", ""), bi("", ""), bi("", "")],
        cta: bi("Start a Project", "ابدأ مشروعك"),
        ctaHref: "#contact",
        portrait: "me.jpeg",
        portraitAlt: bi("", "")
      },
      services: { eyebrow: bi("Services", "الخدمات"), title: bi("", ""), intro: bi("", ""), items: [] },
      work: {
        eyebrow: bi("Portfolio", "معرض الأعمال"),
        title: bi("Selected Work", "أعمال مختارة"),
        intro: bi("", ""),
        emptyLabel: bi("Projects coming soon.", "أعمال جديدة قريبًا."),
        visitLabel: bi("Visit site", "زيارة الموقع"),
        items: []
      },
      story: {
        eyebrow: bi("", ""),
        title: bi("How I Build Websites", "كيف أبني المواقع"),
        intro: bi("", ""),
        stagesLabel: bi("5 CORE STAGES", "٥ مراحل أساسية"),
        scrollLabel: bi("SCROLL THROUGH THE PROCESS", "مرّر للتعرّف على المراحل"),
        items: []
      },
      skills: { title: bi("", ""), intro: bi("", ""), listLabel: bi("Skills and technologies", "المهارات والتقنيات"), items: [] },
      contact: {
        eyebrow: bi("Contact", "تواصل"),
        title: bi("", ""),
        copy: bi("", ""),
        whatsapp: "",
        email: "",
        whatsappLabel: bi("Message me on WhatsApp", "راسلني عبر WhatsApp"),
        whatsappShort: bi("WhatsApp", "WhatsApp"),
        emailLabel: bi("Email me", "راسلني بالبريد الإلكتروني"),
        emailShort: bi("Email", "البريد الإلكتروني"),
        footerRights: bi("", "")
      }
    };
  }

  function normalize(content) {
    const base = blankContent();
    if (!content || typeof content !== "object") return base;
    const merged = Object.assign(base, content);
    ["meta", "nav", "hero", "services", "work", "story", "skills", "contact"].forEach((key) => {
      merged[key] = Object.assign({}, base[key], content[key] || {});
    });
    merged.hero.lines = Array.isArray(merged.hero.lines) ? merged.hero.lines : base.hero.lines;
    ["services", "work", "story", "skills"].forEach((key) => {
      merged[key].items = Array.isArray(merged[key].items) ? merged[key].items : [];
    });
    return merged;
  }

  async function fetchJSON(url, options) {
    const response = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), Object.assign({
      headers: { Accept: "application/json" }
    }, options || {}));
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  }

  async function loadContent() {
    let remote = null;
    const github = window.GitHubPublish;
    if (github) github.load();

    // 1) Local server API (node server.js)
    try {
      remote = await fetchJSON(API.content);
      state.online = true;
      state.mode = "local";
    } catch (error) {
      state.online = false;
      state.mode = "offline";
    }

    // 2) GitHub API (works on static hosting, needs a token)
    if (!remote && github && github.configured()) {
      try {
        const file = await github.readFile("content/site.json");
        if (file) {
          remote = JSON.parse(file.text);
          state.mode = "github";
        }
      } catch (gitError) {
        toast("تعذّر قراءة المحتوى من GitHub: " + gitError.message, "error");
      }
    }

    // 3) Plain static hosting: published content file, then bundled snapshot
    if (!remote) {
      try {
        remote = await fetchJSON("content/site.json");
      } catch (error) {
        remote = null;
      }
    }
    if (!remote && window.__SITE_CONTENT__) {
      remote = clone(window.__SITE_CONTENT__);
    }

    let draft = null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) draft = JSON.parse(raw);
    } catch (error) {
      draft = null;
    }

    if (!remote && !draft) {
      remote = blankContent();
    }

    state.content = normalize(draft || remote);
    state.original = clone(state.content);
    state.dirty = Boolean(draft && remote && draft.updatedAt !== remote.updatedAt);
    if (!draft && !remote) {
      toast("مفيش محتوى محفوظ — ابدأ من الصفر أو استورد site.json.", "warn");
    }
    renderAll();
  }

  function markDirty() {
    state.dirty = true;
    const badge = el("saveState");
    if (badge) {
      badge.textContent = "تعديلات غير محفوظة";
      badge.classList.add("is-dirty");
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state.content));
    } catch (error) { /* storage may be full or blocked */ }
  }

  function markClean(updatedAt) {
    state.dirty = false;
    const badge = el("saveState");
    if (badge) {
      badge.textContent = "كل التعديلات محفوظة — " + formatDate(updatedAt || state.content.updatedAt);
      badge.classList.remove("is-dirty");
    }
    try {
      localStorage.removeItem(LS_KEY);
      if (updatedAt) localStorage.setItem(LS_LAST_SAVE, String(updatedAt));
    } catch (error) { /* ignore */ }
  }

  /* ---------------- save / upload ---------------- */

  async function saveContent() {
    if (state.saving) return;
    state.saving = true;
    const button = el("saveBtn");
    button.classList.add("is-busy");
    q(".btn__label", button).textContent = "جارٍ الحفظ…";

    state.content.updatedAt = nowISO();
    const payload = clone(state.content);

    try {
      if (state.online) {
        const response = await fetch(API.content, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: payload })
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail.error || "HTTP " + response.status);
        }
        const result = await response.json();
        state.content.updatedAt = result.updatedAt || payload.updatedAt;
        state.original = clone(state.content);
        markClean(state.content.updatedAt);
        toast("تم حفظ التعديلات على الموقع ✓");
        loadBackups();
      } else if (state.mode === "github" && window.GitHubPublish && window.GitHubPublish.configured()) {
        q(".btn__label", button).textContent = "جارٍ النشر على GitHub…";
        const result = await window.GitHubPublish.publish(payload, (step) => {
          q(".btn__label", button).textContent = step;
        });
        state.content.updatedAt = result.updatedAt;
        state.original = clone(state.content);
        markClean(state.content.updatedAt);
        localStorage.removeItem(LS_KEY);
        toast("تم النشر على GitHub ✓ — GitHub Pages هيتحدّث في خلال دقيقة.", "ok");
        renderGhStatus();
      } else {
        state.original = clone(state.content);
        markClean(state.content.updatedAt);
        toast(
          state.mode === "offline" && !(window.GitHubPublish && window.GitHubPublish.configured())
            ? "تم الحفظ في المتصفح فقط. فعّل GitHub من تبويب «الإعدادات» عشان تنشر."
            : "تم الحفظ في المتصفح.",
          "warn"
        );
      }
      renderStats();
    } catch (error) {
      toast("فشل الحفظ: " + error.message, "error");
    } finally {
      state.saving = false;
      button.classList.remove("is-busy");
      q(".btn__label", button).textContent = "حفظ التعديلات";
    }
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("تعذّر قراءة الملف"));
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage(file) {
    const dataUrl = await readFileAsDataURL(file);

    // GitHub mode: commit the image into the repo so it survives reloads
    // and is served by GitHub Pages.
    if (!state.online && state.mode === "github" && window.GitHubPublish && window.GitHubPublish.configured()) {
      try {
        return await window.GitHubPublish.uploadImage(file, dataUrl);
      } catch (error) {
        toast("فشل رفع الصورة على GitHub: " + error.message, "error");
      }
    }

    if (state.online) {
      try {
        const response = await fetch(API.upload, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, dataUrl })
        });
        if (response.ok) {
          const result = await response.json();
          if (result.path) return result.path;
        }
      } catch (error) { /* fall through to inline storage */ }
    }
    toast("الصورة اتحفظت داخل ملف المحتوى (بدون سيرفر).", "warn");
    return dataUrl;
  }

  /* ---------------- panels ---------------- */

  const panelMeta = {
    home: { title: "نظرة عامة", subtitle: "عدّل محتوى الموقع وأضف أعمالك السابقة من مكان واحد." },
    projects: { title: "الأعمال السابقة", subtitle: "أضف مشاريعك، ارفع صور المعاينة، وحدد ما يظهر على الموقع." },
    hero: { title: "الواجهة الرئيسية", subtitle: "أول ما يراه الزائر: الاسم، التخصص، والوصف." },
    services: { title: "الخدمات", subtitle: "بطاقات الخدمات وأيقوناتها وألوانها." },
    story: { title: "طريقة العمل", subtitle: "مراحل العمل الخمس التي تظهر في قسم «كيف أبني المواقع»." },
    skills: { title: "المهارات والتقنيات", subtitle: "الشارات المتحركة في قسم المهارات." },
    contact: { title: "التواصل والفوتر", subtitle: "واتساب، البريد، ونصوص الفوتر." },
    settings: { title: "الإعدادات والنسخ", subtitle: "عنوان الصفحة، النسخ الاحتياطية، والتصدير." }
  };

  function setPanel(name) {
    state.activePanel = name;
    qa(".admin-nav__item").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.panel === name);
    });
    qa(".panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === name);
    });
    const meta = panelMeta[name] || panelMeta.home;
    el("panelTitle").textContent = meta.title;
    el("panelSubtitle").textContent = meta.subtitle;
    el("sidebar").classList.remove("is-open");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (name === "settings") loadBackups();
  }

  /* ---------------- generic form binding ---------------- */

  function bindForm(section, form) {
    const node = q('[data-form="' + section + '"]');
    if (!node) return;

    // fill (AR + EN pairs)
    qa("input, textarea, select", node).forEach((input) => {
      const name = input.name;
      if (!name) return;
      const suffix = name.endsWith("_ar") ? "ar" : name.endsWith("_en") ? "en" : null;
      const key = suffix ? name.slice(0, -3) : name;
      const value = form[key];

      if (suffix) {
        input.value = pickLang(value, suffix);
      } else if (Array.isArray(value)) {
        input.value = value.map((item) => pickLang(item, "ar") || pickLang(item, "en")).join("\n");
      } else if (value && typeof value === "object") {
        input.value = pickLang(value, "ar");
      } else {
        input.value = value == null ? "" : String(value);
      }

      if (input.dataset.bound === "1") return;
      input.dataset.bound = "1";
      input.addEventListener("input", () => {
        const target = state.content[section];
        if (suffix) {
          target[key] = Object.assign({}, target[key], { [suffix]: input.value });
        } else if (Array.isArray(target[key])) {
          target[key] = input.value
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => bi(line, line));
        } else {
          target[key] = input.value;
        }
        markDirty();
      });
    });
  }

  /* ---------------- projects ---------------- */

  function projectById(id) {
    return state.content.work.items.find((item) => item.id === id);
  }

  function newProject() {
    return {
      id: uid("project"),
      title: bi("", ""),
      copy: bi("", ""),
      url: "",
      image: "",
      tags: [],
      visible: true
    };
  }

  function renderProjects() {
    const list = el("projectsList");
    const empty = el("projectsEmpty");
    if (!list) return;

    const items = state.content.work.items;
    const query = state.projectSearch.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (!query) return true;
      const haystack = [pickLang(item.title, "ar"), pickLang(item.title, "en"), item.url]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    list.innerHTML = "";
    filtered.forEach((item) => {
      const card = document.createElement("article");
      card.className = "project-card" + (item.visible === false ? " is-hidden" : "");
      card.dataset.id = item.id;

      const media = document.createElement("div");
      media.className = "project-card__media";
      if (item.image) media.style.backgroundImage = 'url("' + item.image.replace(/"/g, "%22") + '")';
      media.innerHTML =
        '<span class="project-card__badge' +
        (item.visible === false ? " project-card__badge--hidden" : "") +
        '">' +
        (item.visible === false ? "مخفي" : "ظاهر") +
        "</span>";

      const body = document.createElement("div");
      body.className = "project-card__body";

      const title = pickLang(item.title, "ar") || pickLang(item.title, "en") || "بدون اسم";
      const copy = pickLang(item.copy, "ar") || pickLang(item.copy, "en");
      const tags = (item.tags || [])
        .map((tag) => pickLang(tag, "ar") || pickLang(tag, "en"))
        .filter(Boolean)
        .slice(0, 4);

      body.innerHTML =
        "<h3>" + escapeHtml(title) + "</h3>" +
        (copy ? "<p>" + escapeHtml(copy) + "</p>" : "") +
        (tags.length
          ? '<ul class="project-card__tags">' +
            tags.map((tag) => "<li>" + escapeHtml(tag) + "</li>").join("") +
            "</ul>"
          : "");

      const actions = document.createElement("div");
      actions.className = "project-card__actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn--ghost btn--small";
      editBtn.textContent = "تعديل";
      editBtn.addEventListener("click", () => openProjectEditor(item.id));

      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "btn btn--ghost btn--small";
      toggleBtn.textContent = item.visible === false ? "إظهار" : "إخفاء";
      toggleBtn.addEventListener("click", () => {
        item.visible = item.visible === false;
        item.updatedAt = nowISO();
        markDirty();
        renderProjects();
        renderStats();
      });

      actions.append(editBtn, toggleBtn);
      body.appendChild(actions);
      card.append(media, body);
      list.appendChild(card);
    });

    if (empty) empty.hidden = filtered.length > 0;
    if (!filtered.length && query) {
      empty.textContent = "مفيش نتائج مطابقة للبحث.";
      empty.hidden = false;
    } else if (empty) {
      empty.textContent = "لا توجد أعمال بعد. اضغط «عمل جديد» لإضافة أول عمل.";
    }
  }

  function openProjectEditor(id) {
    const item = id ? projectById(id) : newProject();
    if (!item) return;
    if (!id) {
      state.content.work.items.unshift(item);
      markDirty();
      renderProjects();
      renderStats();
    }

    state.editingProjectId = item.id;
    const drawer = el("projectEditor");
    const form = el("projectForm");
    if (!drawer || !form) return;

    el("projectEditorTitle").textContent = id ? "تعديل العمل" : "عمل جديد";
    form.elements.id.value = item.id;
    form.elements.title_ar.value = pickLang(item.title, "ar");
    form.elements.title_en.value = pickLang(item.title, "en");
    form.elements.copy_ar.value = pickLang(item.copy, "ar");
    form.elements.copy_en.value = pickLang(item.copy, "en");
    form.elements.url.value = item.url || "";
    form.elements.image.value = item.image && !item.image.startsWith("data:") ? item.image : "";
    form.elements.tags.value = (item.tags || [])
      .map((tag) => pickLang(tag, "en") || pickLang(tag, "ar"))
      .filter(Boolean)
      .join(", ");
    form.elements.visible.checked = item.visible !== false;

    updateProjectPreview(item.image);

    drawer.hidden = false;
    drawer.scrollIntoView({ behavior: "smooth", block: "start" });
    form.elements.title_ar.focus({ preventScroll: true });

    // live preview while a link is typed
    form.elements.image.oninput = () => updateProjectPreview(form.elements.image.value.trim());
    form.elements.url.oninput = () => {
      const value = form.elements.url.value.trim();
      if (value && !form.elements.image.value) {
        updateProjectPreview("https://image.thum.io/get/width/1200/crop/750/noanimate/" + value);
      }
    };
  }

  function updateProjectPreview(src) {
    const preview = q("[data-project-preview]");
    if (!preview) return;
    if (src) {
      preview.style.backgroundImage = 'url("' + String(src).replace(/"/g, "%22") + '")';
      preview.classList.add("has-image");
    } else {
      preview.style.backgroundImage = "";
      preview.classList.remove("has-image");
    }
  }

  function closeProjectEditor() {
    const drawer = el("projectEditor");
    if (drawer) drawer.hidden = true;
    state.editingProjectId = null;
  }

  function saveProjectFromForm() {
    const form = el("projectForm");
    const id = form.elements.id.value;
    const item = projectById(id);
    if (!item) return;

    const fallbackTitle = form.elements.title_en.value.trim() || form.elements.title_ar.value.trim();
    const arTitle = form.elements.title_ar.value.trim() || fallbackTitle;
    const enTitle = form.elements.title_en.value.trim() || form.elements.title_ar.value.trim();
    const arCopy = form.elements.copy_ar.value.trim() || form.elements.copy_en.value.trim();
    const enCopy = form.elements.copy_en.value.trim() || form.elements.copy_ar.value.trim();

    item.title = bi(enTitle, arTitle);
    item.copy = bi(enCopy, arCopy);
    item.url = form.elements.url.value.trim();
    item.image = form.elements.image.value.trim() || (item.image && item.image.startsWith("data:") ? item.image : "");
    item.tags = form.elements.tags.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => bi(tag, tag));
    item.visible = form.elements.visible.checked;
    item.updatedAt = nowISO();

    markDirty();
    renderProjects();
    renderStats();
    closeProjectEditor();
    toast("تم تحديث بيانات العمل. اضغط «حفظ التعديلات» للنشر.");
  }

  function deleteProject() {
    const form = el("projectForm");
    const id = form.elements.id.value;
    const item = projectById(id);
    if (!item) return;
    const title = pickLang(item.title, "ar") || pickLang(item.title, "en") || "هذا العمل";
    if (!window.confirm("هل تريد حذف «" + title + "»؟")) return;
    state.content.work.items = state.content.work.items.filter((entry) => entry.id !== id);
    markDirty();
    renderProjects();
    renderStats();
    closeProjectEditor();
    toast("تم حذف العمل.");
  }

  function quickAddProject(form) {
    const title = form.elements.title.value.trim();
    if (!title) {
      toast("اكتب اسم المشروع الأول.", "warn");
      form.elements.title.focus();
      return;
    }
    const url = form.elements.url.value.trim();
    const item = newProject();
    item.title = bi(title, title);
    item.url = url;
    item.image = url
      ? "https://image.thum.io/get/width/1200/crop/750/noanimate/" + url.replace(/\/$/, "")
      : "";
    state.content.work.items.unshift(item);
    markDirty();
    renderProjects();
    renderStats();
    form.reset();
    toast("تمت إضافة العمل. اضغط «حفظ التعديلات» للنشر.");
  }

  /* ---------------- repeatable rows (services / steps / skills) ---------------- */

  function repeatRow(options) {
    const row = document.createElement("div");
    row.className = "repeat-row";
    row.dataset.id = options.id;
    if (options.collapsed) row.classList.add("is-collapsed");

    const head = document.createElement("div");
    head.className = "repeat-row__head";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "repeat-row__title";
    toggle.innerHTML =
      (options.swatch ? '<span class="repeat-row__swatch" style="background:' + options.swatch + '"></span>' : "") +
      "<strong>" + escapeHtml(options.title || "بدون اسم") + "</strong>" +
      '<span class="repeat-row__chevron" aria-hidden="true">▾</span>';
    toggle.addEventListener("click", () => row.classList.toggle("is-collapsed"));

    const tools = document.createElement("div");
    tools.className = "repeat-row__tools";

    if (options.onVisibility) {
      const visibility = document.createElement("button");
      visibility.type = "button";
      visibility.className = "btn btn--icon";
      visibility.title = options.visible === false ? "إظهار" : "إخفاء";
      visibility.textContent = options.visible === false ? "◌" : "◉";
      visibility.addEventListener("click", () => {
        options.onVisibility();
        visibility.title = options.visible === false ? "إظهار" : "إخفاء";
        visibility.textContent = options.visible === false ? "◌" : "◉";
      });
      tools.appendChild(visibility);
    }

    if (options.onMoveUp) {
      const up = document.createElement("button");
      up.type = "button";
      up.className = "btn btn--icon";
      up.title = "تحريك لأعلى";
      up.textContent = "↑";
      up.addEventListener("click", () => options.onMoveUp());
      tools.appendChild(up);
    }

    if (options.onMoveDown) {
      const down = document.createElement("button");
      down.type = "button";
      down.className = "btn btn--icon";
      down.title = "تحريك لأسفل";
      down.textContent = "↓";
      down.addEventListener("click", () => options.onMoveDown());
      tools.appendChild(down);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn--icon btn--danger";
    remove.title = "حذف";
    remove.textContent = "✕";
    remove.addEventListener("click", () => {
      if (!window.confirm("حذف «" + (options.title || "العنصر") + "»؟")) return;
      options.onRemove();
    });
    tools.appendChild(remove);

    head.append(toggle, tools);

    const body = document.createElement("div");
    body.className = "repeat-row__body";
    body.appendChild(options.body);

    row.append(head, body);
    return row;
  }

  function field(label, input) {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const span = document.createElement("span");
    span.textContent = label;
    wrap.append(span, input);
    return wrap;
  }

  function textInput(value, dir, placeholder) {
    const input = document.createElement("input");
    input.type = "text";
    input.dir = dir || "rtl";
    input.value = value || "";
    if (placeholder) input.placeholder = placeholder;
    return input;
  }

  function textArea(value, dir, rows) {
    const input = document.createElement("textarea");
    input.rows = rows || 2;
    input.dir = dir || "rtl";
    input.value = value || "";
    return input;
  }

  function moveItem(items, index, delta) {
    const next = index + delta;
    if (next < 0 || next >= items.length) return false;
    const [item] = items.splice(index, 1);
    items.splice(next, 0, item);
    return true;
  }

  function renderServicesEditor() {
    const list = el("servicesList");
    if (!list) return;
    const items = state.content.services.items;
    list.innerHTML = "";

    items.forEach((item, index) => {
      const body = document.createElement("div");
      body.className = "form-grid";

      const titleAr = textInput(pickLang(item.title, "ar"), "rtl");
      const titleEn = textInput(pickLang(item.title, "en"), "ltr");
      const copyAr = textArea(pickLang(item.copy, "ar"), "rtl", 2);
      const copyEn = textArea(pickLang(item.copy, "en"), "ltr", 2);

      titleAr.addEventListener("input", () => { item.title.ar = titleAr.value; markDirty(); });
      titleEn.addEventListener("input", () => { item.title.en = titleEn.value; markDirty(); });
      copyAr.addEventListener("input", () => { item.copy.ar = copyAr.value; markDirty(); });
      copyEn.addEventListener("input", () => { item.copy.en = copyEn.value; markDirty(); });

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = /^#[0-9a-f]{6}$/i.test(item.color || "") ? item.color : "#c4b5fd";
      const colorText = textInput(item.color || "#c4b5fd", "ltr");
      colorInput.addEventListener("input", () => {
        item.color = colorInput.value;
        colorText.value = colorInput.value;
        markDirty();
      });
      colorText.addEventListener("input", () => {
        item.color = colorText.value;
        if (/^#[0-9a-f]{6}$/i.test(colorText.value)) colorInput.value = colorText.value;
        markDirty();
      });

      const colorWrap = document.createElement("div");
      colorWrap.className = "color-input";
      colorWrap.append(colorInput, colorText);

      const iconArea = textArea(item.icon || "", "ltr", 4);
      iconArea.style.direction = "ltr";
      iconArea.placeholder = "<svg …></svg>";
      iconArea.addEventListener("input", () => { item.icon = iconArea.value; markDirty(); });
      const iconWrap = document.createElement("div");
      iconWrap.className = "icon-field field field--full";
      const iconLabel = document.createElement("span");
      iconLabel.textContent = "كود الأيقونة (SVG) — اختياري";
      iconWrap.append(iconLabel, iconArea);

      body.append(
        field("الاسم (ع)", titleAr),
        field("Name (EN)", titleEn),
        field("الوصف (ع)", copyAr),
        field("Copy (EN)", copyEn),
        field("لون الأيقونة", colorWrap),
        iconWrap
      );

      list.appendChild(repeatRow({
        id: item.id,
        title: pickLang(item.title, "ar") || pickLang(item.title, "en") || "خدمة",
        swatch: item.color,
        collapsed: index > 1,
        visible: item.visible,
        body,
        onRemove: () => {
          state.content.services.items = items.filter((entry) => entry.id !== item.id);
          markDirty();
          renderServicesEditor();
          renderStats();
        },
        onVisibility: () => {
          item.visible = item.visible === false;
          markDirty();
          renderStats();
        },
        onMoveUp: () => { if (moveItem(items, index, -1)) { markDirty(); renderServicesEditor(); } },
        onMoveDown: () => { if (moveItem(items, index, 1)) { markDirty(); renderServicesEditor(); } }
      }));
    });
  }

  function renderStoryEditor() {
    const list = el("storyList");
    if (!list) return;
    const items = state.content.story.items;
    list.innerHTML = "";

    items.forEach((item, index) => {
      const body = document.createElement("div");
      body.className = "form-grid";

      const titleAr = textInput(pickLang(item.title, "ar"), "rtl");
      const titleEn = textInput(pickLang(item.title, "en"), "ltr");
      const copyAr = textArea(pickLang(item.copy, "ar"), "rtl", 2);
      const copyEn = textArea(pickLang(item.copy, "en"), "ltr", 2);
      const phaseAr = textInput(pickLang(item.phase, "ar"), "rtl");
      const phaseEn = textInput(pickLang(item.phase, "en"), "ltr");

      titleAr.addEventListener("input", () => { item.title.ar = titleAr.value; markDirty(); });
      titleEn.addEventListener("input", () => { item.title.en = titleEn.value; markDirty(); });
      copyAr.addEventListener("input", () => { item.copy.ar = copyAr.value; markDirty(); });
      copyEn.addEventListener("input", () => { item.copy.en = copyEn.value; markDirty(); });
      phaseAr.addEventListener("input", () => { item.phase.ar = phaseAr.value; markDirty(); });
      phaseEn.addEventListener("input", () => { item.phase.en = phaseEn.value; markDirty(); });

      body.append(
        field("المرحلة (ع)", titleAr),
        field("Stage (EN)", titleEn),
        field("الوصف (ع)", copyAr),
        field("Copy (EN)", copyEn),
        field("وسم المرحلة (ع)", phaseAr),
        field("Phase label (EN)", phaseEn)
      );

      list.appendChild(repeatRow({
        id: item.id,
        title: pickLang(item.title, "ar") || pickLang(item.title, "en") || "مرحلة",
        collapsed: index > 1,
        body,
        onRemove: () => {
          state.content.story.items = items.filter((entry) => entry.id !== item.id);
          markDirty();
          renderStoryEditor();
        },
        onMoveUp: () => { if (moveItem(items, index, -1)) { markDirty(); renderStoryEditor(); } },
        onMoveDown: () => { if (moveItem(items, index, 1)) { markDirty(); renderStoryEditor(); } }
      }));
    });
  }

  function renderSkillsEditor() {
    const list = el("skillsList");
    if (!list) return;
    const items = state.content.skills.items;
    list.innerHTML = "";

    items.forEach((item, index) => {
      const body = document.createElement("div");
      body.className = "form-grid";

      const labelAr = textInput(pickLang(item.label, "ar"), "rtl");
      const labelEn = textInput(pickLang(item.label, "en"), "ltr");
      labelAr.addEventListener("input", () => { item.label.ar = labelAr.value; markDirty(); });
      labelEn.addEventListener("input", () => { item.label.en = labelEn.value; markDirty(); });

      const iconArea = textArea(item.icon || "", "ltr", 4);
      iconArea.style.direction = "ltr";
      iconArea.placeholder = "<svg …></svg>";
      iconArea.addEventListener("input", () => { item.icon = iconArea.value; markDirty(); });
      const iconWrap = document.createElement("div");
      iconWrap.className = "icon-field field field--full";
      const iconLabel = document.createElement("span");
      iconLabel.textContent = "كود الأيقونة (SVG) — اختياري";
      iconWrap.append(iconLabel, iconArea);

      body.append(field("الاسم (ع)", labelAr), field("Label (EN)", labelEn), iconWrap);

      list.appendChild(repeatRow({
        id: item.id,
        title: pickLang(item.label, "ar") || pickLang(item.label, "en") || "مهارة",
        collapsed: index > 3,
        visible: item.visible,
        body,
        onRemove: () => {
          state.content.skills.items = items.filter((entry) => entry.id !== item.id);
          markDirty();
          renderSkillsEditor();
          renderStats();
        },
        onVisibility: () => {
          item.visible = item.visible === false;
          markDirty();
          renderStats();
        },
        onMoveUp: () => { if (moveItem(items, index, -1)) { markDirty(); renderSkillsEditor(); } },
        onMoveDown: () => { if (moveItem(items, index, 1)) { markDirty(); renderSkillsEditor(); } }
      }));
    });
  }

  /* ---------------- stats / hero preview ---------------- */

  function renderStats() {
    const content = state.content;
    const visibleCount = (items) => (items || []).filter((item) => item.visible !== false).length;
    el("statProjects").textContent = visibleCount(content.work.items);
    el("statServices").textContent = visibleCount(content.services.items);
    el("statSkills").textContent = visibleCount(content.skills.items);
    el("statUpdated").textContent = formatDate(content.updatedAt);
    el("projectsCount").textContent = String(content.work.items.length);

    const portrait = q("[data-portrait-preview]");
    if (portrait) {
      if (content.hero.portrait) {
        portrait.style.backgroundImage = 'url("' + String(content.hero.portrait).replace(/"/g, "%22") + '")';
        portrait.classList.add("has-image");
      } else {
        portrait.style.backgroundImage = "";
        portrait.classList.remove("has-image");
      }
    }
  }

  /* ---------------- backups ---------------- */

  async function loadBackups() {
    const list = el("backupList");
    if (!list) return;
    list.innerHTML = '<p class="muted">جارٍ التحميل…</p>';

    if (!state.online) {
      if (state.mode === "github" && window.GitHubPublish && window.GitHubPublish.configured()) {
        list.innerHTML =
          '<p class="muted">في وضع GitHub كل حفظ بيعمل commit. تقدر ترجع لأي نسخة من ' +
          'تاريخ الريبو على GitHub مباشرة.</p>' +
          '<p class="muted"><a class="gh-history-link" target="_blank" rel="noopener" href="' +
          'https://github.com/' + window.GitHubPublish.state.owner + "/" + window.GitHubPublish.state.repo +
          '/commits/' + window.GitHubPublish.state.branch + '/content/site.json">' +
          'افتح تاريخ المحتوى على GitHub ↗</a></p>';
        return;
      }
      list.innerHTML = '<p class="muted">النسخ الاحتياطية بتظهر لما تشغّل السيرفر: <code>node server.js</code> ' +
        'أو تفعّل وضع GitHub من فوق.</p>';
      return;
    }

    try {
      const result = await fetchJSON(API.backups);
      const backups = result.backups || [];
      if (!backups.length) {
        list.innerHTML = '<p class="muted">مفيش نسخ احتياطية بعد. أول حفظ هيعمل نسخة.</p>';
        return;
      }
      list.innerHTML = "";
      backups.forEach((name) => {
        const row = document.createElement("div");
        row.className = "backup-row";
        const code = document.createElement("code");
        code.textContent = name;
        const restore = document.createElement("button");
        restore.type = "button";
        restore.className = "btn btn--ghost btn--small";
        restore.textContent = "استعادة";
        restore.addEventListener("click", async () => {
          if (!window.confirm("استعادة النسخة «" + name + "»؟ سيتم استبدال المحتوى الحالي.")) return;
          restore.disabled = true;
          try {
            const response = await fetch(API.restore, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name })
            });
            if (!response.ok) throw new Error("HTTP " + response.status);
            toast("تم استرجاع النسخة ✓");
            await loadContent();
            loadBackups();
          } catch (error) {
            toast("فشل الاسترجاع: " + error.message, "error");
          } finally {
            restore.disabled = false;
          }
        });
        row.append(code, restore);
        list.appendChild(row);
      });
    } catch (error) {
      list.innerHTML = '<p class="muted">تعذّر تحميل النسخ الاحتياطية.</p>';
    }
  }

  /* ---------------- wiring ---------------- */

  function renderAll() {
    bindForm("hero", state.content.hero);
    bindForm("services", state.content.services);
    bindForm("story", state.content.story);
    bindForm("skills", state.content.skills);
    bindForm("contact", state.content.contact);
    bindForm("meta", state.content.meta);
    renderProjects();
    renderServicesEditor();
    renderStoryEditor();
    renderSkillsEditor();
    renderStats();
    markClean(state.content.updatedAt);
  }

  function wireEvents() {
    qa(".admin-nav__item").forEach((item) => {
      item.addEventListener("click", () => setPanel(item.dataset.panel));
    });

    qa("[data-goto-projects]").forEach((button) => {
      button.addEventListener("click", () => setPanel("projects"));
    });

    el("sidebarToggle").addEventListener("click", () => {
      el("sidebar").classList.toggle("is-open");
    });

    el("saveBtn").addEventListener("click", saveContent);

    el("undoBtn").addEventListener("click", () => {
      if (!window.confirm("الرجوع لآخر محتوى محفوظ؟ هتضيع التعديلات غير المحفوظة.")) return;
      state.content = clone(state.original);
      renderAll();
      toast("تم الرجوع لآخر نسخة محفوظة.");
    });

    el("newProjectBtn").addEventListener("click", () => openProjectEditor(null));

    el("projectSearch").addEventListener("input", (event) => {
      state.projectSearch = event.target.value;
      renderProjects();
    });

    qa("[data-close-editor]").forEach((button) => {
      button.addEventListener("click", closeProjectEditor);
    });

    el("projectForm").addEventListener("submit", (event) => {
      event.preventDefault();
      saveProjectFromForm();
    });

    q("[data-delete-project]").addEventListener("click", deleteProject);
    q("[data-clear-image]").addEventListener("click", () => {
      const form = el("projectForm");
      form.elements.image.value = "";
      const item = projectById(form.elements.id.value);
      if (item) item.image = "";
      updateProjectPreview("");
      markDirty();
    });

    el("quickProjectForm").addEventListener("submit", (event) => {
      event.preventDefault();
      quickAddProject(event.target);
    });

    el("quickProjectForm")
      .querySelector("[data-image-picker]")
      .addEventListener("change", async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        toast("جارٍ رفع الصورة…", "warn");
        const path = await uploadImage(file);
        const form = el("quickProjectForm");
        const pending = state.content.work.items[0];
        if (pending) pending.image = path;
        const titleInput = form.elements.title;
        if (!titleInput.value) titleInput.focus();
        toast("الصورة جاهزة — اكتب اسم المشروع واضغط إضافة.");
        event.target.value = "";
        markDirty();
      });

    q("[data-portrait-picker]").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      toast("جارٍ رفع الصورة…", "warn");
      const path = await uploadImage(file);
      state.content.hero.portrait = path;
      const input = q('[data-form="hero"] [name="portrait"]');
      if (input) input.value = path;
      renderStats();
      markDirty();
      toast("تم تحديث صورة البروفايل. اضغط «حفظ التعديلات».");
      event.target.value = "";
    });

    q("#projectForm [data-image-picker]").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      toast("جارٍ رفع الصورة…", "warn");
      const path = await uploadImage(file);
      const form = el("projectForm");
      form.elements.image.value = path.startsWith("data:") ? "" : path;
      const item = projectById(form.elements.id.value);
      if (item) item.image = path;
      updateProjectPreview(path);
      markDirty();
      toast("تم تحديث صورة العمل. اضغط «حفظ العمل».");
      event.target.value = "";
    });

    el("newServiceBtn").addEventListener("click", () => {
      state.content.services.items.push({
        id: uid("service"),
        title: bi("", ""),
        copy: bi("", ""),
        color: "#c4b5fd",
        icon: "",
        visible: true
      });
      markDirty();
      renderServicesEditor();
      renderStats();
    });

    el("newStepBtn").addEventListener("click", () => {
      state.content.story.items.push({
        id: uid("step"),
        title: bi("", ""),
        copy: bi("", ""),
        phase: bi("", ""),
        visible: true
      });
      markDirty();
      renderStoryEditor();
    });

    el("newSkillBtn").addEventListener("click", () => {
      state.content.skills.items.push({
        id: uid("skill"),
        label: bi("", ""),
        icon: "",
        visible: true
      });
      markDirty();
      renderSkillsEditor();
      renderStats();
    });

    el("exportBtn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state.content, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "site.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast("تم تصدير ملف المحتوى.");
    });

    el("importInput").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object") throw new Error("ملف غير صالح");
        state.content = normalize(parsed);
        markDirty();
        renderAll();
        toast("تم استيراد المحتوى. اضغط «حفظ التعديلات» لتأكيده.");
      } catch (error) {
        toast("تعذّر استيراد الملف: " + error.message, "error");
      } finally {
        event.target.value = "";
      }
    });

    el("resetBtn").addEventListener("click", async () => {
      if (!window.confirm("استعادة المحتوى الأصلي؟ كل التعديلات الحالية هتضيع.")) return;
      try {
        const fresh = state.online ? await fetchJSON("content/site.json") : blankContent();
        state.content = normalize(fresh);
        markDirty();
        renderAll();
        toast("تم تحميل المحتوى الأصلي. اضغط «حفظ التعديلات» لتأكيده.");
      } catch (error) {
        toast("تعذّر تحميل المحتوى الأصلي: " + error.message, "error");
      }
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveContent();
      }
      if (event.key === "Escape" && !el("projectEditor").hidden) {
        closeProjectEditor();
      }
    });
  }

  function setConnectionBadge() {
    const badge = el("connBadge");
    if (!badge) return;
    badge.classList.remove("is-online", "is-offline", "is-github");
    if (state.online) {
      badge.textContent = "متصل — الحفظ على الملفات ✓";
      badge.classList.add("is-online");
    } else if (state.mode === "github" && window.GitHubPublish && window.GitHubPublish.configured()) {
      badge.textContent = "GitHub — النشر مباشرة ✓";
      badge.classList.add("is-github");
    } else {
      badge.textContent = "حفظ في المتصفح — فعّل GitHub";
      badge.classList.add("is-offline");
    }
  }

  function renderGhStatus() {
    const badge = el("ghBadge");
    const status = el("ghStatus");
    const github = window.GitHubPublish;
    if (!github) return;
    github.load();
    const ready = github.configured();
    if (badge) {
      badge.textContent = ready ? "مُفعّل ✓" : "غير مُفعّل";
      badge.classList.toggle("is-on", ready);
    }
    if (status) {
      status.textContent = ready
        ? "النشر على " + github.state.owner + "/" + github.state.repo + " (" + github.state.branch + ")"
        : "لسه ما اتوصلناش. أضف التوكن من الفورم فوق.";
      status.classList.toggle("is-on", ready);
    }
  }

  function wireGithub() {
    const github = window.GitHubPublish;
    const form = el("ghForm");
    if (!github || !form) return;

    github.load();
    form.elements.token.value = github.state.token || "";
    form.elements.owner.value = github.state.owner || "";
    form.elements.repo.value = github.state.repo || "";
    form.elements.branch.value = github.state.branch || "main";
    renderGhStatus();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      github.persist({
        token: form.elements.token.value,
        owner: form.elements.owner.value,
        repo: form.elements.repo.value,
        branch: form.elements.branch.value
      });
      const status = el("ghStatus");
      if (status) status.textContent = "جارٍ اختبار الاتصال…";
      try {
        const info = await github.verify();
        if (status) {
          status.textContent = "متصل بـ " + info.owner + "/" + info.repo + " ✓ — تقدر تنشر دلوقتي.";
          status.classList.add("is-on");
        }
        state.mode = "github";
        renderGhStatus();
        setConnectionBadge();
        toast("تم تفعيل النشر على GitHub ✓", "ok");
      } catch (error) {
        if (status) {
          status.textContent = "فشل الاتصال: " + error.message;
          status.classList.remove("is-on");
        }
        toast("فشل الاتصال بـ GitHub: " + error.message, "error");
      }
    });

    el("ghDisconnect").addEventListener("click", () => {
      if (!window.confirm("قطع الاتصال بGitHub ومسح التوكن من المتصفح؟")) return;
      github.persist({ token: "", owner: github.state.defaultOwner || "", repo: github.state.defaultRepo || "", branch: "main" });
      form.elements.token.value = "";
      state.mode = state.online ? "local" : "offline";
      renderGhStatus();
      setConnectionBadge();
      toast("تم قطع الاتصال.");
    });

    // A token already stored in this browser means GitHub mode is live on load.
    if (github.configured() && !state.online) state.mode = "github";
  }

  async function boot() {
    await loadContent();
    wireEvents();
    wireGithub();
    setConnectionBadge();
    markClean(state.content.updatedAt);
    if (state.dirty) {
      toast("فيه تعديلات غير محفوظة من جلسة سابقة. راجعها واضغط حفظ.", "warn");
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
