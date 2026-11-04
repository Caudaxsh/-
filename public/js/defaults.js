/* 預設值與參考價格。
 * 這些只是「初始參考值」:第一次載入時複製進 localStorage,使用者可在介面中任意修改、新增、刪除。
 * 圖示 key 對應 assets/workhorse/asset-manifest.json 的 reward_icons。
 */
window.Defaults = (function () {
  // 新增貨幣只要加一筆。
  const CURRENCIES = {
    TWD: { code: 'TWD', symbol: 'NT$', rateToTWD: 1 },
    JPY: { code: 'JPY', symbol: '¥', rateToTWD: 0 },   // rateToTWD 預留,實際換算用即時匯率
    PHP: { code: 'PHP', symbol: '₱', rateToTWD: 0 },
  };
  // 國家 → 幣別;各國物價與法定薪資參考值在 prices.js
  const COUNTRIES = ['TW', 'JP', 'PH'];

  const CATEGORIES = ['drinks', 'food', 'fun', 'travel', 'tech', 'goal']; // 咖啡與飲料 / 美食與零食 / 娛樂 / 交通與旅行 / 3C / 個人目標(股票另有專屬流程)
  const ICON_BY_CATEGORY = {
    drinks: 'bubble_tea', food: 'taiwanese_bento', fun: 'movie_ticket_popcorn', travel: 'metro_card', tech: 'smartphone', goal: 'travel_suitcase_passport',
  };
  // 舊版(中文類別)→ 新版類別 id,用於資料遷移
  const LEGACY_CATEGORY = { '咖啡': 'coffee', '便當': 'bento', '手搖飲': 'drink', '火鍋': 'hotpot', '娛樂': 'fun', '交通': 'transit', '個人目標': 'goal' };
  // 圖示可選:換算圖示(只寫 key)+ 介面圖示(完整 ref,含點號)。之後換新圖只要改素材包。
  const UI_ICON_CHOICES = ['ui_icons.wallet', 'ui_icons.money_pouch', 'ui_icons.goal_flag'];
  const REWARD_ICONS = ['coffee_to_go', 'taiwanese_bento', 'bubble_tea', 'hotpot', 'movie_ticket_popcorn', 'metro_card', 'travel_suitcase_passport', 'smartphone', 'camera'];

  const SETTINGS = {
    hourly: 196,
    workDays: [1, 2, 3, 4, 5], // 0=日 … 6=六
    start: '09:00',
    end: '18:00',
    autoBreaks: [{ id: 'b1', start: '12:00', end: '13:00', enabled: true }], // 每天自動扣除的固定休息
    regularHours: 8,
    ot: { on: true, h1: 2, m1: 1.34, m2: 1.67 }, // 勞基法平日加班:前 2 小時 1.34 倍,之後 1.67 倍
    dailyGoal: 0, // 0 = 自動(時薪 × 正常工時,含倍率)
    country: 'TW',
    currency: 'TWD', // 由國家決定
    wageTouched: false, // 使用者改過時薪 → 切換國家時不再自動換成當地最低工資
    otTouched: false,
    quoteProxy: '', // 股價查詢代理(選填)
    notifyEvery: 30, // 分鐘,0 = 關閉
    useSystemNotification: false,
    hideAmount: false,
    nextTarget: 'auto', // 首頁「下一個目標」卡追蹤哪個項目('auto' = 最快能換到的;否則是項目 id)
    lang: '', // 空字串 = 依瀏覽器語言
    lastFinal: 0, // 最後一個已寫入流水帳的日子(內部使用)
  };

  const ITEMS = window.Prices.itemsFor('TW');

  return { CURRENCIES, COUNTRIES, CATEGORIES, ICON_BY_CATEGORY, LEGACY_CATEGORY, REWARD_ICONS, UI_ICON_CHOICES, SETTINGS, ITEMS };
})();
