/**
 * @jest-environment jsdom
 *
 * 管理面板「反馈管理 → 题目反馈」（js/admin/admin-ops.js）
 * ---------------------------------------------------------------
 * 用户报障：练习页提交的题目反馈在管理员界面看不到。
 * 修复：反馈管理页签顶部新增「题目反馈」区，合并
 *   - 云端 question_feedbacks（admin.js /admin/question-feedbacks，
 *     跨用户读取需 sql/migration_v13_question_feedbacks_admin.sql）
 *   - 本机 localStorage bioquest_question_feedbacks（同浏览器提交必然可见）
 * 并支持「标为已处理」状态（localStorage 持久）。
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
  loadScript(read('js/admin/admin-ops.js'));
});

afterEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(opts) {
  window.getQuestionFeedbacks = jest.fn(async () =>
    opts.cloud !== undefined ? opts.cloud : { items: [{ id: 'cf-1', question_id: 'M1-15-aaaa', question_text: '云端题干：尿素循环发生在？', issue_type: 'wrong_answer', description: '选项B和C都对', created_at: '2026-10-19T08:00:00+08:00' }] });
  window.getFeedbacks = jest.fn(async () => ({ feedbacks: [] }));
  if (opts.local) localStorage.setItem('bioquest_question_feedbacks', JSON.stringify(opts.local));
  const container = document.createElement('div');
  document.body.appendChild(container);
  await renderFeedbacksTab(container);
  await flush();
  return container;
}

describe('管理面板 · 题目反馈', () => {
  test('云端 + 本机合并显示，去重，未处理状态可见', async () => {
    const container = await render({
      local: [
        { id: 'qf_local1', questionId: 'M3-57-bbbb', questionText: '本机题干：枪乌贼动作电位', issueType: 'typo', description: '题干有错别字', createdAt: '2026-10-18T10:00:00.000Z' },
        // 与云端同内容（同题/同类型/同日/同描述前缀）→ 应被去重
        { id: 'qf_dup', questionId: 'M1-15-aaaa', questionText: '云端题干：尿素循环发生在？', issueType: 'wrong_answer', description: '选项B和C都对', createdAt: '2026-10-19T08:00:00+08:00' }
      ]
    });
    const html = container.innerHTML;
    expect(html).toContain('题目反馈');
    expect(html).toContain('云端题干：尿素循环发生在？');
    expect(html).toContain('本机题干：枪乌贼动作电位');
    expect(html).toContain('答案有误');
    expect(html).toContain('错别字');
    expect(html).toContain('未处理');
    expect(html).toContain('qf-toggle-btn');
    // 去重：同一内容只出现一次（合并计数 2 条）
    expect(container.querySelectorAll('.qf-toggle-btn')).toHaveLength(2);
    container.remove();
  });

  test('标为已处理 → localStorage 持久 + 重渲染显示已处理', async () => {
    const container = await render({});
    const btn = container.querySelector('.qf-toggle-btn');
    expect(btn).toBeTruthy();
    btn.click();
    await flush();
    const saved = JSON.parse(localStorage.getItem('bioquest_question_feedbacks_resolved') || '[]');
    expect(saved.map(String)).toContain('cf-1');
    const html = container.innerHTML;
    expect(html).toContain('已处理');
    expect(html).toContain('重新打开');
    container.remove();
  });

  test('云端受限（RLS 未开放）时提示执行 migration_v13，本机反馈仍显示', async () => {
    const container = await render({
      cloud: { items: [], _restricted: true },
      local: [{ id: 'qf_only_local', questionId: 'M2-05-cccc', questionText: '向光性', issueType: 'unclear', description: '图看不清', createdAt: '2026-10-17T09:00:00.000Z' }]
    });
    const html = container.innerHTML;
    expect(html).toContain('migration_v13_question_feedbacks_admin.sql');
    expect(html).toContain('向光性');
    expect(html).toContain('题意不清');
    container.remove();
  });
});
