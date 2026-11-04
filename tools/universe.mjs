// 每日資料要涵蓋哪些美股 / 日股。台股不需要(證交所 + 櫃買中心官方資料已含全部個股與 ETF)。
// 想新增代碼:編輯 tools/extra-symbols.txt(每行一個,格式 `代碼` 或 `代碼,顯示名稱`;日股用 `7203.T`),推送後下次部署就會納入。

/** S&P 500 成分股 CSV(欄位:Symbol,Security,...;datasets/s-and-p-500-companies)→ [[symbol, name]],BRK.B → BRK-B(Yahoo 格式) */
export function parseSp500Csv(csv) {
  const out = [];
  const lines = String(csv || '').trim().split(/\r?\n/);
  if (!lines.length) return out;
  const split = (line) => { // 簡單 CSV(含引號)
    const cells = []; let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur); return cells;
  };
  const head = split(lines[0]).map((h) => h.trim().toLowerCase());
  const iS = head.indexOf('symbol'), iN = head.indexOf('security') >= 0 ? head.indexOf('security') : head.indexOf('name');
  if (iS < 0) return out;
  for (const line of lines.slice(1)) {
    const c = split(line);
    const sym = (c[iS] || '').trim().toUpperCase().replace(/\./g, '-');
    if (/^[A-Z][A-Z0-9-]{0,9}$/.test(sym)) out.push([sym, (c[iN] || sym).trim()]);
  }
  return out;
}

/** extra-symbols.txt → { us:[[sym,name]], jp:[[code,name]] }。`#` 開頭為註解。 */
export function parseExtra(text) {
  const us = [], jp = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [symRaw, ...rest] = line.split(',');
    const sym = symRaw.trim().toUpperCase();
    const name = rest.join(',').trim() || sym;
    if (/^\d{4}[A-Z]?\.T$/.test(sym)) { const c = sym.replace(/\.T$/, ''); jp.push([c, name === sym ? c : name]); }
    else if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(sym)) { const y = sym.replace(/\./g, '-'); us.push([y, name === sym ? y : name]); }
  }
  return { us, jp };
}

/** 常見美股 ETF / 指數基金(不在 S&P 500 內) */
export const US_ETFS = [
  ['SPY', 'SPDR S&P 500 ETF'], ['VOO', 'Vanguard S&P 500 ETF'], ['IVV', 'iShares Core S&P 500 ETF'], ['VTI', 'Vanguard Total Stock Market ETF'],
  ['QQQ', 'Invesco QQQ Trust'], ['QQQM', 'Invesco NASDAQ 100 ETF'], ['VT', 'Vanguard Total World Stock ETF'], ['VXUS', 'Vanguard Total International Stock ETF'],
  ['VEA', 'Vanguard FTSE Developed Markets ETF'], ['VWO', 'Vanguard FTSE Emerging Markets ETF'], ['IEMG', 'iShares Core MSCI Emerging Markets ETF'],
  ['BND', 'Vanguard Total Bond Market ETF'], ['AGG', 'iShares Core U.S. Aggregate Bond ETF'], ['TLT', 'iShares 20+ Year Treasury Bond ETF'],
  ['SCHD', 'Schwab U.S. Dividend Equity ETF'], ['VYM', 'Vanguard High Dividend Yield ETF'], ['VIG', 'Vanguard Dividend Appreciation ETF'], ['DIA', 'SPDR Dow Jones Industrial Average ETF'],
  ['IWM', 'iShares Russell 2000 ETF'], ['VUG', 'Vanguard Growth ETF'], ['VTV', 'Vanguard Value ETF'], ['SCHG', 'Schwab U.S. Large-Cap Growth ETF'],
  ['XLK', 'Technology Select Sector SPDR'], ['XLF', 'Financial Select Sector SPDR'], ['XLE', 'Energy Select Sector SPDR'], ['XLV', 'Health Care Select Sector SPDR'],
  ['SOXX', 'iShares Semiconductor ETF'], ['SMH', 'VanEck Semiconductor ETF'], ['ARKK', 'ARK Innovation ETF'], ['TQQQ', 'ProShares UltraPro QQQ'], ['SQQQ', 'ProShares UltraPro Short QQQ'],
  ['SOXL', 'Direxion Daily Semiconductor Bull 3X'], ['GLD', 'SPDR Gold Shares'], ['SLV', 'iShares Silver Trust'], ['IBIT', 'iShares Bitcoin Trust ETF'], ['VNQ', 'Vanguard Real Estate ETF'],
  ['EWJ', 'iShares MSCI Japan ETF'], ['EWT', 'iShares MSCI Taiwan ETF'], ['EPHE', 'iShares MSCI Philippines ETF'],
  ['TSM', 'Taiwan Semiconductor (ADR)'], ['BABA', 'Alibaba Group (ADR)'], ['PDD', 'PDD Holdings (ADR)'], ['NIO', 'NIO Inc.'], ['SONY', 'Sony Group (ADR)'], ['TM', 'Toyota Motor (ADR)'],
  ['SHOP', 'Shopify'], ['SPOT', 'Spotify'], ['ASML', 'ASML Holding (ADR)'], ['GOOG', 'Alphabet Inc. Class C'],
];

