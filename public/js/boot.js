/* 最先載入:若任何腳本出錯或載入失敗,在畫面上顯示原因與「清除快取」按鈕,而不是一片空白。 */
(function () {
  var shown = false;
  function show(msg) {
    var el = document.getElementById('bootError');
    if (!el) { document.addEventListener('DOMContentLoaded', function () { show(msg); }); return; }
    el.hidden = false;
    var m = document.getElementById('bootErrorMsg');
    if (m && !shown) m.textContent = String(msg).slice(0, 400);
    shown = true;
  }
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName) {
      if (t.tagName === 'SCRIPT' || t.tagName === 'LINK') show('Failed to load ' + (t.src || t.href || '').split('/').pop());
      return; // 圖片載入失敗不打擾
    }
    show((e.message || 'Error') + (e.filename ? ' @ ' + e.filename.split('/').pop().split('?')[0] + ':' + e.lineno : ''));
  }, true);
  /** 移除 Service Worker 與快取後重新載入 */
  window.WH_RESET = function () {
    var done = function () { location.replace(location.pathname + '?r=' + Date.now()); };
    try {
      var p = [];
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) p.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
      if (window.caches && caches.keys) p.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
      Promise.all(p).then(done, done);
    } catch (e) { done(); }
  };
})();
