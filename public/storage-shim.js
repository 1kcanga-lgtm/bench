// Card Ledger was originally built for a runtime that provides a global `window.storage`
// key/value store. This shim gives it the same API, backed by this server's SQLite database
// instead, so the app's own code (card_ledger.jsx) needs zero changes to run self-hosted.
//
// Contract expected by the app: window.storage.get(key) -> Promise<{ value: string|null }>
//                                window.storage.set(key, value) -> Promise<void>
// (the app also passes a trailing boolean to both calls; it's unused here.)
//
// BUG FIXED 2026-09-06: set() used to always resolve to `undefined` regardless of whether the
// PUT actually succeeded. The app's own persist() does `setSaveError(!res)` on whatever set()
// resolves to -- so every single save, even a completely successful one, was flagged as failed,
// showing "Your last change didn't save" on every card despite the data being saved correctly.
// Now resolves to the real res.ok so the app's error banner reflects the truth.
(function () {
  function apiUrl(key) {
    return "/api/storage/" + encodeURIComponent(key);
  }

  window.storage = {
    get: function (key) {
      return fetch(apiUrl(key))
        .then(function (res) {
          if (!res.ok) return { value: null };
          return res.json();
        })
        .then(function (data) {
          return { value: data && data.value != null ? data.value : null };
        })
        .catch(function () {
          return { value: null };
        });
    },
    set: function (key, value) {
      return fetch(apiUrl(key), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: value }),
      })
        .then(function (res) {
          return res.ok;
        })
        .catch(function () {
          return false;
        });
    },
  };
})();