/** 常見日股(代碼, 名稱)。Yahoo 查不到的代碼會被略過,不影響其他檔。 */
export const JP_STOCKS = [
  ['7203', 'トヨタ自動車'], ['6758', 'ソニーグループ'], ['6861', 'キーエンス'], ['9984', 'ソフトバンクグループ'], ['8306', '三菱UFJフィナンシャル・グループ'], ['9432', '日本電信電話'],
  ['6098', 'リクルートホールディングス'], ['8035', '東京エレクトロン'], ['7974', '任天堂'], ['4063', '信越化学工業'], ['6501', '日立製作所'], ['9983', 'ファーストリテイリング'],
  ['8316', '三井住友フィナンシャルグループ'], ['8411', 'みずほフィナンシャルグループ'], ['6367', 'ダイキン工業'], ['6902', 'デンソー'], ['7741', 'HOYA'], ['4519', '中外製薬'],
  ['4502', '武田薬品工業'], ['6594', 'ニデック'], ['6954', 'ファナック'], ['6981', '村田製作所'], ['6762', 'TDK'], ['6723', 'ルネサスエレクトロニクス'],
  ['8001', '伊藤忠商事'], ['8031', '三井物産'], ['8058', '三菱商事'], ['8053', '住友商事'], ['8002', '丸紅'], ['9433', 'KDDI'], ['9434', 'ソフトバンク'],
  ['4568', '第一三共'], ['4661', 'オリエンタルランド'], ['2914', '日本たばこ産業'], ['3382', 'セブン&アイ・ホールディングス'], ['2802', '味の素'], ['2503', 'キリンホールディングス'],
  ['2502', 'アサヒグループホールディングス'], ['2501', 'サッポロホールディングス'], ['4452', '花王'], ['4901', '富士フイルムホールディングス'], ['7751', 'キヤノン'], ['7267', '本田技研工業'],
  ['7201', '日産自動車'], ['7269', 'スズキ'], ['7270', 'SUBARU'], ['7011', '三菱重工業'], ['7012', '川崎重工業'], ['7013', 'IHI'], ['6301', 'コマツ'], ['6326', 'クボタ'],
  ['6273', 'SMC'], ['6857', 'アドバンテスト'], ['6920', 'レーザーテック'], ['7735', 'SCREENホールディングス'], ['8766', '東京海上ホールディングス'], ['8725', 'MS&ADインシュアランスグループ'],
  ['8591', 'オリックス'], ['8604', '野村ホールディングス'], ['9020', '東日本旅客鉄道'], ['9022', '東海旅客鉄道'], ['9201', '日本航空'], ['9202', 'ANAホールディングス'],
  ['9101', '日本郵船'], ['9104', '商船三井'], ['9107', '川崎汽船'], ['4543', 'テルモ'], ['4578', '大塚ホールディングス'], ['6178', '日本郵政'], ['9613', 'NTTデータグループ'],
  ['4755', '楽天グループ'], ['3659', 'ネクソン'], ['9697', 'カプコン'], ['7832', 'バンダイナムコホールディングス'], ['9766', 'コナミグループ'], ['6752', 'パナソニック ホールディングス'],
  ['6701', '日本電気'], ['6702', '富士通'], ['6971', '京セラ'], ['4307', '野村総合研究所'], ['6146', 'ディスコ'], ['2413', 'エムスリー'], ['4689', 'LINEヤフー'],
  ['3092', 'ZOZO'], ['8267', 'イオン'], ['9843', 'ニトリホールディングス'], ['7532', 'パン・パシフィック・インターナショナルHD'], ['2897', '日清食品ホールディングス'], ['2269', '明治ホールディングス'],
  ['1925', '大和ハウス工業'], ['1928', '積水ハウス'], ['1801', '大成建設'], ['1802', '大林組'], ['1803', '清水建設'], ['1812', '鹿島建設'], ['5401', '日本製鉄'], ['5411', 'JFEホールディングス'],
  ['5020', 'ENEOSホールディングス'], ['5019', '出光興産'], ['1605', 'INPEX'], ['9501', '東京電力ホールディングス'], ['9503', '関西電力'], ['9531', '東京瓦斯'],
  ['3407', '旭化成'], ['3402', '東レ'], ['5108', 'ブリヂストン'], ['9766', 'コナミグループ'], ['4385', 'メルカリ'], ['7186', 'コンコルディア・フィナンシャルグループ'],
  ['1321', '日経225連動型上場投資信託'], ['1306', 'TOPIX連動型上場投資信託'], ['1570', 'NEXT FUNDS 日経平均レバレッジ'], ['2558', 'MAXIS 米国株式(S&P500)上場投信'],
  ['1655', 'iShares S&P 500 米国株 ETF'], ['2559', 'MAXIS 全世界株式(オール・カントリー)上場投信'], ['1475', 'iShares Core TOPIX ETF'], ['1489', 'NEXT FUNDS 日経平均高配当株50指数連動型'],
];

/** 合併、去重(以代碼為準,先出現的名稱優先) */
export function mergeUnique(...lists) {
  const seen = new Set(), out = [];
  for (const l of lists) for (const [sym, name] of l) { if (!seen.has(sym)) { seen.add(sym); out.push([sym, name]); } }
  return out;
}
