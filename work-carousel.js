/* Native swipe carousel on compact/short screens; optional scroll-driven 3D
   on roomy desktops. The cards always keep their intrinsic image height. */
(function () {
  "use strict";
  var stage = document.getElementById("workStage");
  var grid = document.getElementById("workGrid");
  var controls = document.getElementById("workControls");
  var pagination = document.getElementById("workPagination");
  var previous = document.getElementById("workPrevious");
  var next = document.getElementById("workNext");
  if (!stage || !grid || !controls || !pagination) return;

  var desktop = window.matchMedia("(min-width: 1000px) and (min-height: 780px) and (hover: hover) and (pointer: fine)");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var cards = [];
  var dots = [];
  var active = 0;
  var trigger = null;
  var tween = null;
  var resizeTimer = 0;
  var scrollFrame = 0;
  var gestureTimer = 0;
  var gestureStarted = 0;
  var gestureDirection = 0;
  var hasGSAP = Boolean(window.gsap && window.ScrollTrigger);

  function t(key, values) { return window.siteI18n ? window.siteI18n.t(key, values) : key; }
  function digits(value) { return window.siteI18n ? window.siteI18n.localizeDigits(value) : String(value); }
  function galleryIsOpen() { var dialog = document.getElementById("projectGallery"); return dialog && dialog.open; }
  function writeScroll(y) { if (window.writeScroll) window.writeScroll(y); else window.scrollTo(0, y); }

  function setActive(index) {
    active = Math.max(0, Math.min(cards.length - 1, index));
    dots.forEach(function (dot, i) {
      dot.classList.toggle("is-active", i === active);
      if (i === active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
    previous.disabled = active <= 0;
    next.disabled = active >= cards.length - 1;
    cards.forEach(function (card, i) { card.inert = Boolean(trigger && i !== active); });
  }

  function clearGesture() {
    window.clearTimeout(gestureTimer);
    gestureTimer = 0;
    gestureStarted = 0;
    gestureDirection = 0;
  }

  function applyCoverflow(progress) {
    var position = progress * (cards.length - 1);
    cards.forEach(function (card, i) {
      var offset = i - position;
      var distance = Math.min(Math.abs(offset), 1);
      var direction = offset < 0 ? -1 : 1;
      card.style.transform = "translate3d(" + (offset * 54).toFixed(3) + "%,0," + (-170 * distance).toFixed(1) + "px) rotateY(" + (-direction * 20 * distance).toFixed(2) + "deg) scale(" + (1 - 0.06 * distance).toFixed(3) + ")";
      card.style.opacity = String(1 - 0.48 * distance);
      card.style.filter = distance > 0.05 ? "blur(" + (distance * 1.4).toFixed(2) + "px) brightness(" + (1 - distance * 0.25).toFixed(2) + ")" : "";
      card.style.zIndex = String(100 - Math.round(Math.abs(offset) * 10));
    });
    setActive(Math.round(position));
  }

  function goTo(index, immediate) {
    if (!cards.length) return;
    var target = Math.max(0, Math.min(cards.length - 1, index));
    if (trigger) {
      var y = trigger.start + target / (cards.length - 1) * (trigger.end - trigger.start);
      if (tween) tween.kill();
      if (immediate || reduce.matches) { writeScroll(y); applyCoverflow(target / (cards.length - 1)); return; }
      var proxy = { y: window.scrollY };
      tween = window.gsap.to(proxy, {
        y: y, duration: 0.5, ease: "power3.out",
        onUpdate: function () { writeScroll(proxy.y); },
        onComplete: function () { tween = null; if (target === 0 || target === cards.length - 1) clearGesture(); }
      });
    } else {
      var x = cards[target].offsetLeft - (grid.clientWidth - cards[target].offsetWidth) / 2;
      grid.scrollTo({ left: x, behavior: immediate || reduce.matches ? "instant" : "smooth" });
      setActive(target);
    }
  }

  function teardown() {
    clearGesture();
    if (tween) { tween.kill(); tween = null; }
    if (trigger) { trigger.kill(true); trigger = null; }
    stage.classList.remove("is-coverflow");
    grid.classList.remove("is-coverflow");
    grid.style.removeProperty("--work-card-height");
    cards.forEach(function (card) {
      card.inert = false;
      ["transform", "opacity", "filter", "z-index"].forEach(function (property) { card.style.removeProperty(property); });
    });
  }

  function stickyHeaderHeight() {
    var header = document.getElementById("siteHeader");
    if (!header) return 0;
    var position = window.getComputedStyle(header).position;
    return position === "sticky" || position === "fixed" ? Math.ceil(header.getBoundingClientRect().height) : 0;
  }

  function maxCardHeight() {
    return Math.max.apply(null, cards.map(function (card) { return card.offsetHeight; }));
  }

  function bodiesFit() {
    return cards.every(function (card) {
      var body = card.querySelector(".project-body");
      return !body || (body.scrollHeight <= body.clientHeight + 1 && body.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom + 1);
    });
  }

  function fitScene() {
    stage.classList.remove("is-fitted", "is-compact", "is-minimal", "is-landscape");
    stage.style.removeProperty("--work-card-width");
    stage.style.removeProperty("--work-landscape-card-height");
    var viewport = window.visualViewport;
    var height = viewport && Math.abs(viewport.scale - 1) < 0.01 ? Math.min(window.innerHeight, Math.floor(viewport.height)) : window.innerHeight;
    var headerHeight = stickyHeaderHeight();
    var available = Math.max(0, height - headerHeight);
    stage.style.setProperty("--work-header-height", headerHeight + "px");
    stage.style.setProperty("--work-available-height", available + "px");
    var scene = { fits: false, headerHeight: headerHeight, height: available };
    if (!cards.length) return scene;

    function fits() { return stage.offsetHeight <= available && bodiesFit(); }
    var preferredWidth = cards[0].offsetWidth;
    if (!fits()) {
      var width = document.documentElement.clientWidth;
      var landscape = (width >= 700 && height <= 760) || (width >= 480 && height <= 560);
      if (landscape) {
        // A side-by-side card uses the spare width of a short laptop/window.
        // The screenshot has its own cell and is contained, never distorted.
        stage.classList.add("is-landscape");
        stage.style.setProperty("--work-card-width", Math.min(880, width - 32) + "px");
        ["", "is-compact", "is-minimal"].some(function (variant) {
          if (variant) stage.classList.add(variant);
          stage.style.removeProperty("--work-landscape-card-height");
          var chrome = stage.offsetHeight - maxCardHeight();
          var minimum = Math.max.apply(null, cards.map(function (card) { return card.querySelector(".project-body").scrollHeight + 2; }));
          var preferred = cards[0].offsetWidth / 2 * 10 / 16 + cards[0].querySelector(".project-window-bar").offsetHeight;
          var cardHeight = Math.floor(Math.min(Math.max(minimum, preferred), available - chrome - 2));
          if (cardHeight < minimum) return false;
          stage.style.setProperty("--work-landscape-card-height", cardHeight + "px");
          return fits();
        });
      } else {
        // Reserve the measured text/heading/controls first, then size a 16:10
        // screenshot. Long copy never steals height from the image itself.
        ["is-compact", "is-minimal"].some(function (variant) {
          stage.classList.add(variant);
          stage.style.setProperty("--work-card-width", preferredWidth + "px");
          for (var pass = 0; pass < 3 && !fits(); pass += 1) {
            var overflow = stage.offsetHeight - available;
            var current = cards[0].offsetWidth;
            var nextWidth = Math.max(Math.min(248, preferredWidth), Math.floor(current - (overflow + 3) * 16 / 10));
            if (nextWidth >= current) break;
            stage.style.setProperty("--work-card-width", nextWidth + "px");
          }
          return fits();
        });
      }
    }
    scene.fits = fits();
    stage.classList.toggle("is-fitted", scene.fits);
    // Accessibility fallback: if enlarged type cannot physically fit, keep
    // all actions reachable by normal page scrolling instead of hiding them.
    if (!scene.fits) stage.style.removeProperty("--work-landscape-card-height");
    return scene;
  }

  function refresh() {
    var previousId = cards[active] && cards[active].dataset.contentId;
    var wasPinned = Boolean(trigger && trigger.isActive);
    teardown();
    document.documentElement.style.setProperty("--sbw", (window.innerWidth - document.documentElement.clientWidth) + "px");
    cards = Array.from(grid.querySelectorAll(":scope > .project"));
    var keptIndex = cards.findIndex(function (card) { return card.dataset.contentId === previousId; });
    active = keptIndex < 0 ? 0 : keptIndex;
    pagination.replaceChildren();
    dots = cards.map(function (card, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "work-dot";
      dot.setAttribute("aria-label", t("project.goTo", { number: digits(i + 1) }));
      dot.addEventListener("click", function () { goTo(i); });
      pagination.appendChild(dot);
      return dot;
    });
    controls.hidden = cards.length < 2;

    var scene = fitScene();
    if (cards.length > 1 && scene.fits && hasGSAP && desktop.matches && !reduce.matches) {
      grid.scrollLeft = 0;
      grid.style.setProperty("--work-card-height", maxCardHeight() + "px");
      stage.classList.add("is-coverflow");
      grid.classList.add("is-coverflow");
      window.gsap.registerPlugin(window.ScrollTrigger);
      trigger = window.ScrollTrigger.create({
        id: "workCoverflow", trigger: stage, start: "top top+=" + scene.headerHeight,
        end: function () { return "+=" + Math.round(scene.height * 0.4) * (cards.length - 1); },
        pin: true, pinSpacing: true, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: function (self) { applyCoverflow(self.progress); }
      });
      applyCoverflow(trigger.progress);
      if (wasPinned) goTo(keptIndex < 0 ? 0 : keptIndex, true);
    }
    if (!trigger) goTo(active, true);
    else setActive(Math.round(trigger.progress * (cards.length - 1)));
    if (window.ScrollTrigger) {
      // This module initializes after the later storyline pin. Refresh in page
      // order so that pin includes the work stage's spacer, not its old offset.
      window.ScrollTrigger.sort();
      window.ScrollTrigger.refresh();
    }
    var heading = stage.querySelector(".work-heading");
    stage.style.setProperty("--work-heading-offset", (heading ? heading.offsetTop : 0) + "px");
    if (window.lenisAPI) window.lenisAPI.resize();
  }

  grid.addEventListener("scroll", function () {
    if (trigger || scrollFrame) return;
    scrollFrame = requestAnimationFrame(function () {
      scrollFrame = 0;
      if (!cards.length || trigger) return;
      var center = grid.scrollLeft + grid.clientWidth / 2;
      var nearest = 0;
      var distance = Infinity;
      cards.forEach(function (card, i) {
        var delta = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
        if (delta < distance) { nearest = i; distance = delta; }
      });
      setActive(nearest);
    });
  }, { passive: true });

  previous.addEventListener("click", function () { goTo(active - 1); });
  next.addEventListener("click", function () { goTo(active + 1); });
  controls.addEventListener("keydown", function (event) {
    var index = active;
    if (event.key === "ArrowRight") index += 1;
    else if (event.key === "ArrowLeft") index -= 1;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = cards.length - 1;
    else return;
    event.preventDefault();
    goTo(index);
    if (event.target.classList.contains("work-dot")) dots[Math.max(0, Math.min(cards.length - 1, index))].focus({ preventScroll: true });
  });

  // Wheel capture is restricted to an active, sufficiently tall desktop pin.
  // It must never consume scrolling inside the open image gallery.
  window.addEventListener("wheel", function (event) {
    if (!trigger || !trigger.isActive || galleryIsOpen() || event.ctrlKey || Math.abs(event.deltaY) < 1) return;
    var direction = event.deltaY > 0 ? 1 : -1;
    if ((direction > 0 && active === cards.length - 1) || (direction < 0 && active === 0)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var now = performance.now();
    if (gestureStarted && direction === gestureDirection && now - gestureStarted < 900) {
      window.clearTimeout(gestureTimer);
      gestureTimer = window.setTimeout(clearGesture, 140);
      return;
    }
    window.clearTimeout(gestureTimer);
    gestureStarted = now;
    gestureDirection = direction;
    gestureTimer = window.setTimeout(clearGesture, 140);
    goTo(active + direction);
  }, { passive: false, capture: true });

  document.addEventListener("project-gallery-toggle", function (event) {
    if (event.detail.open) { clearGesture(); if (tween) { tween.kill(); tween = null; } }
  });
  document.addEventListener("site-work-rendered", refresh);
  function scheduleRefresh() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(refresh, 180);
  }
  window.addEventListener("resize", scheduleRefresh);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", scheduleRefresh);
  reduce.addEventListener("change", refresh);
  desktop.addEventListener("change", refresh);
  if (document.fonts) {
    document.fonts.ready.then(refresh);
    document.fonts.addEventListener("loadingdone", scheduleRefresh);
  }
  refresh();
})();
