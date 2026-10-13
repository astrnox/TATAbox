/**
 * 题目模型内核单元测试（js/core/question-model.js）
 * -------------------------------------------------
 * 全局化改造：practice / quiz / exam / daily-billion 四页的题型判定、
 * MTF 子题展开、判卷与分值原先各写一份，本模块是唯一权威实现。
 * 验证矩阵：
 *   1. 题型归一：别名映射 + 结构兜底（有 subQuestions → mtf）
 *   2. 子题展开：subQuestions 原样 / options+mtfTruth / options+answer 兜底
 *   3. 作答判定：isAllAnswered（单选/多选/MTF 布尔口径）与 isSubCorrect
 *   4. 四档判卷语义：practice（2.0 分制 + 联赛阶梯）、quiz（全对/半对/零分）、
 *      exam（固定 4 子题 0/0/0.2/1/2）、daily（每计分项 1 分）
 *   5. 文案口径：题型标签 / 选项标记 / 测验分值 / 诊断统计桶归一
 */
'use strict';

const QuestionModel = require('../../js/core/question-model.js');

/* ---------- 测试题构造器 ---------- */
const choiceQ = { type: 'single', options: { A: '甲', B: '乙', C: '丙', D: '丁' }, answer: 'C' };
const judgeQ = { type: 'judge', options: ['正确', '错误'], answer: '正确' }; // daily 页判断题存法
const multipleQ = { type: 'multiple', options: { A: '甲', B: '乙', C: '丙' }, answer: ['A', 'C'] };
const mtf4 = () => ({
  type: 'mtf',
  subQuestions: [
    { label: 'A', text: '陈述一', answer: true },
    { label: 'B', text: '陈述二', answer: false },
    { label: 'C', text: '陈述三', answer: true },
    { label: 'D', text: '陈述四', answer: true }
  ]
});
const mtf2 = () => ({
  type: 'mtf',
  subQuestions: [
    { label: 'A', text: '陈述一', answer: true },
    { label: 'B', text: '陈述二', answer: false }
  ]
});

describe('normalizeType（题型归一）', () => {
  test('标准别名映射', () => {
    expect(QuestionModel.normalizeType('single')).toBe('single');
    expect(QuestionModel.normalizeType('single_choice')).toBe('single');
    expect(QuestionModel.normalizeType('multiple')).toBe('multiple');
    expect(QuestionModel.normalizeType('multi_choice')).toBe('multiple');
    expect(QuestionModel.normalizeType('tf')).toBe('judge');
    expect(QuestionModel.normalizeType('true_false')).toBe('judge');
    expect(QuestionModel.normalizeType('judgment')).toBe('judge');
    expect(QuestionModel.normalizeType('multi_judge')).toBe('mtf');
    expect(QuestionModel.normalizeType('MTF')).toBe('mtf'); // 大小写不敏感
  });

  test('结构兜底：type 缺失但有 subQuestions → mtf；无结构信息 → single', () => {
    expect(QuestionModel.normalizeType({ subQuestions: [{ answer: true }] })).toBe('mtf');
    expect(QuestionModel.normalizeType({})).toBe('single');
    expect(QuestionModel.normalizeType(null)).toBe('single');
    expect(QuestionModel.normalizeType(undefined)).toBe('single');
  });

  test('判断器别名', () => {
    expect(QuestionModel.isMtf({ type: 'multi_judge' })).toBe(true);
    expect(QuestionModel.isJudge({ type: 'tf' })).toBe(true);
    expect(QuestionModel.isMultiple({ type: 'multi_choice' })).toBe(true);
    expect(QuestionModel.isSingle({ type: 'single_choice' })).toBe(true);
  });
});

