/* 預設值與參考價格。
 * 這些只是「初始參考值」:第一次載入時複製進 localStorage,使用者可在介面中任意修改、新增、刪除。
 * 圖示 key 對應 assets/workhorse/asset-manifest.json 的 reward_icons。
 */
window.Defaults = (function () {
  // 新增貨幣只要加一筆;rateToTWD 預留給日後匯率換算。
  const CURRENCIES = {
    TWD: { code: 'TWD', symbol: 'NT$', rateToTWD: 1 },
  };

  // 各縣市便當參考價(元)。僅供參考,非官方統計,可自行修改。
  const CITY_LUNCH = {
    '台北市': 110, '新北市': 100, '基隆市': 90, '桃園市': 95, '新竹市': 100, '新竹縣': 95,
    '苗栗縣': 85, '台中市': 100, '彰化縣': 85, '南投縣': 85, '雲林縣': 80, '嘉義市': 85,
    '嘉義縣': 80, '台南市': 90, '高雄市': 95, '屏東縣': 85, '宜蘭縣': 90, '花蓮縣': 90,
    '台東縣': 90, '澎湖縣': 100, '金門縣': 100, '連江縣': 100,
  };

  const CATEGORIES = ['coffee', 'bento', 'drink', 'hotpot', 'fun', 'transit', 'goal'];
  const ICON_BY_CATEGORY = {
    coffee: 'coffee_to_go', bento: 'taiwanese_bento', drink: 'bubble_tea', hotpot: 'hotpot',
    fun: 'movie_ticket_popcorn', transit: 'metro_card', goal: 'travel_suitcase_passport',
  };
  // 舊版(中文類別)→ 新版類別 id,用於資料遷移
  const LEGACY_CATEGORY = { '咖啡': 'coffee', '便當': 'bento', '手搖飲': 'drink', '火鍋': 'hotpot', '娛樂': 'fun', '交通': 'transit', '個人目標': 'goal' };
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
    currency: 'TWD',
    city: '台北市',
    notifyEvery: 30, // 分鐘,0 = 關閉
    useSystemNotification: false,
    hideAmount: false,
    lang: '', // 空字串 = 依瀏覽器語言
    lastFinal: 0, // 最後一個已寫入流水帳的日子(內部使用)
  };

  const ITEMS = [
    { id: 'i1', category: 'coffee', nameKey: 'item.americano', name: '', price: 45, kind: 'consumable', icon: 'coffee_to_go', enabled: true },
    { id: 'i2', category: 'coffee', nameKey: 'item.latte', name: '', price: 55, kind: 'consumable', icon: 'coffee_to_go', enabled: true },
    { id: 'i3', category: 'bento', nameKey: 'item.bento', name: '', price: 100, kind: 'consumable', icon: 'taiwanese_bento', enabled: true },
    { id: 'i4', category: 'drink', nameKey: 'item.boba', name: '', price: 55, kind: 'consumable', icon: 'bubble_tea', enabled: true },
    { id: 'i5', category: 'hotpot', nameKey: 'item.hotpot', name: '', price: 269, kind: 'consumable', icon: 'hotpot', enabled: true },
    { id: 'i6', category: 'fun', nameKey: 'item.movie', name: '', price: 300, kind: 'consumable', icon: 'movie_ticket_popcorn', enabled: true },
    { id: 'i7', category: 'goal', nameKey: 'item.travel', name: '', price: 30000, saved: 0, kind: 'goal', icon: 'travel_suitcase_passport', enabled: true },
  ];

  return { CURRENCIES, CITY_LUNCH, CATEGORIES, ICON_BY_CATEGORY, LEGACY_CATEGORY, REWARD_ICONS, SETTINGS, ITEMS };
})();
