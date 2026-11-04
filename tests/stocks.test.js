const assert = require('assert');
const S = require('../public/js/stocks.js');
const near = (a, b, e = 1e-6) => assert(Math.abs(a - b) < e, `${a} != ${b}`);

// ---- 代碼正規化 ----
assert.equal(S.normalizeSymbol('TW', '2330'), '2330.TW');
assert.equal(S.normalizeSymbol('TW', '００５０'), '0050.TW');       // 全形
assert.equal(S.normalizeSymbol('TW', '00878'), '00878.TW');
assert.equal(S.normalizeSymbol('TW', '2330.TW'), '2330.TW');
assert.equal(S.normalizeSymbol('JP', '7203'), '7203.T');
assert.equal(S.normalizeSymbol('US', 'aapl'), 'AAPL');
assert.equal(S.normalizeSymbol('US', 'brk-b'), 'BRK-B');
assert.equal(S.normalizeSymbol('US', '台積電'), null);               // 不是代碼
assert.equal(S.normalizeSymbol('TW', 'abc'), null);
assert.equal(S.normalizeSymbol('US', ''), null);

// ---- 簡稱搜尋 ----
assert.equal(S.search('台積電', 'TW')[0].symbol, '2330.TW');
assert.equal(S.search('台積電ADR', 'US')[0].symbol, 'TSM');
assert.equal(S.search('輝達', 'US')[0].symbol, 'NVDA');
assert.equal(S.search('nvidia', 'US')[0].symbol, 'NVDA');
assert.equal(S.search('トヨタ', 'JP')[0].symbol, '7203.T');
assert.equal(S.search('任天堂', 'JP')[0].symbol, '7974.T');
assert.equal(S.search('ＡＡＰＬ', 'US')[0].symbol, 'AAPL');          // 全形
assert.equal(S.search('2330', 'TW')[0].symbol, '2330.TW');
assert.equal(S.search('7203', 'JP')[0].symbol, '7203.T');
assert.equal(S.search('0050', 'TW')[0].symbol, '0050.TW');
assert.equal(S.search('元大台灣50', 'TW')[0].symbol, '0050.TW');
assert.deepStrictEqual(S.search('zzzzzzzz', 'US'), []);
// 代碼唯一性:同一個 Yahoo 代碼不可重複
const ys = S.ALIASES.map((a) => a.sym + S.MARKETS[a.mkt].suffix);
assert.strictEqual(new Set(ys).size, ys.length, 'duplicate alias symbol');

// ---- chart 解析:模擬 Yahoo v8 回應 ----
const D = (y, m, d, h = 0) => Date.UTC(y, m - 1, d, h) / 1000;
function chart({ ts, closes, gmtoffset, regEnd, currency = 'USD', symbol = 'AAPL' }) {
  return { chart: { result: [{ meta: { symbol, currency, gmtoffset, longName: symbol + ' Inc', currentTradingPeriod: regEnd ? { regular: { end: regEnd } } : undefined }, timestamp: ts, indicators: { quote: [{ close: closes }] } }] } };
}
// 美東 UTC-5(冬令):週一 2026-11-02、週二 11-03、週三 11-04。K 線時間戳在 14:30 UTC(開盤)。
const usBars = { ts: [D(2026, 10, 30, 14), D(2026, 11, 2, 14), D(2026, 11, 3, 14), D(2026, 11, 4, 14)], closes: [100, 101, 102, 103.5], gmtoffset: -18000, symbol: 'AAPL' };
// 現在 = 美東 11/4 10:00(= UTC 15:00),盤中 → 捨棄今天的 103.5,拿昨天 102
let q = S.parseChart(chart({ ...usBars, regEnd: D(2026, 11, 4, 21) }), D(2026, 11, 4, 15) * 1000);
near(q.close, 102); assert.equal(q.date, '2026-11-03'); assert.equal(q.currency, 'USD');
// 現在 = 11/4 22:00 UTC(已收盤)→ 拿今天 103.5
q = S.parseChart(chart({ ...usBars, regEnd: D(2026, 11, 4, 21) }), D(2026, 11, 4, 22) * 1000);
near(q.close, 103.5); assert.equal(q.date, '2026-11-04');
// 週末:現在週六,最新一根是週五 → 拿週五
q = S.parseChart(chart({ ts: [D(2026, 10, 29, 14), D(2026, 10, 30, 14)], closes: [10, 11], gmtoffset: -14400, regEnd: D(2026, 11, 2, 20) }), D(2026, 10, 31, 12) * 1000);
near(q.close, 11); assert.equal(q.date, '2026-10-30');
// 有 null 收盤(停牌/資料缺漏)要跳過
q = S.parseChart(chart({ ts: [D(2026, 11, 2, 1), D(2026, 11, 3, 1), D(2026, 11, 4, 1)], closes: [500, null, null], gmtoffset: 28800, symbol: '2330.TW', currency: 'TWD', regEnd: D(2026, 11, 5, 5) }), D(2026, 11, 4, 12) * 1000);
near(q.close, 500); assert.equal(q.currency, 'TWD');
// 台股:現在台北 11/4 09:30(盤中),今天那根要被捨棄
q = S.parseChart(chart({ ts: [D(2026, 11, 3, 1), D(2026, 11, 4, 1)], closes: [1000, 1010], gmtoffset: 28800, symbol: '2330.TW', currency: 'TWD', regEnd: D(2026, 11, 4, 5, 30) }), D(2026, 11, 4, 1, 30) * 1000);
near(q.close, 1000); assert.equal(q.date, '2026-11-03');
// 沒有 currentTradingPeriod:保守起見,今天的 K 線一律捨棄
q = S.parseChart(chart({ ts: [D(2026, 11, 3, 1), D(2026, 11, 4, 1)], closes: [1000, 1010], gmtoffset: 28800, currency: 'TWD' }), D(2026, 11, 4, 12) * 1000);
near(q.close, 1000);
assert.throws(() => S.parseChart({ chart: { result: null, error: { code: 'Not Found' } } }, 0));
assert.throws(() => S.parseChart(chart({ ts: [D(2026, 11, 3, 1)], closes: [null], gmtoffset: 0 }), D(2026, 11, 4) * 1000));

