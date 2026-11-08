/**
 * TATABOX FSRS 调度器单元测试
 * 覆盖：fsrsSchedule 首次/复习调度、评分对间隔的影响、卡片状态转移、
 *      getDueCards 到期摘取、reviewCard 持久化、SM-2 兼容接口。
 *
 * 依赖：js/vendor/ts-fsrs.umd.min.js（UMD，可直接 require）+ js/algo/fsrs-algorithm.js
 */

const fs = require('fs');
const path = require('path');

const FSRS_SRC = path.join(__dirname, '..', '..', 'js', 'algo', 'fsrs-algorithm.js');
const TSFRS_SRC = path.join(__dirname, '..', '..', 'js', 'vendor', 'ts-fsrs.umd.min.js');

// 在隔离沙箱中加载 fsrs-algorithm.js，返回 { FSRS, localStorage }
function loadFsrs() {
  const ts = require(TSFRS_SRC); // UMD：node 下填充 module.exports
  const store = {};
  const localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; }
  };
  const sandbox = { window: { FSRS: ts }, localStorage, console };
  const factory = new Function('window', 'localStorage', 'console', fs.readFileSync(FSRS_SRC, 'utf8'));
  factory(sandbox.window, sandbox.localStorage, sandbox.console);
  if (!sandbox.window.FSRS._loaded) throw new Error('FSRS 未加载成功');
  // 暴露 store 供测试读写卡片持久化
  localStorage._store = store;
  return { FSRS: sandbox.window.FSRS, localStorage };
}

const { FSRS, localStorage } = loadFsrs();
const R = FSRS.RATING;

// 新建一张未复习卡片（TATABOX 格式）
function newCard() {
  return {
    stability: 0,
    difficulty: FSRS.params.difficulty ?? 5,
    lastReview: 0,
    repetitions: 0,
    lapses: 0,
    dueDate: Date.now()
  };
}

describe('FSRS 首次复习 fsrsSchedule（新卡）', () => {
  test('评 Again：repetitions 递增，进入学习态', () => {
    const s = FSRS.schedule(newCard(), R.AGAIN, Date.now());
    expect(s.repetitions).toBeGreaterThan(0);
    expect(s.state).not.toBe(FSRS.State.New);
    expect(typeof s.dueDate).toBe('number');
  });

  test('评 Good：返回正的学习间隔', () => {
    const s = FSRS.schedule(newCard(), R.GOOD, Date.now());
    expect(s.repetitions).toBeGreaterThan(0);
    expect(s.interval).toBeGreaterThanOrEqual(0);
    expect(s.stability).toBeGreaterThan(0);
  });

  test('产出包含 ts-fsrs 版本标记', () => {
    const s = FSRS.schedule(newCard(), R.EASY, Date.now());
    expect(s.version).toBe('ts-fsrs');
  });
});

describe('FSRS 复习调度：评分影响间隔', () => {
  test('同一已复习卡片，Easy 间隔 ≥ Good 间隔 ≥ Again 间隔', () => {
    // 先复习一次成为 Review 卡
    const base = FSRS.schedule(newCard(), R.GOOD, Date.now());
    // 强制置为到期，便于 next 调度
    base.dueDate = Date.now() - 1000;
    base.state = FSRS.State.Review;

    const again = FSRS.schedule(base, R.AGAIN, Date.now());
    const good = FSRS.schedule(base, R.GOOD, Date.now());
    const easy = FSRS.schedule(base, R.EASY, Date.now());

    expect(easy.interval).toBeGreaterThanOrEqual(good.interval);
    expect(good.interval).toBeGreaterThanOrEqual(again.interval);
  });
});

describe('FSRS 卡片状态转移', () => {
  test('toTsCard 缺省输入安全（undefined → 空卡）', () => {
    // 通过 schedule 传入空对象不应抛错
    const s = FSRS.schedule(undefined, R.GOOD, Date.now());
    expect(s.repetitions).toBeGreaterThan(0);
  });
});

describe('FSRS getDueCards 到期摘取', () => {
  test('未学习卡进入 newCards，到期卡进入 due', () => {
    const now = Date.now();
    // 通过 reviewCard 造一张已学卡
    FSRS.reviewCard('due-1', R.GOOD);
    const state = FSRS.getCardState('due-1');
    state.dueDate = now - 1000; // 视为已到期
    // 直接写回 storage
    const raw = JSON.parse(localStorage.getItem('tatabox_fsrs_cards') || '{}');
    raw['due-1'] = state;
    localStorage.setItem('tatabox_fsrs_cards', JSON.stringify(raw));

    const res = FSRS.getDueCards(['due-1', 'new-1'], now);
    expect(res.newCards).toContain('new-1');
    expect(res.due.some(d => d.id === 'due-1')).toBe(true);
  });
});

describe('FSRS reviewCard 持久化', () => {
  test('复习后状态被写入 localStorage', () => {
    const s = FSRS.reviewCard('card-abc', R.HARD);
    const raw = JSON.parse(localStorage.getItem('tatabox_fsrs_cards') || '{}');
    expect(raw['card-abc']).toBeDefined();
    expect(raw['card-abc'].repetitions).toBe(s.repetitions);
  });
});

describe('FSRS SM-2 兼容接口 calculateNextReview', () => {
  test('返回 nextInterval / easeFactor / dueDate', () => {
    const r = FSRS.calculateNextReview(2.5, 1, 3);
    expect(typeof r.nextInterval).toBe('number');
    expect(r.nextInterval).toBeGreaterThan(0);
    expect(typeof r.easeFactor).toBe('number');
    expect(typeof r.dueDate).toBe('number');
  });

  test('评分越高，下次间隔越长', () => {
    const bad = FSRS.calculateNextReview(2.5, 1, 1); // Again
    const good = FSRS.calculateNextReview(2.5, 1, 3); // Good
    expect(good.nextInterval).toBeGreaterThanOrEqual(bad.nextInterval);
  });
});