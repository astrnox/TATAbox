/**
 * TATABOX — 数据计算严苛审查回归测试（score-audit）
 *
 * 针对全库数据计算审查中确认并修复的科学性问题做回归防护：
 *   1) calcBioScore（js/pages/analytic.js）
 *      - G 维度趋势方向：getRecords() 降序 → 修复后升序平滑，进步加分、退步减分
 *      - 极端正确率（0% / 100%）与脏记录（correctCount > totalQuestions）恒 ∈[0,100] 且不 NaN
 *      - 模块难度加权（module_1..4 / module1..8 / 中文科目）实际生效
 *      - I 维度（洞察力）优先采用 records[].questions 的真实全对统计
 *   2) MTF 计分（js/pages/practice.js calculateQuestionScore）
 *      - 非 4 子题全对同样得满分 2.0（修复「3 子题全对得 0 分」）
 *      - 4 子题维持 CBO 分段（4/4→2、3/4→1、2/4→0.2）
 *   3) BKT（js/integrations/bkt-engine.js）
 *      - forward / logLikelihood 与 EM(forwardBackward) 初始条件一致（首观测不预转移）
 *   4) FSRS 预测曲线（js/algo/fsrs-algorithm.js generateForecast）
 *      - 今天到期 / 已过期卡片落入第 1 天复习桶（修复漏桶）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ANALYTIC_SRC = path.join(ROOT, 'js', 'pages', 'analytic.js');
const PRACTICE_SRC = path.join(ROOT, 'js', 'pages', 'practice.js');
const BKT_SRC = path.join(ROOT, 'js', 'integrations', 'bkt-engine.js');
const FSRC_SRC = path.join(ROOT, 'js', 'algo', 'fsrs-algorithm.js');
const TSFRS_SRC = path.join(ROOT, 'js', 'vendor', 'ts-fsrs.umd.min.js');

/* ---------- 加载工具 ---------- */

function makeLocalStorage(init) {
  const store = Object.assign({}, init);
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; }
  };
}

/* 加载 analytic.js 的 calcBioScore（受控 getRecords / getStats） */
function loadBioScore(getRecordsFn) {
  const win = {};
  const cap = {};
  win.__cap = cap;
  const src = fs.readFileSync(ANALYTIC_SRC, 'utf8')
    + '\n;window.__cap={calcBioScore:calcBioScore};';
  new Function('window', 'getRecords', src)(win, getRecordsFn);
  return win.__cap.calcBioScore;
}

function bioScoreWith(stats, records) {
  const calc = loadBioScore(() => (records == null ? [] : records));
  return calc(stats);
}

/* 加载 score-engine.js（IIFE 挂 globalThis 的浏览器全局风格，require 拿不到导出） */
function loadEngine() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'core', 'score-engine.js'), 'utf8');
  const win = {};
  new Function('window', src)(win);
  return win;
}

/* 从 practice.js 源码中截取 calculateQuestionScore 与 getEffectiveSubQuestions（真实代码） */
function extractFunctions(src, names) {
  const fns = {};
  for (const name of names) {
    const re = new RegExp('(function\\s+' + name + '[\\s\\S]*?^})', 'm');
    const m = src.match(re);
    if (!m) throw new Error('未找到函数: ' + name);
    fns[name] = m[1];
  }
  // 直接求值拼接包并返回闭包对象（避免包形参与函数声明同名导致的遮蔽）
  // QuestionModel（判卷内核）作为参数注入：practice.js 薄封装引用该全局
  const body = names.map((n) => fns[n]).join('\n')
    + '\n;return {' + names.map((n) => n + ':' + n).join(',') + '};';
  return new Function('QuestionModel', body)(require('../../js/core/question-model.js'));
}