// ---- 匯率 ----
const rates = S.parseRates({ result: 'success', rates: { USD: 1, TWD: 32, JPY: 150, PHP: 58 } });
near(S.convert(100, 'USD', 'TWD', rates), 3200);
near(S.convert(3200, 'TWD', 'USD', rates), 100);
near(S.convert(1500, 'JPY', 'PHP', rates), 1500 / 150 * 58);
near(S.convert(5, 'TWD', 'TWD', null), 5);                       // 同幣別不需匯率
assert.equal(S.convert(5, 'USD', 'TWD', null), null);            // 缺匯率 → null
assert.throws(() => S.parseRates({ nope: 1 }));

// ---- 搜尋回應 ----
const sr = S.parseSearch({ quotes: [{ symbol: '2330.TW', longname: 'Taiwan Semiconductor Manufacturing', quoteType: 'EQUITY' }, { symbol: 'XYZ=X', quoteType: 'CURRENCY' }, { symbol: '7203.T', shortname: 'TOYOTA', quoteType: 'EQUITY' }, { symbol: 'AAPL', shortname: 'Apple', quoteType: 'EQUITY' }] });
assert.deepStrictEqual(sr.map((x) => x.market), ['TW', 'JP', 'US']);

// ---- 網路備援流程(模擬 fetch) ----
(async () => {
  const calls = [];
  const mk = (plan) => async (u) => { calls.push(u); const r = plan(u); if (r instanceof Error) throw r; return { ok: r.ok !== false, status: r.status || 200, json: async () => r.json }; };
  // 1) 直連被 CORS 擋(拋錯)→ 改走公共代理
  let f = mk((u) => (u.startsWith('https://corsproxy.io/') ? { json: { ok: 1 } } : new TypeError('CORS')));
  assert.deepStrictEqual(await S.fetchJSON('https://x.test/a', { fetch: f }), { ok: 1 });
  assert.equal(calls.length, 2);
  // 2) 有設定代理 → 先走代理
  calls.length = 0;
  f = mk((u) => ({ json: { via: u.split('?')[0] } }));
  const r = await S.fetchJSON('https://x.test/a', { fetch: f, proxy: 'https://p.example.workers.dev/' });
  assert.equal(r.via, 'https://p.example.workers.dev/'); assert.equal(calls.length, 1);
  assert(calls[0].includes(encodeURIComponent('https://x.test/a')));
  // 3) 全部失敗 → 拋錯
  f = mk(() => new TypeError('offline'));
  await assert.rejects(S.fetchJSON('https://x.test/a', { fetch: f }));
  // 4) HTTP 404 視為失敗並繼續嘗試下一個
  calls.length = 0;
  f = mk((u) => (u.includes('corsproxy') ? { json: { ok: 2 } } : { ok: false, status: 404 }));
  assert.deepStrictEqual(await S.fetchJSON('https://x.test/a', { fetch: f }), { ok: 2 });
  // 5) 上市查無 → 改查上櫃
  calls.length = 0;
  const ok = chart({ ts: [D(2026, 11, 3, 1)], closes: [88], gmtoffset: 28800, symbol: '6488.TWO', currency: 'TWD' });
  f = mk((u) => (decodeURIComponent(u).includes('6488.TWO') ? { json: ok } : { ok: false, status: 404 }));
  const quote = await S.fetchQuote('6488.TW', { fetch: f, now: D(2026, 11, 4, 12) * 1000 });
  near(quote.close, 88); assert.equal(quote.yahoo, '6488.TWO');
  // 6) 匯率:er-api 失敗 → 用 Yahoo 匯率對
  f = mk((u) => {
    const d = decodeURIComponent(u);
    if (d.includes('open.er-api.com')) return new TypeError('blocked');
    const c = (d.match(/USD(\w{3})=X/) || [])[1];
    return { json: chart({ ts: [D(2026, 11, 3, 1)], closes: [{ TWD: 32, JPY: 150, PHP: 58 }[c]], gmtoffset: 0, symbol: 'USD' + c + '=X', currency: c }) };
  });
  const fx = await S.fetchRates({ fetch: f, now: D(2026, 11, 4, 12) * 1000 });
  near(fx.TWD, 32); near(fx.JPY, 150); near(fx.PHP, 58); near(fx.USD, 1);
  console.log('stocks tests passed');
})().catch((e) => { console.error(e); process.exit(1); });

