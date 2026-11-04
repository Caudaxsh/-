const assert = require('assert');
const C = require('../public/js/core.js');
const near = (a, b, e = 0.01) => assert(Math.abs(a - b) < e, `${a} != ${b}`);
// 2026-01-05 是週一
const T = (d, h, m = 0, s = 0) => new Date(2026, 0, d, h, m, s).getTime();

const cfg = {
  hourly: 200, regularHours: 8, ot: { on: true, h1: 2, m1: 1.34, m2: 1.67 },
  workDays: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', dailyGoal: 0,
  autoBreaks: [{ start: '12:00', end: '13:00', enabled: true }],
};
const noBreak = { ...cfg, autoBreaks: [] };

// ---- 班表 ----
assert.equal(new Date(T(5, 9)).getDay(), 1);
near(C.plannedWorkMin(cfg), 480);
assert(C.shiftFor(cfg, T(5, 0), null));                 // 週一上班
assert.equal(C.shiftFor(cfg, T(10, 0), null), null);    // 週六不上班
assert(C.shiftFor(cfg, T(10, 0), { work: true }));      // 補班
assert.equal(C.shiftFor(cfg, T(5, 0), { off: true }), null); // 請假
assert.equal(C.shiftFor({ ...cfg, workDays: [0, 6] }, T(5, 0), null), null);

// ---- 自動依現在時間計算(沒有任何按鈕) ----
const at = (c, now, ov) => C.today(c, ov || {}, now);
let t = at(cfg, T(5, 8, 30));
assert.equal(t.phase, 'before'); near(t.earned, 0);
t = at(cfg, T(5, 10)); assert.equal(t.phase, 'working'); near(t.earned, 200);
t = at(cfg, T(5, 12, 30)); assert.equal(t.phase, 'break'); near(t.earned, 600); assert.equal(t.ratePerHour, 0);
t = at(cfg, T(5, 13, 30)); near(t.workedMs, 3.5 * 3600000);        // 午休自動扣
t = at(cfg, T(5, 18)); assert.equal(t.phase, 'done'); near(t.earned, 1600);
t = at(cfg, T(5, 22)); assert.equal(t.phase, 'done'); near(t.earned, 1600);   // 下班後不再增加
t = at(cfg, T(10, 11)); assert.equal(t.phase, 'off'); near(t.earned, 0);      // 週六
assert.equal(new Date(t.next.start).getDay(), 1);                              // 下次上班是週一
assert.equal(new Date(t.next.start).getHours(), 9);
t = at(cfg, T(5, 11), { [C.ymd(T(5, 0))]: { off: true } }); assert.equal(t.phase, 'off'); // 今天請假

// 重新整理 / 隔天打開:只取決於「當下時間」
near(at(cfg, T(5, 15)).earned, at(cfg, T(5, 15)).earned);

// ---- 加班:延長 + 倍率 ----
const ext = { [C.ymd(T(5, 0))]: { extendMin: 60 } };
t = at(noBreak, T(5, 18, 30), ext); assert.equal(t.phase, 'working');
// 無午休 9→18 = 9 小時;其中第 9 小時是 1.34 倍
near(at(noBreak, T(5, 18)).earned, 1600 + 268);
// 18:30(延長 1 小時)= 9.5h → 1600 + 1.5h*268
near(at(noBreak, T(5, 18, 30), ext).earned, 1600 + 1.5 * 268);
near(at(noBreak, T(5, 17, 59, 59)).mult, 1.34);
near(at(noBreak, T(5, 16, 59)).mult, 1);
// 超過 10 小時用 1.67
near(at(noBreak, T(5, 21), { [C.ymd(T(5, 0))]: { extendMin: 180 } }).earned, 1600 + 2 * 268 + 2 * 334);

// ---- 跨午夜班 22:00-06:00 ----
const night = { ...noBreak, workDays: [1], start: '22:00', end: '06:00' };
t = at(night, T(6, 2)); // 週二凌晨 2 點:屬於週一晚班
assert.equal(t.phase, 'working'); near(t.workedMs, 4 * 3600000); near(t.earned, 800);
t = at(night, T(6, 7)); assert.equal(t.phase, 'off');        // 週二早上:週二不是上班日
t = at(night, T(5, 21)); assert.equal(t.phase, 'before');
// 夜間午休 00:00–01:00
const night2 = { ...night, autoBreaks: [{ start: '00:00', end: '01:00', enabled: true }] };
near(at(night2, T(6, 2)).workedMs, 3 * 3600000);
assert.equal(at(night2, T(6, 0, 30)).phase, 'break');