describe('isStandardChoice / isLogicChoice / isChoiceQuestion', () => {
  test('标准单选（options 映射 + 字母 answer）', () => {
    expect(QuestionModel.isStandardChoice(choiceQ)).toBe(true);
    expect(QuestionModel.isChoiceQuestion(choiceQ)).toBe(true);
  });

  test('逻辑单选（category=logic + options 数组 + 索引 answer）', () => {
    const logicQ = { category: 'logic', options: ['甲', '乙', '丙', '丁'], answer: 1 };
    expect(QuestionModel.isLogicChoice(logicQ)).toBe(true);
    expect(QuestionModel.isChoiceQuestion(logicQ)).toBe(true);
  });

  test('MTF 化的逻辑题不算单选', () => {
    const logicMtf = { category: 'logic', type: 'mtf', options: ['甲', '乙'], mtfTruth: [true, false], answer: 0 };
    expect(QuestionModel.isLogicChoice(logicMtf)).toBe(false);
    expect(QuestionModel.isChoiceQuestion(logicMtf)).toBe(false);
  });

  test('daily 页判断题（type=judge + options 数组）算单选类', () => {
    expect(QuestionModel.isChoiceQuestion(judgeQ)).toBe(true);
  });
});

describe('getEffectiveSubQuestions（MTF 子题展开 · 唯一权威）', () => {
  test('已有 subQuestions 原样返回', () => {
    const q = mtf4();
    expect(QuestionModel.getEffectiveSubQuestions(q)).toBe(q.subQuestions);
  });

  test('options + mtfTruth：逐条转判断陈述，truth 优先', () => {
    const q = { type: 'mtf', options: ['甲', '乙', '丙'], mtfTruth: [true, false, true], answer: 1 };
    const subs = QuestionModel.getEffectiveSubQuestions(q);
    expect(subs.map(s => s.answer)).toEqual([true, false, true]);
    expect(subs.map(s => s.label)).toEqual(['A', 'B', 'C']);
    expect(subs[1].text).toBe('乙');
  });

  test('options 无 mtfTruth：原 answer 索引为真，其余为假', () => {
    const q = { type: 'mtf', options: ['甲', '乙', '丙'], answer: 2 };
    const subs = QuestionModel.getEffectiveSubQuestions(q);
    expect(subs.map(s => s.answer)).toEqual([false, false, true]);
  });

  test('非 MTF 题返回空数组', () => {
    expect(QuestionModel.getEffectiveSubQuestions(choiceQ)).toEqual([]);
    expect(QuestionModel.getEffectiveSubQuestions(null)).toEqual([]);
  });
});

describe('isAllAnswered / isSubCorrect（作答判定）', () => {
  test('单选类：已选一个选项即为已答（对象/数组/标量存法均兼容）', () => {
    expect(QuestionModel.isAllAnswered(choiceQ, { 0: 'C' })).toBe(true);
    expect(QuestionModel.isAllAnswered(choiceQ, ['C'])).toBe(true);
    expect(QuestionModel.isAllAnswered(choiceQ, 'C')).toBe(true);
    expect(QuestionModel.isAllAnswered(choiceQ, { 0: undefined })).toBe(false);
    expect(QuestionModel.isAllAnswered(choiceQ, null)).toBe(false);
  });

  test('多选类：至少勾选 1 项即为已答', () => {
    expect(QuestionModel.isAllAnswered(multipleQ, ['A'])).toBe(true);
    expect(QuestionModel.isAllAnswered(multipleQ, [])).toBe(false);
  });

  test('MTF：每条子题都必须是布尔作答（严格口径）', () => {
    expect(QuestionModel.isAllAnswered(mtf4(), [true, false, true, true])).toBe(true);
    expect(QuestionModel.isAllAnswered(mtf4(), [true, false, true])).toBe(false); // 第 4 条未答
    expect(QuestionModel.isAllAnswered(mtf4(), [true, false, 'true', true])).toBe(false); // 非布尔
    expect(QuestionModel.isAllAnswered({ subQuestions: [] }, [])).toBe(false); // 脏数据
  });

  test('isSubCorrect：未作答按错', () => {
    const q = mtf4();
    expect(QuestionModel.isSubCorrect(q, 0, [true, false, false, true])).toBe(true);
    expect(QuestionModel.isSubCorrect(q, 1, [true, true, false, true])).toBe(false);
    expect(QuestionModel.isSubCorrect(q, 0, [undefined, false, false, true])).toBe(false);
    expect(QuestionModel.isSubCorrect(q, 9, [true, false, false, true])).toBe(false);
  });
});

