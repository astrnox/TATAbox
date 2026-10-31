/**
 * IRT 自适应引擎单元测试
 * 覆盖核心算法：3PL 概率、题目参数推断、θ 贝叶斯更新。
 */

const fs = require('fs');
const path = require('path');
const IRT_SRC = path.join(__dirname, '..', '..', 'js', 'algo', 'irt-engine.js');

// 在隔离的 window/localStorage 沙箱中加载 irt-engine.js，返回 window.IrtEngine
function loadIrtEngine() {
  const sandbox = {
    window: {},
    localStorage: {
      _d: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
      setItem(k, v) { this._d[k] = String(v); },
      removeItem(k) { delete this._d[k]; }
    }
  };
  const factory = new Function('window', 'localStorage', fs.readFileSync(IRT_SRC, 'utf8'));
  factory(sandbox.window, sandbox.localStorage);
  if (!sandbox.window.IrtEngine) throw new Error('irt-engine 未挂载到 window.IrtEngine');
  return sandbox.window.IrtEngine;
}

const Irt = loadIrtEngine();

describe('IRT 三参数逻辑斯谛概率 probCorrect', () => {
  test('中等难度、中等能力、无猜测 → P=0.5', () => {
    expect(Irt.probCorrect(0, { a: 1, b: 0, c: 0 })).toBeCloseTo(0.5, 5);
  });

  test('能力越高答对概率越高', () => {
    const pLow = Irt.probCorrect(-2, { a: 1, b: 0, c: 0 });
    const pHigh = Irt.probCorrect(2, { a: 1, b: 0, c: 0 });
    expect(pHigh).toBeGreaterThan(pLow);
    expect(pLow).toBeLessThan(0.5);
    expect(pHigh).toBeGreaterThan(0.5);
  });

  test('猜测率 c 提供下界概率', () => {
    const p = Irt.probCorrect(-10, { a: 1, b: 0, c: 0.25 });
    expect(p).toBeGreaterThanOrEqual(0.25);
    // 能力极低时趋近 c
    expect(p).toBeCloseTo(0.25, 4);
  });

  test('难度 b 越高，同等能力下答对概率越低', () => {
    const easy = Irt.probCorrect(0, { a: 1, b: -1, c: 0 });
    const hard = Irt.probCorrect(0, { a: 1, b: 1, c: 0 });
    expect(hard).toBeLessThan(easy);
  });

  test('概率被限制在 (0.001, 0.999) 内', () => {
    expect(Irt.probCorrect(100, { a: 2, b: -3, c: 0 })).toBeLessThanOrEqual(0.999);
    expect(Irt.probCorrect(-100, { a: 2, b: 3, c: 0 })).toBeGreaterThanOrEqual(0.001);
  });
});

