/**
 * ============================================================
 * TATABOX — 题目模型（题型归一 / 子题展开 / 判卷内核 / 分值 · 纯函数模块）
 * ============================================================
 *
 * 背景（全局化改造）：
 *   「这道题是什么题型」「MTF 展开成哪些子题」「这一题判几分」这三件事，
 *   此前散落在 practice / quiz / exam / daily-billion 四处各写一份——
 *   practice 与 quiz 的 getEffectiveSubQuestions 甚至互相在注释里标注
 *   「与 xxx 同一算法」，一旦实现漂移就会出现同题两页判分相反（PR #165）。
 *   本模块是唯一权威实现，页面只负责渲染与交互。
 *
 * 职责：
 *   1. 题型归一：normalizeType / isSingle / isMtf / isStandardChoice / isLogicChoice
 *   2. 子题展开：getEffectiveSubQuestions（MTF 唯一权威算法）
 *   3. 判卷内核：gradeQuestion(q, userAnswers, profile) —— profile 见下
 *   4. 通用判定：isAllAnswered（是否已答完）/ isSubCorrect（子题是否判对）
 *   5. 文案口径：getTypeLabel / getOptionLabels / getQuizTypeScore / 统计桶标签
 *
 * 分值档位（profile）：
 *   - practice：单题满分 2.0（练习总账「满分 = 题数 × 2」）。
 *     4 子题走 2025 CBO 联赛阶梯 4/4→2.0、3/4→1.0、2/4→0.2、其余 0；
 *     非 4 子题按比例归一到 0.1（全对恒得满分）。
 *   - exam：与 practice 的 4 子题阶梯完全一致（LEAGUE_SCORE_TABLE），
 *     但固定按 4 个计分项判卷（考试页 72 题 × 2 分口径）。
 *   - quiz：全对 full / 半对 partial（仅多选与 MTF）/ 零分 none；
 *     分值 = 单选 3、判断 3、多选 5（半对 2）、MTF 3（半对 2）。
 *   - daily：每个计分项 1 分，score = 正确项数（成绩单按 x/y 展示），
 *     「已提交」状态由页面自己叠加（作答阶段不判卷）。
 *
 * 依赖：无 DOM / 无存储，可在 Node 直接单测（tests/unit/question-model.test.js）。
 * 挂载：浏览器 window.QuestionModel；Node module.exports（同 rating.js 约定）。
 * ============================================================
 */
'use strict';

