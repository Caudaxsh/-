const assert = require('assert');
const C = require('../public/js/core.js');
const near = (a, b, e = 0.01) => assert(Math.abs(a - b) < e, `${a} != ${b}`);
const T = (d, h, m = 0, s = 0) => new Date(2026, 0, d, h, m, s).getTime();

const cfg = {
  hourly: 200, regularHours: 8, ot: { on: true, h1: 2, m1: 1.34, m2: 1.67 },
  start: '09:00', end: '18:00', autoBreaks: [{ start: '12:00', end: '13:00', enabled: true }],
};
const noBreak = { ...cfg, autoBreaks: [] };
const run = (c, start, now, mutate) => {
  const sh = C.startShift(start);
  if (mutate) mutate(sh);
  return C.shiftState(sh, c, now);
};

// 計畫工時 8 小時;預定下班 = 當天 18:00
near(C.plannedWorkMin(cfg), 480);
assert.equal(C.scheduledEnd(T(5, 9), cfg), T(5, 18));
assert.equal(C.scheduledEnd(T(5, 8, 50), cfg), T(5, 18));
// 太晚打卡(19:00 才上班)→ 以計畫時長推算,不會變成明天 18:00
assert.equal(C.scheduledEnd(T(5, 19), cfg), T(5, 19) + 9 * 3600000);

// 10:00 → 1 小時 = 200
near(run(cfg, T(5, 9), T(5, 10)).earned, 200);
// 午休自動扣除:13:30 → 工作 3 + 0.5 = 3.5 小時
near(run(cfg, T(5, 9), T(5, 13, 30)).workedMin, 210);
let s = run(cfg, T(5, 9), T(5, 12, 30));
assert.equal(s.phase, 'break'); assert.equal(s.ratePerHour, 0); near(s.earned, 600);

// 手動休息:10:00-10:30 暫停計薪,與固定午休重疊只算一次
s = run(noBreak, T(5, 9), T(5, 11), (sh) => { sh.breaks.push({ s: T(5, 10), e: T(5, 10, 30) }); });
near(s.workedMin, 90);
s = run(cfg, T(5, 9), T(5, 14), (sh) => { sh.breaks.push({ s: T(5, 12, 30), e: T(5, 13, 30) }); });
near(s.workedMin, 4 * 60 - 0 /* 9-12 = 3h, 13:30-14:00 = .5h → 3.5h */ - 30, 0.01);
// 開啟中的手動休息
const sh = C.startShift(T(5, 9)); C.toggleBreak(sh, T(5, 10));
assert.equal(C.shiftState(sh, noBreak, T(5, 10, 20)).phase, 'break');
near(C.shiftState(sh, noBreak, T(5, 10, 20)).workedMin, 60);
C.toggleBreak(sh, T(5, 10, 20));
assert.equal(C.shiftState(sh, noBreak, T(5, 10, 30)).phase, 'working');
near(C.shiftState(sh, noBreak, T(5, 10, 30)).workedMin, 70);

// 加班倍率:9→21 無午休 = 8h*200 + 2h*268 + 2h*334
s = run(noBreak, T(5, 9), T(5, 21));
near(s.earned, 1600 + 2 * 268 + 2 * 334);
near(run(noBreak, T(5, 9), T(5, 18, 30)).mult, 1.34);
near(run(noBreak, T(5, 9), T(5, 16, 59)).mult, 1);

// 跨午夜:22:00 → 02:00 無休息 = 4 小時;預定下班隔天 06:00
const night = { ...noBreak, start: '22:00', end: '06:00', regularHours: 8 };
near(run(night, T(5, 22), T(6, 2)).workedMin, 240);
assert.equal(C.scheduledEnd(T(5, 22), night), T(6, 6));
assert.equal(C.scheduledEnd(T(5, 21, 55), night), T(6, 6));
// 跨午夜且午休在夜間 00:00-01:00
const night2 = { ...night, autoBreaks: [{ start: '00:00', end: '01:00', enabled: true }] };
near(run(night2, T(5, 22), T(6, 2)).workedMin, 180);

// 重新整理頁面等同於只改 now → 結果只取決於時間戳
near(run(cfg, T(5, 9), T(5, 15)).earned, run(cfg, T(5, 9), T(5, 15)).earned);

// 反推與 ETA:11:30 賺 500,目標 700 → 還需 60 分鐘,但跨午休 → ETA 14:00
const day = C.startShift(T(5, 9));
let ctx = C.today(cfg, [], day, T(5, 11, 30));
near(ctx.earned, 500);
let r = C.remaining(ctx, 700);
near(r.minutes, 60); assert.equal(r.eta, T(5, 13, 30));
// 超過預定下班使用加班倍率
ctx = C.today(noBreak, [], C.startShift(T(5, 9)), T(5, 16));
r = C.remaining(ctx, 1800);
near(r.minutes, 60 + 200 / (200 * 1.34 / 60)); assert(!r.beyondEnd);
r = C.remaining(ctx, 2200); assert(r.beyondEnd);
near(r.minutes, 60 + 120 + 64 / (200 * 1.67 / 60), 0.01);
assert(C.remaining(ctx, 100).unlocked);

// 結束班次 → 凍結結果;之後更改時薪不影響歷史
const f = C.finishShift(C.startShift(T(5, 9)), cfg, T(5, 18));
near(f.earned, 1600); near(f.workedMs, 8 * 3600000);
const t2 = C.today({ ...cfg, hourly: 999 }, [f], null, T(5, 20));
near(t2.earned, 1600); assert.equal(t2.phase, 'done');
// 未上班
assert.equal(C.today(cfg, [], null, T(5, 8)).phase, 'idle');
// 下班後再開第二班:當日累積相加
const f2 = C.startShift(T(5, 19));
near(C.today(cfg, [f], f2, T(5, 20)).earned, 1600 + 200);

// 補登班次與月統計
const m = C.manualShift(T(6, 9), T(6, 19), 60, cfg); // 10h - 1h = 9h → 8h + 1h*1.34
near(m.workedMs, 9 * 3600000); near(m.earned, 1600 + 268);
const ms = C.monthStats([f, m, C.startShift(T(7, 9))], 2026, 0);
assert.equal(ms.count, 2); near(ms.earned, 1600 + 1868); near(ms.otMs, 3600000); assert.equal(ms.workDays, 2);
assert.equal(C.monthStats([f, m], 2026, 1).count, 0);

// 目標進度
ctx = C.today(noBreak, [], C.startShift(T(5, 9)), T(5, 10));
let p = C.itemProgress(ctx, { kind: 'consumable', price: 45 });
assert.equal(p.count, 4);
p = C.itemProgress(ctx, { kind: 'goal', price: 30000, saved: 29900 }); assert(p.unlocked);
assert.equal(C.dailyGoal(cfg), 1600); assert.equal(C.dailyGoal({ ...cfg, dailyGoal: 1000 }), 1000);
console.log('all core tests passed');
