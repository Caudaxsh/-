/* 各國「這筆錢能買啥?」資料(2026-11 查詢)。每個國家各自獨立,不用匯率硬轉別國價格。
 *
 * 結構:
 *   featured  → 首次載入只顯示這 4 項:當地代表性飲品、代表性餐點、一般 2D 成人電影票、旅行基金(目標,可改)
 *   catalog   → 「探索更多」目錄(使用者按「加入」才會出現在自己的清單)
 *   goalPresets → 「個人目標」快速建立的預設(手機/相機/筆電/日本旅行/鏡頭)
 *
 * 每一項:src = 參考價來源、date = 資料日期、est = true 表示只找到舊資料/價格區間/沒查到,屬於估算(畫面顯示「約」)。
 * 所有價格都只是初始參考值,使用者可在介面修改;改過的項目切換國家或更新預設清單時都不會被覆蓋。
 *
 * ── 來源(2026-11 查詢) ──
 *  TW  50嵐 珍珠奶茶 中杯 NT$50(食尚玩家,北部,2025-12)│鬍鬚張 小碗魯肉飯 NT$39(2026-01 凍漲說明)│威秀雙北一般廳全票 約 320–370(Money101 2026)
 *      日本 5 天 4 夜自由行 NT$25,000–60,000、東京約 37,000–43,000(Money101 / uptogo 2026)│鼎泰豐小籠包 10 顆 290(2026-06-22 起)
 *      高鐵台北→左營 1,490│iPhone 17 256GB 29,900(Apple 台灣發表價 2025-09)│最低時薪 196(2026)
 *  JP  セブンカフェ R ¥140・L ¥220(pricey.jp 2026-05)│吉野家 牛丼並盛 ¥498(2024-07〜據え置き)│TOHOシネマズ 一般 ¥2,000(一部都心 ¥2,200 2026-07〜)
 *      京都・大阪 2泊3日 約 ¥80,000/人(新幹線往復約3万+宿+食)│鳥貴族 ¥410(2026-10-01〜)│銭湯 東京都 ¥600(2026-08-01〜)│新幹線 のぞみ指定 ¥14,720
 *      iPhone 17 256GB ¥129,800(Apple 日本 2025-09)│最低賃金 全国加重平均 ¥1,177(2026 年度)
 *  PH  Buko juice 街邊攤 約 ₱30–50、連鎖店 ₱71–160(uptogo / foodpanda 標價,年份未註明 → 估算)│Jollibee Chickenjoy 含飯 solo 約 ₱106(2026-09 第三方整理;Sarap Savers 套餐促銷 ₱99)
 *      SM 一般 2D ₱275–400(SkedCheck / fomo.ph 2026-11)│Boracay 旅行預算範例約 ₱20K(Klook PH)│Jeepney 起跳 ₱14(LTFRB 2026-03-19〜)
 *      iPhone 17 256GB ₱57,990(Apple PH 2025-09;Lazada 2026-05 仍同價)│NCR 最低日薪 ₱755(NCR-28, 2026-09-26)→ 時薪 94.38
 */
