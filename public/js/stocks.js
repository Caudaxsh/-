/* 股票:代碼/簡稱查詢、最近收盤價、匯率換算。
 * 資料來源:Yahoo Finance 的公開 chart API(JSON)。純函式部分(parseChart / convert / normalize / search)可在 Node 測試。
 * 網路取得流程:自訂代理 → 直連 → 公共 CORS 代理;全部失敗時介面會讓使用者手動輸入價格。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Stocks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MARKETS = { US: { suffix: '', currency: 'USD' }, TW: { suffix: '.TW', currency: 'TWD' }, JP: { suffix: '.T', currency: 'JPY' } };

  // 常用股票別名:[代碼, 市場, 名稱們(中/英/日,任一個符合就算)]
  const A = (sym, mkt, ...names) => ({ sym, mkt, names });
  const ALIASES = [
    // 台股
    A('2330', 'TW', '台積電', '台灣積體電路', 'TSMC', 'Taiwan Semiconductor', '台積電'), A('2317', 'TW', '鴻海', 'Hon Hai', 'Foxconn'),
    A('2454', 'TW', '聯發科', 'MediaTek'), A('2412', 'TW', '中華電', '中華電信', 'Chunghwa Telecom'), A('2308', 'TW', '台達電', 'Delta Electronics'),
    A('2303', 'TW', '聯電', 'UMC'), A('2382', 'TW', '廣達', 'Quanta'), A('3231', 'TW', '緯創', 'Wistron'), A('2357', 'TW', '華碩', 'ASUS'), A('2353', 'TW', '宏碁', 'Acer'),
    A('3711', 'TW', '日月光投控', '日月光', 'ASE'), A('2379', 'TW', '瑞昱', 'Realtek'), A('3008', 'TW', '大立光', 'Largan'), A('2327', 'TW', '國巨', 'Yageo'),
    A('2345', 'TW', '智邦', 'Accton'), A('3034', 'TW', '聯詠', 'Novatek'), A('2301', 'TW', '光寶科', 'Lite-On'), A('2395', 'TW', '研華', 'Advantech'),
    A('2881', 'TW', '富邦金', 'Fubon'), A('2882', 'TW', '國泰金', 'Cathay'), A('2891', 'TW', '中信金', 'CTBC'), A('2886', 'TW', '兆豐金', 'Mega'), A('2884', 'TW', '玉山金', 'E.SUN'),
    A('2892', 'TW', '第一金', 'First Financial'), A('5880', 'TW', '合庫金'), A('2880', 'TW', '華南金'), A('2885', 'TW', '元大金'),
    A('2603', 'TW', '長榮', 'Evergreen Marine'), A('2609', 'TW', '陽明', 'Yang Ming'), A('2615', 'TW', '萬海', 'Wan Hai'),
    A('1301', 'TW', '台塑', 'Formosa Plastics'), A('1303', 'TW', '南亞', 'Nan Ya'), A('2002', 'TW', '中鋼', 'China Steel'), A('1216', 'TW', '統一', 'Uni-President'),
    A('2912', 'TW', '統一超', '統一超商', '7-ELEVEN Taiwan'), A('6505', 'TW', '台塑化'), A('3045', 'TW', '台灣大', 'Taiwan Mobile'), A('4904', 'TW', '遠傳', 'FarEasTone'),
    A('0050', 'TW', '元大台灣50', '台灣50', 'Yuanta Taiwan 50'), A('0056', 'TW', '元大高股息', 'Yuanta High Dividend'), A('00878', 'TW', '國泰永續高股息', '00878'),
    A('00919', 'TW', '群益台灣精選高息'), A('00929', 'TW', '復華台灣科技優息'), A('006208', 'TW', '富邦台50', 'Fubon Taiwan 50'), A('00713', 'TW', '元大台灣高息低波'),
    // 美股
    A('AAPL', 'US', 'Apple', '蘋果', 'アップル'), A('MSFT', 'US', 'Microsoft', '微軟', 'マイクロソフト'), A('NVDA', 'US', 'NVIDIA', '輝達', '英偉達', 'エヌビディア'),
    A('GOOGL', 'US', 'Alphabet', 'Google', '谷歌', 'グーグル'), A('AMZN', 'US', 'Amazon', '亞馬遜', 'アマゾン'), A('META', 'US', 'Meta', 'Facebook', '臉書', 'メタ'),
    A('TSLA', 'US', 'Tesla', '特斯拉', 'テスラ'), A('AVGO', 'US', 'Broadcom', '博通'), A('NFLX', 'US', 'Netflix', '網飛', 'ネットフリックス'), A('AMD', 'US', 'AMD', '超微'),
    A('INTC', 'US', 'Intel', '英特爾', 'インテル'), A('TSM', 'US', 'TSMC ADR', '台積電ADR', '台積電 ADR'), A('BRK-B', 'US', 'Berkshire', '波克夏', 'バークシャー'),
    A('JPM', 'US', 'JPMorgan', '摩根大通'), A('V', 'US', 'Visa'), A('MA', 'US', 'Mastercard', '萬事達'), A('WMT', 'US', 'Walmart', '沃爾瑪'),
    A('KO', 'US', 'Coca-Cola', '可口可樂', 'コカ・コーラ'), A('MCD', 'US', "McDonald's", '麥當勞', 'マクドナルド'), A('SBUX', 'US', 'Starbucks', '星巴克', 'スターバックス'),
    A('DIS', 'US', 'Disney', '迪士尼', 'ディズニー'), A('NKE', 'US', 'Nike', '耐吉', '耐克', 'ナイキ'), A('COST', 'US', 'Costco', '好市多', 'コストコ'),
    A('ORCL', 'US', 'Oracle', '甲骨文'), A('CRM', 'US', 'Salesforce'), A('ADBE', 'US', 'Adobe'), A('QCOM', 'US', 'Qualcomm', '高通'), A('MU', 'US', 'Micron', '美光'),
    A('PLTR', 'US', 'Palantir'), A('COIN', 'US', 'Coinbase'), A('UBER', 'US', 'Uber'), A('SPOT', 'US', 'Spotify'), A('PYPL', 'US', 'PayPal'),
    A('SPY', 'US', 'SPDR S&P 500', 'S&P500 ETF'), A('VOO', 'US', 'Vanguard S&P 500', 'VOO'), A('VTI', 'US', 'Vanguard Total Market'), A('QQQ', 'US', 'Invesco QQQ', '納斯達克100'),
    A('SCHD', 'US', 'Schwab Dividend', 'SCHD'), A('VT', 'US', 'Vanguard Total World'), A('IVV', 'US', 'iShares Core S&P 500'), A('SOXX', 'US', 'iShares Semiconductor'),
    // 日股
    A('7203', 'JP', 'トヨタ', 'トヨタ自動車', 'Toyota', '豐田'), A('6758', 'JP', 'ソニー', 'ソニーグループ', 'Sony', '索尼'), A('7974', 'JP', '任天堂', 'Nintendo'),
    A('9984', 'JP', 'ソフトバンクグループ', 'ソフトバンクG', 'SoftBank Group', '軟銀'), A('6861', 'JP', 'キーエンス', 'Keyence', '基恩斯'), A('8306', 'JP', '三菱UFJ', '三菱UFJフィナンシャル', 'MUFG'),
    A('9432', 'JP', 'NTT', '日本電信電話'), A('9433', 'JP', 'KDDI'), A('6098', 'JP', 'リクルート', 'Recruit'), A('8035', 'JP', '東京エレクトロン', 'Tokyo Electron', '東京威力科創'),
    A('6501', 'JP', '日立', '日立製作所', 'Hitachi'), A('7267', 'JP', 'ホンダ', '本田技研', 'Honda', '本田'), A('7201', 'JP', '日産', '日産自動車', 'Nissan', '日產'),
    A('4502', 'JP', '武田薬品', 'Takeda', '武田'), A('9983', 'JP', 'ファーストリテイリング', 'ユニクロ', 'Fast Retailing', 'Uniqlo', '優衣庫'), A('7011', 'JP', '三菱重工'),
    A('8058', 'JP', '三菱商事', 'Mitsubishi Corp'), A('8001', 'JP', '伊藤忠', '伊藤忠商事'), A('2914', 'JP', 'JT', '日本たばこ'), A('3382', 'JP', 'セブン&アイ', 'セブンアンドアイ', '7&i', 'Seven & i'),
    A('6954', 'JP', 'ファナック', 'Fanuc'), A('6594', 'JP', 'ニデック', 'Nidec'), A('7741', 'JP', 'HOYA'), A('4661', 'JP', 'オリエンタルランド', 'Oriental Land', '東京迪士尼'),
    A('9766', 'JP', 'コナミ', 'Konami'), A('7832', 'JP', 'バンダイナムコ', 'Bandai Namco', '萬代南夢宮'), A('9697', 'JP', 'カプコン', 'Capcom'),
    A('1321', 'JP', '日経225', '日経225連動型', 'Nikkei 225 ETF'), A('1306', 'JP', 'TOPIX', 'TOPIX ETF'),
  ];

  /** 全形→半形、去空白、轉小寫 */
  function norm(s) {
    return String(s || '').replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[\s　]+/g, '').toLowerCase();
  }
  /** 使用者輸入的代碼 → Yahoo 代碼;不像代碼就回 null */
  function normalizeSymbol(market, input) {
    const raw = String(input || '').trim().replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).toUpperCase();
    if (!raw) return null;
    if (/\.(TW|TWO|T)$/.test(raw) || /^\^/.test(raw)) return raw;
    if (market === 'TW') return /^\d{4,6}[A-Z]?$/.test(raw) ? raw + '.TW' : null;
    if (market === 'JP') return /^\d{4}[A-Z]?$/.test(raw) ? raw + '.T' : null;
    return /^[A-Z][A-Z0-9.\-]{0,9}$/.test(raw) ? raw : null;
  }
  const yahooSymbol = (a) => a.sym + MARKETS[a.mkt].suffix;

  /** 在別名表搜尋(代碼或名稱,不分大小寫與全半形)。優先同市場,最多 8 筆 */
  function search(query, market) {
    const q = norm(query);
    if (!q) return [];
    const scored = [];
    for (const a of ALIASES) {
      let s = 0;
      if (norm(a.sym) === q) s = 100;
      else if (a.names.some((n) => norm(n) === q)) s = 90;
      else if (norm(a.sym).startsWith(q)) s = 60;
      else if (a.names.some((n) => norm(n).startsWith(q))) s = 50;
      else if (q.length >= 2 && a.names.some((n) => norm(n).includes(q))) s = 30;
      if (s) scored.push({ a, s: s + (a.mkt === market ? 5 : 0) });
    }
    scored.sort((x, y) => y.s - x.s);
    return scored.slice(0, 8).map(({ a }) => ({ symbol: yahooSymbol(a), market: a.mkt, name: a.names[0] }));
  }

  /* ---------- Yahoo 回應解析 ---------- */
  const dateIn = (sec, gmtoffset) => new Date((sec + (gmtoffset || 0)) * 1000).toISOString().slice(0, 10);
  /**
   * 取「最近一個已經收盤的交易日」的收盤價。
   * 若最新一根日 K 屬於「今天且盤還沒收」,就捨棄它(避免拿到盤中價)。
   */
  function parseChart(json, nowMs) {
    const r = json && json.chart && json.chart.result && json.chart.result[0];
    if (!r || !r.meta || !r.timestamp || !r.indicators || !r.indicators.quote || !r.indicators.quote[0]) throw new Error('bad chart');
    const meta = r.meta;
    const closes = r.indicators.quote[0].close || [];
    const off = meta.gmtoffset || 0;
    const nowSec = (nowMs == null ? Date.now() : nowMs) / 1000;
    const today = dateIn(nowSec, off);
    const regEnd = meta.currentTradingPeriod && meta.currentTradingPeriod.regular && meta.currentTradingPeriod.regular.end;
    let i = closes.length - 1;
    while (i >= 0 && (closes[i] == null || !(closes[i] > 0))) i--;
    if (i >= 0 && dateIn(r.timestamp[i], off) === today) {
      const sessionOver = regEnd ? nowSec >= regEnd : false;
      if (!sessionOver) { i--; while (i >= 0 && (closes[i] == null || !(closes[i] > 0))) i--; }
    }
    if (i < 0) throw new Error('no close');
    return {
      symbol: meta.symbol, name: meta.longName || meta.shortName || meta.symbol, currency: meta.currency,
      close: closes[i], date: dateIn(r.timestamp[i], off),
    };
  }
  const chartUrl = (symbol) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10d&interval=1d&includePrePost=false`;
  const searchUrl = (q, lang) => `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0&lang=${lang || 'en-US'}`;
  function parseSearch(json) {
    const qs = (json && json.quotes) || [];
    return qs.filter((x) => x.symbol && (x.quoteType === 'EQUITY' || x.quoteType === 'ETF'))
      .map((x) => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, market: /\.(TW|TWO)$/.test(x.symbol) ? 'TW' : /\.T$/.test(x.symbol) ? 'JP' : 'US' }));
  }

  /* ---------- 匯率 ---------- */
  /** rates:以 USD 為基準 { USD:1, TWD:…, JPY:…, PHP:… } */
  function convert(amount, from, to, rates) {
    if (from === to) return amount;
    if (!rates || !rates[from] || !rates[to]) return null;
    return amount / rates[from] * rates[to];
  }
  function parseRates(json) {
    if (json && json.rates && (json.result === 'success' || json.rates.USD)) return { ...json.rates, USD: 1 };
    throw new Error('bad rates');
  }

  /* ---------- 網路(瀏覽器端) ---------- */
  /** 依序嘗試:自訂代理 → 直連 → 公共 CORS 代理。回傳解析後的 JSON。 */
  async function fetchJSON(url, opts) {
    const o = opts || {};
    const f = o.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    const tries = [];
    if (o.proxy) tries.push(o.proxy.replace(/\/+$/, '') + '/?u=' + encodeURIComponent(url));
    tries.push(url);
    tries.push('https://corsproxy.io/?' + encodeURIComponent(url));
    let lastErr;
    for (const u of tries) {
      try {
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), o.timeout || 7000) : null;
        const res = await f(u, ctl ? { signal: ctl.signal } : undefined);
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('network');
  }
  /** 台股代碼若在上市(.TW)查不到,再試上櫃(.TWO) */
  async function fetchQuote(symbol, opts) {
    const o = opts || {};
    const tryOne = async (s) => ({ ...parseChart(await fetchJSON(chartUrl(s), o), o.now), yahoo: s });
    try { return await tryOne(symbol); } catch (e) {
      if (/\.TW$/.test(symbol)) return await tryOne(symbol.replace(/\.TW$/, '.TWO'));
      throw e;
    }
  }
  async function fetchRates(opts) {
    const o = opts || {};
    try { return parseRates(await fetchJSON('https://open.er-api.com/v6/latest/USD', o)); } catch (e) {
      const out = { USD: 1 };
      for (const c of ['TWD', 'JPY', 'PHP']) {
        const q = parseChart(await fetchJSON(chartUrl('USD' + c + '=X'), o), o.now);
        out[c] = q.close;
      }
      return out;
    }
  }
  async function remoteSearch(query, opts) {
    return parseSearch(await fetchJSON(searchUrl(query, (opts || {}).lang), opts || {}));
  }


  /* ---------- 每日官方/彙整資料檔(data/market.json,由 GitHub Actions 產生) ----------
   * 格式:{ tw:{ date, list:[[code, 官方簡稱, close, 'TWSE'|'TPEx']] }, us|jp:{ list:[[code, name, close, date, src]] }, fx:{ rates } } */
  const twSymbol = (row) => row[0] + (row[3] === 'TPEx' ? '.TWO' : '.TW');
  const jpSymbol = (code) => code + '.T';
  /** 在資料檔搜尋(代碼或官方簡稱),只回傳 allowed 市場 */
  function dataSearch(data, query, allowed) {
    if (!data) return [];
    const q = norm(query);
    if (!q) return [];
    const ok = (m) => !allowed || allowed.includes(m);
    const out = [];
    const score = (code, name) => (norm(code) === q ? 100 : norm(name) === q ? 90 : norm(code).startsWith(q) ? 60 : norm(name).startsWith(q) ? 50 : q.length >= 2 && norm(name).includes(q) ? 30 : 0);
    if (ok('TW') && data.tw && data.tw.list) for (const r of data.tw.list) { const s = score(r[0], r[1]); if (s) out.push({ s, symbol: twSymbol(r), market: 'TW', name: r[1] }); }
    for (const [mkt, key, sym] of [['US', 'us', (c) => c], ['JP', 'jp', jpSymbol]]) {
      if (!ok(mkt) || !data[key] || !data[key].list) continue;
      for (const r of data[key].list) { const s = score(r[0], r[1]); if (s) out.push({ s, symbol: sym(r[0]), market: mkt, name: r[1] }); }
    }
    // 別名(中/日/英俗稱)也對應到資料檔裡的代碼
    for (const a of ALIASES) {
      if (!ok(a.mkt)) continue;
      const hit = a.names.some((n) => norm(n) === q) ? 85 : q.length >= 2 && a.names.some((n) => norm(n).includes(q)) ? 25 : 0;
      if (!hit) continue;
      const symbol = yahooSymbol(a);
      const d = dataQuote(data, symbol);
      if (d && !out.some((o) => o.symbol === d.symbol)) out.push({ s: hit, symbol: d.symbol, market: a.mkt, name: d.name });
    }
    out.sort((x, y) => y.s - x.s);
    return out.slice(0, 8).map(({ symbol, market, name }) => ({ symbol, market, name, inData: true }));
  }
  /** 從資料檔取報價;台股代碼可帶 .TW 或 .TWO */
  function dataQuote(data, symbol) {
    if (!data || !symbol) return null;
    const s = String(symbol).toUpperCase();
    let m;
    if ((m = s.match(/^(\w+)\.TWO?$/)) && data.tw && data.tw.list) {
      const r = data.tw.list.find((x) => x[0] === m[1]);
      if (r) return { symbol: twSymbol(r), name: r[1], close: r[2], currency: 'TWD', date: data.tw.date, src: r[3] };
    }
    if ((m = s.match(/^(\w+)\.T$/)) && data.jp && data.jp.list) {
      const r = data.jp.list.find((x) => x[0] === m[1]);
      if (r) return { symbol: jpSymbol(r[0]), name: r[1], close: r[2], currency: 'JPY', date: r[3], src: r[4] };
    }
    if (!/\./.test(s) && data.us && data.us.list) {
      const r = data.us.list.find((x) => x[0] === s);
      if (r) return { symbol: r[0], name: r[1], close: r[2], currency: 'USD', date: r[3], src: r[4] };
    }
    return null;
  }
  const marketOf = (symbol) => (/\.TWO?$/i.test(symbol) ? 'TW' : /\.T$/i.test(symbol) ? 'JP' : 'US');

  return { MARKETS, ALIASES, norm, normalizeSymbol, search, dataSearch, dataQuote, marketOf, parseChart, parseSearch, chartUrl, searchUrl, convert, parseRates, fetchJSON, fetchQuote, fetchRates, remoteSearch };
});
