/**
 * TATABOX — 打印工具（js/core/print-utils.js）单元测试
 *
 * 覆盖打印功能规范：
 *   1. 文档构建：A4 版式（@page size:A4）、每页固定页脚 TATAbox.cc.cd、
 *      break-inside:avoid 防题目跨页截断；
 *   2. 题集打印（练习/组卷）：题干 + 选项完整、默认不带答案；
 *   3. 错题打印：题干、选项、你的答案、正确答案、解析五要素齐全，
 *      三种数据来源（review_cards / wrong_questions.extra_data / 本地 fullQuestion）均可归一化；
 *   4. 空列表防护：无记录时不打开打印窗口而是提示返回 false。
 *
 * 加载方式：node 环境（无 DOM），读源码 eval 到手工 window 假全局。
 */

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'core', 'print-utils.js'),
  'utf8'
);

let PU = null;

beforeAll(() => {
  global.window = { location: { href: 'https://cdn.local/index.html' } };
  (0, eval)(SRC);
  PU = global.window.__printUtils;
  expect(PU).toBeDefined();
});

afterAll(() => {
  delete global.window;
});

/** 构造一道标准单选题 */
function makeQuestion(overrides) {
  return Object.assign(
    {
      question: '下列关于 DNA 复制的叙述，正确的是？',
      options: ['半保留复制', '全保留复制', '随机分散复制', '不对称复制'],
      answer: 0,
      subject: '遗传学',
      concept: 'DNA复制'
    },
    overrides || {}
  );
}

