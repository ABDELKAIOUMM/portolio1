/* Full project details and two screenshot collections, loaded on demand. */
(function () {
  "use strict";
  var dialog = document.getElementById("projectGallery");
  if (!dialog || !window.ProjectMedia) return;
  var image = document.getElementById("galleryImage");
  var imageScroll = document.getElementById("galleryImageScroll");
  var canvas = dialog.querySelector(".gallery-canvas");
  var empty = document.getElementById("galleryEmpty");
  var thumbs = document.getElementById("galleryThumbnails");
  var counter = document.getElementById("galleryCounter");
  var zoom = document.getElementById("galleryZoom");
  var panel = document.getElementById("galleryPanel");
  var tabs = Array.from(dialog.querySelectorAll("[data-gallery-tab]"));
  var previous = dialog.querySelector("[data-gallery-previous]");
  var next = dialog.querySelector("[data-gallery-next]");
  var state = { id: "", item: null, group: "site", index: 0, images: { site: [], dashboard: [] }, zoomed: false };
  var opener = null;
  var resumeLenis = false;
  var pointerStart = null;
  var suppressClickUntil = 0;

  function t(key, values) { return window.siteI18n ? window.siteI18n.t(key, values) : key; }
  function digits(value) { return window.siteI18n ? window.siteI18n.localizeDigits(value) : String(value); }
  function rtl() { return document.documentElement.dir === "rtl"; }
  function pick(value) {
    var language = window.siteI18n ? window.siteI18n.getLanguage() : "en";
    return typeof value === "string" ? value : value && (value[language] || value.en || value.ar) || "";
  }
  function content() { return window.siteContent ? window.siteContent.get() : window.__SITE_CONTENT__ || {}; }
  function projects() { return ((content().work || {}).items || []).filter(function (item) { return item && item.visible !== false; }); }
  function projectId(item, index) { return item.id || "project-" + index; }
  function currentImages() { return state.images[state.group]; }
  function imageLabel(index) {
    return t("project.imageAlt", { title: pick(state.item.title), group: t(state.group === "site" ? "project.siteShots" : "project.dashboardShots"), number: digits(index + 1) });
  }

  function updateZoom() {
    imageScroll.classList.toggle("is-zoomed", state.zoomed);
    canvas.classList.toggle("is-zoomed", state.zoomed);
    zoom.setAttribute("aria-pressed", String(state.zoomed));
    zoom.querySelector("[data-gallery-zoom-label]").textContent = t(state.zoomed ? "project.zoomOut" : "project.zoomIn");
    imageScroll.scrollTop = 0;
    imageScroll.scrollLeft = 0;
  }

  function showImage(index) {
    var images = currentImages();
    state.index = images.length ? (index + images.length) % images.length : 0;
    state.zoomed = false;
    updateZoom();
    empty.hidden = images.length > 0;
    empty.textContent = images.length ? "" : t("project.noImages");
    image.hidden = !images.length;
    zoom.disabled = !images.length;
    previous.hidden = next.hidden = images.length < 2;
    counter.textContent = images.length ? t("project.imageCount", { current: digits(state.index + 1), total: digits(images.length) }) : "";
    canvas.classList.toggle("is-loading", images.length > 0);
    canvas.setAttribute("aria-busy", String(images.length > 0));
    if (images.length) {
      image.alt = imageLabel(state.index);
      image.src = images[state.index];
      if (image.complete) { canvas.classList.remove("is-loading"); canvas.setAttribute("aria-busy", "false"); }
    } else image.removeAttribute("src");
    Array.from(thumbs.children).forEach(function (button, i) {
      button.setAttribute("aria-current", String(i === state.index));
      button.tabIndex = i === state.index ? 0 : -1;
    });
    var selected = thumbs.children[state.index];
    if (selected) {
      // Scroll only the thumbnail rail. scrollIntoView would move the page or
      // jump the mobile dialog away from its close button and category tabs.
      var left = selected.offsetLeft - thumbs.offsetLeft - (thumbs.clientWidth - selected.offsetWidth) / 2;
      if (!rtl()) thumbs.scrollTo({ left: left, behavior: "instant" });
      else thumbs.scrollLeft = -(state.index * (selected.offsetWidth + 8));
    }
  }

  function showGroup(group, index) {
    state.group = group;
    if (!state.images[group].length && state.images[group === "site" ? "dashboard" : "site"].length) {
      state.group = group === "site" ? "dashboard" : "site";
    }
    var hasImages = state.images.site.length + state.images.dashboard.length > 0;
    tabs.forEach(function (tab) {
      var key = tab.dataset.galleryTab;
      var selected = key === state.group;
      tab.disabled = !state.images[key].length && (hasImages || key === "dashboard");
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.querySelector("[data-gallery-tab-count]").textContent = digits(state.images[key].length);
    });
    panel.setAttribute("aria-labelledby", state.group === "site" ? "gallerySiteTab" : "galleryDashboardTab");
    thumbs.replaceChildren();
    currentImages().forEach(function (src, i) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "gallery-thumbnail";
      button.setAttribute("aria-label", imageLabel(i));
      var thumbnail = document.createElement("img");
      thumbnail.src = src;
      thumbnail.alt = "";
      thumbnail.loading = "lazy";
      thumbnail.decoding = "async";
      button.appendChild(thumbnail);
      button.addEventListener("click", function () { showImage(i); });
      thumbs.appendChild(button);
    });
    thumbs.hidden = !currentImages().length;
    showImage(Math.min(index || 0, Math.max(0, currentImages().length - 1)));
  }

  function paintProject() {
    var items = projects();
    var index = items.findIndex(function (item, i) { return projectId(item, i) === state.id; });
    if (index === -1) { dialog.close(); return; }
    state.item = items[index];
    state.images = window.ProjectMedia.normalize(state.item);
    document.getElementById("galleryTitle").textContent = pick(state.item.title) || t("project.details");
    document.getElementById("galleryDescription").textContent = pick(state.item.copy);
    document.getElementById("galleryProjectNumber").textContent = t("project.details") + " / " + digits(String(index + 1).padStart(2, "0"));
    var tags = document.getElementById("galleryTags");
    tags.replaceChildren();
    (Array.isArray(state.item.tags) ? state.item.tags : []).forEach(function (tag) {
      var text = pick(tag);
      if (!text) return;
      var li = document.createElement("li");
      li.textContent = text;
      tags.appendChild(li);
    });
    tags.hidden = !tags.children.length;
    var visit = document.getElementById("galleryVisit");
    var url = /^https?:\/\//i.test(state.item.url || "") ? state.item.url : "";
    visit.hidden = !url;
    if (url) visit.href = url;
    else visit.removeAttribute("href");
    visit.querySelector("[data-gallery-visit-label]").textContent = pick((content().work || {}).visitLabel) || t("project.visit");
    showGroup(state.group, state.index);
  }

  function openGallery(id, button) {
    if (!projects().some(function (item, i) { return projectId(item, i) === id; })) return;
    opener = button;
    state.id = id;
    state.group = "site";
    state.index = 0;
    if (!dialog.open) {
      dialog.showModal();
      resumeLenis = Boolean(window.lenisAPI && window.lenisAPI.enabled && !window.lenisAPI.instance.isStopped);
      if (resumeLenis) window.lenisAPI.stop();
      document.documentElement.classList.add("has-project-gallery");
      document.dispatchEvent(new CustomEvent("project-gallery-toggle", { detail: { open: true } }));
    }
    paintProject();
    dialog.querySelector("[data-gallery-close]").focus({ preventScroll: true });
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-project-gallery]");
    if (!button) return;
    event.preventDefault();
    openGallery(button.dataset.projectGallery, button);
  });
  dialog.querySelector("[data-gallery-close]").addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", function () {
    document.documentElement.classList.remove("has-project-gallery");
    if (resumeLenis && window.lenisAPI) window.lenisAPI.start();
    resumeLenis = false;
    document.dispatchEvent(new CustomEvent("project-gallery-toggle", { detail: { open: false } }));
    var focusTarget = opener && opener.isConnected ? opener : Array.from(document.querySelectorAll(".project-gallery-trigger")).find(function (button) { return button.dataset.projectGallery === state.id; });
    if (focusTarget) focusTarget.focus({ preventScroll: true });
    image.removeAttribute("src");
    image.alt = "";
    thumbs.replaceChildren();
    state.item = null;
  });
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () { if (!tab.disabled) showGroup(tab.dataset.galleryTab, 0); });
  });
  previous.addEventListener("click", function () { showImage(state.index - 1); });
  next.addEventListener("click", function () { showImage(state.index + 1); });
  zoom.addEventListener("click", function () { state.zoomed = !state.zoomed; updateZoom(); });
  image.addEventListener("load", function () {
    canvas.classList.remove("is-loading");
    canvas.setAttribute("aria-busy", "false");
  });
  image.addEventListener("error", function () {
    canvas.classList.remove("is-loading");
    canvas.setAttribute("aria-busy", "false");
    if (!dialog.open || !image.hasAttribute("src")) return;
    image.hidden = true;
    empty.hidden = false;
    empty.textContent = t("project.imageError");
    zoom.disabled = true;
  });

  dialog.addEventListener("keydown", function (event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    var isTab = event.target.matches("[data-gallery-tab]");
    var direction = (event.key === "ArrowRight" ? 1 : -1) * (rtl() ? -1 : 1);
    if (isTab) {
      var available = tabs.filter(function (tab) { return !tab.disabled; });
      var index = available.indexOf(event.target);
      if (event.key === "Home") index = 0;
      else if (event.key === "End") index = available.length - 1;
      else index = (index + direction + available.length) % available.length;
      event.preventDefault();
      showGroup(available[index].dataset.galleryTab, 0);
      available[index].focus({ preventScroll: true });
    } else if (currentImages().length && !state.zoomed) {
      event.preventDefault();
      var target = event.key === "Home" ? 0 : event.key === "End" ? currentImages().length - 1 : state.index + direction;
      var focusThumbnail = event.target.classList.contains("gallery-thumbnail");
      showImage(target);
      if (focusThumbnail) thumbs.children[state.index].focus({ preventScroll: true });
    }
  });
  canvas.addEventListener("pointerdown", function (event) {
    pointerStart = event.pointerType === "touch" && !state.zoomed ? { x: event.clientX, y: event.clientY } : null;
  }, { passive: true });
  canvas.addEventListener("pointerup", function (event) {
    if (!pointerStart) return;
    var dx = event.clientX - pointerStart.x;
    var dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.25 && currentImages().length > 1) {
      suppressClickUntil = performance.now() + 350;
      showImage(state.index + (dx < 0 ? 1 : -1) * (rtl() ? -1 : 1));
    }
  }, { passive: true });
  canvas.addEventListener("pointercancel", function () { pointerStart = null; });
  canvas.addEventListener("click", function (event) {
    // A swipe starting on an overlaid arrow is still a swipe, not a second tap.
    if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener("site-work-rendered", function () { if (dialog.open) paintProject(); });
})();