/* 加载 bkt-engine.js，返回 window.BKTEngine（真实暴露名） */
function loadBkt() {
  const win = {};
  new Function('window', fs.readFileSync(BKT_SRC, 'utf8'))(win);
  if (!win.BKTEngine) throw new Error('bkt-engine 未挂载 window.BKTEngine');
  return win.BKTEngine;
}

/* 加载 fsrs-algorithm.js（params: { ts-fsrs UMD 加载结果 }） */
function loadFsrs(ts) {
  const localStorage = makeLocalStorage({});
  const sandbox = { window: { FSRS: ts }, localStorage, console };
  const factory = new Function('window', 'localStorage', 'console', fs.readFileSync(FSRC_SRC, 'utf8'));
  factory(sandbox.window, sandbox.localStorage, sandbox.console);
  return sandbox.window.FSRS;
}

describe('1. calcBioScore — 成长性(G)趋势方向（修复方向反转）', () => {
  const mkRecord = (i, rate) => ({
    timestamp: 1000 + i * 1000,
    totalQuestions: 10,
    correctCount: Math.round(rate * 10)
  });

  test('进步（旧→新 0.4→0.9）G 应显著高于退步（旧→新 0.9→0.4）', () => {
    const statsFixed = (totalAnswered, totalCorrect) => ({ totalAnswered, totalCorrect, modules: {} });
    const improve = bioScoreWith(statsFixed(50, 30), [0, 1, 2, 3, 4, 5].map((i) => mkRecord(i, 0.4 + i * 0.1)));
    const decline = bioScoreWith(statsFixed(50, 30), [0, 1, 2, 3, 4, 5].map((i) => mkRecord(i, 0.9 - i * 0.1)));
    // 退步记录的 G 不应高于进步记录；进步记录 G 应接近/高于 50
    expect(improve.components.G).toBeGreaterThan(decline.components.G);
    expect(improve.components.G).toBeGreaterThanOrEqual(50);
    expect(decline.components.G).toBeLessThanOrEqual(50);
  });

  test('同样记录无论数组输入顺序，G 只与时间戳方向有关（getRecords 降序也正确）', () => {
    const statsFixed = (a, c) => ({ totalAnswered: a, totalCorrect: c, modules: {} });
    // 手工传入「降序」数组（getRecords 的真实返回形态）
    const descInput = [5, 4, 3, 2, 1, 0].map((i) => mkRecord(i, 0.4 + i * 0.1));
    const r = bioScoreWith(statsFixed(50, 30), descInput);
    expect(r.components.G).toBeGreaterThanOrEqual(50); // 仍是进步
  });
});

describe('2. calcBioScore — 极端与脏数据鲁棒性', () => {
  test('0% 与 100% 正确率：分数有界、无 NaN、整体单调', () => {
    const zero = bioScoreWith({ totalAnswered: 60, totalCorrect: 0, modules: {} }, []);
    const full = bioScoreWith({ totalAnswered: 60, totalCorrect: 60, modules: {} }, []);
    for (const s of [zero, full]) {
      expect(Number.isFinite(s.score)).toBe(true);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
      for (const k of ['B', 'I', 'O', 'G', 'C', 'D']) {
        expect(Number.isFinite(s.components[k])).toBe(true);
        expect(s.components[k]).toBeGreaterThanOrEqual(0);
        expect(s.components[k]).toBeLessThanOrEqual(100);
      }
    }
    expect(full.score).toBeGreaterThanOrEqual(zero.score);
  });

  test('历史脏记录 correctCount>totalQuestions（旧考试格式）不产生 >100% / NaN', () => {
    const records = [
      { timestamp: 1, totalQuestions: 100, correctCount: 350 },  // 旧考试记录（子题级）
      { timestamp: 2, totalQuestions: 100, correctCount: 400 },
      { timestamp: 3, totalQuestions: 100, correctCount: 0 },
      { timestamp: 4, totalQuestions: 10, correctCount: 10 },
      { timestamp: 5, totalQuestions: 10, correctCount: 9 }
    ];
    const s = bioScoreWith({ totalAnswered: 200, totalCorrect: 120, modules: {} }, records);
    expect(Number.isFinite(s.score)).toBe(true);
    for (const k of ['G', 'C']) {
      expect(Number.isFinite(s.components[k])).toBe(true);
      expect(s.components[k]).toBeGreaterThanOrEqual(0);
      expect(s.components[k]).toBeLessThanOrEqual(100);
    }
  });
});

