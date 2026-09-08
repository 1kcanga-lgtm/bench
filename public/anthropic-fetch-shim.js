// Card Ledger's AI features (identify, appraise, price lookup) call
// fetch("https://api.anthropic.com/v1/messages", ...) directly from the browser -- that only
// worked in the original sandboxed runtime, which transparently authenticated those specific
// requests. In a normal browser this would be blocked by CORS and would need a real API key
// exposed client-side (unsafe). This shim intercepts exactly that one URL and reroutes it to
// this server's own /api/anthropic/messages proxy, which holds the real API key server-side
// and is never sent to the browser. No changes needed to card_ledger.jsx itself.
(function () {
  var nativeFetch = window.fetch.bind(window);
  var TARGET = "https://api.anthropic.com/v1/messages";

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : input && input.url;
    if (url === TARGET) {
      return nativeFetch("/api/anthropic/messages", init);
    }
    return nativeFetch(input, init);
  };
})();
