/* 預設值與參考價格。
 * 這些只是「初始參考值」:第一次載入時複製進 localStorage,使用者可在介面中任意修改、新增、刪除。
 * 圖示 key 對應 assets/workhorse/asset-manifest.json 的 reward_icons。
 */
window.Defaults = (function () {
  // 新增貨幣只要加一筆;rateToTWD 預留給日後匯率換算。
  const CURRENCIES = {
    TWD: { code: 'TWD', symbol: 'NT$', name: '新台幣', locale: 'zh-TW', rateToTWD: 1 },
  };

  // 各縣市便當參考價(元)。僅供參考,非官方統計,可自行修改。
  const CITY_LUNCH = {
    '台北市': 110, '新北市': 100, '基隆市': 90, '桃園市': 95, '新竹市': 100, '新竹縣': 95,
    '苗栗縣': 85, '台中市': 100, '彰化縣': 85, '南投縣': 85, '雲林縣': 80, '嘉義市': 85,
    '嘉義縣': 80, '台南市': 90, '高雄市': 95, '屏東縣': 85, '宜蘭縣': 90, '花蓮縣': 90,
    '台東縣': 90, '澎湖縣': 100, '金門縣': 100, '連江縣': 100,
  };

  const CATEGORIES = ['咖啡', '便當', '手搖飲', '火鍋', '娛樂', '交通', '個人目標'];
  const ICON_BY_CATEGORY = {
    '咖啡': 'coffee_to_go', '便當': 'taiwanese_bento', '手搖飲': 'bubble_tea', '火鍋': 'hotpot',
    '娛樂': 'movie_ticket_popcorn', '交通': 'metro_card', '個人目標': 'travel_suitcase_passport',
  };
  const REWARD_ICON_LABELS = {
    coffee_to_go: '咖啡', taiwanese_bento: '便當', bubble_tea: '手搖飲', hotpot: '火鍋',
    movie_ticket_popcorn: '電影', metro_card: '交通', travel_suitcase_passport: '旅行',
    smartphone: '手機', camera: '相機',
  };

  const SETTINGS = {
    hourly: 196,
    start: '09:00',
    end: '18:00',
    autoBreaks: [{ id: 'b1', start: '12:00', end: '13:00', enabled: true }], // 每天自動扣除的固定休息
    regularHours: 8,
    ot: { on: true, h1: 2, m1: 1.34, m2: 1.67 }, // 勞基法平日加班:前 2 小時 1.34 倍,之後 1.67 倍
    dailyGoal: 0, // 0 = 自動(時薪 × 正常工時,含倍率)
    currency: 'TWD',
    city: '台北市',
    notifyEvery: 30, // 分鐘,0 = 關閉
    useSystemNotification: false,
    hideAmount: false,
    mini: false,
  };

  const ITEMS = [
    { id: 'i1', category: '咖啡', name: '7-ELEVEN 大杯美式', price: 45, kind: 'consumable', icon: 'coffee_to_go', enabled: true },
    { id: 'i2', category: '咖啡', name: '7-ELEVEN 大杯拿鐵', price: 55, kind: 'consumable', icon: 'coffee_to_go', enabled: true },
    { id: 'i3', category: '便當', name: '便當', price: 100, kind: 'consumable', icon: 'taiwanese_bento', enabled: true },
    { id: 'i4', category: '手搖飲', name: '手搖飲', price: 55, kind: 'consumable', icon: 'bubble_tea', enabled: true },
    { id: 'i5', category: '火鍋', name: '石二鍋', price: 269, kind: 'consumable', icon: 'hotpot', enabled: true },
    { id: 'i6', category: '娛樂', name: '電影票', price: 300, kind: 'consumable', icon: 'movie_ticket_popcorn', enabled: true },
    { id: 'i7', category: '個人目標', name: '旅行基金', price: 30000, saved: 0, kind: 'goal', icon: 'travel_suitcase_passport', enabled: true },
  ];

  return { CURRENCIES, CITY_LUNCH, CATEGORIES, ICON_BY_CATEGORY, REWARD_ICON_LABELS, SETTINGS, ITEMS };
})();