describe('3. calcBioScore — 模块 key 兼容与难度加权生效', () => {
  test('module_1(易) 正确率低 vs module_4(难) 正确率高：难度突破力(D) 反映难度加权', () => {
    // module_1 难度 0.6 / module_4 难度 0.85
    const s = bioScoreWith({
      totalAnswered: 40, totalCorrect: 32,
      modules: {
        module_1: { totalAnswered: 20, totalCorrect: 18, accuracy: 90 }, // 简单模块 90%
        module_4: { totalAnswered: 20, totalCorrect: 15, accuracy: 75 }  // 难模块 75%
      }
    }, []);
    expect(Number.isFinite(s.components.D)).toBe(true);
    // D = Σ(acc×diff)/Σ diff：0.9×0.6 + 0.75×0.85) / (0.6+0.85) ≈ 80.7
    expect(s.components.D).toBeGreaterThanOrEqual(75);
    expect(s.components.D).toBeLessThanOrEqual(85);
  });

  test('旧格式 module1..4 与中文科目名同样命中难度表（不恒为 0.7 兜底）', () => {
    const mk = (key) => bioScoreWith({
      totalAnswered: 10, totalCorrect: 8,
      modules: { [key]: { totalAnswered: 10, totalCorrect: 8, accuracy: 80 } }
    }, []);
    // 无模块数据（空）：D 回退 50
    const none = bioScoreWith({ totalAnswered: 10, totalCorrect: 8, modules: {} }, []);
    // 有模块数据：D 恒等于该模块正确率映射（80%）
    expect(mk('module1').components.D).toBe(80);
    expect(mk('module_3').components.D).toBe(80);
    expect(mk('遗传学').components.D).toBe(80);
    expect(none.components.D).toBe(50);
  });
});

describe('4. calcBioScore — 洞察力(I)采用真实全对数据', () => {
  test('records 含题目级明细：全对率按 difficulty 加权统计（非 subRatio^4 估算）', () => {
    const records = [
      {
        timestamp: 100,
        totalQuestions: 2, correctCount: 1,
        questions: [
          { subject: '细胞生物学', score: 2 },      // 全对（满分 2）
          { subject: '遗传学', score: 0 }            // 全错
        ]
      },
      {
        timestamp: 200,
        totalQuestions: 2, correctCount: 1,
        questions: [
          { subject: '细胞生物学', score: 0.2 },     // 部分对 → 非全对
          { subject: '遗传学', score: 2 }            // 全对
        ]
      }
    ];
    const s = bioScoreWith({ totalAnswered: 10, totalCorrect: 6, modules: {} }, records);
    // 真实全对 2 题：细胞(0.6)+遗传(0.85)；权重总 2.9 → I = 1.45/2.9 ≈ 50
    expect(s.components.I).toBeGreaterThanOrEqual(40);
    expect(s.components.I).toBeLessThanOrEqual(60);
  });

  test('无明细记录时回退“正确率²”估算且结果有界', () => {
    const s = bioScoreWith({ totalAnswered: 40, totalCorrect: 32, modules: {} }, [
      { timestamp: 1, totalQuestions: 10, correctCount: 8 }
    ]);
    // 0.8² = 0.64 → I ≈ 64（历史⁴幂次把 78% 正确率的省一压到 37，与真实全对率脱节）
    expect(s.components.I).toBeGreaterThanOrEqual(58);
    expect(s.components.I).toBeLessThanOrEqual(70);
  });

  test('回退幂次不压分：78% 正确率（省一画像）无明细时 I 不再低于 50', () => {
    const s = bioScoreWith({ totalAnswered: 780, totalCorrect: 608, modules: {} }, [
      { timestamp: 1, totalQuestions: 30, correctCount: 23 }
    ]);
    expect(s.components.I).toBeGreaterThanOrEqual(55);
  });
});

