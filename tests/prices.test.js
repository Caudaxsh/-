const assert = require('assert'), vm = require('vm'), fs = require('fs'), path = require('path');
const w = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public/js/prices.js'), 'utf8'), { window: w });
const P = w.Prices;
const refs = (c) => P.COUNTRIES[c].items.map((i) => i.ref).sort().join();
assert.strictEqual(refs('TW'), refs('JP')); assert.strictEqual(refs('TW'), refs('PH'));        // 每個國家項目一致
assert.deepStrictEqual(Object.keys(P.COUNTRIES), ['TW', 'JP', 'PH']);
assert.deepStrictEqual(Object.values(P.COUNTRIES).map((c) => c.currency), ['TWD', 'JPY', 'PHP']);
for (const [k, c] of Object.entries(P.COUNTRIES)) {
  assert(c.hourly > 0 && c.ot.m1 >= 1 && c.ot.m2 >= 1, k);
  for (const it of c.items) assert(it.price > 0 && typeof it.est === 'boolean' && it.nameKey && it.icon, k + it.ref);
  const ids = P.itemsFor(k).map((i) => i.id); assert.strictEqual(new Set(ids).size, ids.length);
}
// 使用者指定的台灣參考價
const tw = Object.fromEntries(P.COUNTRIES.TW.items.map((i) => [i.ref, i.price]));
assert.deepStrictEqual([tw.coffee1, tw.coffee2, tw.bento, tw.boba, tw.hotpot], [45, 55, 100, 55, 269]);
assert.strictEqual(P.COUNTRIES.TW.hourly, 196);
assert(Math.abs(P.COUNTRIES.PH.hourly - 755 / 8) < 0.01);
assert.strictEqual(P.COUNTRIES.JP.hourly, 1177);
// 偵測
assert.strictEqual(P.detect('Asia/Tokyo', 'en-US'), 'JP'); assert.strictEqual(P.detect('Asia/Manila', 'en'), 'PH');
assert.strictEqual(P.detect('Asia/Taipei', 'zh-TW'), 'TW'); assert.strictEqual(P.detect('America/New_York', 'ja'), 'JP');
assert.strictEqual(P.detect('', 'fil-PH'), 'PH'); assert.strictEqual(P.detect('Europe/Paris', 'fr'), 'TW');
// 估算旗標:日本有查到的項目為 false;菲律賓全是估算
assert(P.COUNTRIES.JP.items.filter((i) => !i.est).length >= 4);
assert(P.COUNTRIES.PH.items.every((i) => i.est));
console.log('prices tests passed');
