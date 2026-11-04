// 每日在 GitHub Actions 上執行:抓公開資料,產生 public/data/market.json(網站只讀同網域檔案,不需跨站請求)。
//
// 台股:臺灣證券交易所 OpenAPI(上市)+ 證券櫃檯買賣中心 OpenAPI(上櫃)— 官方、全部個股與 ETF 的官方簡稱與收盤價
// 美股/日股:沒有免費的官方交易所 API → Yahoo Finance chart API 取最近一個已收盤交易日收盤價,並用 Stooq 交叉核對(差距 < 2% 標記為一致)
// 匯率:Yahoo Finance(USDTWD=X 等),失敗改用 open.er-api.com
//
// 用法:node tools/fetch-market-data.mjs public/data/market.json
// 任何一個來源失敗都不會中止,只會在輸出與 log 中缺少該部分。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Stocks = require('../public/js/stocks.js');
const OUT = process.argv[2] || 'public/data/market.json';
const UA = 'Mozilla/5.0 (compatible; WorkHorseData/1.0; +https://github.com/Caudaxsh/-)';
const log = (...a) => console.log('[market]', ...a);

async function get(url, { text = false, timeout = 20000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: text ? 'text/csv,text/plain,*/*' : 'application/json,*/*' }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return text ? await r.text() : await r.json();
  } finally { clearTimeout(timer); }
}
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
/** 民國 yyyMMdd / 西元 yyyyMMdd / yyyy-MM-dd → yyyy-MM-dd */
function toIso(v) {
  const s = String(v ?? '').replace(/\D/g, '');
  if (s.length === 7) return `${Number(s.slice(0, 3)) + 1911}-${s.slice(3, 5)}-${s.slice(5, 7)}`;
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return null;
}
const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return null; };

/* ---------- 台股(官方) ---------- */
async function fetchTW() {
  const list = [];
  let date = null;
  try {
    const rows = await get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
    log('TWSE rows', rows.length, 'keys:', Object.keys(rows[0] || {}).join(','));
    for (const o of rows) {
      const code = pick(o, ['Code', '證券代號']);
      const name = pick(o, ['Name', '證券名稱']);
      const close = num(pick(o, ['ClosingPrice', '收盤價']));
      if (code && name && close) list.push([String(code).trim(), String(name).trim(), close, 'TWSE']);
      date = date || toIso(pick(o, ['Date', '日期']));
    }
  } catch (e) { log('TWSE OpenAPI failed:', e.message); }
  if (!date) {
    // OpenAPI 的列沒有日期時,用證交所同一份報表的 rwd 版本取得資料日期
    try {
      const j = await get('https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?response=json');
      date = toIso(j.date);
      log('TWSE date from rwd:', j.date, '→', date);
      if (!list.length && Array.isArray(j.data)) {
        const f = j.fields || [];
        const iC = f.indexOf('證券代號'), iN = f.indexOf('證券名稱'), iP = f.indexOf('收盤價');
        for (const r of j.data) { const c = num(r[iP]); if (c) list.push([String(r[iC]).trim(), String(r[iN]).trim(), c, 'TWSE']); }
        log('TWSE rows from rwd fallback', list.length);
      }
    } catch (e) { log('TWSE rwd failed:', e.message); }
  }
  let tpexDate = null;
  try {
    const rows = await get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes');
    log('TPEx rows', rows.length, 'keys:', Object.keys(rows[0] || {}).join(','));
    const seen = new Set(list.map((r) => r[0]));
    for (const o of rows) {
      const code = pick(o, ['SecuritiesCompanyCode', 'Code', '代號']);
      const name = pick(o, ['CompanyName', 'Name', '名稱']);
      const close = num(pick(o, ['Close', 'ClosingPrice', '收盤']));
      if (code && name && close && !seen.has(String(code).trim())) list.push([String(code).trim(), String(name).trim(), close, 'TPEx']);
      tpexDate = tpexDate || toIso(pick(o, ['Date', '資料日期']));
    }
  } catch (e) { log('TPEx OpenAPI failed:', e.message); }
  if (date && tpexDate && date !== tpexDate) log('WARN TWSE/TPEx date differ', date, tpexDate);
  return list.length ? { date: date || tpexDate, list } : null;
}

