/* Shared, backwards-compatible project image data. No runtime dependencies. */
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

  function normalize(project) {
    project = project || {};
    var gallery = project.gallery || {};
    var result = { site: images(gallery.site), dashboard: images(gallery.dashboard) };
    var legacyCover = source(project.image);
    // Preserve every existing single-image project, without putting a dashboard
    // cover in the website group when it already belongs to the dashboard.
    if (legacyCover && result.site.indexOf(legacyCover) === -1 && result.dashboard.indexOf(legacyCover) === -1) {
      result.site.unshift(legacyCover);
    }
    return result;
  }

  function cover(project) {
    var gallery = normalize(project);
    return source(project && project.image) || gallery.site[0] || gallery.dashboard[0] || "";
  }

  function count(project) {
    var gallery = normalize(project);
    return gallery.site.length + gallery.dashboard.length;
  }

  return { source: source, images: images, normalize: normalize, cover: cover, count: count };
});