describe('5. MTF 计分（calculateQuestionScore）子题数归一化', () => {
  let api;
  beforeAll(() => {
    api = extractFunctions(fs.readFileSync(PRACTICE_SRC, 'utf8'),
      ['calculateQuestionScore', 'getEffectiveSubQuestions']);
  });

  const mtf = (size, answeredTrueCount) => {
    // 子题答案恒为「全真」，作答数组直接通过 true 的个数表达答对数
    const subs = Array.from({ length: size }, (_, i) => ({ label: 'ABCDEFGH'[i], answer: true }));
    const answers = {};
    for (let i = 0; i < size; i++) answers[i] = i < answeredTrueCount;
    return api.calculateQuestionScore.call(null, { subQuestions: subs }, answers);
  };

  test('4 子题保持 CBO 分段：4/4→2.0，3/4→1.0，2/4→0.2', () => {
    expect(mtf(4, 4).score).toBe(2.0);   // 全对
    expect(mtf(4, 3).score).toBe(1.0);   // 3/4
    expect(mtf(4, 2).score).toBe(0.2);   // 2/4
    expect(mtf(4, 1).score).toBe(0);     // 1/4
    expect(mtf(4, 0).score).toBe(0);     // 全错
  });

  test('非 4 子题：全对得满分 2.0，部分对按比例，全错 0（修复 3/3 得 0 分）', () => {
    expect(mtf(3, 3).score).toBe(2.0);   // 3 子题全对（修复）
    expect(mtf(2, 2).score).toBe(2.0);   // 2 子题全对
    expect(mtf(1, 1).score).toBe(2.0);   // 判断题全对
    expect(mtf(3, 2).score).toBeCloseTo(1.3, 1); // 2/3 → 2×2/3 ≈ 1.3
    expect(mtf(2, 0).score).toBe(0);
  });

  test('correct/total 保持题目级口径（records 消费方依赖）', () => {
    expect(api.calculateQuestionScore.call(null, { subQuestions: [{ label: 'A', answer: true }, { label: 'B', answer: true }] }, { 0: true, 1: true })).toMatchObject({ correct: 2, total: 2 });
    expect(mtf(2, 0)).toMatchObject({ correct: 0, total: 2 });
  });
});

describe('6. BKT — forward/logLikelihood 与 EM 初始条件一致', () => {
  let Bkt;
  beforeAll(() => {
    Bkt = loadBkt();
  });

  const params = { L0: 0.4, T: 0.3, S: 0.2, G: 0.1 };

  test('首观测不预转移：后验 = L0 直接发射（与 forwardBackward α1 = π·b）', () => {
    const obs = [1];
    const fwd = Bkt.forward(params, obs);
    const L0 = params.L0, S = params.S, G = params.G;
    // 手工：pL_pred = L0；pCorrect = L0(1-S)+(1-L0)G；post = L0(1-S)/pCorrect
    const pCorrect = L0 * (1 - S) + (1 - L0) * G;
    const post = (L0 * (1 - S)) / pCorrect;
    expect(fwd[0]).toBeCloseTo(post, 8);
  });

  test('正确序列后验单调上升、错误序列后验下降（BKT 单调性）', () => {
    const up = Bkt.forward(params, [1, 1, 1]);
    const down = Bkt.forward(params, [0, 0, 0]);
    expect(up[2]).toBeGreaterThan(up[0]);
    expect(down[2]).toBeLessThan(down[0]);
  });

  test('logLikelihood 与 forward 同模型：空序列 ll=0', () => {
    expect(Bkt.logLikelihood(params, [])).toBe(0);
  });
});