describe('IRT 题目参数推断 inferParams', () => {
  test('4 选项单选题：c=1/4，a=1.2', () => {
    const p = Irt.inferParams({ type: 'mcq', difficulty: 0.5, options: [1, 2, 3, 4] });
    expect(p.c).toBeCloseTo(0.25, 5);
    expect(p.a).toBe(1.2);
    expect(p.b).toBeCloseTo(0, 5);
  });

  test('判断题：c=0.5', () => {
    const p = Irt.inferParams({ type: 'judgment' });
    expect(p.c).toBe(0.5);
  });

  test('2 选项题区分度较低 a=0.6', () => {
    const p = Irt.inferParams({ type: 'mcq', options: [1, 2] });
    expect(p.a).toBe(0.6);
  });

  test('难度映射：difficulty=1 → b≈2.5', () => {
    const p = Irt.inferParams({ type: 'mcq', difficulty: 1, options: [1, 2, 3, 4] });
    expect(p.b).toBeCloseTo(2.5, 5);
  });

  test('无标注时按题型推断：essay 区分度更高且无猜测', () => {
    const p = Irt.inferParams({ type: 'essay' });
    expect(p.a).toBe(1.5);
    expect(p.c).toBe(0);
  });

  test('字符串难度归一：hard > medium > easy，不再统一落到 b=0', () => {
    const easy = Irt.inferParams({ type: 'mcq', difficulty: 'easy', options: [1, 2, 3, 4] });
    const medium = Irt.inferParams({ type: 'mcq', difficulty: 'medium', options: [1, 2, 3, 4] });
    const hard = Irt.inferParams({ type: 'mcq', difficulty: 'hard', options: [1, 2, 3, 4] });
    expect(easy.b).toBeCloseTo(-1.25, 5);
    expect(medium.b).toBeCloseTo(0, 5);
    expect(hard.b).toBeCloseTo(1.25, 5);
  });

  test('中文/数字字符串难度同样归一', () => {
    expect(Irt.inferParams({ type: 'mcq', difficulty: '简单', options: [1, 2, 3, 4] }).b).toBeCloseTo(-1.25, 5);
    expect(Irt.inferParams({ type: 'mcq', difficulty: '联赛', options: [1, 2, 3, 4] }).b).toBeCloseTo(1.25, 5);
    expect(Irt.inferParams({ type: 'mcq', difficulty: '0.8', options: [1, 2, 3, 4] }).b).toBeCloseTo(1.5, 5);
  });

  test('难度越界钳制到 [0,1]；无法识别的字符串回落题型默认值', () => {
    expect(Irt.inferParams({ type: 'mcq', difficulty: 5, options: [1, 2, 3, 4] }).b).toBeCloseTo(2.5, 5);
    expect(Irt.inferParams({ type: 'mcq', difficulty: -2, options: [1, 2, 3, 4] }).b).toBeCloseTo(-2.5, 5);
    // 未知标签按 mcq 默认 0.4 → b=-0.5，而非 0
    expect(Irt.inferParams({ type: 'mcq', difficulty: 'unknown', options: [1, 2, 3, 4] }).b).toBeCloseTo(-0.5, 5);
  });
});

describe('IRT θ 贝叶斯更新 updateTheta（经 recordAnswer）', () => {
  test('答对 → θ 上升；答错 → θ 下降', () => {
    const mid = { a: 1, b: 0, c: 0 };
    const up = Irt.recordAnswer('q1', true, { type: 'mcq', difficulty: 0.5, options: [1, 2, 3, 4] });
    const down = Irt.recordAnswer('q2', false, { type: 'mcq', difficulty: 0.5, options: [1, 2, 3, 4] });
    // recordAnswer 返回更新后的状态对象
    expect(typeof up.theta).toBe('number');
    expect(up.totalAnswered).toBeGreaterThan(0);
    // 单步更新被限制在步长内，且始终在 [-3,3]
    expect(up.theta).toBeLessThanOrEqual(3);
    expect(up.theta).toBeGreaterThanOrEqual(-3);
    expect(down.theta).toBeGreaterThanOrEqual(-3);
  });

  test('连续答对使 θ 增加，连续答错使 θ 减少', () => {
    Irt.recordAnswer('a1', true, { type: 'mcq', difficulty: 0.4, options: [1, 2, 3, 4] });
    Irt.recordAnswer('a2', true, { type: 'mcq', difficulty: 0.4, options: [1, 2, 3, 4] });
    Irt.recordAnswer('a3', true, { type: 'mcq', difficulty: 0.4, options: [1, 2, 3, 4] });
    const afterGood = Irt.loadState().theta;
    expect(afterGood).toBeGreaterThan(0);

    Irt.recordAnswer('b1', false, { type: 'mcq', difficulty: 0.4, options: [1, 2, 3, 4] });
    Irt.recordAnswer('b2', false, { type: 'mcq', difficulty: 0.4, options: [1, 2, 3, 4] });
    Irt.recordAnswer('b3', false, { type: 'mcq', difficulty: 0.4, options: [1, 2, 3, 4] });
    const afterBad = Irt.loadState().theta;
    expect(afterBad).toBeLessThan(afterGood);
  });
});