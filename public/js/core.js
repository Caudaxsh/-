/* WorkHorse 核心計算(純函式,不碰 DOM,可在 Node 內測試)
 *
 * 一切以「實際時間戳(毫秒)」計算,不靠計時器累加:
 *   工時 = (下班或現在 − 上班) − 休息時間
 * 休息時間 = 手動休息區間 ∪ 每天固定休息時段(例如午休),重疊只算一次。
 * 跨午夜無須特殊處理,因為時間戳本身是連續的。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN = 60000;
  const HOUR = 3600000;
  const DAY = 86400000;

  function toMin(hhmm) {
    const [h, m] = String(hhmm || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  function dayStart(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const atLocal = (dayMs, minutes) => dayMs + minutes * MIN;

  /* ---------- 加班倍率(以「該班次累計工作分鐘」分段) ---------- */
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
  function earnedForWorked(cfg, workedMin) {
    const rate = Number(cfg.hourly) / 60;
    let prev = 0, sum = 0;
    for (const { upto, mult } of tiers(cfg)) {
      if (workedMin <= prev) break;
      sum += (Math.min(workedMin, upto) - prev) * mult;
      prev = upto;
    }
    return sum * rate;
  }
  function workedForEarned(cfg, E) {
    const rate = Number(cfg.hourly) / 60;
    if (!(rate > 0)) return Infinity;
    let left = E / rate, prev = 0, w = 0;
    for (const { upto, mult } of tiers(cfg)) {
      const span = upto - prev;
      const cost = span * mult;
      if (left <= cost) return w + left / mult;
      left -= cost; w += span; prev = upto;
    }
    return Infinity;
  }
  function multAt(cfg, workedMin) {
    for (const { upto, mult } of tiers(cfg)) if (workedMin < upto) return mult;
    return 1;
  }

  /* ---------- 休息區間 ---------- */
  function mergeIntervals(list) {
    const a = list.filter(([s, e]) => e > s).sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const [s, e] of a) {
      const last = out[out.length - 1];
      if (last && s <= last[1]) last[1] = Math.max(last[1], e);
      else out.push([s, e]);
    }
    return out;
  }
  /** 每天固定休息時段在 [from, to] 範圍內的實際區間 */
  function fixedBreakWindows(autoBreaks, from, to) {
    const out = [];
    const list = (autoBreaks || []).filter((b) => b.enabled !== false);
    for (let d = dayStart(from) - DAY; d <= to; d += DAY) {
      for (const b of list) {
        const s = atLocal(d, toMin(b.start));
        let e = atLocal(d, toMin(b.end));
        if (e <= s) e += DAY;
        out.push([s, e]);
      }
    }
    return out;
  }
  /** 班次內所有休息(已併集、已裁切在 [start, upto]) */
  function breakUnion(shift, cfg, upto) {
    const raw = fixedBreakWindows(cfg.autoBreaks, shift.start, upto)
      .concat((shift.breaks || []).map((b) => [b.s, b.e == null ? upto : b.e]));
    const clipped = raw.map(([s, e]) => [Math.max(s, shift.start), Math.min(e, upto)]);
    return mergeIntervals(clipped);
  }
  const sumLen = (iv) => iv.reduce((a, [s, e]) => a + (e - s), 0);

  function isBreakAt(shift, cfg, t) {
    if ((shift.breaks || []).some((b) => t >= b.s && (b.e == null || t < b.e))) return true;
    return fixedBreakWindows(cfg.autoBreaks, t, t).some(([s, e]) => t >= s && t < e);
  }

  /* ---------- 單一班次狀態 ---------- */
  function shiftState(shift, cfg, now) {
    const active = shift.end == null;
    const upto = active ? Math.max(now, shift.start) : shift.end;
    const union = breakUnion(shift, cfg, upto);
    const breakMs = sumLen(union) + (shift.extraBreakMs || 0);
    const workedMs = Math.max(0, upto - shift.start - breakMs);
    const workedMin = workedMs / MIN;
    const earned = earnedForWorked(cfg, workedMin);
    let phase = 'done';
    if (active) phase = isBreakAt(shift, cfg, now) ? 'break' : 'working';
    const mult = phase === 'working' ? multAt(cfg, workedMin) : 0;
    return { active, upto, union, breakMs, workedMs, workedMin, earned, phase, mult, ratePerHour: Number(cfg.hourly) * mult };
  }

  /** 計畫工時(分鐘):預定上下班 − 固定休息 */
  function plannedWorkMin(cfg) {
    const s = toMin(cfg.start);
    let e = toMin(cfg.end);
    if (e <= s) e += 1440;
    const ref = dayStart(Date.UTC(2000, 0, 3));
    const wins = mergeIntervals(fixedBreakWindows(cfg.autoBreaks, ref + s * MIN, ref + e * MIN)
      .map(([a, b]) => [Math.max(a, ref + s * MIN), Math.min(b, ref + e * MIN)]));
    return e - s - sumLen(wins) / MIN;
  }
  function plannedSpanMin(cfg) {
    const s = toMin(cfg.start);
    let e = toMin(cfg.end);
    if (e <= s) e += 1440;
    return e - s;
  }
  /** 預定下班的時間戳(跨午夜、提早/晚打卡皆可) */
  function scheduledEnd(startMs, cfg) {
    const span = plannedSpanMin(cfg) * MIN;
    const endMin = toMin(cfg.end);
    let cand = atLocal(dayStart(startMs), endMin);
    if (cand <= startMs && toMin(cfg.end) <= toMin(cfg.start)) cand += DAY; // 跨夜班
    if (cand <= startMs || cand - startMs > span + 3 * HOUR) cand = startMs + span;
    return cand;
  }

  /* ---------- 今日彙總(可含多個班次) ---------- */
  function dailyGoal(cfg) {
    return Number(cfg.dailyGoal) > 0 ? Number(cfg.dailyGoal) : earnedForWorked(cfg, Number(cfg.regularHours) * 60);
  }
  function today(cfg, shifts, active, now) {
    const t0 = dayStart(now);
    const done = shifts.filter((s) => s.end != null && dayStart(s.start) === t0);
    const base = done.reduce((a, s) => a + (s.earned || 0), 0);
    const baseMs = done.reduce((a, s) => a + (s.workedMs || 0), 0);
    const a = active ? shiftState(active, cfg, now) : null;
    const earned = base + (a ? a.earned : 0);
    const workedMs = baseMs + (a ? a.workedMs : 0);
    const goal = dailyGoal(cfg);
    return {
      now, base, baseMs, a, earned, workedMs, goal,
      goalRatio: goal > 0 ? Math.min(1, earned / goal) : 0,
      phase: a ? a.phase : done.length ? 'done' : 'idle',
      ratePerHour: a ? a.ratePerHour : 0,
      mult: a ? a.mult : 0,
      sched: active ? scheduledEnd(active.start, cfg) : null,
      dayTotal: earnedForWorked(cfg, plannedWorkMin(cfg)),
      shift: active || null,
      cfg,
    };
  }

  /** 以「實際有效速度」估算:從現在起還要多少分鐘工作才能讓今日累積達到 target */
  function etaClock(ctx, needMs) {
    const { now, cfg } = ctx;
    const wins = mergeIntervals(fixedBreakWindows(cfg.autoBreaks, now, now + needMs + 4 * DAY));
    let t = now, rem = needMs;
    for (const [s, e] of wins) {
      if (e <= t) continue;
      if (s <= t) { t = e; continue; }
      if (s - t >= rem) break;
      rem -= s - t; t = e;
    }
    return t + rem;
  }
  function remaining(ctx, target) {
    const gap = target - ctx.earned;
    if (gap <= 1e-9) return { unlocked: true, gap: 0, minutes: 0 };
    const wNeed = workedForEarned(ctx.cfg, target - ctx.base);
    if (!isFinite(wNeed)) return { unlocked: false, gap, minutes: Infinity, days: Infinity };
    const curMin = ctx.a ? ctx.a.workedMin : 0;
    const minutes = Math.max(0, wNeed - curMin);
    const eta = ctx.a ? etaClock(ctx, minutes * MIN) : null;
    return {
      unlocked: false, gap, minutes, eta,
      beyondEnd: eta != null && ctx.sched != null && eta > ctx.sched + 1000,
      days: ctx.dayTotal > 0 ? gap / ctx.dayTotal : Infinity,
    };
  }
  function itemProgress(ctx, item) {
    const price = Number(item.price);
    if (!(price > 0)) return { invalid: true };
    if (item.kind === 'goal') {
      const saved = Math.max(0, Number(item.saved) || 0);
      const total = ctx.earned + saved;
      return { kind: 'goal', price, saved, total, ratio: Math.min(1, total / price), ...remaining(ctx, price - saved) };
    }
    const count = Math.floor(ctx.earned / price + 1e-9);
    const next = (count + 1) * price;
    return { kind: 'consumable', price, count, ratio: (ctx.earned - count * price) / price, ...remaining(ctx, next) };
  }

  /* ---------- 班次生命週期 ---------- */
  const pickCfg = (c) => JSON.parse(JSON.stringify({
    hourly: c.hourly, regularHours: c.regularHours, ot: c.ot, autoBreaks: c.autoBreaks,
  }));
  function startShift(now, id) { return { id: id || 's' + now.toString(36), start: now, end: null, breaks: [] }; }
  function toggleBreak(shift, now) {
    const open = (shift.breaks || []).find((b) => b.e == null);
    if (open) open.e = now; else shift.breaks.push({ s: now, e: null });
    return shift;
  }
  /** 結束班次:凍結當時的薪資設定與結果,之後改時薪不會影響歷史 */
  function finishShift(shift, cfg, now) {
    const open = (shift.breaks || []).find((b) => b.e == null);
    if (open) open.e = now;
    shift.end = Math.max(now, shift.start);
    shift.cfg = pickCfg(cfg);
    const st = shiftState(shift, shift.cfg, shift.end);
    shift.earned = st.earned;
    shift.workedMs = st.workedMs;
    return shift;
  }
  /** 補登班次:休息分鐘直接扣除,不套用固定休息 */
  function manualShift(startMs, endMs, breakMin, cfg, id) {
    const s = { id: id || 'm' + startMs.toString(36) + endMs.toString(36), start: startMs, end: null, breaks: [], extraBreakMs: Math.max(0, breakMin) * MIN, manual: true };
    const c = { ...pickCfg(cfg), autoBreaks: [] };
    s.end = endMs;
    s.cfg = c;
    const st = shiftState(s, c, endMs);
    s.earned = st.earned;
    s.workedMs = st.workedMs;
    return s;
  }

  /* ---------- 月統計 ---------- */
  function monthStats(shifts, year, month) {
    const list = shifts.filter((s) => {
      if (s.end == null) return false;
      const d = new Date(s.start);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    const dim = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: dim }, (_, i) => ({ day: i + 1, earned: 0, workedMs: 0 }));
    let earned = 0, workedMs = 0, otMs = 0;
    for (const s of list) {
      const d = days[new Date(s.start).getDate() - 1];
      d.earned += s.earned || 0; d.workedMs += s.workedMs || 0;
      earned += s.earned || 0; workedMs += s.workedMs || 0;
      const reg = ((s.cfg && s.cfg.regularHours) || 8) * HOUR;
      otMs += Math.max(0, (s.workedMs || 0) - reg);
    }
    const active = days.filter((d) => d.workedMs > 0);
    const best = active.reduce((m, d) => (d.earned > (m ? m.earned : -1) ? d : m), null);
    return {
      count: list.length, earned, workedMs, otMs, days, workDays: active.length,
      avgPerDay: active.length ? earned / active.length : 0,
      effHourly: workedMs > 0 ? earned / (workedMs / HOUR) : 0,
      best,
    };
  }

  function fmtDuration(minutes) {
    if (!isFinite(minutes)) return '—';
    const m = Math.ceil(minutes - 1e-9);
    if (m < 60) return m + ' 分鐘';
    const h = Math.floor(m / 60), r = m % 60;
    return h + ' 小時' + (r ? ' ' + r + ' 分' : '');
  }
  function fmtHMS(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const p = (n) => String(n).padStart(2, '0');
    return Math.floor(s / 3600) + ':' + p(Math.floor(s / 60) % 60) + ':' + p(s % 60);
  }

  return {
    MIN, HOUR, DAY, toMin, dayStart, tiers, earnedForWorked, workedForEarned, multAt,
    mergeIntervals, fixedBreakWindows, breakUnion, isBreakAt, shiftState, plannedWorkMin, scheduledEnd,
    dailyGoal, today, etaClock, remaining, itemProgress, pickCfg,
    startShift, toggleBreak, finishShift, manualShift, monthStats, fmtDuration, fmtHMS,
  };
});
