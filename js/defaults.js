/* 預設值與參考價格。
 * 所有價格都只是「初始參考值」,會在第一次載入時複製進 localStorage,
 * 使用者可在介面中任意修改、新增、刪除;程式邏輯不依賴這些數字。
 */
window.Defaults = (function () {
  // 貨幣表:新增貨幣只要在這裡加一筆。rate 為「1 單位該貨幣 = 多少 TWD」,
  // 目前計算全程使用單一貨幣,rate 預留給日後做匯率換算。
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

  const CATEGORIES = ['咖啡', '便當', '手搖飲', '火鍋', '娛樂', '個人目標'];

  const SETTINGS = {
    hourly: 196,
    start: '09:00',
    end: '18:00',
    breaks: [{ id: 'b1', start: '12:00', end: '13:00', enabled: true }],
    regularHours: 8,
    ot: { on: true, h1: 2, m1: 1.34, m2: 1.67 }, // 勞基法:前 2 小時 1.34 倍,之後 1.67 倍
    continueOT: false,
    currency: 'TWD',
    city: '台北市',
    notifyEvery: 30, // 分鐘,0 = 關閉
    useSystemNotification: false,
    hideAmount: false,
    mini: false,
  };

  const ITEMS = [
    { id: 'i1', category: '咖啡', name: '7-ELEVEN 大杯美式', price: 45, kind: 'consumable', enabled: true },
    { id: 'i2', category: '咖啡', name: '7-ELEVEN 大杯拿鐵', price: 55, kind: 'consumable', enabled: true },
    { id: 'i3', category: '便當', name: '便當', price: 100, kind: 'consumable', enabled: true },
    { id: 'i4', category: '手搖飲', name: '手搖飲', price: 55, kind: 'consumable', enabled: true },
    { id: 'i5', category: '火鍋', name: '石二鍋', price: 269, kind: 'consumable', enabled: true },
    { id: 'i6', category: '娛樂', name: '電影票', price: 300, kind: 'consumable', enabled: true },
    { id: 'i7', category: '個人目標', name: '旅行基金', price: 30000, saved: 0, kind: 'goal', enabled: true },
  ];

  return { CURRENCIES, CITY_LUNCH, CATEGORIES, SETTINGS, ITEMS };
})();