describe('文档构建（A4 + 页脚 + 防截断）', () => {
  test('buildDoc 输出 A4 版式与固定页脚标记', () => {
    const html = PU.buildDoc({ title: '测试打印', metaText: '共 1 题', bodyHtml: '<div class="q">x</div>' });
    expect(html).toContain('@page { size: A4;');
    expect(html).toContain('TATAbox.cc.cd');
    expect(html).toContain('position: fixed');
    expect(html).toContain('break-inside: avoid');
    expect(html).toContain('测试打印');
    expect(html).toContain('共 1 题');
  });

  test('页脚标记常量与需求文案完全一致', () => {
    expect(PU.FOOTER_MARK).toBe('TATAbox.cc.cd');
    const html = PU.buildDoc({ bodyHtml: '' });
    const marks = html.match(/TATAbox\.cc\.cd/g) || [];
    expect(marks.length).toBe(1);
  });

  test('标题经 HTML 转义，防注入', () => {
    const html = PU.buildDoc({ title: '<script>x</script>', bodyHtml: '' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('题集打印（练习 / 组卷）', () => {
  test('题目内容与全部选项完整输出，且不含答案', () => {
    const q = makeQuestion();
    const html = PU.questionBlock(q, 1, {});
    expect(html).toContain('下列关于 DNA 复制的叙述');
    expect(html).toContain('<b>A.</b> 半保留复制');
    expect(html).toContain('<b>B.</b> 全保留复制');
    expect(html).toContain('<b>C.</b> 随机分散复制');
    expect(html).toContain('<b>D.</b> 不对称复制');
    // 练习/组卷打印默认不输出答案与解析
    expect(html).not.toContain('正确答案');
    expect(html).not.toContain('解析');
    expect(html).toContain('第 1 题');
  });

  test('对象型 options（逻辑题）按键排序渲染', () => {
    const html = PU.questionBlock(
      { question: '逻辑题干', options: { Y: '结论甲', X: '结论乙' } },
      2,
      {}
    );
    expect(html).toContain('<b>X.</b> 结论乙');
    expect(html).toContain('<b>Y.</b> 结论甲');
  });

  test('对象型 options 的值为对象时取 text/content，不出现 [object Object]', () => {
    const rows = PU.optionRows({
      options: { A: { text: '甲文本' }, B: { content: '乙内容' } }
    });
    expect(rows.map((r) => r.text)).toEqual(['甲文本', '乙内容']);
    const html = PU.questionBlock({ question: 'q', options: { A: { text: '甲文本' } } }, 1, {});
    expect(html).not.toContain('[object Object]');
    expect(html).toContain('甲文本');
  });

  test('选项超过 26 项时标签降级为 AA/AB，不再出现 [ 等符号', () => {
    const opts = Array.from({ length: 27 }, (_, i) => '选项' + (i + 1));
    const rows = PU.optionRows({ options: opts });
    expect(rows[25].label).toBe('Z');
    expect(rows[26].label).toBe('AA');
    expect(rows[26].label).not.toBe('[');
  });

  test('printQuestionSet 空列表不打开打印并返回 false', () => {
    expect(PU.printQuestionSet([], {})).toBe(false);
    expect(PU.printQuestionSet(null, {})).toBe(false);
  });

  test('printQuestionSet 有题目时调起打印窗口', () => {
    jest.useFakeTimers();
    let written = '';
    global.window.open = () => ({
      document: {
        open() {},
        write(h) { written = h; },
        close() {},
        images: []
      },
      focus() {},
      print() {}
    });
    const ok = PU.printQuestionSet([makeQuestion()], { title: '练习题打印' });
    jest.runAllTimers();   // 消化图片就绪轮询定时器，避免测试句柄泄漏
    jest.useRealTimers();
    expect(ok).toBe(true);
    expect(written).toContain('TATAbox.cc.cd');
    expect(written).toContain('半保留复制');
    delete global.window.open;
  });
});

describe('错题归一化与打印', () => {
  test('来源①：review_cards 形状（user_answer/correct_answer/analysis）', () => {
    const n = PU.normalizeWrongRecord({
      id: 'r1',
      question_text: '错题题干',
      user_answer: 'B',
      correct_answer: 'A',
      analysis: '解析文本',
      concept: '概念X',
      error_reason: '概念理解错误',
      textbook_chapter: '必修一'
    });
    expect(n.question).toBe('错题题干');
    expect(n.userAnswer).toBe('B');
    expect(n.correctAnswer).toBe('A');
    expect(n.analysis).toBe('解析文本');
    expect(n.errorReason).toBe('概念理解错误');
    expect(n.chapter).toBe('必修一');
  });

  test('来源②：wrong_questions.extra_data（JSON 串含 options/answer/explanation）', () => {
    const n = PU.normalizeWrongRecord({
      question_text: '带选项的错题',
      extra_data: JSON.stringify({
        options: ['甲', '乙', '丙', '丁'],
        answer: 2,
        explanation: '选丙的理由'
      })
    });
    expect(n.rows.map(r => r.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(n.rows[2].text).toBe('丙');
    expect(n.correctAnswer).toBe('C');       // 下标 → 字母
    expect(n.analysis).toBe('选丙的理由');
  });

  test('来源③：本地 fullQuestion（含 options/answer/explanation）', () => {
    const n = PU.normalizeWrongRecord({
      questionText: '本地错题',
      fullQuestion: {
        question: '本地错题',
        options: ['x', 'y'],
        answer: 1,
        explanation: '本地解析'
      }
    });
    expect(n.question).toBe('本地错题');
    expect(n.correctAnswer).toBe('B');
    expect(n.analysis).toBe('本地解析');
  });

  test('来源①：review_cards.options 为 JSON 字符串时仍可渲染选项（v17 兼容）', () => {
    const n = PU.normalizeWrongRecord({
      question_id: 'q-json',
      question_text: 'JSON 选项题',
      options: JSON.stringify(['甲', '乙', '丙']),
      correct_answer: 'B'
    });
    expect(n.rows.map((r) => r.label)).toEqual(['A', 'B', 'C']);
    expect(n.rows[1].text).toBe('乙');
  });

  test('非法 timestamp 不抛异常，日期降级为空串', () => {
    expect(() => PU.normalizeWrongRecord({ question_text: 'x', timestamp: 'not-a-date' })).not.toThrow();
    const n = PU.normalizeWrongRecord({ question_text: 'x', timestamp: 'not-a-date' });
    expect(n.date).toBe('');
  });

  test('多选答案数组 → 字母组合', () => {
    expect(PU.lettersOf([0, 2], null)).toBe('A、C');
    expect(PU.lettersOf(true, null)).toBe('正确');
    expect(PU.lettersOf('D', null)).toBe('D');
  });

  test('错题打印输出五要素（题干/选项/你的答案/正确答案/解析）', () => {
    jest.useFakeTimers();
    let written = '';
    global.window.open = () => ({
      document: {
        open() {},
        write(h) { written = h; },
        close() {},
        images: []
      },
      focus() {},
      print() {}
    });
    const ok = PU.printWrongRecords(
      [{
        question_text: '错题干',
        user_answer: 'B',
        correct_answer: 'A',
        analysis: '这是解析',
        extra_data: JSON.stringify({ options: ['选项一', '选项二', '选项三', '选项四'] })
      }],
      { title: '错题打印' }
    );
    jest.runAllTimers();
    jest.useRealTimers();
    expect(ok).toBe(true);
    expect(written).toContain('错题干');
    expect(written).toContain('<b>A.</b> 选项一');
    expect(written).toContain('你的答案');
    expect(written).toContain('正确答案');
    expect(written).toContain('这是解析');
    expect(written).toContain('TATAbox.cc.cd');
    delete global.window.open;
  });

  test('空记录列表返回 false（不打开窗口）', () => {
    expect(PU.printWrongRecords([], {})).toBe(false);
    expect(PU.printWrongRecords(undefined, {})).toBe(false);
  });
});

describe('分模式打印（题目 / 答案解析分开出纸）', () => {
  let written = '';

  beforeEach(() => {
    jest.useFakeTimers();
    written = '';
    global.window.open = () => ({
      document: {
        open() {},
        write(h) { written = h; },
        close() {},
        images: []
      },
      focus() {},
      print() {}
    });
  });

  afterEach(() => {
    jest.runAllTimers();      // 消化图片就绪轮询，避免句柄泄漏
    jest.useRealTimers();
    delete global.window.open;
  });

  const WRONG = () => ([{
    question_text: '错题干：下列叙述正确的是',
    user_answer: 'B',
    correct_answer: 'A',
    analysis: '错题解析文本',
    extra_data: JSON.stringify({ options: ['甲选项', '乙选项', '丙选项', '丁选项'] })
  }]);

  test('printQuestionSet mode=questions：仅题目与选项，不含答案解析', () => {
    const ok = PU.printQuestionSet([makeQuestion()], { mode: 'questions', title: '题目打印' });
    expect(ok).toBe(true);
    expect(written).toContain('下列关于 DNA 复制的叙述');
    expect(written).toContain('<b>A.</b> 半保留复制');
    expect(written).not.toContain('正确答案');
    expect(written).not.toContain('解析：');
    expect(written).toContain('TATAbox.cc.cd');
  });

  test('printQuestionSet mode=answers：仅正确答案与解析，不含题干选项', () => {
    const ok = PU.printQuestionSet([makeQuestion()], { mode: 'answers', title: '答案打印' });
    expect(ok).toBe(true);
    expect(written).toContain('第 1 题');
    expect(written).toContain('正确答案');
    expect(written).toContain('A');                 // 下标 0 → 字母 A
    expect(written).not.toContain('下列关于 DNA 复制的叙述');
    expect(written).not.toContain('半保留复制');
    expect(written).toContain('TATAbox.cc.cd');
  });

  test('printQuestionSet mode=answers：MTF 子题逐条输出正确答案', () => {
    PU.printQuestionSet([{
      question: 'MTF 组题',
      type: 'mtf',
      subQuestions: [
        { label: 'A', text: '陈述一', answer: true },
        { label: 'B', text: '陈述二', is_true: false }
      ]
    }], { mode: 'answers' });
    expect(written).toContain('A. 正确');
    expect(written).toContain('B. 错误');
    expect(written).not.toContain('陈述一');
  });

  test('printWrongRecords mode=questions 仅题干与选项', () => {
    const ok = PU.printWrongRecords(WRONG(), { mode: 'questions' });
    expect(ok).toBe(true);
    expect(written).toContain('错题干：下列叙述正确的是');
    expect(written).toContain('<b>A.</b> 甲选项');
    expect(written).not.toContain('你的答案');
    expect(written).not.toContain('正确答案');
    expect(written).not.toContain('错题解析文本');
  });

  test('printWrongRecords mode=answers 仅答案与解析（含你的答案/错误原因）', () => {
    const rec = WRONG()[0];
    rec.error_reason = '概念混淆';
    rec.textbook_chapter = '必修一 第三章';
    PU.printWrongRecords([rec], { mode: 'answers' });
    expect(written).toContain('第 1 题');
    expect(written).toContain('你的答案');
    expect(written).toContain('正确答案');
    expect(written).toContain('错题解析文本');
    expect(written).toContain('错误原因：概念混淆');
    expect(written).toContain('章节：必修一 第三章');
    expect(written).not.toContain('错题干：下列叙述正确的是');
    expect(written).not.toContain('甲选项');
  });

  test('未传 mode 时保持原行为（题集=仅题目，错题=五要素）', () => {
    PU.printQuestionSet([makeQuestion()], { title: '默认题集' });
    expect(written).not.toContain('正确答案');

    written = '';
    PU.printWrongRecords(WRONG(), { title: '默认错题' });
    expect(written).toContain('错题干：下列叙述正确的是');
    expect(written).toContain('你的答案');
    expect(written).toContain('正确答案');
    expect(written).toContain('错题解析文本');
  });

  test('非法 mode 取值回退默认（不报错）', () => {
    PU.printQuestionSet([makeQuestion()], { mode: 'bogus' });
    expect(written).not.toContain('正确答案');

    written = '';
    PU.printWrongRecords(WRONG(), { mode: 'bogus' });
    expect(written).toContain('你的答案');
  });

  test('answerBlock：有你的答案/正确答案/解析时全部输出，且不带题干选项', () => {
    const html = PU.answerBlock(
      { userAnswer: 'B', correctAnswer: 'A', analysis: '解析内容' },
      7
    );
    expect(html).toContain('第 7 题');
    expect(html).toContain('你的答案');
    expect(html).toContain('正确答案');
    expect(html).toContain('解析内容');
    expect(html).not.toContain('q-text');
    expect(html).not.toContain('q-opts');
  });
});

describe('图片绝对化（独立打印窗口相对路径失效防护）', () => {
  test('相对 src 转绝对 URL，绝对地址保持不变', () => {
    const out = PU.absSrcs('<img src="img/a.png"><img src="https://x/y.png">');
    expect(out).toContain('src="https://cdn.local/img/a.png"');
    expect(out).toContain('src="https://x/y.png"');
  });

  test('srcset 候选逐个绝对化并保留描述符', () => {
    const out = PU.absSrcs('<img srcset="img/a.png 1x, img/a@2x.png 2x">');
    expect(out).toContain('srcset="https://cdn.local/img/a.png 1x, https://cdn.local/img/a@2x.png 2x"');
  });
});
