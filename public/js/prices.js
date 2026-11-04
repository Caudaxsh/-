/* 各國預設物價與法定薪資參考值(2026 年底查詢)。
 *
 * est:false = 有查到公開資料(來源見下);est:true = 沒查到可靠數字,屬於估算,介面會顯示「約」。
 * 所有數字都只是「初始參考值」,使用者可在介面任意修改;改過的項目切換國家時不會被覆蓋。
 *
 * 來源(2026-11 查詢):
 *  JP  Seven Café R ¥140 / L ¥220(pricey.jp, 2026-05)、ほっともっと のり弁当 ¥470–480(週刊アスキー, 2026-08)、
 *      映画 一般 ¥2,000(TOHOシネマズ 2026-07 起部分都心館 ¥2,200)、東京メトロ 初乗り ¥180(2023 改定後, 2026 一般區間未再調整)、
 *      最低賃金 全国加重平均 ¥1,177(JIL, 2026 年度)、しゃぶ葉 ランチ 食べ放題 約 ¥2,000 前後(クーポン後 ¥1,999 の記事より推定)
 *  PH  NCR 最低日薪 ₱755(Wage Order NCR-28, 2026-09-26 生效, 非農業)、Gong cha 中杯奶茶 約 ₱125(外送平台標價)、
 *      電影 一般 2D 約 ₱300–400(各媒體說法不一)、Wow Cow 火鍋吃到飽 ₱699(2025 年標價)、7-Eleven Café 咖啡/Jollibee 套餐/MRT 票價 無可靠 2026 數字 → 估算
 *  TW  咖啡/便當/手搖/火鍋 為產品需求指定的參考值;最低時薪 NT$196(2026)
 */
window.Prices = (function () {
  const OT_TW = { on: true, h1: 2, m1: 1.34, m2: 1.67 }; // 勞基法:前 2 小時 1.34、之後 1.67
  const OT_FLAT = { on: true, h1: 2, m1: 1.25, m2: 1.25 }; // 日本 / 菲律賓:平日加班 125%

  const COUNTRIES = {
    TW: {
      currency: 'TWD', hourly: 196, ot: OT_TW, market: 'TW',
      items: [
        { ref: 'coffee1', category: 'coffee', nameKey: 'item.americano', price: 45, icon: 'coffee_to_go', est: false },
        { ref: 'coffee2', category: 'coffee', nameKey: 'item.latte', price: 55, icon: 'coffee_to_go', est: false },
        { ref: 'bento', category: 'bento', nameKey: 'item.bento', price: 100, icon: 'taiwanese_bento', est: false },
        { ref: 'boba', category: 'drink', nameKey: 'item.boba', price: 55, icon: 'bubble_tea', est: false },
        { ref: 'hotpot', category: 'hotpot', nameKey: 'item.hotpot', price: 269, icon: 'hotpot', est: false },
        { ref: 'movie', category: 'fun', nameKey: 'item.movie', price: 300, icon: 'movie_ticket_popcorn', est: true },
        { ref: 'transit', category: 'transit', nameKey: 'item.tw.transit', price: 20, icon: 'metro_card', est: true },
        { ref: 'travel', category: 'goal', nameKey: 'item.travel', price: 30000, icon: 'travel_suitcase_passport', est: true, kind: 'goal' },
      ],
    },
    JP: {
      currency: 'JPY', hourly: 1177, ot: OT_FLAT, market: 'JP',
      items: [
        { ref: 'coffee1', category: 'coffee', nameKey: 'item.jp.coffeeL', price: 220, icon: 'coffee_to_go', est: false },
        { ref: 'coffee2', category: 'coffee', nameKey: 'item.jp.coffeeR', price: 140, icon: 'coffee_to_go', est: false },
        { ref: 'bento', category: 'bento', nameKey: 'item.jp.bento', price: 480, icon: 'taiwanese_bento', est: false },
        { ref: 'boba', category: 'drink', nameKey: 'item.jp.boba', price: 600, icon: 'bubble_tea', est: true },
        { ref: 'hotpot', category: 'hotpot', nameKey: 'item.jp.hotpot', price: 2199, icon: 'hotpot', est: true },
        { ref: 'movie', category: 'fun', nameKey: 'item.jp.movie', price: 2000, icon: 'movie_ticket_popcorn', est: false },
        { ref: 'transit', category: 'transit', nameKey: 'item.jp.transit', price: 180, icon: 'metro_card', est: false },
        { ref: 'travel', category: 'goal', nameKey: 'item.travel', price: 150000, icon: 'travel_suitcase_passport', est: true, kind: 'goal' },
      ],
    },
    PH: {
      currency: 'PHP', hourly: 94.38, ot: OT_FLAT, market: 'US', // ₱755/日 ÷ 8 小時(NCR 非農業)
      items: [
        { ref: 'coffee1', category: 'coffee', nameKey: 'item.ph.coffee', price: 60, icon: 'coffee_to_go', est: true },
        { ref: 'coffee2', category: 'coffee', nameKey: 'item.ph.coffee2', price: 90, icon: 'coffee_to_go', est: true },
        { ref: 'bento', category: 'bento', nameKey: 'item.ph.lunch', price: 100, icon: 'taiwanese_bento', est: true },
        { ref: 'boba', category: 'drink', nameKey: 'item.ph.boba', price: 125, icon: 'bubble_tea', est: true },
        { ref: 'hotpot', category: 'hotpot', nameKey: 'item.ph.hotpot', price: 699, icon: 'hotpot', est: true },
        { ref: 'movie', category: 'fun', nameKey: 'item.ph.movie', price: 350, icon: 'movie_ticket_popcorn', est: true },
        { ref: 'transit', category: 'transit', nameKey: 'item.ph.transit', price: 20, icon: 'metro_card', est: true },
        { ref: 'travel', category: 'goal', nameKey: 'item.travel', price: 25000, icon: 'travel_suitcase_passport', est: true, kind: 'goal' },
      ],
    },
  };

  /** 產生該國的預設項目(新的物件,id 以 ref 為基礎) */
  function itemsFor(country) {
    const c = COUNTRIES[country] || COUNTRIES.TW;
    return c.items.map((it) => ({
      id: 'd-' + it.ref, ref: it.ref, category: it.category, nameKey: it.nameKey, name: '',
      price: it.price, kind: it.kind || 'consumable', icon: it.icon, est: !!it.est, enabled: true,
      ...(it.kind === 'goal' ? { saved: 0 } : {}),
    }));
  }
  /** 依時區 / 語言猜使用者所在國家 */
  function detect(tz, lang) {
    if (/Manila/i.test(tz || '')) return 'PH';
    if (/Tokyo/i.test(tz || '') || /^ja/i.test(lang || '')) return 'JP';
    if (/^(fil|tl)/i.test(lang || '') || /-PH$/i.test(lang || '')) return 'PH';
    return 'TW';
  }
  return { COUNTRIES, itemsFor, detect };
})();
