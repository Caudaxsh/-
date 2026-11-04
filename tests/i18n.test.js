// 三種語言 key 完全一致;HTML 與 JS 用到的 key 都存在;不得有空字串;預留變數 {x} 在各語言一致。
const fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
const root = path.join(__dirname, '..', 'public');
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8'), { window: win, document: { documentElement: {} }, navigator: {} });
const D = win.I18n.D;
const langs = Object.keys(D);
assert.deepStrictEqual(langs.sort(), ['en', 'ja', 'zh-TW']);
const base = Object.keys(D['zh-TW']);
for (const l of langs) {
  const keys = Object.keys(D[l]);
  const missing = base.filter((k) => !keys.includes(k) && !k.startsWith('month.'));
  const extra = keys.filter((k) => !base.includes(k) && !k.startsWith('month.'));
  assert.deepStrictEqual(missing, [], `${l} missing keys`);
  assert.deepStrictEqual(extra, [], `${l} extra keys`);
  for (const k of keys) assert(D[l][k] !== '', `${l}.${k} empty`);
}
const vars = (s) => (s.match(/\{(\w+)\}/g) || []).sort().join();
for (const k of base) if (!k.startsWith('month.')) for (const l of ['en', 'ja']) {
  // 允許語言之間不用到某些變數(例如 en 的 wd.short),但不得出現未知變數
  const allowed = new Set((D['zh-TW'][k].match(/\{(\w+)\}/g) || []));
  for (const v of (D[l][k].match(/\{(\w+)\}/g) || [])) assert(allowed.has(v), `${l}.${k} unknown var ${v}`);
}
// 引用檢查
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const used = new Set();
for (const m of html.matchAll(/data-i18n(?:-title|-aria)?="([\w.]+)"/g)) used.add(m[1]);
for (const m of app.matchAll(/\bt\('([\w.]+)'/g)) used.add(m[1]);
for (const m of app.matchAll(/'((?:toast|q|until|next|item|hist|dlg|stats|set|share|phase|rate|worked|done|off|confirm|stock|items|sec|goal|explore)\.[\w.]+)'/g)) used.add(m[1]);
for (const k of used) if (!k.endsWith('.')) assert(D['zh-TW'][k] != null, 'unknown i18n key: ' + k);
// 動態前綴
for (const p of ['phase.', 'cat.', 'icon.', 'country.', 'wd.', 'cur.']) assert(base.some((k) => k.startsWith(p)), p);
const defs = {}; vm.runInNewContext(fs.readFileSync(path.join(root, 'js/prices.js'), 'utf8') + ';' + fs.readFileSync(path.join(root, 'js/defaults.js'), 'utf8'), { window: defs });
for (const c of defs.Defaults.CATEGORIES) for (const l of langs) assert(D[l]['cat.' + c], l + ' cat ' + c);
for (const g of ['custom']) for (const l of langs) assert(D[l]['goalp.' + g], l + ' goalp.custom');
for (const k of defs.Defaults.UI_ICON_CHOICES) for (const l of langs) assert(D[l]['icon.' + k], l + ' icon ' + k);
for (const k of defs.Defaults.REWARD_ICONS) assert(D.ja['icon.' + k], 'icon ' + k);
for (const code of defs.Defaults.COUNTRIES) {
  assert(D.en['country.' + code] && D.ja['country.' + code], 'country ' + code);
  for (const it of defs.Prices.COUNTRIES[code].items) for (const l of langs) assert(D[l][it.nameKey], `${l} item name ${it.nameKey}`);
  for (const g of defs.Prices.goalPresetsFor(code)) for (const l of langs) assert(D[l]['goalp.' + g.key], `${l} preset ${g.key}`);
  assert(D['zh-TW']['cur.' + defs.Prices.COUNTRIES[code].currency], 'currency name ' + code);
  assert(defs.Defaults.CURRENCIES[defs.Prices.COUNTRIES[code].currency], 'currency table ' + code);
}
for (const m of ['US', 'TW', 'JP']) assert(D.ja['stock.mkt.' + m], 'market ' + m);
console.log(`i18n ok: ${base.length} keys × ${langs.length} langs, ${used.size} referenced`);
