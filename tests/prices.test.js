const assert = require('assert'), vm = require('vm'), fs = require('fs'), path = require('path');
const w = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public/js/prices.js'), 'utf8'), { window: w });
const P = w.Prices;
assert.deepStrictEqual(Object.keys(P.COUNTRIES), ['TW', 'JP', 'PH']);
assert.deepStrictEqual(Object.values(P.COUNTRIES).map((c) => c.currency), ['TWD', 'JPY', 'PHP']);
for (const [k, c] of Object.entries(P.COUNTRIES)) {
  assert(c.hourly > 0 && c.ot.m1 >= 1 && c.ot.m2 >= 1, k);
  assert(c.items.length >= 8, k + ' has enough local items');
  const refs = c.items.map((i) => i.ref);
  assert.strictEqual(new Set(refs).size, refs.length, k + ' unique refs');
  for (const it of c.items) {
    assert(it.price > 0 && typeof it.est === 'boolean' && it.icon, k + it.ref);
    assert.strictEqual(it.nameKey, 'item.' + it.ref);
    // 每國的項目只能是自己國家的(或通用的旅行基金)
    assert(it.ref === 'travel' || it.ref.startsWith(k.toLowerCase() + '.'), `${k} contains foreign item ${it.ref}`);
  }
  assert(c.markets.length >= 1);
}
const price = (c, ref) => P.COUNTRIES[c].items.find((i) => i.ref === ref).price;
// 查到的價格(2026)
assert.strictEqual(price('TW', 'tw.xlb'), 290); assert.strictEqual(price('TW', 'tw.hsr'), 1490); assert.strictEqual(price('TW', 'tw.lurou'), 39);
assert.strictEqual(price('JP', 'jp.tori'), 410); assert.strictEqual(price('JP', 'jp.toriall'), 4100); assert.strictEqual(price('JP', 'jp.sento'), 600);
assert.strictEqual(price('JP', 'jp.gyudon'), 498); assert.strictEqual(price('JP', 'jp.shinkansen'), 14720); assert.strictEqual(price('JP', 'jp.sushi'), 120);
assert.strictEqual(price('PH', 'ph.chickenjoy'), 99); assert.strictEqual(price('PH', 'ph.jeepney'), 14);
assert.strictEqual(P.COUNTRIES.TW.hourly, 196); assert.strictEqual(P.COUNTRIES.JP.hourly, 1177);
assert(Math.abs(P.COUNTRIES.PH.hourly - 755 / 8) < 0.01);
assert.strictEqual(P.COUNTRIES.PH.markets.join(), 'US');
// 升級:沒改過的預設換新;自己新增 / 改過的 / 股票保留,且不重複
const old = [
  { id: 'd-coffee1', ref: 'coffee1', price: 45 },                         // 舊版預設 → 移除
  { id: 'd-tw.boba', ref: 'tw.boba', price: 70, custom: true },            // 使用者改過 → 保留,不再加新的同 ref
  { id: 'x1', name: '我的咖啡', price: 80 },                                // 自己新增 → 保留
  { id: 'x2', kind: 'stock', symbol: '2330.TW', price: 1000 },             // 股票 → 保留
];
const up = P.upgrade('TW', old);
assert(!up.some((i) => i.ref === 'coffee1'));
assert.strictEqual(up.filter((i) => i.ref === 'tw.boba').length, 1); assert.strictEqual(up.find((i) => i.ref === 'tw.boba').price, 70);
assert(up.some((i) => i.id === 'x1') && up.some((i) => i.id === 'x2'));
assert.strictEqual(up.length, P.COUNTRIES.TW.items.length + 2);
// 偵測
assert.strictEqual(P.detect('Asia/Tokyo', 'en-US'), 'JP'); assert.strictEqual(P.detect('Asia/Manila', 'en'), 'PH');
assert.strictEqual(P.detect('Asia/Taipei', 'zh-TW'), 'TW'); assert.strictEqual(P.detect('', 'fil-PH'), 'PH');
console.log('prices tests passed');
