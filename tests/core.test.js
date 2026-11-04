const assert = require('assert');
const C = require('../js/core.js');
const cfg = { hourly: 200, start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }],
  regularHours: 8, ot: { on: true, h1: 2, m1: 1.34, m2: 1.67 }, continueOT: false };
const at = (h, m = 0, s = 0) => new Date(2026, 0, 5, h, m, s);
const near = (a, b, e = 0.01) => assert(Math.abs(a - b) < e, `${a} != ${b}`);

// 排班:8 小時實際工時
near(C.buildSchedule(cfg).scheduledWork, 480);
// 10:00 → 工作 1 小時 = 200
near(C.snapshot(cfg, at(10)).earned, 200);
// 休息中 12:30:不增加、倍率 0
let s = C.snapshot(cfg, at(12, 30));
near(s.earned, 600); assert.equal(s.phase, 'break'); assert.equal(s.ratePerHour, 0);
// 下班時總額 1600,下班後停止
near(C.snapshot(cfg, at(20)).earned, 1600); assert.equal(C.snapshot(cfg, at(20)).phase, 'after');
// 持續加班:18:00-19:00 = 200*1.34 ;19:00-20:00 = 200*1.34; 20:00-21:00 = 200*1.67
const ot = { ...cfg, continueOT: true };
near(C.snapshot(ot, at(19)).earned, 1600 + 268);
near(C.snapshot(ot, at(21)).earned, 1600 + 268 * 2 + 334);
near(C.snapshot(ot, at(19, 30)).mult, 1.34);
// 反推一致
for (const w of [10, 300, 480, 500, 650, 700]) near(C.workedForEarned(cfg, C.earnedForWorked(cfg, w)), w, 1e-6);
// 剩餘時間要跳過午休:11:30 賺 500,目標 700 → 還需 60 分鐘工作,ETA 13:30
s = C.snapshot(cfg, at(11, 30));
let r = C.remaining(cfg, s, 700);
near(r.minutes, 60); assert.equal(C.fromAxis(r.etaAxis), '13:30');
// 超過下班要用加班倍率:16:00 後已賺 1300 → 目標 1800,先 300 到 1600(90 分),再 200/(200*1.34/60)=44.78
s = C.snapshot(cfg, at(16)); r = C.remaining(cfg, s, 1800);
near(r.minutes, 120 + 200 / (200 * 1.34 / 60), 0.01 + 0.0); assert(r.beyondEnd);
// 已達成
assert(C.remaining(cfg, C.snapshot(cfg, at(17)), 100).unlocked);
// 上班前
s = C.snapshot(cfg, at(8)); near(s.earned, 0); assert.equal(s.phase, 'before');
r = C.remaining(cfg, s, 200); near(r.minutes, 60); assert.equal(C.fromAxis(r.etaAxis), '10:00');
// 跨夜班 22:00-06:00,無休息,02:00 時已工作 4 小時
const night = { ...cfg, start: '22:00', end: '06:00', breaks: [] };
near(C.snapshot(night, at(2)).worked, 240);
// 關閉加班倍率
near(C.earnedForWorked({ ...ot, ot: { on: false } }, 600), 2000);
// 商品進度
s = C.snapshot(cfg, at(10)); // 200
let p = C.itemProgress(cfg, s, { kind: 'consumable', price: 45 });
assert.equal(p.count, 4); near(p.minutes, 45 * 60 / 200 - (200 % 45) * 60 / 200, 0.01);
p = C.itemProgress(cfg, s, { kind: 'goal', price: 100, saved: 0 }); assert(p.unlocked);
p = C.itemProgress(cfg, s, { kind: 'goal', price: 30000, saved: 29800 }); assert(p.unlocked);
console.log('all core tests passed');