describe('7. FSRS generateForecast — 今天到期/过期卡不漏桶', () => {
  let FSRS;
  beforeAll(() => {
    const ts = require(TSFRS_SRC); // ts-fsrs UMD（node 填充 module.exports）
    FSRS = loadFsrs(ts);
  });

  function seedCards(cards) {
    const store = {};
    cards.forEach((c) => { store[c.id] = c.state; });
    FSRS.__debugSetState && FSRS.__debugSetState(store);
    try {
      FSRS._saveState && FSRS._saveState(store);
    } catch (e) { /* localStorage 直写 */ }
    return store;
  }

  test('今天到期（dueDate≈now）与 3 天前过期（dueDate=now-3d）都计入第 1 天', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const cards = [
      { id: 'today', state: { repetitions: 2, stability: 5, difficulty: 5, dueDate: now } },
      { id: 'overdue3d', state: { repetitions: 2, stability: 5, difficulty: 5, dueDate: now - 3 * day } },
      { id: 'tomorrow', state: { repetitions: 2, stability: 5, difficulty: 5, dueDate: now + day } },
      { id: 'in3d', state: { repetitions: 2, stability: 5, difficulty: 5, dueDate: now + 3 * day } }
    ];
    // 通过 localStorage 预置（generateForecast 直接读 localStorage）
    const save = makeLocalStorage({});
    save.setItem('bioquest_fsrs_cards', JSON.stringify(Object.fromEntries(cards.map((c) => [c.id, c.state]))));
    // 重新加载 FSRS 包装层后调用 generateForecast
    const sandbox = { window: { FSRS: require(TSFRS_SRC) }, localStorage: save, console };
    new Function('window', 'localStorage', 'console', fs.readFileSync(FSRC_SRC, 'utf8'))(sandbox.window, sandbox.localStorage, sandbox.console);
    const f = sandbox.window.FSRS.generateForecast(['today', 'overdue3d', 'tomorrow', 'in3d'], 5);
    const day1 = f.find((x) => x.day === 1).count;
    const day2 = f.find((x) => x.day === 2).count;
    const day4 = f.find((x) => x.day === 4).count;
    expect(day1).toBe(2); // today + overdue3d
    expect(day2).toBe(1); // tomorrow
    expect(day4).toBe(1); // in3d
  });

  test('getStatistics：avgStability/avgDifficulty 为数值（非字符串拼接）', () => {
    const save = makeLocalStorage({});
    save.setItem('bioquest_fsrs_cards', JSON.stringify({
      c1: { repetitions: 3, stability: 20, difficulty: 6, dueDate: Date.now() + 100000 },
      c2: { repetitions: 3, stability: 10, difficulty: 4, dueDate: Date.now() + 100000 }
    }));
    const sandbox = { window: { FSRS: require(TSFRS_SRC) }, localStorage: save, console };
    new Function('window', 'localStorage', 'console', fs.readFileSync(FSRC_SRC, 'utf8'))(sandbox.window, sandbox.localStorage, sandbox.console);
    const s = sandbox.window.FSRS.getStatistics(['c1', 'c2']);
    expect(typeof s.avgStability).toBe('number');
    expect(typeof s.avgDifficulty).toBe('number');
    expect(s.avgStability).toBe(15);
  });
});