window.Prices = (function () {
  const VERSION = 3;
  const AS_OF = '2026-11';
  const OT_TW = { on: true, h1: 2, m1: 1.34, m2: 1.67 }; // 勞基法:前 2 小時 1.34、之後 1.67
  const OT_FLAT = { on: true, h1: 2, m1: 1.25, m2: 1.25 }; // 日本 / 菲律賓:平日加班 125%

  // E(ref, 分類, 價格, 圖示, 是否估算, 來源, 日期, 其他欄位)
  const E = (ref, category, price, icon, est, src, date, extra) => ({ ref, category, nameKey: 'item.' + ref, price, icon, est: !!est, src, date, kind: 'consumable', ...(extra || {}) });
  const FEATURED = { featured: true };
  const GOAL = { kind: 'goal', category: 'goal' };

  const COUNTRIES = {
    TW: {
      currency: 'TWD', hourly: 196, ot: OT_TW, markets: ['TW', 'US'],
      items: [
        // ── 精選 4 項 ──
        E('tw.boba50', 'drinks', 50, 'bubble_tea', false, '食尚玩家 50嵐菜單(北部)', '2025-12', FEATURED),
        E('tw.lurou', 'food', 39, 'taiwanese_bento', false, '鬍鬚張官方說明(媒體報導)', '2026-01', FEATURED),
        E('tw.movie2d', 'fun', 340, 'movie_ticket_popcorn', true, 'Money101 威秀票價整理(雙北一般廳 320–370)', '2026', FEATURED),
        E('tw.trip', 'goal', 40000, 'travel_suitcase_passport', true, 'Money101 / uptogo 日本 5 天 4 夜預算(25,000–60,000)', '2026', { ...FEATURED, ...GOAL }),
        // ── 探索更多 ──
        E('tw.americano', 'drinks', 45, 'coffee_to_go', false, '產品需求指定參考價', '2026-11'),
        E('tw.latte', 'drinks', 55, 'coffee_to_go', false, '產品需求指定參考價', '2026-11'),
        E('tw.boba60', 'drinks', 60, 'bubble_tea', false, '食尚玩家 50嵐菜單(波霸紅茶拿鐵 中杯)', '2025-12'),
        E('tw.chicken', 'food', 85, 'taiwanese_bento', true, '派克雞排漲價報導(2023,無 2026 資料)', '2023-04'),
        E('tw.beefnoodle', 'food', 200, 'hotpot', true, '各名店 160–250 的中間值(2026 新聞)', '2026'),
        E('tw.xlb', 'food', 290, 'taiwanese_bento', false, '鼎泰豐調價公告(2026-06-22 起)', '2026-06'),
        E('tw.bento', 'food', 100, 'taiwanese_bento', true, '產品需求指定參考價', '2026-11'),
        E('tw.hotpot', 'food', 269, 'hotpot', true, '石二鍋參考價(產品需求指定,2026 未查證)', '2026-11'),
        E('tw.movieSp', 'fun', 520, 'movie_ticket_popcorn', true, 'Money101 威秀特殊廳(IMAX/4DX 約 420–870)', '2026'),
        E('tw.mrt', 'travel', 20, 'metro_card', true, '台北捷運起跳票價(2026 未查證)', '2026-11'),
        E('tw.hsr', 'travel', 1490, 'metro_card', false, '高鐵 台北→左營 標準車廂(2026 現行,可能調漲)', '2026'),
        E('tech.iphone.tw', 'tech', 29900, 'smartphone', false, 'Apple 台灣 iPhone 17 256GB 發表價', '2025-09'),
        E('tech.macbook.tw', 'tech', 41900, 'ui_icons.wallet', true, 'MacBook Air 13 M4 16GB/512GB(比價站 2025-03)', '2025-03'),
      ],
      goalPresets: [
        { key: 'phone', price: 29900, icon: 'smartphone', est: false, src: 'Apple 台灣 iPhone 17 256GB 發表價', date: '2025-09' },
        { key: 'camera', price: 25000, icon: 'camera', est: true, src: '入門無反相機機身(估算)', date: '2026' },
        { key: 'laptop', price: 41900, icon: 'ui_icons.wallet', est: true, src: 'MacBook Air 13 M4(比價站 2025-03)', date: '2025-03' },
        { key: 'japan', price: 40000, icon: 'travel_suitcase_passport', est: true, src: 'Money101 / uptogo 日本 5 天 4 夜預算', date: '2026' },
        { key: 'lens', price: 15000, icon: 'camera', est: true, src: '相機鏡頭(估算)', date: '2026' },
      ],
    },

    JP: {
      currency: 'JPY', hourly: 1177, ot: OT_FLAT, markets: ['JP', 'US'],
      items: [
        // ── 精選 4 項 ──
        E('jp.cafeR', 'drinks', 140, 'coffee_to_go', false, 'pricey.jp(Seven Café R サイズ)', '2026-05', FEATURED),
        E('jp.gyudon', 'food', 498, 'taiwanese_bento', false, 'pricey.jp / 吉野家(牛丼並盛 店内)', '2025-05', FEATURED),
        E('jp.movie2d', 'fun', 2000, 'movie_ticket_popcorn', false, 'TOHOシネマズ 一般料金(一部都心館 ¥2,200)', '2026-07', FEATURED),
        E('jp.trip', 'goal', 80000, 'travel_suitcase_passport', true, '京都・大阪 2泊3日の目安(約8万円/人)', '2026', { ...FEATURED, ...GOAL }),
        // ── 探索更多 ──
        E('jp.cafeL', 'drinks', 220, 'coffee_to_go', false, 'pricey.jp(Seven Café L サイズ ホット)', '2026-05'),
        E('jp.onigiri', 'food', 197, 'taiwanese_bento', true, 'pricey.jp(セブン ツナマヨ・個人サイト)', '2026-02'),
        E('jp.ramen', 'food', 1005, 'hotpot', false, 'CREST / 日本経済新聞(ラーメン店の平均客単価 2025)', '2025'),
        E('jp.sushi', 'food', 120, 'taiwanese_bento', false, 'スシロー 最低価格(2022-10〜)', '2022-10'),
        E('jp.bento', 'food', 480, 'taiwanese_bento', false, '週刊アスキー(ほっともっと のり弁当 470–480)', '2026-08'),
        E('jp.tori', 'food', 410, 'bubble_tea', false, '鳥貴族 均一価格(2026-10-01〜)', '2026-10'),
        E('jp.toriall', 'food', 4100, 'hotpot', false, '鳥貴族 トリキ晩餐会(食べ飲み放題)', '2026-10'),
        E('jp.sento', 'fun', 600, 'travel_suitcase_passport', false, '東京都 銭湯 大人料金(2026-08-01〜)', '2026-08'),
        E('jp.metro', 'travel', 180, 'metro_card', false, '東京メトロ 初乗り(切符、2023 改定後)', '2023-03'),
        E('jp.shinkansen', 'travel', 14720, 'metro_card', false, 'JR東海 のぞみ 東京→新大阪 指定席 通常期', '2026'),
        E('tech.iphone.jp', 'tech', 129800, 'smartphone', false, 'Apple 日本 iPhone 17 256GB 発売価格', '2025-09'),
        E('tech.macbook.jp', 'tech', 164800, 'ui_icons.wallet', true, 'MacBook Air 13 M4 16GB/256GB(比価サイト 2025-03)', '2025-03'),
      ],
      goalPresets: [
        { key: 'phone', price: 129800, icon: 'smartphone', est: false, src: 'Apple 日本 iPhone 17 256GB', date: '2025-09' },
        { key: 'camera', price: 90000, icon: 'camera', est: true, src: '入門ミラーレス機(目安)', date: '2026' },
        { key: 'laptop', price: 164800, icon: 'ui_icons.wallet', est: true, src: 'MacBook Air 13 M4(比価サイト 2025-03)', date: '2025-03' },
        { key: 'japan', price: 80000, icon: 'travel_suitcase_passport', est: true, src: '京都・大阪 2泊3日の目安', date: '2026' },
        { key: 'lens', price: 50000, icon: 'camera', est: true, src: 'カメラレンズ(目安)', date: '2026' },
      ],
    },

    PH: {
      currency: 'PHP', hourly: 94.38, ot: OT_FLAT, markets: ['US'], // ₱755/日 ÷ 8 小時(NCR 非農業);菲律賓股市(PSE)暫不支援
      items: [
        // ── 精選 4 項 ──
        E('ph.buko', 'drinks', 50, 'bubble_tea', true, 'uptogo(街邊攤約 ₱30–50;連鎖店 ₱71–160)', '年份未註明', FEATURED),
        E('ph.chickenjoy', 'food', 106, 'taiwanese_bento', true, 'Jollibee 點餐頁(第三方整理);Sarap Savers 促銷 ₱99', '2026-09', FEATURED),
        E('ph.movie2d', 'fun', 350, 'movie_ticket_popcorn', true, 'SkedCheck / fomo.ph(SM 一般 2D ₱275–400)', '2026-11', FEATURED),
        E('ph.trip', 'goal', 20000, 'travel_suitcase_passport', true, 'Klook PH Boracay 預算範例(約 ₱20K)', '2026', { ...FEATURED, ...GOAL }),
        // ── 探索更多 ──
        E('ph.halohalo', 'drinks', 79, 'bubble_tea', true, 'Chowking Coco-Mango Halo-Halo 起價', '2026-05'),
        E('ph.beer', 'drinks', 70, 'bubble_tea', true, 'San Miguel 330ml 零售(₱66–77)', '2026'),
        E('ph.balut', 'food', 20, 'taiwanese_bento', true, 'Balut 街邊價(₱15–25,年份未註明)', '未註明'),
        E('ph.lechon', 'food', 1000, 'hotpot', true, 'Lechon 每公斤(₱1,000–1,500)', '2026'),
        E('ph.hotpot', 'food', 699, 'hotpot', true, 'Wow Cow 火鍋吃到飽(2025 標價)', '2025-05'),
        E('ph.movieSp', 'fun', 700, 'movie_ticket_popcorn', true, 'IMAX / 特殊廳(約 ₱650–800)', '2026'),
        E('ph.jeepney', 'travel', 14, 'metro_card', false, 'LTFRB 傳統 Jeepney 起跳價(2026-03-19 起)', '2026-03'),
        E('tech.iphone.ph', 'tech', 57990, 'smartphone', false, 'Apple 菲律賓 iPhone 17 256GB(Lazada 2026-05 仍同價)', '2025-09'),
        E('tech.macbook.ph', 'tech', 69990, 'ui_icons.wallet', true, 'MacBook Air 13 M4(菲律賓無可靠資料,估算)', '2026'),
      ],
      goalPresets: [
        { key: 'phone', price: 57990, icon: 'smartphone', est: false, src: 'Apple 菲律賓 iPhone 17 256GB', date: '2025-09' },
        { key: 'camera', price: 40000, icon: 'camera', est: true, src: '入門無反相機(估算)', date: '2026' },
        { key: 'laptop', price: 69990, icon: 'ui_icons.wallet', est: true, src: 'MacBook Air 13 M4(估算)', date: '2026' },
        { key: 'japan', price: 60000, icon: 'travel_suitcase_passport', est: true, src: '菲律賓出發日本 5 天(估算)', date: '2026' },
        { key: 'lens', price: 25000, icon: 'camera', est: true, src: '相機鏡頭(估算)', date: '2026' },
      ],
    },
  };

  const toItem = (it) => ({
    id: 'd-' + it.ref, ref: it.ref, category: it.category, nameKey: it.nameKey, name: '',
    price: it.price, kind: it.kind, icon: it.icon, est: it.est, src: it.src, srcDate: it.date,
    featured: !!it.featured, enabled: true, ...(it.kind === 'goal' ? { saved: 0 } : {}),
  });
  /** 首次載入的預設清單:只有精選 4 項 */
  function itemsFor(country) {
    const c = COUNTRIES[country] || COUNTRIES.TW;
    return c.items.filter((it) => it.featured).map(toItem);
  }
  /** 「探索更多」目錄(尚未加入的項目由介面過濾) */
  function catalogFor(country) {
    const c = COUNTRIES[country] || COUNTRIES.TW;
    return c.items.filter((it) => !it.featured).map(toItem);
  }
  function goalPresetsFor(country) { return (COUNTRIES[country] || COUNTRIES.TW).goalPresets; }
  /** 預設清單更新時:保留使用者自己新增 / 改過的項目與股票;沒改過的舊預設換成新的精選項 */
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
  /** 舊版分類 id → 新版(咖啡與飲料 / 美食與零食 / 娛樂 / 交通與旅行 / 3C / 個人目標) */
  const GROUP_OF = {
    coffee: 'drinks', drink: 'drinks', drinks: 'drinks', alcohol: 'food', food: 'food', bento: 'food', hotpot: 'food',
    fun: 'fun', transit: 'travel', travel: 'travel', tech: 'tech', goal: 'goal', stock: 'stock',
  };
  const GROUPS = ['drinks', 'food', 'fun', 'travel', 'tech', 'goal'];
  const groupOf = (cat) => GROUP_OF[cat] || 'food';
  return { VERSION, AS_OF, COUNTRIES, GROUPS, itemsFor, catalogFor, goalPresetsFor, upgrade, detect, groupOf };
})();
