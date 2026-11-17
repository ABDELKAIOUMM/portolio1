/* ============================================================
   Content loader — published site edition.

   `content/site-data.js` (loaded just before this file) carries a
   bundled snapshot so the page also works from file:// or a host that
   does not serve JSON. When the site is served over HTTP we refresh
   that snapshot from content/site.json so content saved in the
   dashboard is what the page paints.

   The request is a single same-origin ~30 KB file and it is
   synchronous on purpose: i18n.js and site-content.js run right after
   and must see the final copy, otherwise the page would flash stale
   text on every load.
   ============================================================ */
(function () {
  "use strict";

  var endpoint = "content/site.json";
  var bundled = window.__SITE_CONTENT__ || null;

  function getJSON(url) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.send(null);
    if (xhr.status < 200 || xhr.status >= 300 || !xhr.responseText) {
      throw new Error("No content at " + url);
    }
    return JSON.parse(xhr.responseText);
  }

  function isFresh(remote, local) {
    if (!remote || !remote.work || !Array.isArray(remote.work.items)) return false;
    if (!local || !local.updatedAt || !remote.updatedAt) return true;
    return String(remote.updatedAt) !== String(local.updatedAt);
  }

  try {
    var remote = getJSON(endpoint + "?v=" + Date.now());
    if (isFresh(remote, bundled)) {
      window.__SITE_CONTENT__ = remote;
      bundled = remote;
    }
  } catch (error) {
    // Keep the bundled snapshot; the static HTML remains the last resort.
  }

  // Handy for the dashboard's "open live site" link and for debugging.
  window.__SITE_CONTENT__ = bundled;
})();