// ---- 每日資料檔查詢 ----
{
  const data = {
    tw: { date: '2026-11-04', list: [['2330', '台積電', 1000, 'TWSE'], ['6488', '環球晶', 500, 'TPEx'], ['0050', '元大台灣50', 180, 'TWSE'], ['00878', '國泰永續高股息', 22, 'TWSE']] },
    us: { list: [['NVDA', 'NVIDIA Corporation', 200, '2026-11-03', 'Yahoo+Stooq'], ['AAPL', 'Apple Inc.', 250, '2026-11-03', 'Yahoo']] },
    jp: { list: [['7203', 'トヨタ自動車', 3000, '2026-11-04', 'Stooq']] },
  };
  assert.equal(S.dataSearch(data, '台積電', ['TW'])[0].symbol, '2330.TW');
  assert.equal(S.dataSearch(data, '環球晶', ['TW'])[0].symbol, '6488.TWO');      // 上櫃,只在官方資料裡
  assert.equal(S.dataSearch(data, '6488', ['TW'])[0].symbol, '6488.TWO');
  assert.equal(S.dataSearch(data, '高股息', ['TW'])[0].symbol, '00878.TW');       // 簡稱部分比對
  assert.equal(S.dataSearch(data, '輝達', ['US'])[0].symbol, 'NVDA');             // 中文俗稱 → 資料檔代碼
  assert.equal(S.dataSearch(data, 'トヨタ', ['JP'])[0].symbol, '7203.T');
  assert.deepStrictEqual(S.dataSearch(data, '台積電', ['US']).map((r) => r.symbol), []); // 限定市場
  assert.deepStrictEqual(S.dataSearch(null, '台積電', ['TW']), []);
  let q = S.dataQuote(data, '6488.TW'); assert.equal(q.symbol, '6488.TWO'); assert.equal(q.src, 'TPEx'); assert.equal(q.currency, 'TWD'); assert.equal(q.date, '2026-11-04');
  q = S.dataQuote(data, '2330.TW'); assert.equal(q.src, 'TWSE'); assert.equal(q.close, 1000);
  q = S.dataQuote(data, 'NVDA'); assert.equal(q.currency, 'USD'); assert.equal(q.src, 'Yahoo+Stooq');
  q = S.dataQuote(data, '7203.T'); assert.equal(q.currency, 'JPY'); assert.equal(q.close, 3000);
  assert.equal(S.dataQuote(data, 'MSFT'), null); assert.equal(S.dataQuote(null, 'NVDA'), null);
  assert.equal(S.marketOf('6488.TWO'), 'TW'); assert.equal(S.marketOf('7203.T'), 'JP'); assert.equal(S.marketOf('BRK-B'), 'US');
  console.log('market data lookup tests passed');
}
