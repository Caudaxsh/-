(function () {
  'use strict';
  const D = window.Defaults;
  const C = window.Core;
  const KEY_S = 'nm.settings.v1';
  const KEY_I = 'nm.items.v1';

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let uid = Date.now();
  const newId = () => 'x' + (uid++).toString(36);

  /* ---------- 儲存 ---------- */
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 無痕模式等情況 */ }
    return clone(fallback);
  }
  function save() {
    try {
      localStorage.setItem(KEY_S, JSON.stringify(settings));
      localStorage.setItem(KEY_I, JSON.stringify(items));
    } catch (e) { /* ignore */ }
  }
  function merge(base, over) {
    const out = clone(base);
    for (const k in over) {
      out[k] = over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) ? Object.assign(out[k] || {}, over[k]) : over[k];
    }
    return out;
  }

  let settings = merge(D.SETTINGS, load(KEY_S, {}));
  let items = load(KEY_I, D.ITEMS);

  const params = new URLSearchParams(location.search);
  if (params.get('mini') === '1') settings.mini = true;

  /* ---------- 格式化 ---------- */
  const cur = () => D.CURRENCIES[settings.currency] || D.CURRENCIES.TWD;
  // 金額固定顯示到小數點後兩位;換算成其他貨幣時再乘以 rate(預留)
  function money(v, withSymbol = true) {
    const n = Number(v) || 0;
    const s = n.toLocaleString(cur().locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return withSymbol ? cur().symbol + ' ' + s : s;
  }
  const money0 = (v) => cur().symbol + ' ' + (Number(v) || 0).toLocaleString(cur().locale, { maximumFractionDigits: 2 });
  const hm = (min) => {
    const m = Math.max(0, Math.floor(min));
    return Math.floor(m / 60) + ' 小時 ' + (m % 60) + ' 分';
  };
  const clock = (axis) => C.fromAxis(axis);

  /* ---------- 多文件(主視窗 + 浮動視窗)綁定 ---------- */
  let pipWin = null;
  const docs = () => (pipWin && !pipWin.closed ? [document, pipWin.document] : [document]);
  function bind(name, text) {
    for (const d of docs()) for (const el of d.querySelectorAll(`[data-bind="${name}"]`)) {
      if (el.textContent !== text) el.textContent = text;
    }
  }
  function bindHTML(name, html) {
    for (const d of docs()) for (const el of d.querySelectorAll(`[data-bind="${name}"]`)) {
      if (el.innerHTML !== html) el.innerHTML = html;
    }
  }
  function bindClass(name, cls) {
    for (const d of docs()) for (const el of d.querySelectorAll(`[data-bind="${name}"]`)) {
      el.className = 'chip ' + cls;
    }
  }
  function bindWidth(name, ratio) {
    for (const d of docs()) for (const el of d.querySelectorAll(`[data-bind-width="${name}"]`)) {
      el.style.width = (ratio * 100).toFixed(2) + '%';
    }
  }

  const PHASE = { before: '尚未上班', working: '上班中 💪', break: '休息中 ☕', after: '已下班 🎉', overtime: '加班中 🔥' };

  /* ---------- 每個項目的顯示 ---------- */
  function itemSummary(p) {
    if (p.invalid) return { main: '價格無效', sub: '', ratio: 0 };
    if (p.kind === 'goal') {
      if (p.unlocked) return { main: '<span class="badge">已解鎖 🔓</span>', sub: `目標 ${money0(p.price)}${p.saved ? `(含已存 ${money0(p.saved)})` : ''}`, ratio: 1 };
      return {
        main: `<span class="item-count">${(p.ratio * 100).toFixed(1)}<small>%</small></span>`,
        sub: `還差 <b>${money(p.gap)}</b>｜${timeLeft(p)}`,
        ratio: p.ratio,
      };
    }
    return {
      main: `<span class="item-count">${p.count}<small> 份</small></span>`,
      sub: `下一份還差 <b>${money(p.gap)}</b>｜${timeLeft(p)}`,
      ratio: p.ratio,
    };
  }
  function timeLeft(p) {
    if (!isFinite(p.minutes)) return '無法估算';
    let s = `還需工作 <b>${C.fmtDuration(p.minutes)}</b>`;
    if (p.beyondEnd) s += p.days > 1 ? `(約 ${p.days.toFixed(1)} 個工作天)` : '(超過下班時間,需加班)';
    else s += `(預計 ${clock(p.etaAxis)})`;
    return s;
  }

  /* ---------- 渲染:項目列表 ---------- */
  function renderItems() {
    const list = $('#itemList');
    list.innerHTML = items.map((it) => `
      <div class="card item ${it.enabled === false ? 'off' : ''}" data-id="${it.id}">
        <div class="item-head">
          <div class="item-name">${esc(it.name)}<span class="item-cat">${esc(it.category)}${it.kind === 'goal' ? '・目標' : ''}</span></div>
          <div class="item-price">${money0(it.price)}</div>
        </div>
        <div class="item-main" data-role="main"></div>
        <div class="bar"><i data-role="bar"></i></div>
        <div class="item-sub" data-role="sub"></div>
        <div class="item-actions">
          <button data-act="edit">編輯</button>
          <button data-act="toggle">${it.enabled === false ? '啟用' : '停用'}</button>
        </div>
      </div>`).join('') || '<p class="note">還沒有項目,按「＋ 新增」建立。</p>';
    updateItems(C.snapshot(settings));
  }
  function updateItems(snap) {
    for (const it of items) {
      const el = $(`.item[data-id="${it.id}"]`);
      if (!el) continue;
      if (it.enabled === false) { $('[data-role=main]', el).innerHTML = ''; $('[data-role=sub]', el).innerHTML = '已停用'; $('[data-role=bar]', el).style.width = '0'; continue; }
      const s = itemSummary(C.itemProgress(settings, snap, it));
      const m = $('[data-role=main]', el), sub = $('[data-role=sub]', el);
      if (m.innerHTML !== s.main) m.innerHTML = s.main;
      if (sub.innerHTML !== s.sub) sub.innerHTML = s.sub;
      $('[data-role=bar]', el).style.width = (Math.max(0, Math.min(1, s.ratio)) * 100).toFixed(1) + '%';
    }
  }

  /* ---------- 主要更新迴圈 ---------- */
  function nearestGoal(snap) {
    let best = null;
    for (const it of items) {
      if (it.enabled === false) continue;
      const p = C.itemProgress(settings, snap, it);
      if (p.invalid || p.unlocked || !isFinite(p.minutes)) continue;
      if (!best || p.minutes < best.p.minutes) best = { it, p };
    }
    return best;
  }

  let lastNotifyBucket = null;
  function tick() {
    const snap = C.snapshot(settings);
    const rate = snap.ratePerHour;
    bind('earned', money(snap.earned, false));
    bind('phase', PHASE[snap.phase]);
    bindClass('phase', snap.phase);
    bindWidth('dayProgress', snap.dayProgress);
    bind('progressText', `進度 ${(snap.dayProgress * 100).toFixed(1)}%`);
    bind('toEndShort', snap.phase === 'before' ? `${hm(snap.toStart)}後上班` : snap.toEnd > 0 ? `距離下班 ${hm(snap.toEnd)}` : '已過下班時間');
    bind('rateShort', rate ? `${money(rate)}/小時` : '暫停計薪');
    bind('effRate', rate ? money(rate) + ' /小時' : '—(暫停計薪)');
    bind('perMin', money(rate / 60));
    bind('perSec', money(rate / 3600));
    bind('workedText', hm(snap.worked));
    bind('toEnd', snap.toEnd > 0 && snap.phase !== 'before' ? hm(snap.toEnd) : snap.phase === 'before' ? '尚未上班' : '已下班');
    if (snap.phase === 'break') { bind('breakLabel', '休息剩餘'); bind('breakText', hm(snap.breakEndsIn)); }
    else { bind('breakLabel', '下一次休息'); bind('breakText', snap.nextBreakIn != null ? hm(snap.nextBreakIn) + '後' : '今天沒有了'); }
    bind('dayTotal', money(snap.dayTotal));
    bind('multText', snap.working ? `× ${snap.mult}${snap.mult > 1 ? '(加班)' : ''}` : '—');

    const g = nearestGoal(snap);
    bindHTML('nextGoal', g ? `下一個解鎖:<b>${esc(g.it.name)}</b>,還需工作 ${C.fmtDuration(g.p.minutes)}` : '');

    updateItems(snap);
    maybeNotify(snap);
  }

  /* ---------- 定時「今天賺了多少」提醒 ---------- */
  function maybeNotify(snap) {
    const every = Number(settings.notifyEvery);
    if (!every || !snap.working) { return; }
    const bucket = Math.floor(snap.worked / every);
    if (lastNotifyBucket === null) { lastNotifyBucket = bucket; return; } // 剛開啟頁面時不補發
    if (bucket > lastNotifyBucket) {
      lastNotifyBucket = bucket;
      const msg = `今天已經賺了 ${money(snap.earned)} 💰`;
      toast(msg);
      if (settings.useSystemNotification && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('牛馬薪水計', { body: msg, icon: 'icon.svg', silent: true }); } catch (e) { /* ignore */ }
      }
    }
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 4500);
  }

  /* ---------- 設定表單 ---------- */
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.');
    const last = ks.pop();
    ks.reduce((a, k) => (a[k] = a[k] || {}), o)[last] = v;
  }
  function fillSettings() {
    for (const el of $$('[data-set]')) {
      const v = getPath(settings, el.dataset.set);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    }
    renderBreaks();
    timeNote();
  }
  function timeNote() {
    const s = C.buildSchedule(settings);
    $('#timeNote').textContent = `實際計薪 ${hm(s.scheduledWork)}(已排除休息)` + (s.end > C.DAY ? '・跨夜班' : '');
  }
  function renderBreaks() {
    $('#breakList').innerHTML = (settings.breaks || []).map((b) => `
      <div class="break-row" data-id="${b.id}">
        <input type="checkbox" data-bk="enabled" ${b.enabled !== false ? 'checked' : ''} title="啟用">
        <input type="time" data-bk="start" value="${b.start}">
        <input type="time" data-bk="end" value="${b.end}">
        <button class="btn small danger" data-bk="del">刪除</button>
      </div>`).join('') || '<p class="note">沒有休息時間。</p>';
  }

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.set) {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number' || el.tagName === 'SELECT' && el.dataset.set === 'notifyEvery') v = Number(v);
      if (el.type === 'number' && !isFinite(v)) return;
      setPath(settings, el.dataset.set, v);
      if (el.dataset.set === 'useSystemNotification' && v && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      afterSettingsChange(el.dataset.set === 'currency');
    } else if (el.dataset && el.dataset.bk) {
      const row = el.closest('.break-row');
      const b = settings.breaks.find((x) => x.id === row.dataset.id);
      if (!b) return;
      if (el.dataset.bk === 'enabled') b.enabled = el.checked;
      else if (el.value) b[el.dataset.bk] = el.value;
      afterSettingsChange();
    }
  });
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.bk === 'del') {
      const id = t.closest('.break-row').dataset.id;
      settings.breaks = settings.breaks.filter((x) => x.id !== id);
      renderBreaks(); afterSettingsChange();
    }
  });
  function afterSettingsChange(rerender) {
    save(); timeNote(); lastNotifyBucket = null;
    if (rerender) renderItems();
    tick();
  }
  $('#btnAddBreak').onclick = () => {
    settings.breaks.push({ id: newId(), start: '15:00', end: '15:15', enabled: true });
    renderBreaks(); afterSettingsChange();
  };
  $('#btnReset').onclick = () => {
    if (!confirm('確定要把設定與所有項目還原成預設值嗎?')) return;
    settings = clone(D.SETTINGS); items = clone(D.ITEMS);
    save(); applyMode(); fillSettings(); renderItems(); tick();
  };

  /* ---------- 縣市 / 貨幣 ---------- */
  function fillSelects() {
    $('#citySelect').innerHTML = Object.keys(D.CITY_LUNCH).map((c) => `<option>${c}</option>`).join('');
    $('#citySelect').value = settings.city;
    $('#currencySelect').innerHTML = Object.values(D.CURRENCIES).map((c) => `<option value="${c.code}">${c.symbol} ${c.name}</option>`).join('');
    bind('cur', cur().symbol);
    $('select[name=category]').innerHTML = D.CATEGORIES.map((c) => `<option>${c}</option>`).join('');
  }
  $('#citySelect').onchange = (e) => {
    settings.city = e.target.value;
    const lunch = items.find((i) => i.category === '便當');
    if (lunch && D.CITY_LUNCH[settings.city]) lunch.price = D.CITY_LUNCH[settings.city];
    save(); renderItems(); tick();
    toast(`便當參考價已套用 ${settings.city}:${money0(lunch ? lunch.price : 0)}(可自行編輯)`);
  };

  /* ---------- 項目新增 / 編輯 / 刪除 ---------- */
  const dlg = $('#itemDialog');
  const form = $('#itemForm');
  let editingId = null;
  function openItem(id) {
    editingId = id;
    const it = items.find((i) => i.id === id) || { category: '娛樂', name: '', price: '', kind: 'consumable', saved: '' };
    form.category.value = it.category; form.name.value = it.name; form.price.value = it.price;
    form.kind.value = it.kind; form.saved.value = it.saved || '';
    $('#itemDialogTitle').textContent = id ? '編輯項目' : '新增項目';
    $('#btnDeleteItem').style.display = id ? '' : 'none';
    syncSaved();
    dlg.showModal();
  }
  function syncSaved() { $('#savedField').style.display = form.kind.value === 'goal' ? '' : 'none'; }
  form.category.onchange = () => { if (form.category.value === '個人目標') { form.kind.value = 'goal'; syncSaved(); } };
  form.kind.onchange = syncSaved;
  $('#btnAddItem').onclick = () => openItem(null);
  $('#btnCancelItem').onclick = () => dlg.close();
  $('#btnDeleteItem').onclick = () => {
    if (confirm('確定刪除這個項目?')) { items = items.filter((i) => i.id !== editingId); save(); renderItems(); tick(); dlg.close(); }
  };
  form.onsubmit = () => {
    const data = {
      category: form.category.value, name: form.name.value.trim() || form.category.value,
      price: Math.max(0.01, Number(form.price.value) || 0.01), kind: form.kind.value,
      saved: form.kind.value === 'goal' ? Math.max(0, Number(form.saved.value) || 0) : 0,
    };
    const it = items.find((i) => i.id === editingId);
    if (it) Object.assign(it, data); else items.push({ id: newId(), enabled: true, ...data });
    save(); renderItems(); tick();
  };
  $('#itemList').addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    const id = e.target.closest('.item').dataset.id;
    if (act === 'edit') openItem(id);
    if (act === 'toggle') { const it = items.find((i) => i.id === id); it.enabled = it.enabled === false; save(); renderItems(); tick(); }
  });

  /* ---------- 分頁 / 模式 ---------- */
  const wide = matchMedia('(min-width:900px)');
  function showTab(name) {
    if (wide.matches && name === 'today') name = 'items';
    for (const b of $$('#tabs button')) b.classList.toggle('active', b.dataset.tab === name);
    for (const s of $$('.tab')) s.classList.toggle('active', s.id === 'tab-' + name);
    try { sessionStorage.setItem('nm.tab', name); } catch (e) { /* ignore */ }
    tick();
  }
  $('#tabs').onclick = (e) => { if (e.target.dataset.tab) showTab(e.target.dataset.tab); };
  wide.addEventListener('change', () => showTab(($('#tabs .active') || {}).dataset ? $('#tabs .active').dataset.tab : 'today'));

  function applyMode() {
    document.body.classList.toggle('mini', !!settings.mini);
    document.body.classList.toggle('hide-amount', !!settings.hideAmount);
    for (const d of docs()) d.body.classList.toggle('hide-amount', !!settings.hideAmount);
  }
  $('#btnMini').onclick = () => { settings.mini = !settings.mini; save(); applyMode(); };
  $('#btnHide').onclick = toggleHide;
  function toggleHide() { settings.hideAmount = !settings.hideAmount; save(); applyMode(); }
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'h' || e.key === 'H') toggleHide(); // 老闆鍵
    if (e.key === 'Escape' && document.body.classList.contains('mini') && !params.get('mini')) { settings.mini = false; save(); applyMode(); }
  });
  // 迷你視窗點兩下回到完整模式(自己開的 mini 視窗除外)
  $('#miniCard').addEventListener('dblclick', () => { if (!params.get('mini')) { settings.mini = false; save(); applyMode(); } });

  /* ---------- 浮動小視窗(置頂) ---------- */
  $('#btnPip').onclick = async () => {
    if (pipWin && !pipWin.closed) { pipWin.close(); return; }
    if ('documentPictureInPicture' in window) {
      try {
        pipWin = await window.documentPictureInPicture.requestWindow({ width: 320, height: 190 });
        for (const l of $$('link[rel=stylesheet]')) {
          const n = pipWin.document.createElement('link'); n.rel = 'stylesheet'; n.href = l.href; pipWin.document.head.appendChild(n);
        }
        pipWin.document.title = '牛馬薪水計';
        pipWin.document.body.className = 'pip' + (settings.hideAmount ? ' hide-amount' : '');
        pipWin.document.documentElement.dataset.theme = document.documentElement.dataset.theme || '';
        const card = $('#miniCard');
        const home = card.parentNode, next = card.nextSibling;
        card.style.display = 'flex';
        pipWin.document.body.appendChild(card);
        pipWin.addEventListener('pagehide', () => {
          card.style.display = '';
          home.insertBefore(card, next);
          pipWin = null;
        });
        tick();
        return;
      } catch (err) { /* 落到下方備援 */ }
    }
    // 備援:開一個小視窗載入精簡模式(不會置頂,但可搭配 Windows 的 PowerToys「置頂」)
    window.open('?mini=1', 'nm-mini', 'popup,width=340,height=230');
    toast('此瀏覽器不支援置頂浮窗,已開啟小視窗;可用 PowerToys「釘選視窗」置頂');
  };

  /* ---------- 成果卡 ---------- */
  function drawCard() {
    const snap = C.snapshot(settings);
    const lines = [];
    for (const it of items) {
      if (it.enabled === false || it.kind === 'goal') continue;
      const n = Math.floor(snap.earned / it.price + 1e-9);
      if (n >= 1) lines.push({ label: it.name, value: `× ${n}`, n });
    }
    lines.sort((a, b) => b.n - a.n);
    const unlocked = items.filter((it) => it.enabled !== false && it.kind === 'goal' && C.itemProgress(settings, snap, it).unlocked);
    for (const g of unlocked) lines.unshift({ label: '🔓 ' + g.name, value: '已解鎖' });
    if (!lines.length) lines.push({ label: '繼續努力,第一份快到了', value: '…' });
    const now = new Date();
    ShareCard.draw($('#shareCanvas'), {
      dateText: `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`,
      amountText: $('#shareShowAmount').checked ? money(snap.earned) : null,
      workedText: hm(snap.worked),
      lines,
    });
  }
  $('#btnShare').onclick = () => { drawCard(); $('#shareDialog').showModal(); };
  $('#shareShowAmount').onchange = drawCard;
  $('#btnShareClose').onclick = () => $('#shareDialog').close();
  $('#btnShareSave').onclick = async () => {
    const blob = await ShareCard.toBlob($('#shareCanvas'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'niuma-today.png'; a.click();
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
  fillSelects();
  fillSettings();
  applyMode();
  renderItems();
  let initTab = 'today';
  try { initTab = sessionStorage.getItem('nm.tab') || 'today'; } catch (e) { /* ignore */ }
  showTab(initTab);
  setInterval(tick, 250);
  // 第一次使用:引導到設定
  try {
    if (!localStorage.getItem(KEY_S)) { save(); toast('先到「設定」輸入你的時薪與上下班時間 👉'); }
  } catch (e) { /* ignore */ }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