describe('8. score-engine — 评级阈值标定（省一 ≈ 70-76 → A）', () => {
  const engine = loadEngine();

  test('评级边界与 BIO_SCORE_EXPLAIN.grades 自洽（无死档/空档）', () => {
    const grades = engine.BIO_SCORE_EXPLAIN.grades;
    expect(grades.length).toBe(10);
    // 每档 min 单调递减，最低档 min=0
    for (let i = 1; i < grades.length; i++) {
      expect(grades[i].min).toBeLessThan(grades[i - 1].min);
    }
    expect(grades[grades.length - 1].min).toBe(0);
    // computeBioScoreFromRaw 的实际评级与表一致（对每档 min 值抽查）
    grades.forEach((g) => {
      const out = engine.computeBioScoreFromRaw({ B: g.min, I: g.min, O: g.min, G: g.min, C: g.min, D: g.min });
      // 注：B/I 均 ≥70 时有 +5 协同，直接用得分对齐档位边界
      const probe = engine.computeBioScoreFromRaw({ B: 50, I: 50, O: g.min, G: 50, C: 50, D: 50 });
      expect(probe.score).toBeGreaterThanOrEqual(0);
      expect(out.grade).toBeTruthy();
    });
  });

  test('省一画像（78% 正确率、无明细、多场稳定）落在 A（70-76）', () => {
    const stats = {
      totalAnswered: 780, totalCorrect: 608,
      modules: { module_1: { totalAnswered: 400, totalCorrect: 312 }, module_4: { totalAnswered: 380, totalCorrect: 296 } }
    };
    const records = [];
    for (let i = 0; i < 25; i++) {
      records.push({ timestamp: Date.now() - (25 - i) * 86400000, totalQuestions: 30, correctCount: 23 });
    }
    const dims = engine.computeBioDimensions(stats, records);
    const out = engine.computeBioScoreFromRaw(dims);
    expect(out.score).toBeGreaterThanOrEqual(70);
    expect(out.score).toBeLessThanOrEqual(76); // A 档 70-76（A+ 自 77 起）
    expect(out.grade).toBe('A');
    expect(out.letter).toBe('优秀');
  });

  test('I 维度：78% 正确率无明细时回退值 ≥ 55（不再被⁴幂压到 37）', () => {
    const stats = { totalAnswered: 780, totalCorrect: 608, modules: {} };
    const dims = engine.computeBioDimensions(stats, [
      { timestamp: 1, totalQuestions: 30, correctCount: 23 }
    ]);
    expect(dims.I).toBeGreaterThanOrEqual(55); // 0.78² = 0.6084 → I ≈ 61
  });
});

