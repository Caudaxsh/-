/* 牛馬薪水計 - 核心計算(純函式,不碰 DOM,可在 Node 內測試)
 *
 * 時間軸單位:分鐘(可含小數),0 = 當日 00:00。
 * 跨夜班(下班時間 <= 上班時間)會自動把下班時間 +1440。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DAY = 1440;

  function toMin(hhmm) {
    const [h, m] = String(hhmm || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function fromAxis(t) {
    const m = ((Math.round(t) % DAY) + DAY) % DAY;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  /** 由設定建立班表:上下班時間、休息區間、實際計薪區段 */
  function buildSchedule(cfg) {
    const start = toMin(cfg.start);
    let end = toMin(cfg.end);
    if (end <= start) end += DAY;

    let breaks = (cfg.breaks || [])
      .filter((b) => b.enabled !== false)
      .map((b) => {
        let s = toMin(b.start);
        let e = toMin(b.end);
        if (e <= s) e += DAY;
        if (s < start) { s += DAY; e += DAY; }
        return [Math.max(s, start), Math.min(e, end)];
      })
      .filter(([s, e]) => e > s)
      .sort((a, b) => a[0] - b[0]);

    // 合併重疊的休息時間
    const merged = [];
    for (const b of breaks) {
      const last = merged[merged.length - 1];
      if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
      else merged.push([b[0], b[1]]);
    }
    breaks = merged;

    const segments = [];
    let cur = start;
    for (const [s, e] of breaks) {
      if (s > cur) segments.push([cur, s]);
      cur = e;
    }
    if (cur < end) segments.push([cur, end]);

    const scheduledWork = segments.reduce((a, [s, e]) => a + (e - s), 0);
    return { start, end, breaks, segments, scheduledWork };
  }

  /** 把「現在時間」對應到班表的時間軸(處理跨夜) */
  function axisNow(sched, date) {
    const d = date || new Date();
    let t = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60000;
    if (sched.end > DAY && t < sched.end - DAY) t += DAY;
    return t;
  }

  /** 加班倍率分段:累計工時門檻 -> 倍率 */
  function tiers(cfg) {
    const regular = Math.max(0, Number(cfg.regularHours)) * 60;
    const ot = cfg.ot || {};
    if (ot.on === false) return [{ upto: Infinity, mult: 1 }];
    const h1 = Math.max(0, Number(ot.h1)) * 60;
    return [
      { upto: regular, mult: 1 },
      { upto: regular + h1, mult: Number(ot.m1) || 1 },
      { upto: Infinity, mult: Number(ot.m2) || 1 },
    ];
  }

  /** 到時間軸 t 為止的實際工作分鐘(排除休息)。continueOT=false 時下班後不再累計 */
  function workedAt(sched, t, continueOT) {
    let w = 0;
    for (const [s, e] of sched.segments) {
      if (t > s) w += Math.min(t, e) - s;
    }
    if (continueOT && t > sched.end) w += t - sched.end;
    return w;
  }

  /** 累計工作 w 分鐘後,累積的工資 */
  function earnedForWorked(cfg, w) {
    const rate = Number(cfg.hourly) / 60;
    let prev = 0;
    let sum = 0;
    for (const { upto, mult } of tiers(cfg)) {
      if (w <= prev) break;
      sum += (Math.min(w, upto) - prev) * mult;
      prev = upto;
    }
    return sum * rate;
  }

  /** 反推:要累積到工資 E,總共需要工作幾分鐘 */
  function workedForEarned(cfg, E) {
    const rate = Number(cfg.hourly) / 60;
    if (!(rate > 0)) return Infinity;
    let left = E / rate;
    let prev = 0;
    let w = 0;
    for (const { upto, mult } of tiers(cfg)) {
      const span = upto - prev;
      const cost = span * mult;
      if (left <= cost) return w + left / mult;
      left -= cost;
      w += span;
      prev = upto;
    }
    return Infinity;
  }

  /** 累計工作 w 分鐘時的倍率 */
  function multAt(cfg, w) {
    for (const { upto, mult } of tiers(cfg)) if (w < upto) return mult;
    return 1;
  }

  /** 再工作到累計 w 分鐘時,時鐘會走到哪(跳過休息;下班後視為連續加班) */
  function clockForWorked(sched, w) {
    let acc = 0;
    const segs = sched.segments.concat([[sched.end, Infinity]]);
    for (const [s, e] of segs) {
      const len = e - s;
      if (w <= acc + len) return s + (w - acc);
      acc += len;
    }
    return sched.end;
  }

  /** 目前狀態快照 */
  function snapshot(cfg, date) {
    const sched = buildSchedule(cfg);
    const t = axisNow(sched, date);
    const cont = !!cfg.continueOT;
    const worked = workedAt(sched, t, cont);
    const earned = earnedForWorked(cfg, worked);

    let phase;
    if (t < sched.start) phase = 'before';
    else if (t >= sched.end) phase = cont ? 'overtime' : 'after';
    else if (sched.breaks.some(([s, e]) => t >= s && t < e)) phase = 'break';
    else phase = 'working';

    const working = phase === 'working' || phase === 'overtime';
    const mult = working ? multAt(cfg, worked) : 0;
    const ratePerHour = Number(cfg.hourly) * mult;

    const nextBreak = sched.breaks.find(([s]) => s > t);
    const curBreak = sched.breaks.find(([s, e]) => t >= s && t < e);
    const dayTotal = earnedForWorked(cfg, sched.scheduledWork);

    return {
      sched, t, worked, earned, phase, working, mult, ratePerHour, dayTotal,
      toStart: Math.max(0, sched.start - t),
      toEnd: Math.max(0, sched.end - t),
      dayProgress: sched.scheduledWork > 0 ? Math.min(1, worked / sched.scheduledWork) : 0,
      nextBreakIn: nextBreak && phase !== 'break' ? nextBreak[0] - t : null,
      breakEndsIn: curBreak ? curBreak[1] - t : null,
    };
  }

  /**
   * 距離目標金額還要工作多久。
   * targetEarned:要累積到的「今日工資」總額(不是差額)。
   * 以實際有效計薪速度計算:排除休息、套用加班倍率。
   */
  function remaining(cfg, snap, targetEarned) {
    const gap = targetEarned - snap.earned;
    if (gap <= 1e-9) return { unlocked: true, gap: 0, minutes: 0 };
    const wNeed = workedForEarned(cfg, targetEarned);
    if (!isFinite(wNeed)) return { unlocked: false, gap, minutes: Infinity, days: Infinity };
    const minutes = Math.max(0, wNeed - snap.worked);
    const etaAxis = clockForWorked(snap.sched, wNeed);
    const beyondEnd = etaAxis > snap.sched.end + 1e-9;
    const days = snap.dayTotal > 0 ? gap / snap.dayTotal : Infinity;
    return { unlocked: false, gap, minutes, etaAxis, beyondEnd, days };
  }

  /** 把一個消費品/目標轉成進度資訊 */
  function itemProgress(cfg, snap, item) {
    const price = Number(item.price);
    if (!(price > 0)) return { invalid: true };
    if (item.kind === 'goal') {
      const saved = Math.max(0, Number(item.saved) || 0);
      const total = snap.earned + saved;
      const ratio = Math.min(1, total / price);
      const rem = remaining(cfg, snap, price - saved);
      return { kind: 'goal', price, saved, total, ratio, ...rem };
    }
    const count = Math.floor(snap.earned / price + 1e-9);
    const next = (count + 1) * price;
    const ratio = (snap.earned - count * price) / price;
    const rem = remaining(cfg, snap, next);
    return { kind: 'consumable', price, count, ratio, ...rem };
  }

  function fmtDuration(minutes) {
    if (!isFinite(minutes)) return '—';
    const m = Math.ceil(minutes - 1e-9);
    if (m < 60) return m + ' 分鐘';
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h + ' 小時' + (r ? ' ' + r + ' 分' : '');
  }

  return {
    DAY, toMin, fromAxis, buildSchedule, axisNow, tiers, workedAt, earnedForWorked,
    workedForEarned, multAt, clockForWorked, snapshot, remaining, itemProgress, fmtDuration,
  };
});
