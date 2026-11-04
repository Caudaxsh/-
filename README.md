# 🐂 牛馬薪水計 WorkHorse

即時顯示「今天已經賺了多少錢」(小數點後兩位),並換算成台灣日常消費品。純 HTML/CSS/JS、零依賴、資料只存在你的瀏覽器(localStorage)。桌面優先的小視窗網站(標準約 400×540,迷你約 330×190)。

## 在 Windows 執行
- **最簡單**:雙擊 `serve.bat`(需要 Python 或 Node.js 其中之一),會用 Edge 開成無網址列的小視窗。
- **不裝任何東西**:直接雙擊 `public/index.html`(可用,但無法「安裝成 App」與離線快取)。
- **安裝成 App**:用 Edge 開 `http://localhost:8123/` → `…` → 應用程式 →「將此網站安裝為應用程式」,之後可釘選到工作列。
- 手動:`cd public && python -m http.server 8123`

## 結構
```
public/                      網站根目錄
  index.html style.css
  js/core.js                 計算核心(時間戳為準,可在 Node 測試)
  js/defaults.js             預設設定與參考價格(都可在介面修改)
  js/assets.js               依 asset-manifest 載入素材
  js/share.js js/app.js      成果卡 / 介面
  assets/workhorse/          素材包(保留 brand/ icons/ mascot/ backgrounds/)
    asset-manifest.json      素材路徑唯一來源
    asset-manifest.js        由 json 自動產生(讓 file:// 也能用)
tests/                       node tests/core.test.js · node tests/assets.test.js
tools/build-manifest-js.js   修改 manifest.json 後執行,重新產生 .js
```
素材只用獨立 PNG;所有金額、時間、價格與中文都是 HTML 文字。

## 功能
- 上班 / 休息(繼續)/ 下班;金額依**實際時間戳**計算,重新整理或關閉頁面都不會漏算,可跨午夜
- 休息(手動或每天固定時段如午休)暫停計薪,兩者重疊只扣一次
- 加班倍率(預設勞基法 1.34 / 1.67,依該班次累計工時);今日薪資目標與進度
- 預定下班倒數(超過時顯示已加班時間)
- 班次紀錄(可補登、刪除、匯出 CSV)、月統計(薪資、工時、出勤、平均、加班、每日長條圖)
- 薪資換算器:咖啡、便當(依縣市參考價)、手搖飲、火鍋、電影、交通、個人目標;價格全可編輯、新增、刪除;已解鎖 / 差額 / 還需工作幾分鐘(排除休息、套用加班倍率);貨幣表可擴充(`js/defaults.js`)
- 成果卡 PNG(不含時薪、公司名稱;可隱藏金額)
- 迷你模式(也會在視窗縮到約 330×190 時自動套用)、老闆鍵(按 `H` 模糊金額)、定時「今天賺了多少」提示、備份匯出/匯入

> 「薪資等值」只是累積工資的消費換算,不代表扣稅、扣除其他成本後的實際可支配金額。
