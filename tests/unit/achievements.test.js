/**
 * TATABOX — Issue #129（P3-36）轻量级成就/激励引擎单元测试
 *
 * 覆盖：
 *   1. 无数据不解锁；
 *   2. 达到阈值解锁（首练 / 累计练习 / 收藏 / 错题 / 连续打卡）；
 *   3. 重复判定不重复解锁（幂等）；
 *   4. reset 后可重新解锁。
 *
 * 说明：achievements.js 是浏览器 IIFE，测试用 mocked globals（localStorage /
 *   document / window）经 new Function 沙箱加载，直接断言 window.BioQuestAchievements
 *   暴露的纯判定逻辑（__test.evaluate / api.unlock / api.getEarned / api.reset）。
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'js', 'engagement', 'achievements.js');
const source = fs.readFileSync(SRC, 'utf8');

function makeLocalStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] || null; },
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); }
  };
}

function makeElement() {
  return {
    className: '',
    style: {},
    parentNode: null,
    offsetWidth: 0,
    setAttribute() {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    querySelector() { return { textContent: null }; }
  };
}

/**
 * 在沙箱中加载 achievements.js，返回对外 API（含 __test 纯判定）。
 */
function loadHarness() {
  const localStorage = makeLocalStorage();
  const document = {
    readyState: 'complete',
    body: { appendChild() {}, removeChild() {} },
    createElement() { return makeElement(); },
    addEventListener() {}
  };
  const CustomEventCtor = class CustomEvent {
    constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; }
  };
  const windowObj = {
    localStorage,
    document,
    dispatchEvent() { return true; },
    CustomEvent: CustomEventCtor,
    addEventListener() {}
  };
  const factory = new Function(
    'window', 'localStorage', 'document', 'console',
    source + '\n;return { api: window.BioQuestAchievements };'
  );
  const out = factory(windowObj, localStorage, document, console);
  return { api: out.api, localStorage, window: windowObj };
}

const keysOf = (arr) => arr.map((a) => a.key);

describe('Issue #129 轻量级成就引擎', () => {
  test('成就定义数量在 8-10 之间，且包含所需关键成就', () => {
    const { api } = loadHarness();
    const defs = api.__test.ACHIEVEMENTS;
    expect(defs.length).toBeGreaterThanOrEqual(8);
    expect(defs.length).toBeLessThanOrEqual(10);
    const keys = defs.map((d) => d.key);
    expect(keys).toEqual(expect.arrayContaining([
      'first_practice', 'practice_10', 'practice_50', 'practice_200',
      'favorite_1', 'favorite_20', 'wrong_5', 'streak_3', 'streak_7', 'streak_30'
    ]));
  });

  test('无数据不解锁', () => {
    const { api } = loadHarness();
    expect(api.__test.evaluate({})).toEqual([]);
    expect(api.__test.evaluate({ records: [], favorites: [], wrongCount: 0, maxStreak: 0 })).toEqual([]);
  });

  test('达到阈值解锁：首练 + 累计练习', () => {
    const { api } = loadHarness();
    expect(keysOf(api.__test.evaluate({ records: 1 }))).toEqual(['first_practice']);
    expect(keysOf(api.__test.evaluate({ records: 200 })))
      .toEqual(['first_practice', 'practice_10', 'practice_50', 'practice_200']);
    // records 为数组：按 totalQuestions 求和
    const arr = [{ totalQuestions: 10 }, { totalQuestions: 20 }];
    expect(keysOf(api.__test.evaluate({ records: arr }))).toEqual(['first_practice', 'practice_10']);
  });

  test('达到阈值解锁：收藏 / 错题 / 连续打卡', () => {
    const { api } = loadHarness();
    expect(keysOf(api.__test.evaluate({ favorites: 20 }))).toEqual(['favorite_1', 'favorite_20']);
    expect(keysOf(api.__test.evaluate({ wrongCount: 5 }))).toEqual(['wrong_5']);
    expect(keysOf(api.__test.evaluate({ maxStreak: 7 }))).toEqual(['streak_3', 'streak_7']);
    expect(keysOf(api.__test.evaluate({ maxStreak: 30 }))).toEqual(['streak_3', 'streak_7', 'streak_30']);
  });

  test('favorites 可传数组并取长度', () => {
    const { api } = loadHarness();
    const favs = ['a', 'b', 'c'];
    const keys = keysOf(api.__test.evaluate({ favorites: favs }));
    expect(keys).toContain('favorite_1');
    expect(keys).not.toContain('favorite_20');
    expect(api.__test.evaluate({ favorites: ['x'] })).toHaveLength(1);
  });

  test('解锁落盘 + 重复判定不重复解锁（幂等）', () => {
    const { api, localStorage } = loadHarness();
    const first = api.unlock({ key: 'favorite_1' });
    expect(first).toEqual(expect.objectContaining({ key: 'favorite_1', tier: 'bronze' }));
    expect(api.getEarned()).toHaveLength(1);
    // 再次解锁同 key：返回已有的，不新增
    const again = api.unlock('favorite_1');
    expect(again.key).toBe('favorite_1');
    expect(api.getEarned()).toHaveLength(1);
    // 已解锁后在 evaluate 中不再重复解锁
    expect(api.__test.evaluate({ favorites: 5 })).toEqual([]);
    // 存储确实写入 localStorage
    expect(localStorage.getItem('tatabox_achievements')).toContain('favorite_1');
  });

  test('checkAndUnlock 批量解锁且不重复', () => {
    const { api } = loadHarness();
    const unlocked = api.checkAndUnlock({ records: 50, wrongCount: 5 });
    expect(keysOf(unlocked)).toEqual(['first_practice', 'practice_10', 'practice_50', 'wrong_5']);
    expect(api.getEarned()).toHaveLength(4);
    // 再次判定：全部已解锁 → 无新增
    expect(api.checkAndUnlock({ records: 50, wrongCount: 5 })).toEqual([]);
  });

  test('reset 清除后即可重新解锁', () => {
    const { api, localStorage } = loadHarness();
    api.unlock({ key: 'streak_3' });
    expect(api.getEarned()).toHaveLength(1);
    const cleared = api.reset();
    expect(cleared).toBe(1);
    expect(api.getEarned()).toHaveLength(0);
    expect(localStorage.getItem('tatabox_achievements')).toBeNull();
    // reset 后可重新解锁
    expect(keysOf(api.__test.evaluate({ maxStreak: 3 }))).toEqual(['streak_3']);
  });
});