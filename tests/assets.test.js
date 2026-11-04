// 檢查:manifest.js 與 manifest.json 同步;所有素材檔存在、為透明 PNG;JS/HTML 引用的素材 key 都存在於 manifest。
const fs = require('fs'), path = require('path'), assert = require('assert');
const dir = path.join(__dirname, '..', 'public', 'assets', 'workhorse');
const json = JSON.parse(fs.readFileSync(path.join(dir, 'asset-manifest.json'), 'utf8'));
const jsSrc = fs.readFileSync(path.join(dir, 'asset-manifest.js'), 'utf8');
const fromJs = JSON.parse(jsSrc.slice(jsSrc.indexOf('{'), jsSrc.lastIndexOf('}') + 1));
assert.deepStrictEqual(fromJs, json, 'asset-manifest.js 與 .json 不同步,請執行 node tools/build-manifest-js.js');
let n = 0;
for (const g in json) {
  if (typeof json[g] !== 'object') continue;
  for (const k in json[g]) {
    const f = path.join(dir, json[g][k]);
    assert(fs.existsSync(f), 'missing ' + f);
    if (f.endsWith('.png')) {
      const b = fs.readFileSync(f);
      assert.strictEqual(b.slice(1, 4).toString(), 'PNG');
      assert([4, 6].includes(b[25]) || b.includes('tRNS'), 'no alpha: ' + f); // color type 6/4 = 含 alpha
    }
    n++;
  }
}
const src = ['index.html', 'js/app.js', 'js/defaults.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8')).join('\n');
const refs = new Set([...src.matchAll(/(?:data-asset="|A\.url\('|A\.img\('|A\.img\(`|url\('|'\s*)((?:brand|ui_icons|reward_icons|mascot|backgrounds)\.[a-z_0-9]+)/g)].map((m) => m[1]));
for (const r of refs) { const [g, k] = r.split('.'); assert(json[g] && json[g][k], 'unknown asset ref ' + r); }
for (const k of Object.values(require('vm').runInNewContext('var window={};' + fs.readFileSync(path.join(__dirname, '..', 'public/js/defaults.js'), 'utf8') + ';window.Defaults.ICON_BY_CATEGORY'))) assert(json.reward_icons[k], 'category icon ' + k);
console.log(`assets ok: ${n} files, ${refs.size} refs`);
