(function () {
  'use strict';
  const D = window.Defaults;
  const C = window.Core;
  const A = window.Assets;
  const I = window.I18n;
  const P = window.Prices;
  const ST = window.Stocks;
  const t = I.t;
  const K = { settings: 'wh.settings.v1', items: 'wh.items.v3', itemsV2: 'wh.items.v2', itemsOld: 'wh.items.v1', shifts: 'wh.shifts.v1', overrides: 'wh.overrides.v1', fx: 'wh.fx.v1' };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let uid = Date.now();
  const newId = () => 'x' + (uid++).toString(36);
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- 儲存 ---------- */
  function load(key, fallback) {
    try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (e) { /* 無痕模式 */ }
    return clone(fallback);
  }
  const hasKey = (key) => { try { return localStorage.getItem(key) != null; } catch (e) { return false; } };
  function put(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ } }
  function saveAll() { itemsAll[settings.country] = { v: P.VERSION, items }; put(K.settings, settings); put(K.items, itemsAll); put(K.shifts, shifts); put(K.overrides, overrides); }
  function merge(base, over) {
    const out = clone(base);
    for (const k in over) out[k] = over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) ? Object.assign(out[k] || {}, over[k]) : over[k];
    return out;
  }
  /** 舊版項目(中文類別、固定名稱)→ 新版(類別 id、可翻譯的預設名稱) */
  function migrateItems(list) {
    return list.map((it) => {
      const o = { ...it };
      if (D.LEGACY_CATEGORY[o.category]) o.category = D.LEGACY_CATEGORY[o.category];
      const def = D.ITEMS.find((d) => d.id === o.id);
      if (def && !o.nameKey && o.name && Object.values(I.D).some((dict) => dict[def.nameKey] === o.name)) { o.nameKey = def.nameKey; o.name = ''; }
      return o;
    });
  }

  /** 舊版預設項目(沒有 ref)補上 ref / est,讓它們能跟著國家切換 */
  const LEGACY_REF = { 'item.americano': 'coffee1', 'item.latte': 'coffee2', 'item.bento': 'bento', 'item.boba': 'boba', 'item.hotpot': 'hotpot', 'item.movie': 'movie', 'item.travel': 'travel' };
  function normalizeItems(list) {
    return list.map((it) => {
      const o = { ...it };
      if (!o.ref && /^i[1-7]$/.test(o.id || '') && !o.nameKey) o.ref = 'legacy-' + o.id; // 最早期版本的預設項目 → 交給新清單取代
      if (o.kind !== 'stock') o.category = P.groupOf(o.category); // 舊分類(咖啡/便當/…)→ 6 個新分類
      if (!o.ref && o.nameKey && LEGACY_REF[o.nameKey]) { o.ref = LEGACY_REF[o.nameKey]; const d = P.COUNTRIES.TW.items.find((x) => x.ref === o.ref); if (d && o.est === undefined) o.est = d.est; }
      return o;
    });
  }

  const hadSettings = hasKey(K.settings);
  const savedSettings = load(K.settings, {});
  let settings = merge(D.SETTINGS, savedSettings);
  delete settings.mini; delete settings.continueOT;
  if (!Array.isArray(settings.workDays)) settings.workDays = clone(D.SETTINGS.workDays);
  if (!settings.lastFinal) settings.lastFinal = C.dayStart(Date.now()) - C.DAY; // 從今天開始記
  // 第一次使用:依時區/語言猜國家,幣別、時薪、加班倍率、預設項目都用該國的參考值
  if (!savedSettings.country) {
    let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* ignore */ }
    settings.country = hadSettings ? 'TW' : P.detect(tz, navigator.language);
    if (hadSettings) { settings.wageTouched = true; settings.otTouched = true; } // 舊使用者的設定不動
    else { const c = P.COUNTRIES[settings.country]; settings.currency = c.currency; settings.hourly = c.hourly; settings.ot = clone(c.ot); }
  }
  // 每個國家各自一份清單:進入日本只看到日本的東西
  let itemsAll = load(K.items, null);
  if (!itemsAll || typeof itemsAll !== 'object' || Array.isArray(itemsAll)) {
    itemsAll = {};
    const legacy = hasKey(K.itemsV2) ? load(K.itemsV2, []) : hasKey(K.itemsOld) ? migrateItems(load(K.itemsOld, [])) : null;
    if (Array.isArray(legacy) && legacy.length) itemsAll[settings.country] = { v: 0, items: normalizeItems(legacy) };
  }
  /** 取得某國清單;預設清單有新版本時,自動換新(保留自己新增 / 改過的項目與股票) */
  function listFor(code) {
    const e = itemsAll[code];
    if (!e || !Array.isArray(e.items)) return P.itemsFor(code);
    return e.v === P.VERSION ? e.items : P.upgrade(code, e.items);
  }
  let items = listFor(settings.country);
  let fx = load(K.fx, { rates: null, at: 0 });
  const stockState = {}; // id -> 'loading' | 'error'(只存在記憶體)
  let shifts = load(K.shifts, []);
  let overrides = load(K.overrides, {});
  for (const k of Object.keys(overrides)) { // 清掉太舊的設定
    if (Date.now() - new Date(k + 'T00:00:00').getTime() > 150 * C.DAY) delete overrides[k];
  }

  I.set(settings.lang || I.detect());

  /* ---------- 格式化(全部依目前語言) ---------- */
  const cur = () => D.CURRENCIES[settings.currency] || D.CURRENCIES.TWD;
  const num = (v, opt) => (Number(v) || 0).toLocaleString(I.locale, opt);
  const money = (v, sym = true) => (sym ? cur().symbol + ' ' : '') + num(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money0 = (v) => cur().symbol + ' ' + num(v, { maximumFractionDigits: settings.currency === 'JPY' ? 0 : 2 }); // 日圓沒有小數
  const hm = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return Math.floor(m / 60) + ':' + pad(m % 60); };
  const hmText = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return t('time.hm', { h: Math.floor(m / 60), m: m % 60 }); };
  function dur(min) {
    if (!isFinite(min)) return '—';
    const m = Math.ceil(min - 1e-9);
    if (m < 60) return t('time.min', { n: m });
    const h = Math.floor(m / 60), r = m % 60;
    return r ? t('time.hm', { h, m: r }) : t('time.h', { h });
  }
  const clock = (ms) => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const wdName = (d) => t('wd.short', { d: t('wd.' + d) });
  const dayLabel = (ms) => { const d = new Date(ms); return `${t('date.md', { m: d.getMonth() + 1, d: d.getDate() })} ${wdName(d.getDay())}`; };
  const itemName = (it) => (it.nameKey ? t(it.nameKey) : it.name);
  const catName = (c) => { const g = P.groupOf(c); return D.CATEGORIES.includes(g) || g === 'stock' ? t('cat.' + g) : c; };
  const iconOf = (it) => it.icon || D.ICON_BY_CATEGORY[P.groupOf(it.category)] || 'bubble_tea';
  /** 圖示素材 ref:股票用統計圖示,其餘用換算圖示 */
  const iconRef = (k) => (k.includes('.') ? k : 'reward_icons.' + k); // 'ui_icons.wallet' 或 'bubble_tea'
  const itemIcon = (it) => (it.kind === 'stock' ? 'ui_icons.analytics_chart' : iconRef(iconOf(it)));
  /** 商品插畫:使用者上傳的圖片優先,否則用素材包的獨立 PNG */
  const iconHTML = (it) => (it.image ? `<img class="usr-img" src="${it.image}" alt="" draggable="false">` : A.img(itemIcon(it)));

  /* ---------- 綁定 ---------- */
  function bind(name, text) {
    for (const el of document.querySelectorAll(`[data-bind="${name}"]`)) if (el.textContent !== text) el.textContent = text;
  }

  function mascotFor(T) {
    if (T.goalRatio >= 1 && T.phase !== 'before') return 'cow_saving_money';
    if (T.phase === 'working') return 'cow_working_laptop';
    if (T.phase === 'break') return 'cow_holding_coffee';
    return 'cow_sleeping';
  }

  const nowT = () => C.today(settings, overrides, Date.now());

  /** 把已經過完的上班日寫進流水帳(用當時的設定凍結) */
  function flushRecords() {
    const cu = C.catchUp(settings, overrides, shifts, settings.lastFinal, Date.now());
    if (cu.added.length || cu.lastFinal !== settings.lastFinal) {
      shifts.push(...cu.added);
      settings.lastFinal = cu.lastFinal;
      saveAll();
      if ($('#view-history').classList.contains('active')) renderHistory();
      if ($('#view-stats').classList.contains('active')) renderStats();
    }
  }

  function nearestReward(T) {
    let best = null;
    for (const it of items) {
      if (it.enabled === false || it.kind === 'stock' || it.done) continue; // 首頁只看生活消費,股票另外顯示
      const p = C.itemProgress(T, it);
      if (p.invalid || p.unlocked || !isFinite(p.minutes)) continue;
      if (!best || p.minutes < best.p.minutes) best = { it, p };
    }
    return best;
  }

  /** 首頁「下一個目標」:使用者選了就追蹤那一項;選「自動」或該項已刪除/停用,就挑最快能換到的 */
  function nextInfo(T) {
    const id = settings.nextTarget;
    if (id && id !== 'auto') {
      const it = items.find((i) => i.id === id && i.enabled !== false);
      if (it && it.price > 0) return { it, p: C.itemProgress(T, it), chosen: true };
    }
    const g = nearestReward(T);
    return g ? { ...g, chosen: false } : null;
  }

  let lastNext = '';
  let lastNotifyBucket = null;
  function tick() {
    flushRecords();
    const T = nowT();
    const a = T.a;
    const sh = T.shift;
    bind('cur', cur().symbol);
    bind('earned', money(T.earned, false));
    const chip = $('#phaseChip');
    if (chip.textContent !== t('phase.' + T.phase)) chip.textContent = t('phase.' + T.phase);
    chip.className = 'chip ' + T.phase;

    const hourly = money(settings.hourly);
    bind('rateLine', T.phase === 'working'
      ? t('rate.working', { rate: hourly, perMin: money(T.ratePerHour / 60) }) + (T.mult > 1 ? t('rate.ot', { m: T.mult }) : '')
      : T.phase === 'break' ? t('rate.paused', { rate: hourly }) : t('rate.idle', { rate: hourly }));
    bind('goalAmt', money0(T.goal));
    bind('goalPct', (T.goalRatio * 100).toFixed(0) + '%');
    const bar = $('#goalBar');
    bar.style.width = (T.goalRatio * 100).toFixed(1) + '%';
    bar.classList.toggle('full', T.goalRatio >= 1);

    bind('worked', C.fmtHMS(T.workedMs));
    bind('breakInfo', t('worked.sub', { n: a ? Math.floor(a.breakMs / 60000) : 0 }));
    if (T.phase === 'before') {
      bind('endLabel', t('until.start')); bind('toEnd', C.fmtHMS(sh.start - T.now)); bind('endInfo', t('until.start.sub', { t: clock(sh.start) }));
    } else if (T.phase === 'working' || T.phase === 'break') {
      bind('endLabel', t('until.end')); bind('toEnd', C.fmtHMS(sh.end - T.now)); bind('endInfo', t('until.end.sub', { t: clock(sh.end) }));
    } else if (T.phase === 'done') {
      bind('endLabel', t('until.end')); bind('toEnd', '0:00:00'); bind('endInfo', t('done.sub'));
    } else {
      bind('endLabel', t('off.title'));
      bind('toEnd', T.next ? `${wdName(new Date(T.next.start).getDay())} ${clock(T.next.start)}` : '—');
      bind('endInfo', t('off.sub'));
    }

    // 快捷:放假 / 加班
    const t0 = C.dayStart(T.now);
    const ov = overrides[C.ymd(t0)] || {};
    const baseWork = settings.workDays.includes(new Date(t0).getDay());
    const offKey = ov.off ? 'q.offUndo' : ov.work ? 'q.workUndo' : baseWork ? 'q.off' : 'q.work';
    if ($('#offLabel').textContent !== t(offKey)) $('#offLabel').textContent = t(offKey);
    $('#btnOff').classList.toggle('on', !!(ov.off || ov.work));
    const ext = sh ? sh.extendMin : 0;
    const otLabel = ext > 0 ? t('q.otMore', { n: ext }) : t('q.ot');
    if ($('#otLabel').textContent !== otLabel) $('#otLabel').textContent = otLabel;
    const canOt = !!sh && (T.phase === 'working' || T.phase === 'break' || (T.phase === 'done' && T.now < sh.end + C.GRACE));
    $('#btnOt').disabled = !canOt;
    $('#btnOtReset').hidden = !(ext > 0 && canOt);

    // 吉祥物(只有一隻)
    const m = A.url('mascot.' + mascotFor(T));
    const mi = $('#mascot');
    if (mi.getAttribute('src') !== m) mi.setAttribute('src', m);

    // 下一個換算目標(可自訂)
    const g = nextInfo(T);
    let html, ratio = 0;
    if (g) {
      const { it, p } = g;
      const name = esc(itemName(it));
      const pre = p.later || T.phase === 'off' ? t('next.pre.later') : T.phase === 'before' ? t('next.pre.before') : '';
      let text;
      if (p.invalid || (!p.unlocked && !isFinite(p.minutes))) text = t('next.noEstimate', { name });
      else if (it.kind === 'goal' && (p.unlocked || it.done)) { text = t('next.goalReached', { name }); ratio = 1; }
      else {
        text = t(it.kind === 'goal' ? 'next.goal' : it.kind === 'stock' ? 'next.stock' : 'next.consumable', { pre, time: dur(p.minutes), name });
        ratio = Math.max(0, Math.min(1, p.ratio || 0));
      }
      html = `<span class="next-ico">${iconHTML(it)}</span><span class="next-text">${text}</span>`;
    } else {
      html = `<span class="next-ico">${A.img('brand.coffee_cup_illustration')}</span><span class="next-text">${t(items.length ? 'next.allDone' : 'next.none')}</span>`;
    }
    if (html !== lastNext) { $('#nextBody').innerHTML = html; lastNext = html; }
    $('#nextBar').style.width = (ratio * 100).toFixed(1) + '%';

    if ($('#view-rewards').classList.contains('active')) updateItems(T);
    maybeNotify(T);
  }

  /* ---------- 定時提示 ---------- */
  function maybeNotify(T) {
    const every = Number(settings.notifyEvery);
    if (!every || T.phase !== 'working') return;
    const bucket = Math.floor(T.a.workedMin / every);
    if (lastNotifyBucket === null) { lastNotifyBucket = bucket; return; }
    if (bucket > lastNotifyBucket) {
      lastNotifyBucket = bucket;
      const msg = t('toast.earned', { amt: money(T.earned) });
      toast(msg);
      if (settings.useSystemNotification && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification(t('toast.notifyTitle'), { body: msg, icon: A.url('brand.app_icon_512'), silent: true }); } catch (e) { /* ignore */ }
      }
    }
  }
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
  }

  /* ---------- 今天放假 / 加班(取代打卡按鈕) ---------- */
  function resetTodayRecord(dayMs) {
    // 當天設定被更動 → 移除該天自動紀錄並讓它重新結算
    shifts = shifts.filter((r) => r.id !== 'a' + C.ymd(dayMs));
    settings.lastFinal = Math.min(settings.lastFinal, C.dayStart(Date.now()) - C.DAY);
  }
  $('#btnOff').onclick = () => {
    const t0 = C.dayStart(Date.now());
    const key = C.ymd(t0);
    const ov = overrides[key] || {};
    const baseWork = settings.workDays.includes(new Date(t0).getDay());
    let msg;
    if (ov.off || ov.work) { msg = ov.off ? 'toast.offOff' : 'toast.workOff'; delete ov.off; delete ov.work; }
    else if (baseWork) { ov.off = true; msg = 'toast.offOn'; }
    else { ov.work = true; msg = 'toast.workOn'; }
    if (Object.keys(ov).length) overrides[key] = ov; else delete overrides[key];
    resetTodayRecord(t0);
    saveAll(); tick(); toast(t(msg));
  };
  $('#btnOt').onclick = () => {
    const T = nowT();
    if (!T.shift) return;
    const key = C.ymd(T.shift.day);
    const ov = overrides[key] || {};
    let ext = (ov.extendMin || 0) + 30;
    while (T.shift.baseEnd + ext * C.MIN <= T.now) ext += 30; // 已經過了下班時間才按:把中間這段也算進去
    ov.extendMin = ext; overrides[key] = ov;
    resetTodayRecord(T.shift.day);
    saveAll(); tick(); toast(t('toast.otAdd'));
  };
  $('#btnOtReset').onclick = () => {
    const T = nowT();
    if (!T.shift) return;
    const key = C.ymd(T.shift.day);
    if (overrides[key]) { delete overrides[key].extendMin; if (!Object.keys(overrides[key]).length) delete overrides[key]; }
    resetTodayRecord(T.shift.day);
    saveAll(); tick(); toast(t('toast.otReset'));
  };

  /* ---------- 分頁 ---------- */
  function showView(name) {
    for (const b of $$('#tabs button')) b.classList.toggle('active', b.dataset.view === name);
    for (const v of $$('.view')) v.classList.toggle('active', v.id === 'view-' + name);
    if (name === 'rewards') renderItems();
    if (name === 'history') renderHistory();
    if (name === 'stats') renderStats();
    try { sessionStorage.setItem('wh.view', name); } catch (e) { /* ignore */ }
    window.scrollTo(0, 0);
    tick();
  }
  $('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) showView(b.dataset.view); };
  $('#btnSettings').onclick = () => showView('settings');
  $('#btnBackHome').onclick = () => showView('home');
  $('#nextOpen').onclick = () => showView('rewards');

  /* ---------- 首頁「下一個目標」自訂 ---------- */
  const nextDlg = $('#nextDialog');
  function renderNextOptions() {
    const pickable = items.filter((i) => i.enabled !== false && i.price > 0);
    const cur0 = pickable.some((i) => i.id === settings.nextTarget) ? settings.nextTarget : 'auto'; // 追蹤的項目已停用/刪除 → 實際上是「自動」
    const row = (id, ico, name, sub, price) => `<button type="button" class="pick-row" role="radio" aria-checked="${cur0 === id}" data-id="${esc(id)}">
      <span class="pk-ico">${ico}</span><span><span class="pk-name">${name}</span><br><span class="pk-sub">${sub}</span></span><span class="pk-price">${price}</span></button>`;
    $('#nextOptions').innerHTML = row('auto', A.img('brand.coffee_cup_illustration'), esc(t('next.auto')), esc(t('next.autoHint')), '')
      + pickable.map((it) => row(it.id, iconHTML(it), esc(itemName(it)), esc(catName(it.category)) + (it.kind === 'goal' ? t('item.goalTag') : ''), (it.est && !it.priceEdited ? t('item.est') : '') + money0(it.price) + (it.kind === 'stock' ? t('item.perShare') : ''))).join('');
  }
  $('#btnPickNext').onclick = () => { renderNextOptions(); nextDlg.showModal(); };
  $('#btnCloseNext').onclick = () => nextDlg.close();
  $('#nextOptions').addEventListener('click', (e) => {
    const b = e.target.closest('.pick-row');
    if (!b) return;
    settings.nextTarget = b.dataset.id;
    saveAll(); lastNext = ''; tick(); nextDlg.close();
  });

  /* ---------- 換算項目 ---------- */
  function itemSummary(p, it) {
    if (p.invalid) return { main: t('item.invalid'), sub: '', ratio: 0 };
    const left = () => {
      if (!isFinite(p.minutes)) return t('item.noEstimate');
      if (p.later) return t('item.later', { time: dur(p.minutes) });
      let s = t('item.left', { time: dur(p.minutes) });
      if (p.eta != null) s += ' ' + (p.beyondEnd ? (p.days > 1 ? t('item.days', { n: p.days.toFixed(1) }) : t('item.ot')) : t('item.eta', { clock: clock(p.eta) }));
      return s;
    };
    if (p.kind === 'goal') {
      if (it && it.done) return { main: `<span class="badge">${t('goal.done')} ✓</span>`, sub: t('item.goalTarget', { price: money0(p.price) }) + (p.saved ? ' ' + t('item.goalSaved', { saved: money0(p.saved) }) : ''), ratio: 1 };
      if (p.unlocked) return { main: `<span class="badge">${t('item.unlocked')}</span>`, sub: t('item.goalTarget', { price: money0(p.price) }) + (p.saved ? ' ' + t('item.goalSaved', { saved: money0(p.saved) }) : ''), ratio: 1 };
      return { main: `<span class="item-count">${(p.ratio * 100).toFixed(1)}<small>%</small></span>`, sub: `${t('item.gap', { amt: `<b>${money(p.gap)}</b>` })}｜${left()}`, ratio: p.ratio };
    }
    // 「份數」是薪資等值(你賺的錢相當於幾份),不是已經買了
    const main = it && it.kind === 'stock' ? '' : `<span class="item-count">${p.count}<small>${t('item.unit')}</small></span><span class="equiv-tag">${t('item.equivTag')}</span>`;
    return { main, sub: `${t('item.gapNext', { amt: `<b>${money(p.gap)}</b>` })}｜${left()}`, ratio: p.ratio };
  }

  /* ---- 股票:參考股價 / 理論等值股數 / 交易單位 / 報價時間 ---- */
  const LOT = { US: 1, TW: 1000, JP: 100 };
  const lotOf = (it) => LOT[it.market] || LOT[ST.marketOf(it.symbol || '')] || 1;
  const fmtAt = (ts) => { if (!ts) return '—'; const d = new Date(ts); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtShares = (v) => (v > 0 && v < 0.01 ? '<0.01' : num(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  function stockMeta(it) {
    const sym = esc(it.symbol || '');
    if (it.manual > 0) return { text: t('stock.metaManual', { sym }), err: false };
    if (stockState[it.id] === 'loading') return { text: t('stock.loading', { sym }), err: false };
    if (!it.quote) return { text: t(stockState[it.id] === 'error' ? 'stock.error' : 'stock.noQuote', { sym }), err: stockState[it.id] === 'error' };
    let text = t('stock.meta', { sym, price: num(it.quote.close, { maximumFractionDigits: 2 }), cur: it.quote.currency, date: it.quote.date }) + ' ・' + srcLabel(it.quote.src);
    if (it.quote.currency !== settings.currency) text += it.fxMissing ? ' ・' + t('stock.fx', { cur: cur().symbol }) : ` ≈ ${money0(it.price)}`;
    if (stockState[it.id] === 'error') text += ' ・' + t('stock.error', { sym: '' }).replace(/^・/, '');
    return { text, err: !!it.fxMissing || stockState[it.id] === 'error' };
  }

  /* ---- 價格來源行 ---- */
  function srcLine(it) {
    if (it.kind === 'stock') return '';
    if (it.src && !it.priceEdited) return `<div class="price-src">${t('item.src', { src: esc(it.src), date: esc(it.srcDate || P.AS_OF) })}</div>`;
    return `<div class="price-src">${t('item.srcCustom')}</div>`;
  }

  function cardHTML(it) {
    const stock = it.kind === 'stock';
    const meta = stock ? stockMeta(it) : null;
    const priceHTML = stock && !(it.price > 0) ? '—' : money0(it.price);
    const head = `
        <div class="item-head">
          <div class="item-name">${esc(itemName(it))}<span class="item-cat">${esc(catName(it.category))}${it.kind === 'goal' ? t('item.goalTag') : ''}</span></div>
          <div class="item-price amount">${it.est && !it.priceEdited ? `<span class="est">${t('item.est')}</span>` : ''}${priceHTML}${stock ? t('item.perShare') : ''}</div>
        </div>`;
    const stockBlock = !stock ? '' : `
        <div class="stock-grid">
          <div><small>${t('stock.refPrice')}</small><b class="amount">${priceHTML}</b></div>
          <div><small>${t('stock.theory')}</small><b class="amount" data-role="theory">—</b></div>
        </div>
        <div class="stock-line">${t('stock.unit.' + (['US', 'TW', 'JP'].includes(it.market) ? it.market : ST.marketOf(it.symbol || '')))}${it.price > 0 && lotOf(it) > 1 ? '・' + t('stock.lotCost', { amt: money0(it.price * lotOf(it)) }) : ''}</div>
        ${it.quote ? `<div class="stock-line">${t('stock.quoteTime', { date: esc(it.quote.date), at: fmtAt(it.quote.at) })}・${srcLabel(it.quote.src)}</div>` : ''}`;
    return `
      <div class="card item ${it.enabled === false ? 'off' : ''} ${it.done ? 'done' : ''}" data-id="${it.id}">
        <div class="item-ico">${iconHTML(it)}</div>
        <div>
          ${head}
          <div data-role="main"></div>
          <div class="bar"><i data-role="bar"></i></div>
          ${stockBlock}
          <div class="item-sub" data-role="sub"></div>
          ${stock ? `<div class="stock-meta ${meta.err ? 'err' : ''}">${meta.text}</div>` : srcLine(it)}
          <div class="item-actions"><button data-act="edit">${t('item.edit')}</button>${stock ? `<button data-act="refresh">${t('stock.refresh')}</button>` : ''}<button data-act="toggle">${it.enabled === false ? t('item.on') : t('item.off')}</button></div>
        </div>
      </div>`;
  }

  /** 「探索更多」的一列 */
  function catRow(e, addedRefs) {
    const added = addedRefs.has(e.ref);
    return `<div class="cat-row">
      <div class="cat-ico">${A.img(e.icon.includes('.') ? e.icon : 'reward_icons.' + e.icon)}</div>
      <div><div class="cat-name">${esc(t(e.nameKey))}</div>
        <div class="cat-price amount">${e.est ? `<span class="est">${t('item.est')}</span>` : ''}${money0(e.price)}</div>
        <div class="cat-src">${esc(e.src || '')}・${esc(e.srcDate || '')}</div></div>
      <button class="btn small" data-act="catadd" data-ref="${esc(e.ref)}" ${added ? 'disabled' : ''}>${t(added ? 'explore.added' : 'explore.add')}</button>
    </div>`;
  }

  function renderItems() {
    const open = new Set($$('#itemList details[open]').map((d) => d.dataset.key));
    const live = items.filter((i) => i.kind !== 'stock');
    const featured = items.filter((i) => i.featured && i.kind !== 'stock');
    const goals = items.filter((i) => i.kind === 'goal' && !i.featured).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
    const stocks = items.filter((i) => i.kind === 'stock');
    const mine = live.filter((i) => !i.featured && i.kind !== 'goal');
    const addedRefs = new Set(items.filter((i) => i.ref).map((i) => i.ref));
    const catalog = P.catalogFor(settings.country).filter((e) => e.kind !== 'goal');
    const presets = P.goalPresetsFor(settings.country);

    let html = '';
    // 1) 精選
    html += `<div class="sec-head"><h3>${t('sec.featured')}</h3></div>`;
    html += featured.map(cardHTML).join('') || `<div class="card empty">${A.img('brand.coffee_cup_illustration')}${t('item.empty')}</div>`;
    // 2) 個人目標
    html += `<div class="sec-head"><h3>${t('sec.goals')}</h3><button class="btn small" data-act="goaladd">${t('goal.add')}</button></div>`;
    html += `<div class="chips-row" aria-label="${t('goal.quick')}">${presets.map((g) => `<button data-act="preset" data-key="${g.key}">${t('goalp.' + g.key)}</button>`).join('')}<button data-act="preset" data-key="custom">${t('goalp.custom')}</button></div>`;
    html += goals.map(cardHTML).join('') || `<p class="sec-empty">${t('goal.empty')}</p>`;
    // 3) 股票與 ETF
    html += `<div class="sec-head"><h3>${t('sec.invest')}<small>${t('sec.investHint')}</small></h3><button class="btn small" data-act="addstock">${t('items.addStock')}</button></div>`;
    html += stocks.map(cardHTML).join('');
    if (stocks.length) html += `<p class="note">${t('stock.note')}</p>`;
    // 4) 我加入的項目
    if (mine.length) html += `<div class="sec-head"><h3>${t('sec.mine')}</h3></div>` + mine.map(cardHTML).join('');
    // 5) 探索更多(依 6 個分類;個人目標分類放快速建立的預設)
    html += `<details class="card explore" data-key="explore"${open.has('explore') ? ' open' : ''}><summary><span>${t('sec.explore')}<small style="display:block;font-weight:400">${t('sec.exploreHint')}</small></span></summary>`;
    for (const g of P.GROUPS) {
      let rows;
      if (g === 'goal') {
        rows = presets.map((p) => `<div class="cat-row">
          <div class="cat-ico">${A.img(p.icon.includes('.') ? p.icon : 'reward_icons.' + p.icon)}</div>
          <div><div class="cat-name">${esc(t('goalp.' + p.key))}</div><div class="cat-price amount">${p.est ? `<span class="est">${t('item.est')}</span>` : ''}${money0(p.price)}</div><div class="cat-src">${esc(p.src)}・${esc(p.date)}</div></div>
          <button class="btn small" data-act="preset" data-key="${p.key}">${t('explore.add')}</button></div>`).join('');
      } else {
        const list = catalog.filter((e) => e.category === g);
        if (!list.length) continue;
        rows = list.map((e) => catRow(e, addedRefs)).join('');
      }
      html += `<details class="grp" data-key="grp-${g}"${open.has('grp-' + g) ? ' open' : ''}><summary><span>${t('cat.' + g)}</span></summary>${rows}</details>`;
    }
    html += `</details>`;
    $('#itemList').innerHTML = html;
    updateItems(nowT());
  }

  function updateItems(T) {
    for (const it of items) {
      const el = $(`.item[data-id="${it.id}"]`);
      if (!el) continue;
      const main = $('[data-role=main]', el), sub = $('[data-role=sub]', el), bar = $('[data-role=bar]', el), theory = $('[data-role=theory]', el);
      if (it.enabled === false) { main.innerHTML = ''; sub.textContent = t('item.disabled'); bar.style.width = '0'; if (theory) theory.textContent = '—'; continue; }
      if (it.kind === 'stock' && !(it.price > 0)) { main.innerHTML = ''; sub.textContent = ''; bar.style.width = '0'; if (theory) theory.textContent = '—'; continue; }
      const s = itemSummary(C.itemProgress(T, it), it);
      if (main.innerHTML !== s.main) main.innerHTML = s.main;
      if (sub.innerHTML !== s.sub) sub.innerHTML = s.sub;
      if (theory) { const v = fmtShares(T.earned / it.price) + t('item.shareUnit'); if (theory.textContent !== v) theory.textContent = v; }
      bar.style.width = (Math.max(0, Math.min(1, s.ratio)) * 100).toFixed(1) + '%';
    }
  }

  const dlg = $('#itemDialog'), form = $('#itemForm');
  let editingId = null, dlgImage = null, dlgPreset = null;
  const previewIcon = () => {
    const box = $('#itemIconPreview');
    box.setAttribute('src', dlgImage || A.url(iconRef(form.icon.value)));
    box.classList.toggle('usr', !!dlgImage);
  };
  const syncKind = () => { const g = form.kind.value === 'goal'; $('#savedField').style.display = g ? '' : 'none'; $('#doneField').style.display = g ? '' : 'none'; };
  /** preset:快速建立的預設(手機/相機/…);傳 {kind:'goal'} 則是空白目標 */
  function openItem(id, preset) {
    editingId = id; dlgPreset = preset && preset.nameKey ? preset : null;
    const base = preset || {};
    const it = items.find((i) => i.id === id) || { category: base.category || 'fun', name: '', price: base.price || '', kind: base.kind || 'consumable', saved: '', icon: base.icon || D.ICON_BY_CATEGORY[base.category || 'fun'], nameKey: base.nameKey };
    dlgImage = it.image || null;
    form.category.value = P.groupOf(it.category); form.name.value = itemName(it); form.price.value = it.price;
    form.kind.value = it.kind; form.saved.value = it.saved || ''; form.icon.value = iconOf(it); form.done.checked = !!it.done;
    $('#itemDialogTitle').textContent = t(id ? 'dlg.item.edit' : (it.kind === 'goal' ? 'goal.add' : 'dlg.item.add')).replace(/^＋ /, '');
    $('#btnDeleteItem').style.display = id ? '' : 'none';
    syncKind(); previewIcon(); dlg.showModal();
  }
  form.category.onchange = () => {
    form.icon.value = D.ICON_BY_CATEGORY[form.category.value] || form.icon.value;
    if (form.category.value === 'goal') form.kind.value = 'goal';
    syncKind(); previewIcon();
  };
  form.icon.onchange = previewIcon;
  form.kind.onchange = syncKind;
  // 圖片上傳:縮成最長邊 160px 的 JPEG 存在瀏覽器裡(不上傳到任何地方)
  $('#btnPickImage').onclick = () => $('#fileImage').click();
  $('#btnClearImage').onclick = () => { dlgImage = null; previewIcon(); };
  $('#fileImage').onchange = (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f || !/^image\//.test(f.type)) return;
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 160 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const cx = c.getContext('2d'); cx.fillStyle = '#FFFCF7'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(im, 0, 0, c.width, c.height);
      dlgImage = c.toDataURL('image/jpeg', 0.82); URL.revokeObjectURL(url); previewIcon();
    };
    im.onerror = () => URL.revokeObjectURL(url);
    im.src = url;
  };
  $('#btnAddItem').onclick = () => openItem(null);
  $('#btnCancelItem').onclick = () => dlg.close();
  $('#btnDeleteItem').onclick = () => {
    if (confirm(t('confirm.delItem'))) { items = items.filter((i) => i.id !== editingId); saveAll(); renderItems(); tick(); dlg.close(); }
  };
  form.onsubmit = () => {
    const it = items.find((i) => i.id === editingId);
    const typed = form.name.value.trim();
    const isGoal = form.kind.value === 'goal';
    const data = {
      category: form.category.value, icon: form.icon.value, kind: form.kind.value,
      price: Math.max(0.01, Number(form.price.value) || 0.01),
      saved: isGoal ? Math.max(0, Number(form.saved.value) || 0) : 0,
      done: isGoal && form.done.checked, image: dlgImage || undefined,
    };
    if (it) {
      if (data.price !== Number(it.price)) { it.priceEdited = true; it.est = false; } // 使用者改過價格 → 不再是參考價/「約」
      if (it.ref) it.custom = true; // 改過的預設項目,預設清單更新時保留
      Object.assign(it, data);
      if (!data.image) delete it.image;
      if (!(it.nameKey && typed === t(it.nameKey))) { delete it.nameKey; it.name = typed || catName(data.category); } // 使用者改過名字就不再自動翻譯
    } else {
      const n = { id: newId(), enabled: true, name: typed || catName(data.category), ...data };
      if (!data.image) delete n.image;
      if (dlgPreset) { // 從預設快速建立:名字沒改就沿用可翻譯的名稱,價格沒改就保留來源資訊
        if (typed === t(dlgPreset.nameKey)) { n.nameKey = dlgPreset.nameKey; n.name = ''; }
        if (data.price === dlgPreset.price) { n.est = dlgPreset.est; n.src = dlgPreset.src; n.srcDate = dlgPreset.date; } else n.priceEdited = true;
      }
      items.push(n);
    }
    saveAll(); renderItems(); tick();
  };

  /** 「探索更多」按「加入」→ 放進自己的清單 */
  function addFromCatalog(ref) {
    const e = P.catalogFor(settings.country).find((x) => x.ref === ref);
    if (!e || items.some((i) => i.ref === ref)) return;
    items.push({ ...e, id: 'c-' + ref });
    saveAll(); renderItems(); tick(); toast(t('toast.stockAdded', { name: t(e.nameKey) }));
  }
  $('#itemList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'goaladd') return openItem(null, { kind: 'goal', category: 'goal', icon: 'ui_icons.goal_flag' });
    if (act === 'addstock') return openStock(null);
    if (act === 'catadd') return addFromCatalog(btn.dataset.ref);
    if (act === 'preset') {
      if (btn.dataset.key === 'custom') return openItem(null, { kind: 'goal', category: 'goal', icon: 'ui_icons.goal_flag' });
      const g = P.goalPresetsFor(settings.country).find((x) => x.key === btn.dataset.key);
      return g && openItem(null, { kind: 'goal', category: 'goal', nameKey: 'goalp.' + g.key, price: g.price, icon: g.icon, est: g.est, src: g.src, date: g.date });
    }
    const card = btn.closest('.item');
    if (!card) return;
    const id = card.dataset.id;
    if (act === 'edit') { const it0 = items.find((i) => i.id === id); if (it0.kind === 'stock') openStock(id); else openItem(id); }
    if (act === 'refresh') refreshQuotes(true, id);
    if (act === 'toggle') { const it = items.find((i) => i.id === id); it.enabled = it.enabled === false; saveAll(); renderItems(); tick(); }
  });

  /* ---------- 流水帳 ---------- */
  function renderHistory() {
    const list = shifts.slice().sort((a, b) => b.start - a.start);
    if (!list.length) {
      $('#historyList').innerHTML = `<div class="card empty">${A.img('brand.coffee_cup_illustration')}${t('hist.empty')}</div>`;
      return;
    }
    let html = '', lastDay = null;
    for (const s of list) {
      const day = C.dayStart(s.start);
      if (day !== lastDay) {
        const dayTotal = list.filter((x) => C.dayStart(x.start) === day).reduce((a, x) => a + x.earned, 0);
        html += `<div class="day-head"><span>${dayLabel(s.start)}</span><span class="amount">${money(dayTotal)}</span></div>`;
        lastDay = day;
      }
      const crossed = C.dayStart(s.end) !== day;
      const reg = ((s.cfg && s.cfg.regularHours) || 8) * C.HOUR;
      const ot = Math.max(0, s.workedMs - reg);
      html += `<div class="card shift" data-id="${s.id}">
        <div class="shift-main">
          <div class="shift-time">${clock(s.start)} – ${clock(s.end)}${crossed ? '<sup>+1</sup>' : ''}${ot > 0 ? `<span class="tag">${t('hist.ot', { t: hm(ot) })}</span>` : ''}</div>
          <div class="shift-meta">${t('hist.meta', { t: hm(s.workedMs), n: Math.round((s.end - s.start - s.workedMs) / 60000) })}・${t(s.manual ? 'hist.manual' : 'hist.auto')}</div>
        </div>
        <div class="shift-pay amount">${money(s.earned)}</div>
        <button class="shift-del" aria-label="${t('hist.del')}" title="${t('hist.del')}">×</button>
      </div>`;
    }
    $('#historyList').innerHTML = html;
  }
  $('#historyList').addEventListener('click', (e) => {
    if (!e.target.classList.contains('shift-del')) return;
    const id = e.target.closest('.shift').dataset.id;
    if (confirm(t('confirm.delShift'))) { shifts = shifts.filter((s) => s.id !== id); saveAll(); renderHistory(); tick(); }
  });

  const shiftDlg = $('#shiftDialog'), shiftForm = $('#shiftForm');
  const toLocalInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function previewShift() {
    const s = new Date(shiftForm.start.value).getTime(), e = new Date(shiftForm.end.value).getTime();
    const out = $('#shiftPreview');
    if (!isFinite(s) || !isFinite(e)) { out.textContent = ''; return null; }
    if (e <= s) { out.textContent = t('dlg.shift.badEnd'); return null; }
    if (e - s > 24 * C.HOUR) { out.textContent = t('dlg.shift.tooLong'); return null; }
    const m = C.manualShift(s, e, Number(shiftForm.breakMin.value) || 0, settings, 'preview');
    out.textContent = t('dlg.shift.preview', { t: hmText(m.workedMs), amt: money(m.earned) });
    return m;
  }
  $('#btnAddShift').onclick = () => {
    const d9 = new Date(); d9.setHours(9, 0, 0, 0);
    const d18 = new Date(d9); d18.setHours(18, 0, 0, 0);
    shiftForm.start.value = toLocalInput(d9.getTime() - C.DAY);
    shiftForm.end.value = toLocalInput(d18.getTime() - C.DAY);
    shiftForm.breakMin.value = 60;
    previewShift(); shiftDlg.showModal();
  };
  shiftForm.addEventListener('input', previewShift);
  $('#btnCancelShift').onclick = () => shiftDlg.close();
  shiftForm.onsubmit = (e) => {
    const m = previewShift();
    if (!m) { e.preventDefault(); return; }
    m.id = newId();
    shifts.push(m); saveAll(); renderHistory(); renderStats(); tick();
    toast(t('toast.shiftAdded'));
  };
  $('#btnExportCsv').onclick = () => {
    if (!shifts.length) { toast(t('hist.noExport')); return; }
    const rows = [t('csv.head').split(',')];
    for (const s of shifts.slice().sort((a, b) => a.start - b.start)) {
      const d = new Date(s.start);
      rows.push([`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, clock(s.start), clock(s.end),
        (s.workedMs / C.HOUR).toFixed(2), Math.round((s.end - s.start - s.workedMs) / 60000), s.earned.toFixed(2), s.cfg ? s.cfg.hourly : '']);
    }
    download('workhorse-log.csv', '﻿' + rows.map((r) => r.join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- 戰績(月統計) ---------- */
  const now0 = new Date();
  let statYear = now0.getFullYear(), statMonth = now0.getMonth();
  function statRecords() {
    // 把「今天進行中、還沒定稿」的班次也算進來,數字才會即時跳動
    const T = nowT();
    const live = [];
    if (T.shift && T.phase !== 'before' && T.shift.day > settings.lastFinal && !shifts.some((r) => r.id === 'a' + C.ymd(T.shift.day))) {
      live.push({ id: 'live', start: T.shift.start, end: T.shift.end, earned: T.earned, workedMs: T.workedMs, cfg: { regularHours: settings.regularHours } });
    }
    return shifts.concat(live);
  }
  function renderStats() {
    const mm = I.lang === 'en' ? t('month.' + statMonth) : statMonth + 1;
    $('#monthTitle').textContent = t('stats.monthTitle', { y: statYear, m: mm });
    const st = C.monthStats(statRecords(), statYear, statMonth);
    if (!st.count) {
      $('#statsBody').innerHTML = `<div class="card empty">${A.img('mascot.cow_sleeping', 'wide')}${t('stats.empty')}</div>`;
      return;
    }
    const max = Math.max(...st.days.map((d) => d.earned), 1);
    const isCur = statYear === now0.getFullYear() && statMonth === now0.getMonth();
    const dim = st.days.length;
    $('#statsBody').innerHTML = `
      <div class="card stat-hero">
        <small>${t('stats.earned')}</small>
        <div class="money amount"><span class="cur">${cur().symbol}</span> ${money(st.earned, false)}</div>
        <div class="stat-grid">
          <div><small>${t('stats.hours')}</small><b>${hmText(st.workedMs)}</b></div>
          <div><small>${t('stats.days')}</small><b>${t('stats.daysVal', { n: st.workDays })}</b></div>
          <div><small>${t('stats.avg')}</small><b class="amount">${money(st.avgPerDay)}</b></div>
          <div><small>${t('stats.eff')}</small><b class="amount">${money(st.effHourly)}</b></div>
          <div><small>${t('stats.ot')}</small><b>${hmText(st.otMs)}</b></div>
          <div><small>${t('stats.best')}</small><b class="amount">${st.best ? `${t('date.md', { m: statMonth + 1, d: st.best.day })} ${money0(st.best.earned)}` : '—'}</b></div>
        </div>
      </div>
      <div class="card">
        <h2>${t('stats.daily')}</h2>
        <div class="chart">${st.days.map((d) => `<i class="${d.earned > 0 ? 'has' : ''} ${isCur && d.day === now0.getDate() ? 'today' : ''}" style="height:${d.earned > 0 ? Math.max(4, (d.earned / max) * 100) : 2}%" title="${t('date.md', { m: statMonth + 1, d: d.day })}: ${money(d.earned)}"></i>`).join('')}</div>
        <div class="chart-axis"><span>1</span><span>${Math.round(dim / 2)}</span><span>${dim}</span></div>
      </div>`;
  }
  $('#btnPrevMonth').onclick = () => { if (--statMonth < 0) { statMonth = 11; statYear--; } renderStats(); };
  $('#btnNextMonth').onclick = () => { if (++statMonth > 11) { statMonth = 0; statYear++; } renderStats(); };

  /* ---------- 設定 ---------- */
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => (a[k] = a[k] || {}), o)[last] = v; }
  function fillSettings() {
    for (const el of $$('[data-set]')) {
      const v = getPath(settings, el.dataset.set);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    }
    renderDayChips(); renderBreaks(); timeNote();
  }
  function renderDayChips() {
    $('#dayChips').innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" data-day="${d}" aria-pressed="${settings.workDays.includes(d)}">${t('wd.' + d)}</button>`).join('');
  }
  $('#dayChips').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    flushRecords();
    const d = Number(b.dataset.day);
    settings.workDays = settings.workDays.includes(d) ? settings.workDays.filter((x) => x !== d) : settings.workDays.concat(d).sort();
    renderDayChips(); afterSettings();
  });
  function timeNote() {
    const planned = C.plannedWorkMin(settings);
    const n = settings.workDays.length;
    const pay = C.earnedForWorked(settings, planned) * n * 52 / 12;
    $('#timeNote').textContent = t('set.summary', { n, h: dur(planned), pay: money0(pay) });
  }
  function renderBreaks() {
    $('#breakList').innerHTML = (settings.autoBreaks || []).map((b) => `
      <div class="break-row" data-id="${b.id}">
        <input type="checkbox" data-bk="enabled" ${b.enabled !== false ? 'checked' : ''} aria-label="${t('set.enable')}">
        <input type="time" data-bk="start" value="${b.start}">
        <input type="time" data-bk="end" value="${b.end}">
        <button class="btn small danger" data-bk="del">${t('dlg.delete')}</button>
      </div>`).join('') || `<p class="note">${t('set.noBreaks')}</p>`;
  }
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.set) {
      flushRecords(); // 先把已過完的日子用「舊設定」定稿,再套用新設定
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number' || el.dataset.set === 'notifyEvery') { v = Number(v); if (!isFinite(v)) return; }
      setPath(settings, el.dataset.set, v);
      if (el.dataset.set === 'hourly') settings.wageTouched = true;
      if (el.dataset.set === 'regularHours' || el.dataset.set.startsWith('ot.')) settings.otTouched = true;
      if (el.dataset.set === 'useSystemNotification' && v && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      if (el.dataset.set === 'hideAmount') applyMode();
      afterSettings();
    } else if (el.dataset && el.dataset.bk && el.dataset.bk !== 'del') {
      flushRecords();
      const b = settings.autoBreaks.find((x) => x.id === el.closest('.break-row').dataset.id);
      if (!b) return;
      if (el.dataset.bk === 'enabled') b.enabled = el.checked; else if (el.value) b[el.dataset.bk] = el.value;
      afterSettings();
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.dataset && e.target.dataset.bk === 'del') {
      flushRecords();
      const id = e.target.closest('.break-row').dataset.id;
      settings.autoBreaks = settings.autoBreaks.filter((x) => x.id !== id);
      renderBreaks(); afterSettings();
    }
  });
  function afterSettings(rerender) { saveAll(); timeNote(); lastNotifyBucket = null; if (rerender) { renderItems(); renderHistory(); renderStats(); } tick(); }
  $('#btnAddBreak').onclick = () => {
    flushRecords();
    settings.autoBreaks.push({ id: newId(), start: '15:00', end: '15:15', enabled: true });
    renderBreaks(); afterSettings();
  };
  $('#btnReset').onclick = () => {
    if (!confirm(t('confirm.reset'))) return;
    const lang = settings.lang, country = settings.country, c = P.COUNTRIES[country];
    settings = clone(D.SETTINGS); settings.lang = lang; settings.lastFinal = C.dayStart(Date.now()) - C.DAY;
    settings.country = country; settings.currency = c.currency; settings.hourly = c.hourly; settings.ot = clone(c.ot);
    itemsAll = {}; items = P.itemsFor(country); overrides = {};
    saveAll(); rerenderAll();
  };
  $('#btnBackup').onclick = () => download('workhorse-backup.json', JSON.stringify({ app: 'workhorse', v: 3, settings, items: (saveAll(), itemsAll), shifts, overrides }, null, 2), 'application/json');
  $('#btnRestore').onclick = () => $('#fileRestore').click();
  $('#fileRestore').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'workhorse') throw new Error('format');
      if (!confirm(t('confirm.restore'))) return;
      settings = merge(D.SETTINGS, d.settings || {}); delete settings.mini; delete settings.continueOT;
      if (!Array.isArray(settings.workDays)) settings.workDays = clone(D.SETTINGS.workDays);
      if (!settings.lastFinal) settings.lastFinal = C.dayStart(Date.now()) - C.DAY;
      if (!settings.country) { settings.country = 'TW'; settings.wageTouched = true; settings.otTouched = true; }
      settings.currency = (P.COUNTRIES[settings.country] || P.COUNTRIES.TW).currency;
      itemsAll = Array.isArray(d.items) ? { [settings.country]: { v: 0, items: normalizeItems(migrateItems(d.items)) } } : (d.items && typeof d.items === 'object' ? d.items : {});
      items = listFor(settings.country); shifts = d.shifts || []; overrides = d.overrides || {};
      I.set(settings.lang || I.detect());
      saveAll(); rerenderAll(); toast(t('toast.restored'));
    } catch (err) { toast(t('toast.badFile')); }
  };

  /* ---------- 下拉選單 / 語言 ---------- */
  function fillSelects() {
    for (const sel of $$('.country-select')) {
      sel.innerHTML = D.COUNTRIES.map((c) => `<option value="${c}">${t('country.' + c)}(${D.CURRENCIES[P.COUNTRIES[c].currency].symbol})</option>`).join('');
      sel.value = settings.country;
    }
    fillMarkets();
    $('#notifySelect').innerHTML = [['0', 'set.never'], ['15', 'set.15'], ['30', 'set.30'], ['60', 'set.60']].map(([v, k]) => `<option value="${v}">${t(k)}</option>`).join('');
    $('#notifySelect').value = String(settings.notifyEvery);
    form.category.innerHTML = D.CATEGORIES.map((c) => `<option value="${c}">${t('cat.' + c)}</option>`).join('');
    form.icon.innerHTML = D.REWARD_ICONS.filter((k) => A.url('reward_icons.' + k)).map((k) => `<option value="${k}">${t('icon.' + k)}</option>`).join('') + D.UI_ICON_CHOICES.filter((k) => A.url(k)).map((k) => `<option value="${k}">${t('icon.' + k)}</option>`).join('');
    $('#langSelect').innerHTML = Object.entries(I.LANGS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    $('#langSelect').value = I.lang;
  }
  function rerenderAll() {
    I.apply(); fillSelects(); fillSettings(); applyMode();
    renderItems(); renderHistory(); renderStats();
    lastNext = ''; lastNotifyBucket = null; tick();
  }
  $('#langSelect').onchange = (e) => {
    settings.lang = e.target.value; I.set(settings.lang); saveAll(); rerenderAll();
  };

  function applyMode() { document.body.classList.toggle('hide-amount', !!settings.hideAmount); }
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'h' || e.key === 'H') { settings.hideAmount = !settings.hideAmount; saveAll(); applyMode(); fillSettings(); }
  });

  /* ---------- 成果卡 ---------- */
  const imgCache = {};
  async function img(ref) { return imgCache[ref] || (imgCache[ref] = await A.loadImage(ref)); }
  const loadDataUrl = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = u; });
  async function drawCard() {
    const T = nowT();
    const lines = [];
    for (const it of items) {
      if (it.enabled === false || it.kind === 'goal') continue;
      const n = Math.floor(T.earned / it.price + 1e-9);
      if (n >= 1) lines.push({ label: itemName(it), value: `× ${n}`, n, ref: itemIcon(it), image: it.image });
    }
    lines.sort((a, b) => b.n - a.n);
    for (const g of items.filter((it) => it.enabled !== false && it.kind === 'goal' && C.itemProgress(T, it).unlocked)) {
      lines.unshift({ label: itemName(g), value: t('share.unlocked'), ref: itemIcon(g), image: g.image });
    }
    if (!lines.length) lines.push({ label: t('share.keepGoing'), value: '…', ref: 'brand.coffee_cup_illustration' });
    const top = lines.slice(0, 3);
    for (const l of top) l.icon = l.image ? await loadDataUrl(l.image) : await img(l.ref);
    const d = new Date();
    ShareCard.draw($('#shareCanvas'), {
      title: t('share.title'), todayLabel: t('share.today'), footer: t('share.foot'), brand: t('brand.name'),
      dateText: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
      amountText: $('#shareShowAmount').checked ? money(T.earned) : null,
      workedText: t('share.worked', { t: hmText(T.workedMs) }), lines: top, logo: await img('brand.cow_coffee_logo'),
    });
  }
  $('#btnShare').onclick = async () => { await drawCard(); $('#shareDialog').showModal(); };
  $('#shareShowAmount').onchange = drawCard;
  $('#btnShareClose').onclick = () => $('#shareDialog').close();
  $('#btnShareSave').onclick = async () => {
    const blob = await ShareCard.toBlob($('#shareCanvas'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'workhorse-today.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#btnShareCopy').onclick = async () => {
    try {
      const blob = await ShareCard.toBlob($('#shareCanvas'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast(t('toast.copied'));
    } catch (e) { toast(t('toast.copyFail')); }
  };

  /* ---------- 每日資料檔(官方 / 彙整)、匯率與股票報價 ---------- */
  const BUILD = (document.querySelector('meta[name=build]') || {}).content || 'dev';
  let market = null; // data/market.json:台股來自證交所/櫃買中心官方 OpenAPI,美日股為 Yahoo+Stooq 每日彙整
  async function loadMarket() {
    try {
      const r = await fetch('data/market.json?v=' + encodeURIComponent(BUILD), { cache: 'no-cache' });
      if (r.ok) market = await r.json();
    } catch (e) { market = null; }
    if (market && market.fx && market.fx.rates) { fx = { rates: market.fx.rates, at: Date.parse(market.generatedAt) || Date.now(), src: 'data' }; put(K.fx, fx); }
    return market;
  }
  const marketData = () => market;
  const srcLabel = (src) => t('stock.from', { src: t('stock.src.' + (src || 'live')) });
  const HOURS6 = 6 * C.HOUR, HOURS12 = 12 * C.HOUR;
  async function ensureRates(force) {
    if (market && market.fx && market.fx.rates) return fx.rates; // 每日資料檔的匯率優先
    if (!force && fx.rates && Date.now() - fx.at < HOURS12) return fx.rates;
    try {
      fx = { rates: await ST.fetchRates({ proxy: settings.quoteProxy }), at: Date.now() };
      put(K.fx, fx);
    } catch (e) { /* 保留舊匯率(可能是 null) */ }
    return fx.rates;
  }
  /** 依最新報價與匯率,重算每檔股票換成使用者幣別後的每股價格 */
  function repriceStocks() {
    for (const it of items) {
      if (it.kind !== 'stock') continue;
      it.fxMissing = false;
      if (it.manual > 0) { it.price = it.manual; continue; }
      if (!it.quote) continue;
      const v = ST.convert(it.quote.close, it.quote.currency, settings.currency, fx.rates);
      if (v == null) it.fxMissing = true; else it.price = v;
    }
  }
  let refreshing = false;
  async function refreshQuotes(force, onlyId) {
    if (refreshing) return;
    const targets = items.filter((it) => it.kind === 'stock' && !(it.manual > 0) && (!onlyId || it.id === onlyId));
    // 1) 先用每日資料檔(不需網路請求)
    let changed = false;
    for (const it of targets) {
      const d = ST.dataQuote(market, it.symbol);
      if (d && (!it.quote || it.quote.date !== d.date || it.quote.src !== d.src || it.quote.close !== d.close)) {
        it.quote = { close: d.close, currency: d.currency, date: d.date, src: d.src, at: Date.parse(market.generatedAt) || Date.now() };
        it.symbol = d.symbol; delete stockState[it.id]; changed = true;
      }
    }
    // 2) 資料檔沒有的,才即時查詢(非官方來源)
    const stale = (it) => !ST.dataQuote(market, it.symbol) && (force || !it.quote || Date.now() - it.quote.at > HOURS6);
    if (!targets.some(stale)) {
      repriceStocks(); if (changed) { saveAll(); if ($('#view-rewards').classList.contains('active')) renderItems(); }
      if (force && onlyId) toast(t('toast.quoteUpdated'));
      return;
    }
    refreshing = true;
    try {
      await ensureRates(force);
      for (const it of targets) {
        if (!stale(it)) continue;
        stockState[it.id] = 'loading'; if ($('#view-rewards').classList.contains('active')) renderItems();
        try {
          const q = await ST.fetchQuote(it.symbol, { proxy: settings.quoteProxy });
          it.quote = { close: q.close, currency: q.currency, date: q.date, src: 'live', at: Date.now() };
          it.symbol = q.yahoo || it.symbol;
          delete stockState[it.id];
        } catch (e) { stockState[it.id] = 'error'; }
      }
      repriceStocks(); saveAll();
      if (force) toast(t('toast.quoteUpdated'));
    } finally {
      refreshing = false;
      if ($('#view-rewards').classList.contains('active')) renderItems();
      tick();
    }
  }

  /* ---------- 切換國家:幣別、物價、(未手動改過的)時薪與加班倍率 ---------- */
  function applyCountry(code) {
    if (!P.COUNTRIES[code] || code === settings.country) { fillSelects(); return; }
    flushRecords();
    itemsAll[settings.country] = { v: P.VERSION, items }; // 先存好目前國家的清單
    const c = P.COUNTRIES[code];
    settings.country = code; settings.currency = c.currency;
    items = listFor(code); // 只載入該國自己的清單(含你在該國新增的項目與股票)
    const msg = [t('toast.country', { country: t('country.' + code), cur: cur().symbol })];
    if (!settings.wageTouched) { settings.hourly = c.hourly; msg.push(t('toast.countryWage')); } else msg.push(t('toast.countryKeep', { cur: cur().symbol }));
    if (!settings.otTouched) { settings.ot = clone(c.ot); settings.regularHours = 8; }
    lastNotifyBucket = null;
    repriceStocks(); saveAll(); fillSettings(); fillSelects(); renderItems(); tick();
    toast(msg.join(' '));
    refreshQuotes(false);
  }
  for (const sel of $$('.country-select')) sel.onchange = (e) => applyCountry(e.target.value);

  /* ---------- 股票對話框 ---------- */
  const sDlg = $('#stockDialog'), sForm = $('#stockForm');
  let stockPick = null, stockQuote = null, editingStock = null, searchSeq = 0, lastResults = [];
  const allowedMarkets = () => P.COUNTRIES[settings.country].markets;
  function fillMarkets(extra) {
    const ms = allowedMarkets().concat(extra && !allowedMarkets().includes(extra) ? [extra] : []);
    $('#stockMarket').innerHTML = ms.map((m) => `<option value="${m}">${t('stock.mkt.' + m)}</option>`).join('');
  }
  const baseHint = () => t('stock.noPick') + (settings.country === 'PH' ? ' ' + t('stock.phNote') : '');
  const setStatus = (text) => { $('#stockStatus').textContent = text; };
  const fmtNative = (q) => t('stock.got', { price: num(q.close, { maximumFractionDigits: 2 }), cur: q.currency, date: q.date }) + ' ・' + srcLabel(q.src);
  function openStock(id) {
    editingStock = id || null;
    const it = items.find((i) => i.id === id);
    stockPick = it ? { symbol: it.symbol, market: it.market, name: it.name } : null;
    stockQuote = it ? it.quote : null;
    fillMarkets(it && it.market);
    sForm.market.value = it ? it.market : allowedMarkets()[0];
    sForm.q.value = it ? it.symbol : '';
    sForm.manual.value = it && it.manual > 0 ? it.manual : '';
    $('#stockManualLabel').textContent = t('stock.manual', { cur: cur().symbol });
    $('#stockResults').innerHTML = '';
    $('#stockDialogTitle').textContent = t(it ? 'stock.edit' : 'stock.title');
    $('#btnSubmitStock').textContent = t(it ? 'dlg.save' : 'stock.add');
    $('#btnDeleteStock').style.display = it ? '' : 'none';
    setStatus(it ? (stockQuote ? t('stock.picked', { name: it.name, sym: it.symbol }) + '・' + fmtNative(stockQuote) : t('stock.picked', { name: it.name, sym: it.symbol })) : baseHint());
    sDlg.showModal();
  }
  async function pickStock(r) {
    stockPick = r; stockQuote = null;
    sForm.market.value = r.market;
    for (const b of $$('#stockResults button')) b.classList.toggle('sel', b.dataset.sym === r.symbol);
    const seq = ++searchSeq;
    const showPicked = (q) => {
      const local = ST.convert(q.close, q.currency, settings.currency, fx.rates);
      setStatus(t('stock.picked', { name: stockPick.name, sym: stockPick.symbol }) + '・' + fmtNative(q) + (q.currency !== settings.currency ? (local != null ? ` ≈ ${money0(local)}` : ' ・' + t('stock.fx', { cur: cur().symbol })) : ''));
    };
    const d = ST.dataQuote(market, r.symbol);
    if (d) { // 每日資料檔(台股為官方資料)→ 不需即時查詢
      stockQuote = { close: d.close, currency: d.currency, date: d.date, src: d.src, at: Date.now() };
      stockPick = { ...r, symbol: d.symbol, name: d.name };
      await ensureRates(false);
      if (seq === searchSeq) showPicked(stockQuote);
      return;
    }
    setStatus(t('stock.fetching'));
    try {
      const q = await ST.fetchQuote(r.symbol, { proxy: settings.quoteProxy });
      if (seq !== searchSeq) return;
      stockQuote = { close: q.close, currency: q.currency, date: q.date, src: 'live', at: Date.now() };
      stockPick = { ...r, symbol: q.yahoo || r.symbol };
      await ensureRates(false);
      showPicked(stockQuote);
    } catch (e) {
      if (seq === searchSeq) setStatus(t('stock.fail'));
    }
  }
  /** 在指定市場搜尋:資料檔(官方簡稱/代碼)→ 別名(中日英俗稱)→ 直接當代碼 */
  function searchIn(q, mk) {
    let results = ST.dataSearch(marketData(), q, [mk]);
    for (const r of ST.search(q, mk)) if (r.market === mk && !results.some((x) => x.symbol === r.symbol)) results.push(r);
    const direct = ST.normalizeSymbol(mk, q);
    if (direct && !results.some((r) => r.symbol === direct || r.symbol === direct.replace(/\.TW$/, '.TWO'))) {
      const d = ST.dataQuote(marketData(), direct);
      results.unshift(d ? { symbol: d.symbol, market: mk, name: d.name } : { symbol: direct, market: mk, name: direct });
    }
    // 完整代碼要優先:輸入 GOOG 不能先選到 GOOGL
    const exact = (r) => direct && (r.symbol === direct || r.symbol === direct.replace(/\.TW$/, '.TWO'));
    results.sort((a, b) => (exact(b) ? 1 : 0) - (exact(a) ? 1 : 0));
    return { results: results.slice(0, 8), direct };
  }
  async function doStockSearch() {
    const q = sForm.q.value.trim();
    if (!q) return;
    const mk0 = sForm.market.value;
    // 先找選定的市場;找不到再找這個國家允許的其他市場(例如在「台股」輸入 GOOG,自動改查美股)
    let mk = mk0, found = searchIn(q, mk0);
    if (!found.results.length || (found.results.length === 1 && found.results[0].name === found.results[0].symbol && !ST.dataQuote(marketData(), found.results[0].symbol))) {
      for (const m of allowedMarkets()) {
        if (m === mk0) continue;
        const f = searchIn(q, m);
        if (f.results.length && !(f.results.length === 1 && f.results[0].name === f.results[0].symbol && !ST.dataQuote(marketData(), f.results[0].symbol))) { mk = m; found = f; break; }
      }
    }
    let results = found.results;
    const direct = found.direct;
    if (mk !== mk0) { fillMarkets(); sForm.market.value = mk; }
    const draw = () => {
      lastResults = results;
      $('#stockResults').innerHTML = results.map((r) => `<button type="button" data-sym="${esc(r.symbol)}"><span>${esc(r.name)}</span><small>${esc(r.symbol)}・${t('stock.mkt.' + r.market)}</small></button>`).join('');
    };
    draw();
    if (!results.length) {
      setStatus(t('stock.searching'));
      try { results = (await ST.remoteSearch(q, { proxy: settings.quoteProxy, lang: I.lang === 'ja' ? 'ja-JP' : I.lang === 'en' ? 'en-US' : 'zh-TW' })).filter((r) => r.market === mk); } catch (e) { results = []; }
      draw();
      if (!results.length) { setStatus(t('stock.noResult')); return; }
    }
    const isExact = direct && (results[0].symbol === direct || results[0].symbol === direct.replace(/\.TW$/, '.TWO'));
    if (results.length === 1 || isExact) pickStock(results[0]); else setStatus(baseHint());
  }
  $('#btnStockSearch').onclick = doStockSearch;
  sForm.q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doStockSearch(); } });
  $('#stockResults').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const sym = b.dataset.sym;
    pickStock(lastResults.find((x) => x.symbol === sym) || { symbol: sym, market: sForm.market.value, name: b.firstChild.textContent });
  });
  $('#btnCancelStock').onclick = () => sDlg.close();
  $('#btnDeleteStock').onclick = () => {
    if (confirm(t('confirm.delItem'))) { items = items.filter((i) => i.id !== editingStock); saveAll(); renderItems(); tick(); sDlg.close(); }
  };
  sForm.onsubmit = (e) => {
    // 沒選到股票時,若輸入像代碼就直接用;否則留在對話框
    if (!stockPick) {
      const direct = ST.normalizeSymbol(sForm.market.value, sForm.q.value);
      if (!direct) { e.preventDefault(); setStatus(t('stock.noPick')); return; }
      stockPick = { symbol: direct, market: sForm.market.value, name: direct };
    }
    const manual = Math.max(0, Number(sForm.manual.value) || 0);
    const data = { kind: 'stock', category: 'stock', name: stockPick.name, symbol: stockPick.symbol, market: stockPick.market || sForm.market.value, quote: stockQuote, manual };
    const it = items.find((i) => i.id === editingStock);
    if (it) Object.assign(it, data); else items.push({ id: newId(), enabled: true, price: 0, ...data });
    repriceStocks(); saveAll(); renderItems(); tick();
    if (!it) toast(t('toast.stockAdded', { name: data.name }));
    if (!stockQuote && !manual) refreshQuotes(true);
  };

  /* ---------- 啟動 ---------- */
  A.hydrate();
  const pat = A.url('backgrounds.coffee_doodle_pattern');
  if (pat) document.documentElement.style.setProperty('--pattern-url', `url("${pat}")`);
  I.apply(); fillSelects(); fillSettings(); applyMode();
  flushRecords();
  renderItems(); renderHistory(); renderStats();
  let v = 'home';
  try { v = sessionStorage.getItem('wh.view') || 'home'; } catch (e) { /* ignore */ }
  showView(v);
  setInterval(tick, 250);
  repriceStocks();
  loadMarket().then(() => { repriceStocks(); refreshQuotes(false); if ($('#view-rewards').classList.contains('active')) renderItems(); });
  // 舊版 Safari(< 15.4)沒有 <dialog>:補上最小可用的 showModal / close
  for (const d of $$('dialog')) {
    if (typeof d.showModal === 'function') continue;
    d.classList.add('poly');
    d.showModal = function () { this.setAttribute('open', ''); };
    d.close = function () { this.removeAttribute('open'); };
    const f = d.querySelector('form[method=dialog]');
    if (f) f.addEventListener('submit', (e) => { if (!e.defaultPrevented) { e.preventDefault(); d.close(); } });
  }
  setInterval(() => refreshQuotes(false), 30 * 60000);
  document.addEventListener('visibilitychange', tick);
  if (!hadSettings) { saveAll(); toast(t('toast.first')); }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
