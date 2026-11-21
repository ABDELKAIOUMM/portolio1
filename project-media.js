/* Shared, backwards-compatible project media and descriptions. No runtime dependencies. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ProjectMedia = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  function source(value) {
    if (typeof value !== "string") return "";
    var text = value.trim();
    if (!text || /[\u0000-\u001f\u007f]/.test(text)) return "";
    if (/^data:/i.test(text)) {
      return /^data:image\/(png|jpe?g|webp|gif|avif|svg\+xml)[;,]/i.test(text) ? text : "";
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return "";
    return text;
  }

  function images(value) {
    if (!Array.isArray(value)) return [];
    return value.reduce(function (result, entry) {
      var src = source(entry);
      if (src && result.indexOf(src) === -1) result.push(src);
      return result;
    }, []);
  }

  function isLanguage(value) { return value === "ar" || value === "en"; }

  // Exact collections for the editor: never populate an empty language with
  // shared images, or editing it could accidentally change the common gallery.
  function editable(project, language) {
    project = project || {};
    var localized = isLanguage(language);
    var gallery = localized ? (project.galleryByLanguage || {})[language] || {} : project.gallery || {};
    var result = { site: images(gallery.site), dashboard: images(gallery.dashboard) };
    var legacyCover = localized ? "" : source(project.image);
    // Preserve old screenshots in the shared collection only. A shared cover
    // must never be inserted into a language-specific screenshot collection.
    if (legacyCover && result.site.indexOf(legacyCover) === -1 && result.dashboard.indexOf(legacyCover) === -1) {
      result.site.unshift(legacyCover);
    }
    return result;
  }

  // Public view: prefer each language's own group, then its shared fallback.
  // Never fall back to the opposite language or mix it into the chosen group.
  function normalize(project, language) {
    var shared = editable(project);
    if (!isLanguage(language)) return shared;
    var localized = editable(project, language);
    return {
      site: localized.site.length ? localized.site : shared.site,
      dashboard: localized.dashboard.length ? localized.dashboard : shared.dashboard
    };
  }

  function cover(project, language) {
    if (isLanguage(language)) {
      var localized = editable(project, language);
      var available = localized.site.concat(localized.dashboard);
      var selected = source(project && (project.imageByLanguage || {})[language]);
      if (selected && available.indexOf(selected) !== -1) return selected;
      if (available.length) return available[0];
    }
    var shared = editable(project);
    return source(project && project.image) || shared.site[0] || shared.dashboard[0] || "";
  }

  function count(project, language) {
    if (isLanguage(language)) {
      var gallery = normalize(project, language);
      return gallery.site.length + gallery.dashboard.length;
    }
    return ["shared", "ar", "en"].reduce(function (total, scope) {
      var gallery = editable(project, scope);
      return total + gallery.site.length + gallery.dashboard.length;
    }, 0);
  }

  // Descriptions belong to the project, not its image arrays. Keeping the
  // dashboard copy separate also survives gallery reordering/replacement.
  function description(project, group, language) {
    var value = project && (group === "dashboard" ? project.dashboardCopy : project.copy);
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";
    var languages = language === "ar" ? ["ar", "en"] : ["en", "ar"];
    for (var i = 0; i < languages.length; i += 1) {
      var text = value[languages[i]];
      if (typeof text === "string" && text.trim()) return text.trim();
    }
    return "";
  }

  return { source: source, images: images, editable: editable, normalize: normalize, cover: cover, count: count, description: description };
});
