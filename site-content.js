/* ============================================================
   Site content renderer
   Reads content/site.json (loaded by content-loader.js before this
   file) and paints every editable section of the page. Every element
   is re-written on language change, so edits show in both EN + AR.
   ============================================================ */
(function () {
  "use strict";

  var content = window.__SITE_CONTENT__;
  if (!content || typeof content !== "object") return;

  var DEFAULT_PROJECT_IMAGE =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750">' +
        '<rect width="1200" height="750" fill="#0b0d12"/>' +
        '<g fill="none" stroke="#2a2f3a" stroke-width="2">' +
        '<path d="M0 540h1200M0 300h1200M420 0v750M840 0v750"/></g>' +
        '<circle cx="600" cy="375" r="120" fill="#12151d" stroke="#2a2f3a" stroke-width="2"/>' +
        '<path d="M560 375l30 30 55-70" fill="none" stroke="#5b6474" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>"
    );

  function pick(value, lang) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      var text = value[lang];
      if (text == null || text === "") text = value.en;
      if (text == null) text = value.ar;
      return text == null ? "" : String(text);
    }
    return String(value);
  }

  function lang() {
    return window.siteI18n ? window.siteI18n.getLanguage() : "en";
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function svgMarkup(markup, className, color) {
    var holder = document.createElement("span");
    holder.className = className;
    holder.setAttribute("aria-hidden", "true");
    if (color) holder.style.color = color;
    if (markup && /<\s*svg[\s>]/i.test(markup)) {
      holder.innerHTML = markup;
    }
    return holder;
  }

  function visible(items) {
    return (Array.isArray(items) ? items : []).filter(function (item) {
      return item && item.visible !== false;
    });
  }

  function onlyDigits(value) {
    return String(value == null ? "" : value).replace(/[^\d]/g, "");
  }

  function whatsappHref(number) {
    var digits = onlyDigits(number);
    return digits ? "https://wa.me/" + digits : "";
  }

  function mailHref(address) {
    return address ? "mailto:" + address : "";
  }

  /* ---------------- Meta ---------------- */
  function renderMeta() {
    var l = lang();
    var meta = content.meta || {};
    if (meta.title) document.title = pick(meta.title, l);
    var descTag = document.querySelector('[data-i18n-content="meta.description"]');
    if (descTag && meta.description) descTag.setAttribute("content", pick(meta.description, l));
  }

  /* ---------------- Hero ---------------- */
  function renderHero() {
    var l = lang();
    var hero = content.hero || {};
    var eyebrow = document.querySelector(".hero .eyebrow");
    var title = document.getElementById("hero-title");
    var role = hero ? document.querySelector(".hero .role") : null;
    var lead = document.querySelector(".hero .lead");
    var cta = document.querySelector(".hero .cta");
    var portrait = document.querySelector(".hero .portrait img");

    if (eyebrow) eyebrow.textContent = pick(hero.eyebrow, l);
    if (title) {
      title.textContent = pick(hero.title, l);
      title.setAttribute("aria-label", pick(hero.title, l));
    }
    if (role) role.textContent = pick(hero.role, l);

    if (lead) {
      lead.replaceChildren();
      var lines = Array.isArray(hero.lines) ? hero.lines : [];
      lines.forEach(function (line) {
        var text = pick(line, l);
        if (!text) return;
        lead.appendChild(el("span", "line", text));
      });
      if (!lead.children.length && hero.lead) {
        lead.appendChild(el("span", "line", pick(hero.lead, l)));
      }
    }

    if (cta) {
      cta.textContent = pick(hero.cta, l);
      if (hero.ctaHref) cta.setAttribute("href", hero.ctaHref);
    }
    if (portrait) {
      if (hero.portrait) portrait.setAttribute("src", hero.portrait);
      portrait.setAttribute("alt", pick(hero.portraitAlt, l) || pick(hero.title, l));
    }
  }

  /* ---------------- Services ---------------- */
  function renderServices() {
    var l = lang();
    var block = content.services || {};
    var section = document.querySelector(".services-block");
    if (!section) return;

    var eyebrow = section.querySelector(".services-heading .eyebrow");
    var heading = section.querySelector(".services-heading .section-title");
    var intro = section.querySelector(".services-heading > p:last-child");
    if (eyebrow) eyebrow.textContent = pick(block.eyebrow, l);
    if (heading) heading.textContent = pick(block.title, l);
    if (intro) intro.textContent = pick(block.intro, l);

    var track = section.querySelector(".services-track");
    if (!track) return;

    var items = visible(block.items);
    var existing = Array.prototype.slice.call(track.querySelectorAll(".service-milestone"));
    var template = existing[0];
    var ordered = [];

    items.forEach(function (item, index) {
      var node = existing[index] || (template ? template.cloneNode(true) : null);
      if (!node) return;
      ordered.push(node);
      node.classList.remove("is-active");
      node.dataset.service = item.id || "service-" + index;
      node.dataset.contentId = item.id || "";

      var dotIndex = node.querySelector(".service-index");
      if (dotIndex) dotIndex.textContent = String(index + 1).padStart(2, "0");

      var card = node.querySelector(".service-card");
      if (card) {
        card.classList.remove("is-visible");
        card.style.setProperty("--icon-color", item.color || "#c4b5fd");
        var icon = card.querySelector(".card-icon");
        if (icon) icon.innerHTML = item.icon || "";
        var h3 = card.querySelector("h3");
        if (h3) {
          h3.textContent = pick(item.title, l);
          h3.removeAttribute("data-i18n");
        }
        var copy = card.querySelector("p");
        if (copy) {
          copy.textContent = pick(item.copy, l);
          copy.removeAttribute("data-i18n");
        }
      }
    });

    // Remove stale nodes beyond the current item count.
    existing.slice(items.length).forEach(function (node) {
      node.remove();
    });

    // Re-append in data order — covers both reused and cloned nodes.
    ordered.forEach(function (node) {
      track.appendChild(node);
    });

    if (!items.length) track.replaceChildren();
  }

  /* ---------------- Work / projects ---------------- */
  function renderWork() {
    var l = lang();
    var work = content.work || {};
    var section = document.getElementById("work");
    var grid = document.getElementById("workGrid");
    if (!section || !grid || !window.ProjectMedia) return;

    var t = function (key, values) { return window.siteI18n ? window.siteI18n.t(key, values) : key; };
    var digits = function (value) { return window.siteI18n ? window.siteI18n.localizeDigits(value) : String(value); };
    var eyebrow = section.querySelector(".eyebrow");
    var heading = section.querySelector(".section-title");
    var intro = section.querySelector(":scope > p");
    if (eyebrow) eyebrow.textContent = pick(work.eyebrow, l);
    if (heading) heading.textContent = pick(work.title, l);
    if (intro) intro.textContent = pick(work.intro, l);

    var items = visible(work.items);
    var existing = Array.prototype.slice.call(grid.querySelectorAll(":scope > .project"));
    items.forEach(function (item, index) {
      var node = existing[index] || el("article", "project");
      var title = pick(item.title, l);
      var url = /^https?:\/\//i.test(item.url || "") ? item.url : "";
      var cover = window.ProjectMedia.cover(item, l);
      var photoCount = window.ProjectMedia.count(item, l);
      node.dataset.url = url;
      node.dataset.contentId = item.id || "project-" + index;
      // The work carousel owns visibility; the generic reveal animation must
      // not leave native/mobile cards at opacity zero after a rerender.
      node.removeAttribute("data-reveal");
      node.setAttribute("role", "group");
      node.setAttribute("aria-label", digits(index + 1) + " / " + digits(items.length));
      node.replaceChildren();

      var preview = el("div", "project-preview");
      var bar = el("div", "project-window-bar");
      bar.setAttribute("aria-hidden", "true");
      var windowDots = el("span", "project-window-dots");
      for (var dot = 0; dot < 3; dot += 1) windowDots.appendChild(el("i"));
      var domain = "";
      try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch (error) { /* no live URL */ }
      bar.append(windowDots, el("span", "project-domain", domain || t("project.details")));
      if (photoCount) bar.appendChild(el("span", "project-photo-count", t(photoCount === 1 ? "project.photo" : "project.photos", { count: digits(photoCount) })));

      var media = el("button", "project-media");
      media.type = "button";
      media.dataset.projectGallery = node.dataset.contentId;
      media.setAttribute("aria-label", t("project.openGallery", { title: title }));
      media.setAttribute("aria-haspopup", "dialog");
      media.setAttribute("aria-controls", "projectGallery");
      var img = document.createElement("img");
      img.width = 1200;
      img.height = 750;
      img.loading = index > 1 ? "lazy" : "eager";
      img.decoding = "async";
      img.src = cover || DEFAULT_PROJECT_IMAGE;
      img.alt = title;
      img.addEventListener("error", function () {
        media.classList.add("is-fallback");
        if (img.getAttribute("src") !== DEFAULT_PROJECT_IMAGE) img.src = DEFAULT_PROJECT_IMAGE;
      });
      var openIcon = el("span", "project-media-open", "⤢");
      openIcon.setAttribute("aria-hidden", "true");
      media.append(img, openIcon);
      preview.append(bar, media);

      var body = el("div", "project-body");
      var h3 = el("h3", null, title);
      h3.title = title;
      body.append(h3, el("p", "project-summary", pick(item.copy, l)));
      var tags = el("ul", "project-tags");
      var allTags = (Array.isArray(item.tags) ? item.tags : []).map(function (tag) { return pick(tag, l).trim(); }).filter(Boolean);
      allTags.slice(0, 3).forEach(function (tag) { tags.appendChild(el("li", null, tag)); });
      if (allTags.length > 3) tags.appendChild(el("li", null, "+" + digits(allTags.length - 3)));
      tags.hidden = !allTags.length;
      body.appendChild(tags);

      var actions = el("div", "project-actions");
      var galleryButton = el("button", "project-gallery-trigger", t("project.view"));
      galleryButton.type = "button";
      galleryButton.dataset.projectGallery = node.dataset.contentId;
      galleryButton.setAttribute("aria-haspopup", "dialog");
      galleryButton.setAttribute("aria-controls", "projectGallery");
      actions.appendChild(galleryButton);
      if (url) {
        var link = el("a", "project-link");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        var arrow = el("span", null, "↗");
        arrow.setAttribute("aria-hidden", "true");
        link.append(el("span", null, pick(work.visitLabel, l) || t("project.visit")), arrow);
        actions.appendChild(link);
      }
      body.appendChild(actions);
      node.append(preview, body);
      node.classList.add("is-visible", "is-settled");
      if (!node.parentNode) grid.appendChild(node);
    });
    existing.slice(items.length).forEach(function (node) { node.remove(); });
    grid.classList.toggle("work-grid--empty", !items.length);
    if (!items.length) {
      grid.replaceChildren(el("p", "work-empty", pick(work.emptyLabel, l)));
    } else {
      var empty = grid.querySelector(".work-empty");
      if (empty) empty.remove();
    }
    document.dispatchEvent(new CustomEvent("site-work-rendered"));
  }

  /* ---------------- Storyline / process steps ---------------- */
  function renderStory() {
    var l = lang();
    var story = content.story || {};
    var section = document.getElementById("storyline");
    if (!section) return;

    var eyebrow = section.querySelector(".storyline-eyebrow");
    var heading = section.querySelector(".section-title");
    var intro = section.querySelector(".storyline-intro");
    var stages = section.querySelector(".storyline-period");
    var scroll = section.querySelector(".storyline-scroll-hint");
    if (eyebrow) eyebrow.textContent = pick(story.eyebrow, l);
    if (heading) heading.textContent = pick(story.title, l);
    if (intro) intro.textContent = pick(story.intro, l);
    if (stages) stages.textContent = pick(story.stagesLabel, l);
    if (scroll) scroll.textContent = pick(story.scrollLabel, l);

    var track = section.querySelector("[data-storyline-track]");
    if (!track) return;

    var items = visible(story.items);
    var existing = Array.prototype.slice.call(track.querySelectorAll(".storyline-item"));
    var template = existing[0];
    var total = String(items.length).padStart(2, "0");

    items.forEach(function (item, index) {
      var node = existing[index] || (template ? template.cloneNode(true) : null);
      if (!node) return;

      var number = node.querySelector(".storyline-index");
      if (number) {
        number.replaceChildren();
        number.appendChild(document.createTextNode(String(index + 1).padStart(2, "0") + " "));
        var slash = document.createElement("i");
        slash.textContent = "/";
        number.appendChild(slash);
        number.appendChild(document.createTextNode(" " + total));
      }

      var title = node.querySelector(".storyline-stage");
      if (title) {
        title.textContent = pick(item.title, l);
        title.removeAttribute("data-i18n");
      }
      var copy = node.querySelector("p");
      if (copy) {
        copy.textContent = pick(item.copy, l);
        copy.removeAttribute("data-i18n");
      }
      if (index === 0) node.classList.add("is-active");
      else node.classList.remove("is-active");
      if (!node.parentNode) track.appendChild(node);
    });

    existing.slice(items.length).forEach(function (node) {
      node.remove();
    });

    var progress = section.querySelector("[data-storyline-progress]");
    if (progress && !items.length) progress.style.transform = "scaleX(0)";
  }

  /* ---------------- Skills ---------------- */
  function renderSkills() {
    var l = lang();
    var block = content.skills || {};
    var section = document.getElementById("toolbox");
    if (!section) return;

    var heading = section.querySelector(".section-title");
    var intro = section.querySelector(".toolbox-intro > p");
    if (heading) heading.textContent = pick(block.title, l);
    if (intro) intro.textContent = pick(block.intro, l);

    var items = visible(block.items);
    var groups = section.querySelectorAll(".toolbox-group");
    var badgeTemplate = groups[0]
      ? groups[0].querySelector(".toolbox-badge")
      : null;
    if (!badgeTemplate) return;

    var badgeMarkup = badgeTemplate.outerHTML;

    Array.prototype.slice.call(groups).forEach(function (group, groupIndex) {
      var isClone = group.getAttribute("aria-hidden") === "true";
      group.replaceChildren();
      if (isClone) group.setAttribute("aria-hidden", "true");
      else group.setAttribute("aria-label", pick(block.listLabel, l) || "Skills and technologies");

      items.forEach(function (item) {
        var li = el("li", "toolbox-item");
        var badge = document.createElement("span");
        badge.innerHTML = badgeMarkup;
        var holder = badge.querySelector(".toolbox-badge");
        var logo = holder && holder.querySelector(".toolbox-logo");
        if (logo) {
          logo.innerHTML = item.icon || "";
          if (item.color) logo.style.color = item.color;
        }
        var label = holder && holder.querySelector(".toolbox-label");
        if (label) {
          label.textContent = pick(item.label, l);
          label.removeAttribute("data-i18n");
        }
        if (holder) li.appendChild(holder);
        group.appendChild(li);
      });
      group.dataset.groupIndex = String(groupIndex);
    });
  }

  /* ---------------- Contact + footer ---------------- */
  function renderContact() {
    var l = lang();
    var contact = content.contact || {};
    var section = document.getElementById("contact");
    if (section) {
      var eyebrow = section.querySelector(".eyebrow");
      var heading = section.querySelector(".section-title");
      var copy = section.querySelector(".contact-copy > p:last-child");
      if (eyebrow) eyebrow.textContent = pick(contact.eyebrow, l);
      if (heading) heading.textContent = pick(contact.title, l);
      if (copy) copy.textContent = pick(contact.copy, l);

      var actions = section.querySelectorAll(".contact-actions .contact-link");
      var wa = whatsappHref(contact.whatsapp);
      var mail = mailHref(contact.email);
      if (actions[0]) {
        if (wa) actions[0].setAttribute("href", wa);
        else actions[0].removeAttribute("href");
        actions[0].hidden = !wa;
        actions[0].replaceChildren();
        actions[0].appendChild(el("span", null, pick(contact.whatsappLabel, l) || "WhatsApp"));
        var a1 = el("span", null, "↗");
        a1.setAttribute("aria-hidden", "true");
        actions[0].appendChild(a1);
      }
      if (actions[1]) {
        if (mail) actions[1].setAttribute("href", mail);
        else actions[1].removeAttribute("href");
        actions[1].hidden = !mail;
        actions[1].textContent = pick(contact.emailLabel, l) || "Email";
      }
    }

    var footer = document.querySelector(".site-footer");
    if (footer) {
      var rights = footer.querySelector("p span");
      if (rights) rights.textContent = pick(contact.footerRights, l);
      var links = footer.querySelectorAll(".social a");
      var wa2 = whatsappHref(contact.whatsapp);
      var mail2 = mailHref(contact.email);
      if (links[0]) {
        links[0].hidden = !wa2;
        if (wa2) links[0].setAttribute("href", wa2);
        links[0].textContent = pick(contact.whatsappShort, l) || "WhatsApp";
      }
      if (links[1]) {
        links[1].hidden = !mail2;
        if (mail2) links[1].setAttribute("href", mail2);
        links[1].textContent = pick(contact.emailShort, l) || "Email";
      }
    }
  }

  /* ---------------- Nav ---------------- */
  function renderNav() {
    var nav = content.nav || {};
    var links = document.querySelectorAll(".nav-links a");
    var targets = ["home", "services", "work", "approach", "skills", "contact"];
    links.forEach(function (link, i) {
      var key = targets[i];
      if (key && nav[key]) link.textContent = pick(nav[key], lang());
    });
  }

  function renderAll() {
    renderMeta();
    renderNav();
    renderHero();
    renderServices();
    renderWork();
    renderStory();
    renderSkills();
    renderContact();
  }

  renderAll();

  document.addEventListener("site-language-change", function () {
    renderAll();
    if (window.ScrollTrigger && typeof window.ScrollTrigger.refresh === "function") {
      window.ScrollTrigger.refresh();
    }
  });

  window.siteContent = {
    get: function () { return content; },
    render: renderAll,
    helpers: { pick: pick, visible: visible }
  };
})();