var QuestionModel = (function () {

  /* ======================= 常量 ======================= */

  // 题型显示名（模型词表：single / multiple / judge / mtf）
  var TYPE_LABELS = {
    single: '单选题',
    multiple: '多选题',
    judge: '判断题',
    mtf: '多重判断题'
  };

  // 2025 CBO 联赛标准：MTF 4 子题计分阶梯（practice / exam 共用）
  var LEAGUE_SCORE_TABLE = { 0: 0, 1: 0, 2: 0.2, 3: 1, 4: 2 };

  // 练习页单题满分
  var PRACTICE_FULL_SCORE = 2.0;

  // 测验页分值（单选/判断满分、多选满分与半对分、MTF 满分与半对分）
  var QUIZ_SCORES = {
    single: 3,
    judge: 3,
    multiple: 5,
    multiplePartial: 2,
    mtf: 3,
    mtfPartial: 2
  };

  // 学情诊断的题型统计桶（历史记录词表，与模型词表不同：判断题 = tf）
  var STAT_TYPE_LABELS = {
    mtf: '配对判断(MTF)',
    single: '单选题',
    multiple: '多选题',
    tf: '判断题',
    logic: '逻辑推理'
  };

  /* ======================= 科目 → 全局统计模块（唯一权威映射） =======================
   * 所有刷题入口（practice / exam / quiz / 每日亿题 / OCR）统一走这里，
   * 使 updateStats 的模块键（module_1..4，与考试/排行榜/Supabase 同构）
   * 与 bio 分六维、dashboard 模块卡、练习页筛选的科目归属完全一致。
   * 未收录科目返回 'general'，由统计读取端自然兼容。
   */
  var SUBJECT_MODULE_KEYS = {
    '生物化学': 'module_1', '分子生物学': 'module_1', '细胞生物学': 'module_1', '生物技术': 'module_1',
    '植物学': 'module_2', '植物生理学': 'module_2', '微生物学': 'module_2',
    '动物学': 'module_3', '动物生理学': 'module_3', '生态学': 'module_3', '动物行为学': 'module_3',
    '遗传学': 'module_4', '进化生物学': 'module_4', '演化生物学': 'module_4',
    '生物分类学': 'module_4', '生物信息学': 'module_4', '群体遗传学': 'module_4'
  };

  /**
   * 科目 → 全局统计模块键
   * @param {string|Object} subjectOrQuestion - 科目名，或带 subject 字段的题目对象
   * @returns {string} 'module_1'..'module_4'，未收录科目返回 'general'
   */
  function getStatModuleKey(subjectOrQuestion) {
    var s = (subjectOrQuestion && typeof subjectOrQuestion === 'object')
      ? subjectOrQuestion.subject
      : subjectOrQuestion;
    if (typeof s !== 'string' || !s) return 'general';
    return SUBJECT_MODULE_KEYS[s] || 'general';
  }

  /* ======================= 题型归一 ======================= */

  /**
   * 归一题型 —— 接受题目对象或原始 type 字符串，返回模型词表值。
   * 别名映射：single_choice→single、multi_choice→multiple、
   *           judgment/tf/true_false→judge、multi_judge→mtf；
   *           type 缺失/未知时按结构兜底：有 subQuestions 视为 mtf，否则 single。
   * @param {Object|string} q
   * @returns {'single'|'multiple'|'judge'|'mtf'}
   */
  function normalizeType(q) {
    var t = '';
    if (typeof q === 'string') {
      t = q;
    } else if (q && typeof q === 'object') {
      t = q.type ? String(q.type) : '';
    } else {
      return 'single';
    }
    t = t.toLowerCase().replace(/^\s+|\s+$/g, '');

    if (t === 'single' || t === 'single_choice') return 'single';
    if (t === 'multiple' || t === 'multi_choice') return 'multiple';
    if (t === 'judge' || t === 'judgment' || t === 'judgement' ||
        t === 'tf' || t === 'true_false') return 'judge';
    if (t === 'mtf' || t === 'multi_judge') return 'mtf';

    // 未知 / 缺失 type：有子题按 MTF，否则按单选
    if (q && typeof q === 'object' && Array.isArray(q.subQuestions) && q.subQuestions.length > 0) {
      return 'mtf';
    }
    return 'single';
  }

  function isSingle(q) { return normalizeType(q) === 'single'; }
  function isMultiple(q) { return normalizeType(q) === 'multiple'; }
  function isJudge(q) { return normalizeType(q) === 'judge'; }
  function isMtf(q) { return normalizeType(q) === 'mtf'; }

  /**
   * 标准单选题（题库对象格式：options 为 {A:'..'} 映射，answer 为字母 'C'）。
   */
  function isStandardChoice(q) {
    return !!(q && typeof q === 'object' &&
      q.options && typeof q.options === 'object' && !Array.isArray(q.options) && q.answer);
  }

  /**
   * 逻辑推理单选题（options 为数组、answer 为索引 0..4；MTF 化的逻辑题除外）。
   */
  function isLogicChoice(q) {
    return !!(q && typeof q === 'object' &&
      q.category === 'logic' && Array.isArray(q.options) && normalizeType(q) !== 'mtf');
  }

  /**
   * 单选类题（判卷时整题只有 1 个计分项）：
   * 标准单选 / 逻辑单选 / single、judge 且选项为数组的题。
   */
  function isChoiceQuestion(q) {
    if (!q || typeof q !== 'object') return false;
    if (isStandardChoice(q) || isLogicChoice(q)) return true;
    var t = normalizeType(q);
    if (t !== 'single' && t !== 'judge') return false;
    return Array.isArray(q.options) && !Array.isArray(q.subQuestions);
  }

  /* ======================= 子题展开 ======================= */

  /**
   * MTF 的「有效子题」—— 唯一权威实现：
   * - 已有 subQuestions（基础知识 MTF）原样返回；
   * - type 为 mtf 且是 options 数组时，把每个选项转成一条判断陈述：
   *   正确性优先取 mtfTruth（「最不合理的是」等负向提问显式给出每条真假），
   *   缺省时按原单选语义「原正确答案的选项 → 正确，其余 → 错误」；
   * - 其余题型返回 []（由单选类判卷处理）。
   *
   * 转换不写入题库本体：选项保持 A/B/C/D 原顺序，使解析中的字母引用
   * 与渲染一致（不参与页面的选项洗牌）。
   * @param {Object} q
   * @returns {Array<{label:string, text:string, answer:boolean}>}
   */
  function getEffectiveSubQuestions(q) {
    if (!q || typeof q !== 'object') return [];
    if (Array.isArray(q.subQuestions)) return q.subQuestions;
    if (normalizeType(q) === 'mtf' && Array.isArray(q.options)) {
      var truth = (Array.isArray(q.mtfTruth) && q.mtfTruth.length === q.options.length)
        ? q.mtfTruth
        : q.options.map(function (_, idx) { return idx === q.answer; });
      return q.options.map(function (text, idx) {
        return {
          label: 'ABCDEFGH'.charAt(idx),
          text: String(text),
          answer: !!truth[idx]
        };
      });
    }
    return [];
  }

  /* ======================= 通用作答判定 ======================= */

  /** 单选类题的用户作答值（页面存法不同：对象/数组取下标 0，标量原样） */
  function _choiceAnswer(userAnswers) {
    if (userAnswers === undefined || userAnswers === null) return userAnswers;
    if (Array.isArray(userAnswers)) return userAnswers[0];
    if (typeof userAnswers === 'object') return userAnswers[0];
    return userAnswers;
  }

  function _isAnsweredValue(v) {
    return v !== undefined && v !== null;
  }

  /** MTF 子题作答值必须是布尔（true/false）——与 quiz 页口径一致 */
  function _isSubAnswered(v) {
    return v === true || v === false;
  }

  /**
   * 是否已全部作答：
   * - 单选类：已选中一个选项；
   * - 多选类：至少勾选 1 项；
   * - MTF：至少 1 条子题且每条都已作答（无子题的脏数据按「未答完」处理）。
   * @param {Object} q
   * @param {Object|Array|number|string} userAnswers 该题的用户作答
   * @returns {boolean}
   */
  function isAllAnswered(q, userAnswers) {
    if (!q || typeof q !== 'object' || userAnswers === undefined || userAnswers === null) return false;
    var t = normalizeType(q);
    if (t === 'multiple') return Array.isArray(userAnswers) && userAnswers.length > 0;
    if (isChoiceQuestion(q)) return _isAnsweredValue(_choiceAnswer(userAnswers));
    var subs = getEffectiveSubQuestions(q);
    if (subs.length === 0) return false;
    return subs.every(function (sq, i) { return _isSubAnswered(userAnswers[i]); });
  }

  /**
   * 第 idx 条子题是否判对（未作答 / 子题不存在一律按错）。
   */
  function isSubCorrect(q, idx, userAnswers) {
    var subs = getEffectiveSubQuestions(q);
    var sub = subs[idx];
    if (!sub || !userAnswers) return false;
    var ua = userAnswers[idx];
    return _isSubAnswered(ua) && ua === sub.answer;
  }

  /* ======================= 判卷内核 ======================= */

  /** 统一判卷结果骨架 */
  function _empty(profile, type) {
    return {
      profile: profile,
      type: type,
      isChoice: false,   // 是否单选类（整题 1 个计分项）
      answered: false,   // 所有计分项是否已作答
      correct: 0,        // 判对的计分项数
      total: 0,          // 计分项总数
      score: 0,          // 本题得分（按 profile 计分）
      maxScore: 0,       // 本题满分
      verdict: 'none',   // 'full' | 'partial' | 'none'
      details: []        // {label, text?, userAnswer, correctAnswer, answered, isCorrect}
    };
  }

  function _choiceDetail(label, userAnswer, correctAnswer) {
    var answered = _isAnsweredValue(userAnswer);
    var ok = answered && userAnswer === correctAnswer;
    return {
      label: label,
      userAnswer: userAnswer,
      correctAnswer: correctAnswer,
      answered: answered,
      isCorrect: ok
    };
  }

  function _subDetails(subs, userAnswers) {
    var details = [];
    var correct = 0;
    var allAnswered = subs.length > 0;
    subs.forEach(function (sub, idx) {
      var ua = userAnswers ? userAnswers[idx] : undefined;
      var answered = _isSubAnswered(ua);
      var ok = answered && ua === sub.answer;
      if (ok) correct++;
      if (!answered) allAnswered = false;
      details.push({
        label: sub.label,
        text: sub.text,
        userAnswer: ua,
        correctAnswer: sub.answer,
        answered: answered,
        isCorrect: ok
      });
    });
    return { details: details, correct: correct, allAnswered: allAnswered };
  }

  /** 4 子题联赛阶梯；其余子题数按比例归一到 0.1（练习页 2.0 分制） */
  function practiceScore(total, correct) {
    if (total === 4) return LEAGUE_SCORE_TABLE[correct] || 0;
    if (correct === total) return PRACTICE_FULL_SCORE;
    if (correct > 0) {
      var s = Math.round((PRACTICE_FULL_SCORE * correct / total) * 10) / 10;
      return s > PRACTICE_FULL_SCORE ? PRACTICE_FULL_SCORE : s;
    }
    return 0;
  }

  /** MTF 子题判卷共用骨架：逐条判对 + answered 标记；分值由各 profile 叠加 */
  function _gradeSubs(subs, userAnswers, maxScore, fixedTotal, type) {
    var r = _empty('', type || 'mtf');
    var counted = _subDetails(subs, userAnswers);
    r.total = (typeof fixedTotal === 'number') ? fixedTotal : subs.length;
    r.correct = counted.correct;
    r.answered = counted.allAnswered;
    r.details = counted.details;
    r.maxScore = maxScore;
    if (r.total === 0) return r;
    // verdict 只表达对错程度；「未答满不得分」的口径由 quiz 档位单独收紧
    r.verdict = (r.correct === r.total) ? 'full' : (r.correct > 0 ? 'partial' : 'none');
    return r;
  }

  function _gradePractice(q, userAnswers) {
    var type = normalizeType(q);
    var r = _empty('practice', type);

    if (isChoiceQuestion(q)) {
      var ua = _choiceAnswer(userAnswers);
      var det = _choiceDetail('答案', ua, q.answer);
      r.isChoice = true;
      r.answered = det.answered;
      r.correct = det.isCorrect ? 1 : 0;
      r.total = 1;
      r.score = det.isCorrect ? PRACTICE_FULL_SCORE : 0;
      r.maxScore = PRACTICE_FULL_SCORE;
      r.verdict = det.isCorrect ? 'full' : 'none';
      r.details = [det];
      return r;
    }

    var subs = getEffectiveSubQuestions(q);
    if (subs.length === 0) {
      // 无子题的脏数据：维持题目级口径 total=1、0 分（records 消费方依赖）
      r.total = 1;
      r.maxScore = PRACTICE_FULL_SCORE;
      return r;
    }
    var g = _gradeSubs(subs, userAnswers, PRACTICE_FULL_SCORE);
    g.profile = 'practice';
    g.type = type;
    g.score = practiceScore(g.total, g.correct);
    return g;
  }

  function _gradeExam(q, userAnswers) {
    var type = normalizeType(q);
    var subs = getEffectiveSubQuestions(q);
    // 考试页固定 72 题 × 4 子题 × 2 分：不足 4 条的子题按判错计
    var g = _gradeSubs(subs.slice(0, 4), userAnswers, LEAGUE_SCORE_TABLE[4], 4);
    g.profile = 'exam';
    g.type = type;
    g.score = LEAGUE_SCORE_TABLE[g.correct] || 0;
    return g;
  }

  function _gradeQuiz(q, userAnswers) {
    var type = normalizeType(q);
    var r = _empty('quiz', type);

    if (type === 'single' || type === 'judge') {
      var det = _choiceDetail('答案', _choiceAnswer(userAnswers), q.answer);
      r.isChoice = true;
      r.answered = det.answered;
      r.correct = det.isCorrect ? 1 : 0;
      r.total = 1;
      r.maxScore = QUIZ_SCORES[type];
      r.score = det.isCorrect ? r.maxScore : 0;
      r.verdict = det.isCorrect ? 'full' : 'none';
      r.details = [det];
      return r;
    }

    if (type === 'multiple') {
      r.total = 1;
      r.maxScore = QUIZ_SCORES.multiple;
      var picked = Array.isArray(userAnswers) ? userAnswers : null;
      r.answered = !!(picked && picked.length > 0);
      if (r.answered) {
        var correctSet = new Set(Array.isArray(q.answer) ? q.answer : [q.answer]);
        var pickedSet = new Set(picked);
        var allCorrect = pickedSet.size === correctSet.size &&
          Array.from(pickedSet).every(function (v) { return correctSet.has(v); });
        var hasAnyCorrect = Array.from(pickedSet).some(function (v) { return correctSet.has(v); });
        var hasAnyWrong = Array.from(pickedSet).some(function (v) { return !correctSet.has(v); });
        if (allCorrect) r.verdict = 'full';
        else if (hasAnyCorrect && !hasAnyWrong) r.verdict = 'partial';
      }
      r.correct = r.verdict === 'full' ? 1 : 0;
      r.score = r.verdict === 'full' ? QUIZ_SCORES.multiple
        : (r.verdict === 'partial' ? QUIZ_SCORES.multiplePartial : 0);
      r.details = [{
        label: '答案',
        userAnswer: picked,
        correctAnswer: Array.isArray(q.answer) ? q.answer : [q.answer],
        answered: r.answered,
        isCorrect: r.verdict === 'full'
      }];
      return r;
    }

    // MTF：未全部作答按零分（半对需要全答满才成立）
    var subs = getEffectiveSubQuestions(q);
    var g = _gradeSubs(subs, userAnswers, QUIZ_SCORES.mtf);
    g.profile = 'quiz';
    g.type = type;
    if (subs.length === 0 || !g.answered) {
      g.verdict = 'none';
      g.score = 0;
    } else {
      g.score = g.verdict === 'full' ? QUIZ_SCORES.mtf
        : (g.verdict === 'partial' ? QUIZ_SCORES.mtfPartial : 0);
    }
    return g;
  }

  function _gradeDaily(q, userAnswers) {
    var type = normalizeType(q);
    var r = _empty('daily', type);

    if (isChoiceQuestion(q)) {
      var ua = _choiceAnswer(userAnswers);
      var det = _choiceDetail('答案', ua, q.answer);
      r.isChoice = true;
      r.answered = det.answered;
      r.correct = det.isCorrect ? 1 : 0;
      r.total = 1;
      r.score = r.correct;
      r.maxScore = 1;
      r.verdict = det.isCorrect ? 'full' : 'none';
      r.details = [det];
      return r;
    }

    var subs = getEffectiveSubQuestions(q);
    var g = _gradeSubs(subs, userAnswers, subs.length);
    g.profile = 'daily';
    g.type = type;
    g.score = g.correct;   // 每计分项 1 分
    return g;
  }

  /**
   * 统一判卷：给定题目与该题的用户作答，返回得分与逐项对错。
   * @param {Object} q 题目
   * @param {*} userAnswers 该题的用户作答（各页存法不同，函数内部归一）
   * @param {'practice'|'quiz'|'daily'|'exam'} [profile='practice']
   * @returns {{profile:string, type:string, isChoice:boolean, answered:boolean,
   *            correct:number, total:number, score:number, maxScore:number,
   *            verdict:string, details:Array}}
   */
  function gradeQuestion(q, userAnswers, profile) {
    profile = profile || 'practice';
    if (profile === 'quiz') return _gradeQuiz(q, userAnswers);
    if (profile === 'daily') return _gradeDaily(q, userAnswers);
    if (profile === 'exam') return _gradeExam(q, userAnswers);
    return _gradePractice(q, userAnswers);
  }

  /* ======================= 文案口径 ======================= */

  /** 题型标签（接受题目对象或 type 字符串） */
  function getTypeLabel(type) {
    return TYPE_LABELS[normalizeType(type)] || TYPE_LABELS.single;
  }

  /** 测验页分值（接受题目对象或 type 字符串） */
  function getQuizTypeScore(type) {
    var t = normalizeType(type);
    if (t === 'multiple') return QUIZ_SCORES.multiple;
    if (t === 'judge') return QUIZ_SCORES.judge;
    if (t === 'mtf') return QUIZ_SCORES.single; // MTF 与单选同分
    return QUIZ_SCORES.single;
  }

  /** 选项标记（判断题为「正确/错误」，其余 A/B/C/D/E） */
  function getOptionLabels(type) {
    if (normalizeType(type) === 'judge') return ['正确', '错误'];
    return ['A', 'B', 'C', 'D', 'E'];
  }

  /**
   * 学情诊断统计桶归一（历史记录词表：single / multiple / tf / mtf / logic）。
   * 缺失或未知的题型默认落 MTF 桶（与旧实现一致）。
   */
  function normalizeStatType(q) {
    var raw = '';
    if (typeof q === 'string') raw = q;
    else if (q && typeof q === 'object') raw = q.type || q.category || '';
    raw = raw ? String(raw).toLowerCase().replace(/^\s+|\s+$/g, '') : '';

    if (raw === 'logic') return 'logic';
    if (raw === 'single' || raw === 'single_choice') return 'single';
    if (raw === 'multiple' || raw === 'multi_choice') return 'multiple';
    if (raw === 'tf' || raw === 'true_false' || raw === 'judge' ||
        raw === 'judgment' || raw === 'judgement') return 'tf';
    return 'mtf';
  }

  /** 统计桶显示名 */
  function getStatTypeLabel(type) {
    return STAT_TYPE_LABELS[normalizeStatType(type)] || STAT_TYPE_LABELS.mtf;
  }

  /* ======================= 导出 ======================= */

  return {
    // 常量
    TYPE_LABELS: TYPE_LABELS,
    LEAGUE_SCORE_TABLE: LEAGUE_SCORE_TABLE,
    PRACTICE_FULL_SCORE: PRACTICE_FULL_SCORE,
    QUIZ_SCORES: QUIZ_SCORES,
    STAT_TYPE_LABELS: STAT_TYPE_LABELS,
    // 题型归一
    normalizeType: normalizeType,
    isSingle: isSingle,
    isMultiple: isMultiple,
    isJudge: isJudge,
    isMtf: isMtf,
    isStandardChoice: isStandardChoice,
    isLogicChoice: isLogicChoice,
    isChoiceQuestion: isChoiceQuestion,
    // 子题与作答
    getEffectiveSubQuestions: getEffectiveSubQuestions,
    isAllAnswered: isAllAnswered,
    isSubCorrect: isSubCorrect,
    // 判卷
    gradeQuestion: gradeQuestion,
    practiceScore: practiceScore,
    // 文案
    getTypeLabel: getTypeLabel,
    getQuizTypeScore: getQuizTypeScore,
    getOptionLabels: getOptionLabels,
    normalizeStatType: normalizeStatType,
    getStatTypeLabel: getStatTypeLabel,
    // 科目 → 全局统计模块（唯一权威映射）
    SUBJECT_MODULE_KEYS: SUBJECT_MODULE_KEYS,
    getStatModuleKey: getStatModuleKey
  };
})();

// 浏览器挂全局（practice / quiz / exam / daily-billion / admin / 诊断共用）
if (typeof window !== 'undefined') {
  window.QuestionModel = QuestionModel;
  // app.js loadModule 依赖解析用：脚本已在 HTML 预加载时立即就绪（不等 3s 兜底）
  window.initQuestionModel = function () { return QuestionModel; };
}
// Node（jest）直接单测
if (typeof module !== 'undefined' && module.exports) module.exports = QuestionModel;
