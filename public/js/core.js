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
  /* ---------- 班表:週幾上班、幾點到幾點,全部依「當地時間」自動推算 ---------- */
  const p2 = (n) => String(n).padStart(2, '0');
  function ymd(ms) { const d = new Date(ms); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  /** overrides[ymd] = { off:true }(請假/放假) 或 { work:true }(補班),另可有 extendMin(加班分鐘) */
  function isWorkday(cfg, dayMs, ov) {
    if (ov && ov.off) return false;
    if (ov && ov.work) return true;
    return (cfg.workDays || [1, 2, 3, 4, 5]).includes(new Date(dayMs).getDay());
  }
  /** 某一天(當天 00:00 的時間戳)的班次,不上班則 null */
  function shiftFor(cfg, dayMs, ov) {
    if (!isWorkday(cfg, dayMs, ov)) return null;
    const sm = toMin(cfg.start);
    const em = toMin(cfg.end);
    const start = dayMs + sm * MIN;
    let end = dayMs + em * MIN;
    if (em <= sm) end += DAY; // 跨夜班
    const extend = (ov && ov.extendMin) || 0;
    return { start, end: end + extend * MIN, baseEnd: end, day: dayMs, extendMin: extend, breaks: [] };
  }
  function nextShift(cfg, ovs, now) {
    const t0 = dayStart(now);
    for (let i = 0; i < 15; i++) {
      const day = dayStart(t0 + i * DAY + 12 * HOUR);
      const s = shiftFor(cfg, day, ovs[ymd(day)]);
      if (s && s.start > now) return s;
    }
    return null;
  }

  function dailyGoal(cfg) {
    return Number(cfg.dailyGoal) > 0 ? Number(cfg.dailyGoal) : earnedForWorked(cfg, Number(cfg.regularHours) * 60);
  }

  /**
   * 現在的狀態:完全由「班表 + 現在時間」決定,不需要任何按鈕。
   * phase: off(今天不上班) / before / working / break / done
   */
  function today(cfg, overrides, now) {
    const ovs = overrides || {};
    const t0 = dayStart(now);
    const prevDay = dayStart(t0 - 12 * HOUR);
    let shift = shiftFor(cfg, prevDay, ovs[ymd(prevDay)]); // 昨天的跨夜班還沒結束?
    if (!(shift && now >= shift.start && now < shift.end)) shift = shiftFor(cfg, t0, ovs[ymd(t0)]);

    const base = {
      now, cfg, shift, goal: dailyGoal(cfg), dayTotal: earnedForWorked(cfg, plannedWorkMin(cfg)),
      sched: shift ? shift.end : null, ov: ovs[ymd(t0)] || null,
    };
    if (!shift) {
      return { ...base, a: null, earned: 0, workedMs: 0, goalRatio: 0, phase: 'off', ratePerHour: 0, mult: 0, next: nextShift(cfg, ovs, now) };
    }
    const clamp = Math.min(Math.max(now, shift.start), shift.end);
    const a = shiftState({ start: shift.start, end: null, breaks: [] }, cfg, clamp);
    let phase;
    if (now < shift.start) phase = 'before';
    else if (now >= shift.end) phase = 'done';
    else phase = isBreakAt({ breaks: [] }, cfg, now) ? 'break' : 'working';
    const mult = phase === 'working' ? multAt(cfg, a.workedMin) : 0;
    a.mult = mult; a.ratePerHour = Number(cfg.hourly) * mult; a.phase = phase;
    return {
      ...base, a, earned: a.earned, workedMs: a.workedMs, phase, mult, ratePerHour: a.ratePerHour,
      goalRatio: base.goal > 0 ? Math.min(1, a.earned / base.goal) : 0,
    };
  }

  /** 以「實際有效速度」估算:要再工作多久才能讓今日累積達到 target(排除休息、套用加班倍率) */
  function etaClock(ctx, needMs, from) {
    const cfg = ctx.cfg;
    const wins = mergeIntervals(fixedBreakWindows(cfg.autoBreaks, from, from + needMs + 4 * DAY));
    let t = from, rem = needMs;
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
    const days = ctx.dayTotal > 0 ? gap / ctx.dayTotal : Infinity;
    if (gap <= 1e-9) return { unlocked: true, gap: 0, minutes: 0 };
    // 今天已經收工(或放假):算「下次上班」要多久
    if (!ctx.shift || ctx.phase === 'done') {
      const m = workedForEarned(ctx.cfg, gap);
      return { unlocked: false, gap, minutes: m, eta: null, later: true, beyondEnd: false, days };
    }
    const wNeed = workedForEarned(ctx.cfg, target);
    if (!isFinite(wNeed)) return { unlocked: false, gap, minutes: Infinity, days: Infinity };
    const minutes = Math.max(0, wNeed - ctx.a.workedMin);
    const eta = etaClock(ctx, minutes * MIN, Math.max(ctx.now, ctx.shift.start));
    return { unlocked: false, gap, minutes, eta, beyondEnd: eta > ctx.sched + 1000, days };
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

  /* ---------- 流水帳:上班日過完自動寫入 ---------- */
  const pickCfg = (c) => JSON.parse(JSON.stringify({
    hourly: c.hourly, regularHours: c.regularHours, ot: c.ot, autoBreaks: c.autoBreaks,
  }));
  const GRACE = 2 * HOUR; // 下班後 2 小時內仍可按「加班」,之後才定稿
  /** 把「已結束且過了緩衝時間」的班次凍結成紀錄(之後改時薪不影響舊紀錄)。回傳新的紀錄與 lastFinal。 */
  function catchUp(cfg, overrides, records, lastFinal, now) {
    const ovs = overrides || {};
    const t0 = dayStart(now);
    let last = lastFinal || t0 - DAY;
    let day = dayStart(last + 36 * HOUR);
    if ((t0 - day) / DAY > 120) day = t0 - 120 * DAY;
    const out = [];
    for (; day <= t0; day = dayStart(day + 36 * HOUR)) {
      const sh = shiftFor(cfg, day, ovs[ymd(day)]);
      if (sh && sh.end + GRACE > now) break;
      if (sh) {
        const rec = finishShift({ id: 'a' + ymd(day), start: sh.start, end: null, breaks: [], auto: true }, cfg, sh.end);
        if (!records.some((r) => r.id === rec.id)) out.push(rec);
      }
      last = day;
    }
    return { added: out, lastFinal: last };
  }

  /* ---------- 班次生命週期(補登用) ---------- */
  function finishShift(shift, cfg, endMs) {
    shift.end = Math.max(endMs, shift.start);
    shift.cfg = pickCfg(cfg);
    const st = shiftState(shift, shift.cfg, shift.end);
    shift.earned = st.earned;
    shift.workedMs = st.workedMs;
    return shift;
  }
  /** 補登班次:休息分鐘直接扣除,不套用固定休息 */
  function manualShift(startMs, endMs, breakMin, cfg, id) {
    const s = { id: id || 'm' + startMs.toString(36) + endMs.toString(36), start: startMs, end: endMs, breaks: [], extraBreakMs: Math.max(0, breakMin) * MIN, manual: true };
    s.cfg = { ...pickCfg(cfg), autoBreaks: [] };
    const st = shiftState(s, s.cfg, endMs);
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

  function fmtHMS(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const p = (n) => String(n).padStart(2, '0');
    return Math.floor(s / 3600) + ':' + p(Math.floor(s / 60) % 60) + ':' + p(s % 60);
  }

  return {
    MIN, HOUR, DAY, GRACE, toMin, dayStart, ymd, tiers, earnedForWorked, workedForEarned, multAt,
    mergeIntervals, fixedBreakWindows, breakUnion, isBreakAt, shiftState, plannedWorkMin, isWorkday, shiftFor, nextShift,
    dailyGoal, today, etaClock, remaining, itemProgress, pickCfg, catchUp,
    finishShift, manualShift, monthStats, fmtHMS,
  };
});
