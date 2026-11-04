/* 各國「買得起」項目與法定薪資參考值(2026-11 查詢)。每個國家只顯示自己的項目。
 *
 * est:false = 有查到 2026 年公開資料(來源見下);est:true = 只找到舊資料、價格區間或沒查到,屬於估算,介面會顯示「約」。
 * icon 目前是暫用的既有圖示;之後換圖只要改 icon key(或依 ref 對應新圖)。
 * VERSION 變更時,使用者沒改過的預設項目會自動換成新清單;自己新增/改過的項目保留。
 *
 * ── 台灣 TWD ──
 *  7-ELEVEN 大杯美式 45(新聞原價 45)、50嵐 波霸紅茶拿鐵 中杯 60(北部,食尚玩家 2025-12)、鬍鬚張 小碗魯肉飯 39(2026-01 鬍鬚張澄清凍漲)、
 *  鼎泰豐 小籠包 10 顆 290(2026-06-22 起)、高鐵 台北→左營 標準車廂 1,490(2026 現行)、最低時薪 196(2026)
 *  估算:雞排 約 85(派克 2023 年價格)、牛肉麵 約 200(2026 個別店 160–250)、電影 約 340(雙北一般廳 320–370)、捷運起跳 20、便當 100、個人火鍋 269
 * ── 日本 JPY ──
 *  セブンカフェ L 220(2026-05)、吉野家 牛丼並盛 498(2024-07 起據え置き)、ラーメン店 平均客単価 1,005(2025, CREST)、スシロー 1皿 120、
 *  ほっともっと のり弁当 480(470–480, 2026-08)、鳥貴族 全品 410(2026-10-01 起)、トリキ晩餐会 4,100(同)、東京都 銭湯 600(2026-08-01 起)、
 *  映画 一般 2,000(TOHO, 一部都心 2,200)、東京メトロ 初乗り 180、新幹線 東京→新大阪 のぞみ指定 14,720(通常期)、最低賃金 全国加重平均 1,177(2026 年度)
 *  估算:セブン ツナマヨおにぎり 約 197(2026-02 個人サイト)
 * ── 菲律賓 PHP ──
 *  Jollibee Chickenjoy Sarap Savers(雞+飯+飲料)99(2026-01, Spot.ph)、Chowking Coco-Mango Halo-halo 起 79(2026)、
 *  傳統 Jeepney 起跳 14(LTFRB 2026-03-19 起)、NCR 最低日薪 755(Wage Order NCR-28, 2026-09-26)→ 時薪 94.38
 *  估算:Balut 約 20(₱15–25)、Lechon 1kg 約 1,000(₱1,000–1,500)、San Miguel 330ml 約 70(₱66–77 零售)、SM 一般 2D 約 350(₱275–400)
 */
