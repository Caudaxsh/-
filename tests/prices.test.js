const assert = require('assert'), vm = require('vm'), fs = require('fs'), path = require('path');
const w = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public/js/prices.js'), 'utf8'), { window: w });
const P = w.Prices;
const C = P.COUNTRIES;
assert.strictEqual(Object.keys(C).join(), 'TW,JP,PH');
assert.strictEqual(Object.values(C).map((c) => c.currency).join(), 'TWD,JPY,PHP');

// ── 每個國家預設只有 4 個精選項:飲品 / 餐點 / 一般 2D 電影 / 旅行基金 ──
const EXPECT = {
  TW: ['tw.boba50', 'tw.lurou', 'tw.movie2d', 'tw.trip'],
  JP: ['jp.cafeR', 'jp.gyudon', 'jp.movie2d', 'jp.trip'],
  PH: ['ph.buko', 'ph.chickenjoy', 'ph.movie2d', 'ph.trip'],
};
for (const k of Object.keys(C)) {
  const def = P.itemsFor(k);
  assert.strictEqual(def.length, 4, k + ' default count');
  assert.strictEqual(def.map((i) => i.ref).join(), EXPECT[k].join(), k + ' default refs');
  assert.strictEqual(def.map((i) => i.category).join(), 'drinks,food,fun,goal', k + ' default categories');
  assert.strictEqual(def[3].kind, 'goal'); assert(def.every((i) => i.featured && i.enabled && i.price > 0));
  // 交通 / 3C 不在預設,只在目錄
  assert(!def.some((i) => ['travel', 'tech'].includes(i.category)), k + ' no transit/tech by default');
}
// ── 目錄:分類、來源、無重複、不含別國商品 ──
for (const [k, c] of Object.entries(C)) {
  const refs = c.items.map((i) => i.ref);
  assert.strictEqual(new Set(refs).size, refs.length, k + ' unique refs');
  for (const it of c.items) {
    assert(it.price > 0 && typeof it.est === 'boolean' && it.icon && it.src && it.date, `${k} ${it.ref} fields`);
    assert.strictEqual(it.nameKey, 'item.' + it.ref);
    assert(P.GROUPS.includes(it.category), `${k} ${it.ref} category ${it.category}`);
    assert(it.ref.startsWith(k.toLowerCase() + '.') || it.ref.startsWith('tech.') && it.ref.endsWith('.' + k.toLowerCase()), `${k} contains foreign item ${it.ref}`);
  }
  const cat = P.catalogFor(k);
  assert(cat.length >= 8 && cat.every((i) => !i.featured));
  const groups = new Set(cat.map((i) => i.category));
  for (const g of ['drinks', 'food', 'travel', 'tech']) assert(groups.has(g), `${k} catalog has ${g}`);
  // 預設清單 + 目錄 = 全部,沒有漏也沒重疊
  assert.strictEqual(P.itemsFor(k).length + cat.length, c.items.length);
  // 個人目標預設:手機 / 相機 / 筆電 / 日本旅行 / 鏡頭
  assert.strictEqual(P.goalPresetsFor(k).map((g) => g.key).join(), 'phone,camera,laptop,japan,lens');
  assert(P.goalPresetsFor(k).every((g) => g.price > 0 && g.src));
  assert(c.hourly > 0 && c.ot.m1 >= 1);
}
// ── 價格是「各國自己查的」,不是匯率換算:iPhone 三國官方定價(查到)互不成匯率比例的整數換算 ──
const p = (c, ref) => C[c].items.find((i) => i.ref === ref).price;
assert.strictEqual(p('TW', 'tech.iphone.tw'), 29900); assert.strictEqual(p('JP', 'tech.iphone.jp'), 129800); assert.strictEqual(p('PH', 'tech.iphone.ph'), 57990);
assert.strictEqual(p('TW', 'tw.boba50'), 50); assert.strictEqual(p('TW', 'tw.lurou'), 39);
assert.strictEqual(p('JP', 'jp.cafeR'), 140); assert.strictEqual(p('JP', 'jp.gyudon'), 498); assert.strictEqual(p('JP', 'jp.movie2d'), 2000);
assert.strictEqual(p('PH', 'ph.buko'), 50); assert.strictEqual(p('PH', 'ph.chickenjoy'), 106);
assert.strictEqual(p('JP', 'jp.tori'), 410); assert.strictEqual(p('JP', 'jp.sento'), 600); assert.strictEqual(p('TW', 'tw.xlb'), 290);
// 估算旗標:查到的為 false;PH 精選全是估算
assert(C.TW.items.find((i) => i.ref === 'tw.boba50').est === false);
assert(P.itemsFor('PH').slice(0, 3).every((i) => i.est));
assert(P.itemsFor('TW').find((i) => i.ref === 'tw.trip').est && P.itemsFor('JP').find((i) => i.ref === 'jp.trip').est);
// 薪資預設
assert.strictEqual(C.TW.hourly, 196); assert.strictEqual(C.JP.hourly, 1177); assert(Math.abs(C.PH.hourly - 755 / 8) < 0.01);
assert.strictEqual(C.PH.markets.join(), 'US');
// ── 升級:舊預設換成新的 4 項;使用者自己加的 / 改過的 / 股票保留,且不重複 ──
const old = [
  { id: 'd-tw.xlb', ref: 'tw.xlb', price: 290 },                              // 舊預設(沒改過)→ 移除(移到目錄)
  { id: 'd-tw.boba', ref: 'tw.boba50', price: 70, custom: true },            // 精選但使用者改過 → 保留,不重複加
  { id: 'x1', name: '我的咖啡', price: 80 },                                  // 自己新增 → 保留
  { id: 'x2', kind: 'stock', symbol: '2330.TW', price: 1000 },               // 股票 → 保留
];
const up = P.upgrade('TW', old);
assert(!up.some((i) => i.ref === 'tw.xlb'));
assert.strictEqual(up.filter((i) => i.ref === 'tw.boba50').length, 1); assert.strictEqual(up.find((i) => i.ref === 'tw.boba50').price, 70);
assert(up.some((i) => i.id === 'x1') && up.some((i) => i.id === 'x2'));
assert.strictEqual(up.length, 4 + 2);
// ── 分類:舊 → 新 ──
assert.strictEqual(['coffee', 'drink', 'alcohol', 'bento', 'hotpot', 'fun', 'transit', 'goal', 'tech'].map(P.groupOf).join(), 'drinks,drinks,food,food,food,fun,travel,goal,tech');
// 偵測
assert.strictEqual(P.detect('Asia/Tokyo', 'en-US'), 'JP'); assert.strictEqual(P.detect('Asia/Manila', 'en'), 'PH'); assert.strictEqual(P.detect('Asia/Taipei', 'zh-TW'), 'TW');
console.log('prices tests passed');