describe('gradeQuestion · practice 档（2.0 分制 + 联赛阶梯）', () => {
  test('单选：对=2.0、错=0', () => {
    const ok = QuestionModel.gradeQuestion(choiceQ, { 0: 'C' }, 'practice');
    expect(ok).toMatchObject({ correct: 1, total: 1, score: 2, maxScore: 2, verdict: 'full' });
    const bad = QuestionModel.gradeQuestion(choiceQ, { 0: 'A' }, 'practice');
    expect(bad).toMatchObject({ correct: 0, score: 0, verdict: 'none' });
  });

  test('4 子题 MTF 走联赛阶梯 0/0/0.2/1/2', () => {
    const q = mtf4();
    expect(QuestionModel.gradeQuestion(q, [true, false, true, true], 'practice').score).toBe(2);
    expect(QuestionModel.gradeQuestion(q, [true, false, true, false], 'practice').score).toBe(1);   // 3/4
    expect(QuestionModel.gradeQuestion(q, [true, false, false, false], 'practice').score).toBe(0.2); // 2/4
    expect(QuestionModel.gradeQuestion(q, [true, true, false, false], 'practice').score).toBe(0);    // 1/4
  });

  test('非 4 子题按比例归一（全对恒得满分）', () => {
    const q = mtf2();
    expect(QuestionModel.gradeQuestion(q, [true, true], 'practice').score).toBe(1);  // 1/2 → 1.0
    expect(QuestionModel.gradeQuestion(q, [true, false], 'practice').score).toBe(2); // 全对 → 满分
    expect(QuestionModel.gradeQuestion(q, [false, true], 'practice').score).toBe(0);
  });

  test('无子题脏数据：total=1、0 分（records 消费方依赖）', () => {
    const r = QuestionModel.gradeQuestion({ type: 'mtf', subQuestions: [] }, [], 'practice');
    expect(r).toMatchObject({ total: 1, score: 0, maxScore: 2, verdict: 'none' });
  });

  test('details 逐子题给出对错', () => {
    const r = QuestionModel.gradeQuestion(mtf4(), [true, true, false, true], 'practice');
    expect(r.details.map(d => d.isCorrect)).toEqual([true, false, false, true]);
    expect(r.correct).toBe(2);
  });
});

describe('gradeQuestion · quiz 档（全对/半对/零分）', () => {
  test('单选/判断满分 3', () => {
    expect(QuestionModel.gradeQuestion(choiceQ, { 0: 'C' }, 'quiz')).toMatchObject({ score: 3, maxScore: 3, verdict: 'full' });
    expect(QuestionModel.gradeQuestion(judgeQ, { 0: '正确' }, 'quiz').score).toBe(3);
    expect(QuestionModel.gradeQuestion(judgeQ, { 0: '错误' }, 'quiz').score).toBe(0);
  });

  test('多选：全对 5、少选（无错选）2、有错选 0', () => {
    expect(QuestionModel.gradeQuestion(multipleQ, ['A', 'C'], 'quiz')).toMatchObject({ score: 5, verdict: 'full' });
    expect(QuestionModel.gradeQuestion(multipleQ, ['A'], 'quiz')).toMatchObject({ score: 2, verdict: 'partial' });
    expect(QuestionModel.gradeQuestion(multipleQ, ['A', 'B'], 'quiz')).toMatchObject({ score: 0, verdict: 'none' });
    expect(QuestionModel.gradeQuestion(multipleQ, [], 'quiz').answered).toBe(false);
  });

  test('MTF：全对 3、半对 2、零分 0；未答满一律 0 分', () => {
    const q = mtf4();
    expect(QuestionModel.gradeQuestion(q, [true, false, true, true], 'quiz')).toMatchObject({ score: 3, verdict: 'full' });
    expect(QuestionModel.gradeQuestion(q, [true, true, false, true], 'quiz')).toMatchObject({ score: 2, verdict: 'partial' });
    expect(QuestionModel.gradeQuestion(q, [false, true, false, false], 'quiz')).toMatchObject({ score: 0, verdict: 'none' });
    // 未答满：即使已答的都对也不给分（quiz 档收紧口径）
    expect(QuestionModel.gradeQuestion(q, [true, false, true], 'quiz')).toMatchObject({ score: 0, verdict: 'none' });
  });
});

