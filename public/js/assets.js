/* 素材載入:所有圖片路徑都來自 assets/workhorse/asset-manifest.json
 * (為了讓雙擊 index.html 的 file:// 模式也能運作,由 tools/build-manifest-js.js 產生同內容的 asset-manifest.js)。
 * 圖片一律以獨立 PNG 載入,不使用 source sheet 或預覽圖。 */
window.Assets = (function () {
  const BASE = 'assets/workhorse/';
  const M = window.WORKHORSE_ASSET_MANIFEST || {};

  function path(group, key) {
    const p = M[group] && M[group][key];
    return p ? BASE + p : '';
  }
  /** "ui_icons.clock" → URL */
  function url(ref) {
    const [g, k] = ref.split('.');
    return path(g, k);
  }
  function img(ref, cls, alt) {
    const u = url(ref);
    return u ? `<img class="${cls || ''}" src="${u}" alt="${alt || ''}" draggable="false">` : '';
  }
  /** 把 <img data-asset="group.key"> 填上 src */
  function hydrate(root) {
    for (const el of (root || document).querySelectorAll('img[data-asset]')) {
      const u = url(el.dataset.asset);
      if (u && el.getAttribute('src') !== u) el.setAttribute('src', u);
    }
  }
  function all() {
    const out = [];
    for (const g in M) if (typeof M[g] === 'object') for (const k in M[g]) out.push(BASE + M[g][k]);
    return out;
  }
  function loadImage(ref) {
    return new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = url(ref);
    });
  }
  return { url, img, hydrate, all, loadImage, manifest: M };
})();