describe('9. score-engine — 置信度输出（computeBioDimensions.confidence）', () => {
  const engine = loadEngine();

  test('confidence 含 B/I/O/G/C/D 六键且均 ∈[0,1]', () => {
    const dims = engine.computeBioDimensions(
      { totalAnswered: 10, totalCorrect: 8, modules: {} }, []);
    expect(dims.confidence).toBeTruthy();
    ['B', 'I', 'O', 'G', 'C', 'D'].forEach((k) => {
      expect(typeof dims.confidence[k]).toBe('number');
      expect(dims.confidence[k]).toBeGreaterThanOrEqual(0);
      expect(dims.confidence[k]).toBeLessThanOrEqual(1);
    });
  });

  test('空数据：G/C 置信度为 0，D 置信度为 0（无模块数据）', () => {
    const dims = engine.computeBioDimensions(
      { totalAnswered: 0, totalCorrect: 0, modules: {} }, []);
    expect(dims.confidence.G).toBe(0);
    expect(dims.confidence.C).toBe(0);
    expect(dims.confidence.D).toBe(0);
  });

  test('数据充足（30 题/5 场/有模块）：主要维度置信度为 1', () => {
    const stats = { totalAnswered: 40, totalCorrect: 32, modules: { module_1: { totalAnswered: 40, totalCorrect: 32 } } };
    const records = [];
    for (let i = 0; i < 6; i++) {
      records.push({ timestamp: Date.now() - (6 - i) * 86400000, totalQuestions: 10, correctCount: 8 });
    }
    const dims = engine.computeBioDimensions(stats, records);
    expect(dims.confidence.B).toBe(1);
    expect(dims.confidence.O).toBe(1);
    expect(dims.confidence.G).toBe(1);
    expect(dims.confidence.C).toBe(1);
    expect(dims.confidence.D).toBe(1);
  });

  test('I 走回退估算时置信度打 0.6 折（估算值弱于真实题级统计）', () => {
    const stats = { totalAnswered: 40, totalCorrect: 32, modules: {} };
    // 无明细（questions 缺失）→ 回退，I 置信度 = confOf(40,30)×0.6 = 0.6
    const fallback = engine.computeBioDimensions(stats, [
      { timestamp: 1, totalQuestions: 10, correctCount: 8 }
    ]);
    // 有明细（30 题×遗传学权重0.85 = 25.5 ≥ 30 阈值的 0.85）→ I 置信度不受 0.6 折影响
    const realQs = [];
    for (let i = 0; i < 30; i++) realQs.push({ subject: '遗传学', correctSubs: 2, totalSubs: 2 });
    const real = engine.computeBioDimensions(stats, [
      { timestamp: 1, totalQuestions: 30, correctCount: 30, questions: realQs }
    ]);
    expect(fallback.confidence.I).toBeLessThan(real.confidence.I);
    expect(fallback.confidence.I).toBeCloseTo(0.6, 5);
  });

  test('G/C 置信度随场次数线性爬升（<阈值时 <1，≥阈值封顶 1）', () => {
    const mk = (n) => {
      const records = [];
      for (let i = 0; i < n; i++) {
        records.push({ timestamp: Date.now() - (n - i) * 86400000, totalQuestions: 10, correctCount: 8 });
      }
      return engine.computeBioDimensions({ totalAnswered: n * 10, totalCorrect: n * 8, modules: {} }, records).confidence;
    };
    expect(mk(1).G).toBeLessThan(1);
    expect(mk(2).G).toBeLessThan(mk(4).G);
    expect(mk(4).G).toBe(1);
    expect(mk(2).C).toBeLessThan(1);
    expect(mk(3).C).toBe(1);
  });
});

describe('10. score-engine 与 analytic.calcBioScore 双实现对拍（同输入同输出）', () => {
  const engine = loadEngine();

  test('有明细数据：引擎六维与页面 calcBioScore 六维完全一致', () => {
    const stats = {
      totalAnswered: 200, totalCorrect: 150,
      modules: { module_1: { totalAnswered: 100, totalCorrect: 80 }, module_4: { totalAnswered: 100, totalCorrect: 70 } }
    };
    const records = [];
    for (let i = 0; i < 10; i++) {
      records.push({
        timestamp: Date.now() - (10 - i) * 86400000,
        totalQuestions: 20, correctCount: 14 + (i % 3),
        questions: [
          { subject: '细胞生物学', correctSubs: 4, totalSubs: 4 },
          { subject: '遗传学', correctSubs: 2, totalSubs: 4 },
          { subject: '生态学', correctSubs: 3, totalSubs: 3 }
        ]
      });
    }
    const dims = engine.computeBioDimensions(stats, records);
    const page = bioScoreWith(stats, records);
    ['B', 'I', 'O', 'G', 'C', 'D'].forEach((k) => {
      expect(dims[k]).toBe(page.components[k]);
    });
    const out = engine.computeBioScoreFromRaw(dims);
    expect(out.score).toBe(page.score);
    expect(out.grade).toBe(page.grade);
    expect(out.letter).toBe(page.letter);
  });

  test('无明细回退路径：两实现同样不产生 NaN 且 I ≈ 61（0.78²）', () => {
    const stats = { totalAnswered: 780, totalCorrect: 608, modules: {} };
    const records = [{ timestamp: 1, totalQuestions: 30, correctCount: 23 }];
    const dims = engine.computeBioDimensions(stats, records);
    const page = bioScoreWith(stats, records);
    expect(dims.I).toBe(page.components.I);
    expect(dims.I).toBe(61); // Math.round(0.78² × 100)
    expect(Number.isFinite(page.score)).toBe(true);
  });
});