window.Prices = (function () {
  const VERSION = 2;
  const OT_TW = { on: true, h1: 2, m1: 1.34, m2: 1.67 }; // 勞基法:前 2 小時 1.34、之後 1.67
  const OT_FLAT = { on: true, h1: 2, m1: 1.25, m2: 1.25 }; // 日本 / 菲律賓:平日加班 125%

  const I = (ref, category, price, icon, est, kind) => ({ ref, category, nameKey: 'item.' + ref, price, icon, est: !!est, kind: kind || 'consumable' });
  const COUNTRIES = {
    TW: {
      currency: 'TWD', hourly: 196, ot: OT_TW, markets: ['TW', 'US'],
      items: [
        I('tw.americano', 'coffee', 45, 'coffee_to_go', false),
        I('tw.boba', 'drink', 60, 'bubble_tea', false),
        I('tw.lurou', 'food', 39, 'taiwanese_bento', false),
        I('tw.chicken', 'food', 85, 'taiwanese_bento', true),
        I('tw.beefnoodle', 'food', 200, 'hotpot', true),
        I('tw.xlb', 'food', 290, 'taiwanese_bento', false),
        I('tw.bento', 'bento', 100, 'taiwanese_bento', true),
        I('tw.hotpot', 'hotpot', 269, 'hotpot', true),
        I('tw.movie', 'fun', 340, 'movie_ticket_popcorn', true),
        I('tw.mrt', 'transit', 20, 'metro_card', true),
        I('tw.hsr', 'transit', 1490, 'metro_card', false),
        I('travel', 'goal', 30000, 'travel_suitcase_passport', true, 'goal'),
      ],
    },
    JP: {
      currency: 'JPY', hourly: 1177, ot: OT_FLAT, markets: ['JP', 'US'],
      items: [
        I('jp.cafe', 'coffee', 220, 'coffee_to_go', false),
        I('jp.onigiri', 'food', 197, 'taiwanese_bento', true),
        I('jp.gyudon', 'food', 498, 'taiwanese_bento', false),
        I('jp.ramen', 'food', 1005, 'hotpot', false),
        I('jp.sushi', 'food', 120, 'taiwanese_bento', false),
        I('jp.bento', 'bento', 480, 'taiwanese_bento', false),
        I('jp.tori', 'alcohol', 410, 'bubble_tea', false),
        I('jp.toriall', 'alcohol', 4100, 'hotpot', false),
        I('jp.sento', 'fun', 600, 'travel_suitcase_passport', false),
        I('jp.movie', 'fun', 2000, 'movie_ticket_popcorn', false),
        I('jp.metro', 'transit', 180, 'metro_card', false),
        I('jp.shinkansen', 'transit', 14720, 'metro_card', false),
        I('travel', 'goal', 150000, 'travel_suitcase_passport', true, 'goal'),
      ],
    },
    PH: {
      currency: 'PHP', hourly: 94.38, ot: OT_FLAT, markets: ['US'], // ₱755/日 ÷ 8 小時(NCR 非農業);菲律賓股市(PSE)暫不支援
      items: [
        I('ph.chickenjoy', 'food', 99, 'taiwanese_bento', false),
        I('ph.halohalo', 'drink', 79, 'bubble_tea', false),
        I('ph.balut', 'food', 20, 'taiwanese_bento', true),
        I('ph.lechon', 'food', 1000, 'hotpot', true),
        I('ph.beer', 'alcohol', 70, 'bubble_tea', true),
        I('ph.jeepney', 'transit', 14, 'metro_card', false),
        I('ph.movie', 'fun', 350, 'movie_ticket_popcorn', true),
        I('travel', 'goal', 25000, 'travel_suitcase_passport', true, 'goal'),
      ],
    },
  };

  /** 產生該國的預設項目(新的物件) */
  function itemsFor(country) {
    const c = COUNTRIES[country] || COUNTRIES.TW;
    return c.items.map((it) => ({
      id: 'd-' + it.ref, ref: it.ref, category: it.category, nameKey: it.nameKey, name: '',
      price: it.price, kind: it.kind, icon: it.icon, est: it.est, enabled: true,
      ...(it.kind === 'goal' ? { saved: 0 } : {}),
    }));
  }
  /** 預設清單更新時:保留使用者自己新增 / 改過的項目與股票,其餘換成新的預設 */
  function upgrade(country, list) {
    const keep = (list || []).filter((it) => !it.ref || it.custom || it.kind === 'stock');
    const keptRefs = new Set(keep.filter((it) => it.ref).map((it) => it.ref));
    return itemsFor(country).filter((it) => !keptRefs.has(it.ref)).concat(keep);
  }
  /** 依時區 / 語言猜使用者所在國家 */
  function detect(tz, lang) {
    if (/Manila/i.test(tz || '')) return 'PH';
    if (/Tokyo/i.test(tz || '') || /^ja/i.test(lang || '')) return 'JP';
    if (/^(fil|tl)/i.test(lang || '') || /-PH$/i.test(lang || '')) return 'PH';
    return 'TW';
  }
  return { VERSION, COUNTRIES, itemsFor, upgrade, detect };
})();