/* ---------- 美股 / 日股(Yahoo + Stooq 交叉核對) ---------- */
async function yahooClose(symbol) {
  const q = Stocks.parseChart(await get(Stocks.chartUrl(symbol)), Date.now());
  return { close: q.close, date: q.date, name: q.name, currency: q.currency };
}
/** Stooq 一次查多檔:回傳 { 'AAPL.US': {close, date} } */
async function stooqBatch(syms) {
  const out = {};
  for (let i = 0; i < syms.length; i += 40) {
    const chunk = syms.slice(i, i + 40);
    try {
      const csv = await get(`https://stooq.com/q/l/?s=${chunk.map((s) => s.toLowerCase()).join(',')}&f=sd2c&h&e=csv`, { text: true });
      for (const line of csv.trim().split(/\r?\n/).slice(1)) {
        const [sym, d, c] = line.split(',');
        const close = num(c);
        if (sym && close && /^\d{4}-\d{2}-\d{2}$/.test(d)) out[sym.toUpperCase()] = { close, date: d };
      }
    } catch (e) { log('Stooq batch failed:', e.message); }
  }
  return out;
}
async function fetchCurated(mkt) {
  const aliases = Stocks.ALIASES.filter((a) => a.mkt === mkt);
  const stooqSym = (a) => (mkt === 'US' ? a.sym.replace('-', '.') + '.US' : a.sym + '.JP');
  const stooq = await stooqBatch(aliases.map(stooqSym));
  log(mkt, 'Stooq hits', Object.keys(stooq).length, '/', aliases.length);
  const list = [];
  let yOk = 0, agree = 0, disagree = 0;
  for (const a of aliases) {
    const ysym = a.sym + Stocks.MARKETS[mkt].suffix;
    let y = null;
    try { y = await yahooClose(ysym); yOk++; } catch (e) { /* 下面用 Stooq */ }
    const s = stooq[stooqSym(a).toUpperCase()];
    let row = null;
    if (y && s) {
      const same = s.date === y.date && Math.abs(s.close - y.close) / y.close < 0.02;
      if (same) agree++; else { disagree++; log('mismatch', ysym, 'yahoo', y.close, y.date, 'stooq', s.close, s.date); }
      row = [a.sym, a.names[0], y.close, y.date, same ? 'Yahoo+Stooq' : 'Yahoo'];
    } else if (y) row = [a.sym, a.names[0], y.close, y.date, 'Yahoo'];
    else if (s) row = [a.sym, a.names[0], s.close, s.date, 'Stooq'];
    if (row) list.push(row);
    await new Promise((r) => setTimeout(r, 150)); // 禮貌性間隔
  }
  log(mkt, `rows ${list.length}/${aliases.length}, yahoo ok ${yOk}, agree ${agree}, mismatch ${disagree}`);
  return list.length ? { list } : null;
}

/* ---------- 匯率 ---------- */
async function fetchFx() {
  try {
    const rates = { USD: 1 };
    for (const c of ['TWD', 'JPY', 'PHP']) rates[c] = (await yahooClose(`USD${c}=X`)).close;
    return { rates, src: 'Yahoo' };
  } catch (e) {
    log('Yahoo FX failed:', e.message);
    try { return { rates: Stocks.parseRates(await get('https://open.er-api.com/v6/latest/USD')), src: 'open.er-api.com' }; } catch (e2) { log('er-api failed:', e2.message); }
  }
  return null;
}

const [tw, us, jp, fx] = await Promise.all([fetchTW(), fetchCurated('US'), fetchCurated('JP'), fetchFx()]);
const data = { v: 1, generatedAt: new Date().toISOString(), tw, us, jp, fx };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data));
const sample = (sym) => { const q = Stocks.dataQuote(data, sym); return q ? `${sym}=${q.close} ${q.currency} ${q.date} [${q.src}] ${q.name}` : `${sym}=—`; };
log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB', '| TW', tw?.list.length ?? 0, tw?.date ?? '', '| US', us?.list.length ?? 0, '| JP', jp?.list.length ?? 0, '| FX', fx ? JSON.stringify(fx.rates) : '—');
for (const s of ['2330.TW', '0050.TW', '00878.TW', '6488.TW', '2317.TW', 'AAPL', 'NVDA', 'VOO', '7203.T', '7974.T']) log('sample', sample(s));
