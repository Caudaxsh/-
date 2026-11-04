(function () {
  'use strict';
  const D = window.Defaults;
  const C = window.Core;
  const A = window.Assets;
  const I = window.I18n;
  const t = I.t;
  const K = { settings: 'wh.settings.v1', items: 'wh.items.v2', itemsOld: 'wh.items.v1', shifts: 'wh.shifts.v1', overrides: 'wh.overrides.v1' };

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
  function saveAll() { put(K.settings, settings); put(K.items, items); put(K.shifts, shifts); put(K.overrides, overrides); }
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

  const hadSettings = hasKey(K.settings);
  let settings = merge(D.SETTINGS, load(K.settings, {}));
  delete settings.mini; delete settings.continueOT;
  if (!Array.isArray(settings.workDays)) settings.workDays = clone(D.SETTINGS.workDays);
  if (!settings.lastFinal) settings.lastFinal = C.dayStart(Date.now()) - C.DAY; // 從今天開始記
  let items = hasKey(K.items) ? load(K.items, D.ITEMS) : hasKey(K.itemsOld) ? migrateItems(load(K.itemsOld, [])) : clone(D.ITEMS);
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
  const money0 = (v) => cur().symbol + ' ' + num(v, { maximumFractionDigits: 2 });
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
  const catName = (c) => (D.CATEGORIES.includes(c) ? t('cat.' + c) : c);
  const iconOf = (it) => it.icon || D.ICON_BY_CATEGORY[it.category] || 'coffee_to_go';

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
      if (it.enabled === false) continue;
      const p = C.itemProgress(T, it);
      if (p.invalid || p.unlocked || !isFinite(p.minutes)) continue;
      if (!best || p.minutes < best.p.minutes) best = { it, p };
    }
    return best;
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

    // 下一個換算目標
    const g = nearestReward(T);
    let html;
    if (g) {
      const pre = g.p.later || T.phase === 'off' ? t('next.pre.later') : T.phase === 'before' ? t('next.pre.before') : '';
      const text = t(g.p.kind === 'goal' ? 'next.goal' : 'next.consumable', { pre, time: dur(g.p.minutes), name: esc(itemName(g.it)) });
      html = `<span class="next-ico">${A.img('reward_icons.' + iconOf(g.it))}</span><span class="next-text">${text}</span>`;
    } else {
      html = `<span class="next-ico">${A.img('brand.coffee_cup_illustration')}</span><span class="next-text">${t(items.length ? 'next.allDone' : 'next.none')}</span>`;
    }
    if (html !== lastNext) { $('#nextReward').innerHTML = html; lastNext = html; }

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
  $('#nextReward').onclick = () => showView('rewards');

  /* ---------- 換算項目 ---------- */
  function itemSummary(p) {
    if (p.invalid) return { main: t('item.invalid'), sub: '', ratio: 0 };
    const left = () => {
      if (!isFinite(p.minutes)) return t('item.noEstimate');
      if (p.later) return t('item.later', { time: dur(p.minutes) });
      let s = t('item.left', { time: dur(p.minutes) });
      if (p.eta != null) s += ' ' + (p.beyondEnd ? (p.days > 1 ? t('item.days', { n: p.days.toFixed(1) }) : t('item.ot')) : t('item.eta', { clock: clock(p.eta) }));
      return s;
    };
    if (p.kind === 'goal') {
      if (p.unlocked) return { main: `<span class="badge">${t('item.unlocked')}</span>`, sub: t('item.goalTarget', { price: money0(p.price) }) + (p.saved ? ' ' + t('item.goalSaved', { saved: money0(p.saved) }) : ''), ratio: 1 };
      return { main: `<span class="item-count">${(p.ratio * 100).toFixed(1)}<small>%</small></span>`, sub: `${t('item.gap', { amt: `<b>${money(p.gap)}</b>` })}｜${left()}`, ratio: p.ratio };
    }
    return { main: `<span class="item-count">${p.count}<small>${t('item.unit')}</small></span>`, sub: `${t('item.gapNext', { amt: `<b>${money(p.gap)}</b>` })}｜${left()}`, ratio: p.ratio };
  }
  function renderItems() {
    $('#itemList').innerHTML = items.map((it) => `
      <div class="card item ${it.enabled === false ? 'off' : ''}" data-id="${it.id}">
        <div class="item-ico">${A.img('reward_icons.' + iconOf(it))}</div>
        <div>
          <div class="item-head">
            <div class="item-name">${esc(itemName(it))}<span class="item-cat">${esc(catName(it.category))}${it.kind === 'goal' ? t('item.goalTag') : ''}</span></div>
            <div class="item-price amount">${money0(it.price)}</div>
          </div>
          <div data-role="main"></div>
          <div class="bar"><i data-role="bar"></i></div>
          <div class="item-sub" data-role="sub"></div>
          <div class="item-actions"><button data-act="edit">${t('item.edit')}</button><button data-act="toggle">${it.enabled === false ? t('item.on') : t('item.off')}</button></div>
        </div>
      </div>`).join('') || `<div class="card empty">${A.img('brand.coffee_cup_illustration')}${t('item.empty')}</div>`;
    updateItems(nowT());
  }
  function updateItems(T) {
    for (const it of items) {
      const el = $(`.item[data-id="${it.id}"]`);
      if (!el) continue;
      const main = $('[data-role=main]', el), sub = $('[data-role=sub]', el), bar = $('[data-role=bar]', el);
      if (it.enabled === false) { main.innerHTML = ''; sub.textContent = t('item.disabled'); bar.style.width = '0'; continue; }
      const s = itemSummary(C.itemProgress(T, it));
      if (main.innerHTML !== s.main) main.innerHTML = s.main;
      if (sub.innerHTML !== s.sub) sub.innerHTML = s.sub;
      bar.style.width = (Math.max(0, Math.min(1, s.ratio)) * 100).toFixed(1) + '%';
    }
  }

  const dlg = $('#itemDialog'), form = $('#itemForm');
  let editingId = null;
  const previewIcon = () => $('#itemIconPreview').setAttribute('src', A.url('reward_icons.' + form.icon.value));
  const syncSaved = () => { $('#savedField').style.display = form.kind.value === 'goal' ? '' : 'none'; };
  function openItem(id) {
    editingId = id;
    const it = items.find((i) => i.id === id) || { category: 'fun', name: '', price: '', kind: 'consumable', saved: '', icon: D.ICON_BY_CATEGORY.fun };
    form.category.value = it.category; form.name.value = itemName(it); form.price.value = it.price;
    form.kind.value = it.kind; form.saved.value = it.saved || ''; form.icon.value = iconOf(it);
    $('#itemDialogTitle').textContent = t(id ? 'dlg.item.edit' : 'dlg.item.add');
    $('#btnDeleteItem').style.display = id ? '' : 'none';
    syncSaved(); previewIcon(); dlg.showModal();
  }
  form.category.onchange = () => {
    form.icon.value = D.ICON_BY_CATEGORY[form.category.value] || form.icon.value;
    if (form.category.value === 'goal') form.kind.value = 'goal';
    syncSaved(); previewIcon();
  };
  form.icon.onchange = previewIcon;
  form.kind.onchange = syncSaved;
  $('#btnAddItem').onclick = () => openItem(null);
  $('#btnCancelItem').onclick = () => dlg.close();
  $('#btnDeleteItem').onclick = () => {
    if (confirm(t('confirm.delItem'))) { items = items.filter((i) => i.id !== editingId); saveAll(); renderItems(); tick(); dlg.close(); }
  };
  form.onsubmit = () => {
    const it = items.find((i) => i.id === editingId);
    const typed = form.name.value.trim();
    const data = {
      category: form.category.value, icon: form.icon.value, kind: form.kind.value,
      price: Math.max(0.01, Number(form.price.value) || 0.01),
      saved: form.kind.value === 'goal' ? Math.max(0, Number(form.saved.value) || 0) : 0,
    };
    if (it) {
      Object.assign(it, data);
      if (!(it.nameKey && typed === t(it.nameKey))) { delete it.nameKey; it.name = typed || catName(data.category); } // 使用者改過名字就不再自動翻譯
    } else items.push({ id: newId(), enabled: true, name: typed || catName(data.category), ...data });
    saveAll(); renderItems(); tick();
  };
  $('#itemList').addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    const id = e.target.closest('.item').dataset.id;
    if (act === 'edit') openItem(id);
    if (act === 'toggle') { const it = items.find((i) => i.id === id); it.enabled = it.enabled === false; saveAll(); renderItems(); tick(); }
  });
  $('#citySelect').onchange = (e) => {
    settings.city = e.target.value;
    const lunch = items.find((i) => i.category === 'bento');
    if (lunch && D.CITY_LUNCH[settings.city]) lunch.price = D.CITY_LUNCH[settings.city];
    saveAll(); renderItems(); tick();
    toast(t('toast.city', { city: t('city.' + settings.city), price: money0(lunch ? lunch.price : 0) }));
  };

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
      if (el.dataset.set === 'useSystemNotification' && v && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      if (el.dataset.set === 'hideAmount') applyMode();
      afterSettings(el.dataset.set === 'currency');
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
    const lang = settings.lang;
    settings = clone(D.SETTINGS); settings.lang = lang; settings.lastFinal = C.dayStart(Date.now()) - C.DAY;
    items = clone(D.ITEMS); overrides = {};
    saveAll(); rerenderAll();
  };
  $('#btnBackup').onclick = () => download('workhorse-backup.json', JSON.stringify({ app: 'workhorse', v: 2, settings, items, shifts, overrides }, null, 2), 'application/json');
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
      items = d.items ? migrateItems(d.items) : clone(D.ITEMS); shifts = d.shifts || []; overrides = d.overrides || {};
      I.set(settings.lang || I.detect());
      saveAll(); rerenderAll(); toast(t('toast.restored'));
    } catch (err) { toast(t('toast.badFile')); }
  };

  /* ---------- 下拉選單 / 語言 ---------- */
  function fillSelects() {
    $('#citySelect').innerHTML = Object.keys(D.CITY_LUNCH).map((c) => `<option value="${c}">${t('city.' + c)}</option>`).join('');
    $('#citySelect').value = settings.city;
    $('#currencySelect').innerHTML = Object.values(D.CURRENCIES).map((c) => `<option value="${c.code}">${c.symbol} ${t('cur.' + c.code)}</option>`).join('');
    $('#currencySelect').value = settings.currency;
    $('#notifySelect').innerHTML = [['0', 'set.never'], ['15', 'set.15'], ['30', 'set.30'], ['60', 'set.60']].map(([v, k]) => `<option value="${v}">${t(k)}</option>`).join('');
    $('#notifySelect').value = String(settings.notifyEvery);
    form.category.innerHTML = D.CATEGORIES.map((c) => `<option value="${c}">${t('cat.' + c)}</option>`).join('');
    form.icon.innerHTML = D.REWARD_ICONS.filter((k) => A.url('reward_icons.' + k)).map((k) => `<option value="${k}">${t('icon.' + k)}</option>`).join('');
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
  async function drawCard() {
    const T = nowT();
    const lines = [];
    for (const it of items) {
      if (it.enabled === false || it.kind === 'goal') continue;
      const n = Math.floor(T.earned / it.price + 1e-9);
      if (n >= 1) lines.push({ label: itemName(it), value: `× ${n}`, n, ref: 'reward_icons.' + iconOf(it) });
    }
    lines.sort((a, b) => b.n - a.n);
    for (const g of items.filter((it) => it.enabled !== false && it.kind === 'goal' && C.itemProgress(T, it).unlocked)) {
      lines.unshift({ label: itemName(g), value: t('share.unlocked'), ref: 'reward_icons.' + iconOf(g) });
    }
    if (!lines.length) lines.push({ label: t('share.keepGoing'), value: '…', ref: 'brand.coffee_cup_illustration' });
    const top = lines.slice(0, 3);
    for (const l of top) l.icon = await img(l.ref);
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
  document.addEventListener('visibilitychange', tick);
  if (!hadSettings) { saveAll(); toast(t('toast.first')); }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
