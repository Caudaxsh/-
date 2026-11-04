(function () {
  'use strict';
  const D = window.Defaults;
  const C = window.Core;
  const A = window.Assets;
  const K = { settings: 'wh.settings.v1', items: 'wh.items.v1', shifts: 'wh.shifts.v1', active: 'wh.active.v1' };

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
  function put(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ } }
  function drop(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  function saveAll() { put(K.settings, settings); put(K.items, items); put(K.shifts, shifts); active ? put(K.active, active) : drop(K.active); }
  function merge(base, over) {
    const out = clone(base);
    for (const k in over) out[k] = over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) ? Object.assign(out[k] || {}, over[k]) : over[k];
    return out;
  }

  let settings = merge(D.SETTINGS, load(K.settings, {}));
  let items = load(K.items, D.ITEMS);
  let shifts = load(K.shifts, []);
  let active = load(K.active, null);
  if (active && (typeof active.start !== 'number' || active.end != null)) active = null;
  if (new URLSearchParams(location.search).get('mini') === '1') settings.mini = true;

  /* ---------- 格式化 ---------- */
  const cur = () => D.CURRENCIES[settings.currency] || D.CURRENCIES.TWD;
  const num = (v, opt) => (Number(v) || 0).toLocaleString(cur().locale, opt);
  const money = (v, sym = true) => (sym ? cur().symbol + ' ' : '') + num(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money0 = (v) => cur().symbol + ' ' + num(v, { maximumFractionDigits: 2 });
  const hm = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return Math.floor(m / 60) + ':' + pad(m % 60); };
  const hmText = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return Math.floor(m / 60) + ' 小時 ' + (m % 60) + ' 分'; };
  const clock = (ms) => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const dayLabel = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} 週${WD[d.getDay()]}`; };

  /* ---------- 綁定 ---------- */
  function bind(name, text) {
    for (const el of document.querySelectorAll(`[data-bind="${name}"]`)) if (el.textContent !== text) el.textContent = text;
  }
  const PHASE = { idle: '尚未上班', working: '上班中', break: '休息中', done: '已下班' };

  function mascotFor(T) {
    if (T.phase === 'idle' || T.phase === 'done') return T.goalRatio >= 1 && T.phase === 'done' ? 'cow_saving_money' : 'cow_sleeping';
    if (T.goalRatio >= 1) return 'cow_saving_money';
    return T.phase === 'break' ? 'cow_holding_coffee' : 'cow_working_laptop';
  }

  function ctxNow() { return C.today(settings, shifts, active, Date.now()); }

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
    const T = ctxNow();
    const a = T.a;
    bind('cur', cur().symbol);
    bind('earned', money(T.earned, false));
    const chip = $('#phaseChip');
    chip.textContent = PHASE[T.phase];
    chip.className = 'chip ' + T.phase;
    bind('worked', C.fmtHMS(T.workedMs));
    bind('rateLine', a && a.ratePerHour
      ? `時薪 ${money(settings.hourly)}${a.mult > 1 ? `・加班 ×${a.mult}` : ''}・每分鐘 ${money(a.ratePerHour / 60)}`
      : `時薪 ${money(settings.hourly)}${a ? '・暫停計薪' : ''}`);
    bind('goalAmt', money0(T.goal));
    bind('goalPct', (T.goalRatio * 100).toFixed(0) + '%');
    const bar = $('#goalBar');
    bar.style.width = (T.goalRatio * 100).toFixed(1) + '%';
    bar.classList.toggle('full', T.goalRatio >= 1);

    bind('breakInfo', `休息 ${a ? Math.floor(a.breakMs / 60000) : 0} 分鐘`);
    if (T.sched != null) {
      const diff = T.sched - T.now;
      bind('endLabel', diff >= 0 ? '距離預定下班' : '已超過預定下班');
      bind('toEnd', (diff >= 0 ? '' : '+') + C.fmtHMS(Math.abs(diff)));
      bind('endInfo', '預定 ' + clock(T.sched));
    } else {
      bind('endLabel', '預定下班');
      bind('toEnd', T.phase === 'done' ? '已下班' : '—');
      bind('endInfo', `${settings.start} – ${settings.end}`);
    }

    // 控制鈕
    const manualOpen = !!(active && active.breaks.some((b) => b.e == null));
    $('#btnStart').disabled = !!active;
    $('#btnBreak').disabled = !active || (T.phase === 'break' && !manualOpen);
    $('#btnEnd').disabled = !active;
    const bl = !active ? '休息' : manualOpen ? '繼續' : T.phase === 'break' ? '午休中' : '休息';
    if ($('#breakLabel').textContent !== bl) $('#breakLabel').textContent = bl;
    const bi = $('#btnBreak img');
    const want = A.url(manualOpen ? 'ui_icons.play' : 'ui_icons.pause');
    if (bi.getAttribute('src') !== want) bi.setAttribute('src', want);

    // 吉祥物(只有一隻)
    const m = A.url('mascot.' + mascotFor(T));
    const mi = $('#mascot');
    if (mi.getAttribute('src') !== m) mi.setAttribute('src', m);

    // 下一個換算目標
    const g = nearestReward(T);
    let html;
    if (g) {
      const verb = g.p.kind === 'goal' ? '就能解鎖' : '就能買一份';
      html = `${active ? '' : '開始上班後,'}再工作約 <b>${C.fmtDuration(g.p.minutes)}</b>,${verb}<b>${esc(g.it.name)}</b>`;
      html = `<span class="next-ico">${A.img('reward_icons.' + iconOf(g.it))}</span><span class="next-text">${html}</span>`;
    } else {
      html = `<span class="next-ico">${A.img('brand.coffee_cup_illustration')}</span><span class="next-text">${items.length ? '目前所有目標都已解鎖,太強了!' : '到「換算」新增一個消費目標吧'}</span>`;
    }
    if (html !== lastNext) { $('#nextReward').innerHTML = html; lastNext = html; }

    if ($('#view-rewards').classList.contains('active')) updateItems(T);
    maybeNotify(T);
  }
  const iconOf = (it) => it.icon || D.ICON_BY_CATEGORY[it.category] || 'coffee_to_go';

  /* ---------- 定時提示 ---------- */
  function maybeNotify(T) {
    const every = Number(settings.notifyEvery);
    if (!every || !T.a || T.phase !== 'working') return;
    const bucket = Math.floor(T.a.workedMin / every);
    if (lastNotifyBucket === null) { lastNotifyBucket = bucket; return; }
    if (bucket > lastNotifyBucket) {
      lastNotifyBucket = bucket;
      const msg = `今天已經賺了 ${money(T.earned)}`;
      toast(msg);
      if (settings.useSystemNotification && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('牛馬薪水計', { body: msg, icon: A.url('brand.app_icon_512'), silent: true }); } catch (e) { /* ignore */ }
      }
    }
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
  }

  /* ---------- 上班 / 休息 / 下班 ---------- */
  $('#btnStart').onclick = () => {
    if (active) return;
    active = C.startShift(Date.now(), newId());
    lastNotifyBucket = null;
    saveAll(); tick(); toast('開始計薪,今天也辛苦了');
  };
  $('#btnBreak').onclick = () => {
    if (!active) return;
    C.toggleBreak(active, Date.now());
    saveAll(); tick();
  };
  $('#btnEnd').onclick = () => {
    if (!active) return;
    const now = Date.now();
    const f = C.finishShift(active, settings, now);
    shifts.push(f); active = null;
    saveAll(); renderHistory(); tick();
    toast(`下班!這一班賺了 ${money(f.earned)}(工時 ${hmText(f.workedMs)})`);
  };
  // 忘記下班:隔很久才開啟頁面
  if (active && Date.now() - active.start > 16 * C.HOUR) {
    if (confirm('上次上班的班次已持續超過 16 小時,還要繼續計時嗎?\n按「取消」會以預定下班時間結束該班次。')) { /* 繼續 */ } else {
      const endAt = Math.max(active.start, Math.min(C.scheduledEnd(active.start, settings), Date.now()));
      shifts.push(C.finishShift(active, settings, endAt)); active = null; saveAll();
    }
  }

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
    if (p.invalid) return { main: '價格無效', sub: '', ratio: 0 };
    const left = () => {
      if (!isFinite(p.minutes)) return '無法估算';
      let s = `還需工作 <b>${C.fmtDuration(p.minutes)}</b>`;
      if (p.eta != null) s += p.beyondEnd ? (p.days > 1 ? `(約 ${p.days.toFixed(1)} 個工作天)` : '(需加班)') : `(預計 ${clock(p.eta)})`;
      else if (p.days > 1) s += `(約 ${p.days.toFixed(1)} 個工作天)`;
      return s;
    };
    if (p.kind === 'goal') {
      if (p.unlocked) return { main: '<span class="badge">已解鎖</span>', sub: `目標 ${money0(p.price)}${p.saved ? `(含已存 ${money0(p.saved)})` : ''}`, ratio: 1 };
      return { main: `<span class="item-count">${(p.ratio * 100).toFixed(1)}<small>%</small></span>`, sub: `還差 <b>${money(p.gap)}</b>｜${left()}`, ratio: p.ratio };
    }
    return { main: `<span class="item-count">${p.count}<small> 份</small></span>`, sub: `下一份還差 <b>${money(p.gap)}</b>｜${left()}`, ratio: p.ratio };
  }
  function renderItems() {
    $('#itemList').innerHTML = items.map((it) => `
      <div class="card item ${it.enabled === false ? 'off' : ''}" data-id="${it.id}">
        <div class="item-ico">${A.img('reward_icons.' + iconOf(it))}</div>
        <div>
          <div class="item-head">
            <div class="item-name">${esc(it.name)}<span class="item-cat">${esc(it.category)}${it.kind === 'goal' ? '・目標' : ''}</span></div>
            <div class="item-price amount">${money0(it.price)}</div>
          </div>
          <div data-role="main"></div>
          <div class="bar"><i data-role="bar"></i></div>
          <div class="item-sub" data-role="sub"></div>
          <div class="item-actions"><button data-act="edit">編輯</button><button data-act="toggle">${it.enabled === false ? '啟用' : '停用'}</button></div>
        </div>
      </div>`).join('') || `<div class="card empty">${A.img('brand.coffee_cup_illustration')}還沒有項目,按「＋ 新增」建立。</div>`;
    updateItems(ctxNow());
  }
  function updateItems(T) {
    for (const it of items) {
      const el = $(`.item[data-id="${it.id}"]`);
      if (!el) continue;
      const main = $('[data-role=main]', el), sub = $('[data-role=sub]', el), bar = $('[data-role=bar]', el);
      if (it.enabled === false) { main.innerHTML = ''; sub.textContent = '已停用'; bar.style.width = '0'; continue; }
      const s = itemSummary(C.itemProgress(T, it));
      if (main.innerHTML !== s.main) main.innerHTML = s.main;
      if (sub.innerHTML !== s.sub) sub.innerHTML = s.sub;
      bar.style.width = (Math.max(0, Math.min(1, s.ratio)) * 100).toFixed(1) + '%';
    }
  }

  const dlg = $('#itemDialog'), form = $('#itemForm');
  let editingId = null;
  function previewIcon() { $('#itemIconPreview').setAttribute('src', A.url('reward_icons.' + form.icon.value)); }
  function syncSaved() { $('#savedField').style.display = form.kind.value === 'goal' ? '' : 'none'; }
  function openItem(id) {
    editingId = id;
    const it = items.find((i) => i.id === id) || { category: '娛樂', name: '', price: '', kind: 'consumable', saved: '', icon: D.ICON_BY_CATEGORY['娛樂'] };
    form.category.value = it.category; form.name.value = it.name; form.price.value = it.price;
    form.kind.value = it.kind; form.saved.value = it.saved || ''; form.icon.value = iconOf(it);
    $('#itemDialogTitle').textContent = id ? '編輯項目' : '新增項目';
    $('#btnDeleteItem').style.display = id ? '' : 'none';
    syncSaved(); previewIcon(); dlg.showModal();
  }
  form.category.onchange = () => {
    form.icon.value = D.ICON_BY_CATEGORY[form.category.value] || form.icon.value;
    if (form.category.value === '個人目標') form.kind.value = 'goal';
    syncSaved(); previewIcon();
  };
  form.icon.onchange = previewIcon;
  form.kind.onchange = syncSaved;
  $('#btnAddItem').onclick = () => openItem(null);
  $('#btnCancelItem').onclick = () => dlg.close();
  $('#btnDeleteItem').onclick = () => {
    if (confirm('確定刪除這個項目?')) { items = items.filter((i) => i.id !== editingId); saveAll(); renderItems(); tick(); dlg.close(); }
  };
  form.onsubmit = () => {
    const data = {
      category: form.category.value, name: form.name.value.trim() || form.category.value, icon: form.icon.value,
      price: Math.max(0.01, Number(form.price.value) || 0.01), kind: form.kind.value,
      saved: form.kind.value === 'goal' ? Math.max(0, Number(form.saved.value) || 0) : 0,
    };
    const it = items.find((i) => i.id === editingId);
    if (it) Object.assign(it, data); else items.push({ id: newId(), enabled: true, ...data });
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
    const lunch = items.find((i) => i.category === '便當');
    if (lunch && D.CITY_LUNCH[settings.city]) lunch.price = D.CITY_LUNCH[settings.city];
    saveAll(); renderItems(); tick();
    toast(`便當參考價已套用 ${settings.city}:${money0(lunch ? lunch.price : 0)}(可自行編輯)`);
  };

  /* ---------- 班次紀錄 ---------- */
  function renderHistory() {
    const list = shifts.slice().sort((a, b) => b.start - a.start);
    if (!list.length) {
      $('#historyList').innerHTML = `<div class="card empty">${A.img('brand.coffee_cup_illustration')}還沒有班次紀錄<br>按「下班」或「＋ 補登」就會出現在這裡</div>`;
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
          <div class="shift-time">${clock(s.start)} – ${clock(s.end)}${crossed ? '<sup>+1</sup>' : ''}${ot > 0 ? `<span class="tag">加班 ${hm(ot)}</span>` : ''}</div>
          <div class="shift-meta">工時 ${hm(s.workedMs)}・休息 ${Math.round((s.end - s.start - s.workedMs) / 60000)} 分${s.manual ? '・補登' : ''}</div>
        </div>
        <div class="shift-pay amount">${money(s.earned)}</div>
        <button class="shift-del" aria-label="刪除這筆紀錄" title="刪除">×</button>
      </div>`;
    }
    $('#historyList').innerHTML = html;
  }
  $('#historyList').addEventListener('click', (e) => {
    if (!e.target.classList.contains('shift-del')) return;
    const id = e.target.closest('.shift').dataset.id;
    if (confirm('確定刪除這筆班次紀錄?')) { shifts = shifts.filter((s) => s.id !== id); saveAll(); renderHistory(); tick(); }
  });

  const shiftDlg = $('#shiftDialog'), shiftForm = $('#shiftForm');
  const toLocalInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function previewShift() {
    const s = new Date(shiftForm.start.value).getTime(), e = new Date(shiftForm.end.value).getTime();
    const out = $('#shiftPreview');
    if (!isFinite(s) || !isFinite(e)) { out.textContent = ''; return null; }
    if (e <= s) { out.textContent = '下班時間必須晚於上班時間'; return null; }
    if (e - s > 24 * C.HOUR) { out.textContent = '單一班次不能超過 24 小時'; return null; }
    const m = C.manualShift(s, e, Number(shiftForm.breakMin.value) || 0, settings, 'preview');
    out.textContent = `預計工時 ${hmText(m.workedMs)}・薪資 ${money(m.earned)}`;
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
    toast('已加入班次紀錄');
  };
  $('#btnExportCsv').onclick = () => {
    if (!shifts.length) { toast('目前沒有可匯出的紀錄'); return; }
    const rows = [['日期', '上班', '下班', '工時(小時)', '休息(分鐘)', '薪資', '時薪']];
    for (const s of shifts.slice().sort((a, b) => a.start - b.start)) {
      const d = new Date(s.start);
      rows.push([`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, clock(s.start), clock(s.end),
        (s.workedMs / C.HOUR).toFixed(2), Math.round((s.end - s.start - s.workedMs) / 60000), s.earned.toFixed(2), s.cfg ? s.cfg.hourly : '']);
    }
    download('workhorse-shifts.csv', '﻿' + rows.map((r) => r.join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- 統計 ---------- */
  const now0 = new Date();
  let statYear = now0.getFullYear(), statMonth = now0.getMonth();
  function renderStats() {
    $('#monthTitle').textContent = `${statYear} 年 ${statMonth + 1} 月`;
    const st = C.monthStats(shifts, statYear, statMonth);
    if (!st.count) {
      $('#statsBody').innerHTML = `<div class="card empty">${A.img('mascot.cow_sleeping', 'wide')}這個月還沒有班次紀錄</div>`;
      return;
    }
    const max = Math.max(...st.days.map((d) => d.earned), 1);
    const isCur = statYear === now0.getFullYear() && statMonth === now0.getMonth();
    const dim = st.days.length;
    $('#statsBody').innerHTML = `
      <div class="card stat-hero">
        <small>本月累積薪資</small>
        <div class="money amount"><span class="cur">${cur().symbol}</span> ${money(st.earned, false)}</div>
        <div class="stat-grid">
          <div><small>總工時</small><b>${hmText(st.workedMs)}</b></div>
          <div><small>出勤天數</small><b>${st.workDays} 天(${st.count} 班)</b></div>
          <div><small>平均每個工作日</small><b class="amount">${money(st.avgPerDay)}</b></div>
          <div><small>實際平均時薪</small><b class="amount">${money(st.effHourly)}</b></div>
          <div><small>加班工時</small><b>${hmText(st.otMs)}</b></div>
          <div><small>最高單日</small><b class="amount">${st.best ? `${statMonth + 1}/${st.best.day} ${money0(st.best.earned)}` : '—'}</b></div>
        </div>
      </div>
      <div class="card">
        <h2>每日薪資</h2>
        <div class="chart">${st.days.map((d) => `<i class="${d.earned > 0 ? 'has' : ''} ${isCur && d.day === now0.getDate() ? 'today' : ''}" style="height:${d.earned > 0 ? Math.max(4, (d.earned / max) * 100) : 2}%" title="${statMonth + 1}/${d.day}:${money(d.earned)}"></i>`).join('')}</div>
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
    renderBreaks(); timeNote();
  }
  function timeNote() {
    const planned = C.plannedWorkMin(settings);
    $('#timeNote').textContent = `預定計薪 ${hmText(planned * 60000)}(已扣除固定休息)・今日預估 ${money(C.earnedForWorked(settings, planned))}`;
  }
  function renderBreaks() {
    $('#breakList').innerHTML = (settings.autoBreaks || []).map((b) => `
      <div class="break-row" data-id="${b.id}">
        <input type="checkbox" data-bk="enabled" ${b.enabled !== false ? 'checked' : ''} aria-label="啟用">
        <input type="time" data-bk="start" value="${b.start}">
        <input type="time" data-bk="end" value="${b.end}">
        <button class="btn small danger" data-bk="del">刪除</button>
      </div>`).join('') || '<p class="note">沒有固定休息時段。</p>';
  }
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.set) {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number' || el.dataset.set === 'notifyEvery') { v = Number(v); if (!isFinite(v)) return; }
      setPath(settings, el.dataset.set, v);
      if (el.dataset.set === 'useSystemNotification' && v && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      if (el.dataset.set === 'hideAmount') applyMode();
      afterSettings(el.dataset.set === 'currency');
    } else if (el.dataset && el.dataset.bk && el.dataset.bk !== 'del') {
      const b = settings.autoBreaks.find((x) => x.id === el.closest('.break-row').dataset.id);
      if (!b) return;
      if (el.dataset.bk === 'enabled') b.enabled = el.checked; else if (el.value) b[el.dataset.bk] = el.value;
      afterSettings();
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.dataset && e.target.dataset.bk === 'del') {
      const id = e.target.closest('.break-row').dataset.id;
      settings.autoBreaks = settings.autoBreaks.filter((x) => x.id !== id);
      renderBreaks(); afterSettings();
    }
  });
  function afterSettings(rerender) { saveAll(); timeNote(); lastNotifyBucket = null; if (rerender) { renderItems(); renderHistory(); renderStats(); } tick(); }
  $('#btnAddBreak').onclick = () => {
    settings.autoBreaks.push({ id: newId(), start: '15:00', end: '15:15', enabled: true });
    renderBreaks(); afterSettings();
  };
  $('#btnReset').onclick = () => {
    if (!confirm('確定要把「設定與換算項目」還原成預設值嗎?(班次紀錄會保留)')) return;
    settings = clone(D.SETTINGS); items = clone(D.ITEMS);
    saveAll(); applyMode(); fillSettings(); fillSelects(); renderItems(); tick();
  };
  $('#btnBackup').onclick = () => download('workhorse-backup.json', JSON.stringify({ app: 'workhorse', v: 1, settings, items, shifts, active }, null, 2), 'application/json');
  $('#btnRestore').onclick = () => $('#fileRestore').click();
  $('#fileRestore').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'workhorse') throw new Error('format');
      if (!confirm('匯入會覆蓋目前的設定、換算項目與班次紀錄,確定嗎?')) return;
      settings = merge(D.SETTINGS, d.settings || {}); items = d.items || clone(D.ITEMS); shifts = d.shifts || []; active = d.active || null;
      saveAll(); applyMode(); fillSettings(); fillSelects(); renderItems(); renderHistory(); renderStats(); tick();
      toast('已匯入備份');
    } catch (err) { toast('檔案格式不正確'); }
  };

  function fillSelects() {
    $('#citySelect').innerHTML = Object.keys(D.CITY_LUNCH).map((c) => `<option>${c}</option>`).join('');
    $('#citySelect').value = settings.city;
    $('#currencySelect').innerHTML = Object.values(D.CURRENCIES).map((c) => `<option value="${c.code}">${c.symbol} ${c.name}</option>`).join('');
    $('#currencySelect').value = settings.currency;
    form.category.innerHTML = D.CATEGORIES.map((c) => `<option>${c}</option>`).join('');
    form.icon.innerHTML = Object.keys(D.REWARD_ICON_LABELS).filter((k) => A.url('reward_icons.' + k)).map((k) => `<option value="${k}">${D.REWARD_ICON_LABELS[k]}</option>`).join('');
  }

  /* ---------- 模式 ---------- */
  function autoSmall() { return window.innerHeight <= 260 && window.innerWidth <= 420; }
  function applyMode() {
    document.body.classList.toggle('mini', !!settings.mini || autoSmall());
    document.body.classList.toggle('hide-amount', !!settings.hideAmount);
    $('#btnMini').textContent = document.body.classList.contains('mini') ? '展開' : '迷你';
  }
  function resizeWindow(w, h) {
    try {
      window.resizeTo(w + (window.outerWidth - window.innerWidth), h + (window.outerHeight - window.innerHeight));
    } catch (e) { /* 一般分頁不允許調整大小 */ }
  }
  $('#btnMini').onclick = () => {
    const goMini = !document.body.classList.contains('mini');
    settings.mini = goMini; saveAll(); applyMode();
    resizeWindow(goMini ? 330 : 400, goMini ? 190 : 540);
  };
  window.addEventListener('resize', applyMode);
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'h' || e.key === 'H') { settings.hideAmount = !settings.hideAmount; saveAll(); applyMode(); fillSettings(); }
  });

  /* ---------- 成果卡 ---------- */
  const imgCache = {};
  async function img(ref) { return imgCache[ref] || (imgCache[ref] = await A.loadImage(ref)); }
  async function drawCard() {
    const T = ctxNow();
    const lines = [];
    for (const it of items) {
      if (it.enabled === false || it.kind === 'goal') continue;
      const n = Math.floor(T.earned / it.price + 1e-9);
      if (n >= 1) lines.push({ label: it.name, value: `× ${n}`, n, ref: 'reward_icons.' + iconOf(it) });
    }
    lines.sort((a, b) => b.n - a.n);
    for (const g of items.filter((it) => it.enabled !== false && it.kind === 'goal' && C.itemProgress(T, it).unlocked)) {
      lines.unshift({ label: g.name, value: '已解鎖', ref: 'reward_icons.' + iconOf(g) });
    }
    if (!lines.length) lines.push({ label: '第一份快到了,繼續努力', value: '…', ref: 'brand.coffee_cup_illustration' });
    const top = lines.slice(0, 3);
    for (const l of top) l.icon = await img(l.ref);
    const d = new Date();
    ShareCard.draw($('#shareCanvas'), {
      dateText: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
      amountText: $('#shareShowAmount').checked ? money(T.earned) : null,
      workedText: hmText(T.workedMs), lines: top, logo: await img('brand.cow_coffee_logo'),
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
      toast('已複製圖片');
    } catch (e) { toast('此瀏覽器無法複製,請改用下載'); }
  };

  /* ---------- 啟動 ---------- */
  A.hydrate();
  const pat = A.url('backgrounds.coffee_doodle_pattern');
  if (pat) document.documentElement.style.setProperty('--pattern-url', `url("${pat}")`);
  fillSelects(); fillSettings(); applyMode(); renderItems(); renderHistory(); renderStats();
  let first = !localStorage.getItem(K.settings);
  let v = 'home';
  try { v = sessionStorage.getItem('wh.view') || 'home'; } catch (e) { /* ignore */ }
  showView(v === 'settings' ? 'home' : v);
  setInterval(tick, 250);
  document.addEventListener('visibilitychange', tick);
  if (first) { saveAll(); toast('先到右上角齒輪設定你的時薪與上下班時間'); }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
