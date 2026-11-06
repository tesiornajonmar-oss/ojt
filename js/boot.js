/* =====================================================================
   OJT-ERAMS — boot.js
   Every page has ONE script tag:
     <script src="../js/boot.js" data-page="js/approvals.js" data-with="camera messages"></script>
   boot.js loads, in order: config → ui → api-contract → (mock files OR http-api) → api → shell
   → optional modules (data-with) → the page's own script (data-page).
   This is why switching between demo mode and a real backend never touches the pages.
   ===================================================================== */
(function () {
  var self = document.currentScript;
  var ROOT = self.src.replace(/js\/boot\.js(\?.*)?$/, '');
  window.OJT_ROOT = ROOT;                                  // absolute URL of the project root, ends with "/"

  var MODULES = {
    camera:   ['js/face.js', 'js/camera.js'],
    messages: ['js/messages-ui.js'],
    dtr:      ['js/dtr.js'],
    widgets:  ['js/widgets.js'],
    review:   ['js/review-extra.js']
  };

  function showError(msg) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;background:#b3261e;color:#fff;padding:14px 18px;font:14px/1.4 Segoe UI,Arial,sans-serif';
    d.innerHTML = '<b>OJT-ERAMS could not start.</b> ' + msg;
    document.body.appendChild(d);
  }

  function load(url, done) {
    var s = document.createElement('script');
    s.src = url;
    s.onload = function () { done(); };
    s.onerror = function () { showError('Missing file: <code>' + url.replace(ROOT, '') + '</code>. Check that the folder layout matches the project and that you opened the <b>ojt-erams</b> folder itself in VS Code.'); };
    document.head.appendChild(s);
  }

  function chain(list, finish) {
    var i = 0;
    (function next() { if (i >= list.length) return finish(); load(list[i++], next); })();
  }

  var base = ['js/config.js', 'js/ui.js', 'js/api-contract.js'].map(function (p) { return ROOT + p; });
  chain(base, function () {
    var cfg = window.OJT_CONFIG || {};
    var backend = cfg.USE_MOCK ? ['js/mock/mock-rules.js', 'js/mock/mock-db.js', 'js/mock/mock-api.js'] : ['js/http-api.js'];
    var rest = backend.concat(['js/api.js', 'js/shell.js']);
    (self.getAttribute('data-with') || '').split(/\s+/).forEach(function (m) { if (MODULES[m]) rest = rest.concat(MODULES[m]); });
    var urls = rest.map(function (p) { return ROOT + p; });
    var page = self.getAttribute('data-page');
    if (page) urls.push(new URL(page, location.href).href);
    chain(urls, function () { window.OJT_READY = true; });
  });
})();