describe('gradeQuestion · exam 档（固定 4 子题 × 2 分阶梯）', () => {
  test('与 practice 的 4 子题阶梯一致', () => {
    const q = mtf4();
    expect(QuestionModel.gradeQuestion(q, [true, false, true, true], 'exam')).toMatchObject({ correct: 4, total: 4, score: 2 });
    expect(QuestionModel.gradeQuestion(q, [true, false, true, false], 'exam').score).toBe(1);
    expect(QuestionModel.gradeQuestion(q, [true, false, false, false], 'exam').score).toBe(0.2);
    expect(QuestionModel.gradeQuestion(q, [false, true, false, false], 'exam').score).toBe(0);
  });

  test('total 恒为 4（子题不足按判错计）', () => {
    const r = QuestionModel.gradeQuestion(mtf2(), [true, true], 'exam');
    expect(r.total).toBe(4);
    expect(r.correct).toBe(1); // sub1 答案为 false，答 true 判错
  });
});

describe('gradeQuestion · daily 档（每计分项 1 分）', () => {
  test('单选类：对 1 分错 0 分', () => {
    expect(QuestionModel.gradeQuestion(choiceQ, { 0: 'C' }, 'daily')).toMatchObject({ score: 1, maxScore: 1, correct: 1, total: 1 });
    expect(QuestionModel.gradeQuestion(choiceQ, { 0: 'A' }, 'daily').score).toBe(0);
  });

  test('MTF：score = 判对子题数，maxScore = 子题数', () => {
    const r = QuestionModel.gradeQuestion(mtf4(), [true, true, false, true], 'daily');
    expect(r).toMatchObject({ score: 2, maxScore: 4, total: 4, correct: 2 });
  });

  test('未作答的子题不计分但如实反映在 details', () => {
    const r = QuestionModel.gradeQuestion(mtf4(), [true, true], 'daily');
    expect(r.score).toBe(1);
    expect(r.answered).toBe(false);
    expect(r.details[2].answered).toBe(false);
  });
});

describe('gradeQuestion · 默认档', () => {
  test('不传 profile 默认 practice', () => {
    expect(QuestionModel.gradeQuestion(choiceQ, { 0: 'C' }).profile).toBe('practice');
    expect(QuestionModel.gradeQuestion(choiceQ, { 0: 'C' }).score).toBe(2);
  });
});

describe('文案口径（标签 / 选项 / 分值 / 统计桶）', () => {
  test('getTypeLabel', () => {
    expect(QuestionModel.getTypeLabel('single')).toBe('单选题');
    expect(QuestionModel.getTypeLabel('tf')).toBe('判断题');
    expect(QuestionModel.getTypeLabel('multi_judge')).toBe('多重判断题');
    expect(QuestionModel.getTypeLabel('unknown')).toBe('单选题'); // 兜底
  });

  test('getQuizTypeScore：单选/判断/MTF=3、多选=5', () => {
    expect(QuestionModel.getQuizTypeScore('single')).toBe(3);
    expect(QuestionModel.getQuizTypeScore('judge')).toBe(3);
    expect(QuestionModel.getQuizTypeScore('mtf')).toBe(3);
    expect(QuestionModel.getQuizTypeScore('multiple')).toBe(5);
  });

  test('getOptionLabels：判断题 正确/错误，其余 A~E', () => {
    expect(QuestionModel.getOptionLabels('judge')).toEqual(['正确', '错误']);
    expect(QuestionModel.getOptionLabels('single')).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  test('normalizeStatType：诊断统计桶归一（判断题=tf，未知默认 mtf）', () => {
    expect(QuestionModel.normalizeStatType({ type: 'judge' })).toBe('tf');
    expect(QuestionModel.normalizeStatType({ type: 'tf' })).toBe('tf');
    expect(QuestionModel.normalizeStatType({ type: 'single_choice' })).toBe('single');
    expect(QuestionModel.normalizeStatType({ category: 'logic' })).toBe('logic');
    expect(QuestionModel.normalizeStatType({})).toBe('mtf');
    expect(QuestionModel.normalizeStatType(null)).toBe('mtf');
  });

  test('常量导出防漂移：页面引用同一份', () => {
    expect(QuestionModel.LEAGUE_SCORE_TABLE).toEqual({ 0: 0, 1: 0, 2: 0.2, 3: 1, 4: 2 });
    expect(QuestionModel.QUIZ_SCORES).toMatchObject({ single: 3, judge: 3, multiple: 5, multiplePartial: 2 });
    expect(QuestionModel.PRACTICE_FULL_SCORE).toBe(2);
  });
});