// ---- 剩餘時間:排除休息 / 倍率 ----
t = at(cfg, T(5, 11, 30)); // 賺 500
let r = C.remaining(t, 700);
near(r.minutes, 60); assert.equal(r.eta, T(5, 13, 30));       // 跨午休
t = at(noBreak, T(5, 16)); // 7h = 1400
r = C.remaining(t, 2200);
near(r.minutes, 60 + 120 + 64 / (200 * 1.67 / 60), 0.01); assert(r.beyondEnd);
r = C.remaining(t, 1800); assert(!r.beyondEnd);
assert(C.remaining(t, 100).unlocked);
// 上班前:從開工開始算
t = at(cfg, T(5, 8)); r = C.remaining(t, 200); near(r.minutes, 60); assert.equal(r.eta, T(5, 10));
// 下班後 / 放假:改算「下次上班」
t = at(cfg, T(5, 19)); r = C.remaining(t, 1700); assert(r.later); near(r.minutes, 100 / (200 / 60), 0.01);

// ---- 流水帳自動記錄 ----
// 週一 18:00 下班;寬限 2 小時內不定稿(還能按加班)
let cu = C.catchUp(cfg, {}, [], T(4, 0), T(5, 19));
assert.equal(cu.added.length, 0);
cu = C.catchUp(cfg, {}, [], T(4, 0), T(5, 20, 1));
assert.equal(cu.added.length, 1); near(cu.added[0].earned, 1600); near(cu.added[0].workedMs, 8 * 3600000);
assert.equal(cu.lastFinal, T(5, 0));
// 隔了一週沒開網頁:補上週二~週五,週六日跳過
cu = C.catchUp(cfg, {}, cu.added, cu.lastFinal, T(10, 12));
assert.equal(cu.added.length, 4); assert.equal(cu.lastFinal, T(10, 0));
// 已有的紀錄不重複;請假日不產生紀錄
const ovLeave = { [C.ymd(T(6, 0))]: { off: true } };
cu = C.catchUp(cfg, ovLeave, [], T(5, 0), T(7, 23));
assert.equal(cu.added.length, 1); assert.equal(cu.added[0].id, 'a' + C.ymd(T(7, 0)));
// 加班後的紀錄包含倍率
cu = C.catchUp(noBreak, { [C.ymd(T(5, 0))]: { extendMin: 60 } }, [], T(4, 0), T(6, 12));
near(cu.added[0].earned, 1600 + 2 * 268);
// 跨夜班要等到隔天早上 + 寬限才定稿
cu = C.catchUp(night, {}, [], T(4, 0), T(6, 7)); assert.equal(cu.added.length, 0);
cu = C.catchUp(night, {}, [], T(4, 0), T(6, 8, 1)); assert.equal(cu.added.length, 1); near(cu.added[0].workedMs, 8 * 3600000);
// 紀錄凍結:之後改時薪不影響
const rec = C.catchUp(cfg, {}, [], T(4, 0), T(6, 0)).added[0];
near(rec.earned, 1600); assert.equal(rec.cfg.hourly, 200);

// ---- 補登 / 月統計 ----
const m = C.manualShift(T(6, 9), T(6, 19), 60, cfg); // 10h - 1h = 9h → 8h + 1h×1.34
near(m.workedMs, 9 * 3600000); near(m.earned, 1600 + 268);
const f = C.catchUp(cfg, {}, [], T(4, 0), T(6, 0)).added[0];
const ms = C.monthStats([f, m], 2026, 0);
assert.equal(ms.count, 2); near(ms.earned, 1600 + 1868); near(ms.otMs, 3600000); assert.equal(ms.workDays, 2);
assert.equal(C.monthStats([f, m], 2026, 1).count, 0);

// ---- 目標 / 每日目標 ----
t = at(noBreak, T(5, 10));
let p = C.itemProgress(t, { kind: 'consumable', price: 45 }); assert.equal(p.count, 4);
p = C.itemProgress(t, { kind: 'goal', price: 30000, saved: 29900 }); assert(p.unlocked);
assert.equal(C.dailyGoal(cfg), 1600); assert.equal(C.dailyGoal({ ...cfg, dailyGoal: 1000 }), 1000);
console.log('all core tests passed');
