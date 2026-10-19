/**
 * @jest-environment jsdom
 *
 * 管理员面板「本地题库 · 评分与回收站」全量加载回归测试
 * ---------------------------------------------------------------
 * 背景：管理页本地题库原先只读 quiz.json + logic_questions.json（约 141 道），
 * 数千道真题与每日联赛未进面板。扩到全量后有两个易复发的解析陷阱：
 *   1. 每日联赛分片是 { DL-xx: 题目 } 字典形态，取数时若提前 || [] 兜底，
 *      字典识别分支永远进不去 → 每日联赛读到 0 道；
 *   2. 字典的 id 在 key 上、值内没有 id/bioId，不从 key 回填则去重时
 *      400 道题塌缩成同一个空 id。
 * 本测试用真实数据文件 + fetch 桩直接跑加载器，锁死这两条。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const loadScript = (src) => { (0, eval)(src); }; // eslint-disable-line no-eval

beforeAll(() => {
  loadScript(read('js/core/utils.js'));
  loadScript(read('js/admin/admin.js'));
  loadScript(read('js/admin/admin-questions.js'));
});

afterEach(() => {
  delete global.fetch;
  try { sessionStorage.clear(); } catch (e) { /* ignore */ }
});

function stubFetch() {
  global.fetch = async (url) => {
    try {
      const text = read(String(url));
      return { ok: true, json: async () => JSON.parse(text) };
    } catch (e) {
      return { ok: false, json: async () => null };
    }
  };
}

describe('管理员面板本地题库全量加载', () => {
  test('加载 quiz + logic + 真题池 + 每日联赛：3414 道、去重无缺 id、每日联赛非 0', async () => {
    stubFetch();
    const bank = await _loadLocalQuestionBank(true);
    expect(bank.length).toBe(3414);

    const ids = bank.map((q) => q.id || q.bioId);
    expect(ids.filter((x) => !x).length).toBe(0);          // 无空 id（字典 key 回填生效）
    expect(new Set(ids).size).toBe(bank.length);           // 去重后不塌缩

    // 每日联赛（字典形态解析）确实进入
    expect(ids.some((x) => String(x).startsWith('DL-'))).toBe(true);
    // 联赛真题池与 quiz/逻辑题在列
    expect(ids).toContain('M3-57-e783fb7b032b');
    expect(bank.some((q) => q.bioId && q.subject)).toBe(true);
  });
});
