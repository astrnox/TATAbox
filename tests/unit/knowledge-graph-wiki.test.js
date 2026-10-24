/**
 * @jest-environment jsdom
 *
 * 知识图谱 v5.0：百科词条层 + 词云 + 节点面板（AI 讲解 / 读百科）
 * ---------------------------------------------------------------
 * 覆盖：
 *   - 默认视图不变（不自动加载/注入百科层，性能与旧版一致）
 *   - 「百科词条层」按需加载（wiki-seed 回退）→ 注入 wiki:: 节点 + 连边 → 关闭可还原
 *   - 图谱/词云视图切换；词云渲染（考点 3 / 词条标题 2 / 标签 1 权重、6 级字号 class）
 *   - 词云点击考点词 → 回图谱并以搜索词定位
 *   - 节点面板：考点节点含 AI 讲解；词条节点含 读百科/AI 讲解 且练习概念=分类
 *   - AI 讲解 → 写入 tutor 预填 + 跳 #/tutor
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const utilsSrc = read('js/core/utils.js');
const kgSrc = read('js/pages/knowledge-graph.js');

const GRAPH_FIXTURE = {
  version: 'test',
  nodes: [
    { id: 'cell_structure', label: '细胞结构', category: '细胞生物学', description: '细胞的基本结构', relatedModule: 'module1' },
    { id: 'dna_replication', label: 'DNA 复制', category: '分子生物学', description: '半保留复制', relatedModule: 'module1' }
  ],
  edges: [{ source: 'cell_structure', target: 'dna_replication' }]
};

const WIKI_FIXTURE = {
  entries: [
    { id: 'seed-a', title: '细胞膜', category: '细胞生物学', tags: ['细胞生物学', '流动镶嵌模型'], summary: '细胞膜概述', content: '', source: 'wikipedia', sourceUrl: '' },
    { id: 'seed-b', title: '线粒体', category: '细胞生物学', tags: ['细胞生物学', '能量代谢'], summary: '动力工厂', content: '', source: 'wikipedia', sourceUrl: '' },
    { id: 'seed-c', title: 'DNA', category: '分子生物学', tags: ['分子生物学', '双螺旋'], summary: '脱氧核糖核酸', content: '', source: 'wikipedia', sourceUrl: '' }
  ]
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('知识图谱 v5.0：百科词条层 / 词云 / 节点面板', () => {
  let window, document, container;

  const $ = (s) => document.querySelector(s);
  const $all = (s) => Array.from(document.querySelectorAll(s));
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  beforeAll(async () => {
    // jest-environment-jsdom 提供全局 window/document（与 admin-key-auth 同款注入方式）
    window = globalThis.window;
    document = window.document;
    document.body.innerHTML = '<div id="page-content"></div>';
    window.console = console;
    window.fetch = (url) => {
      const u = String(url);
      if (u.indexOf('knowledge-graph.json') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(GRAPH_FIXTURE) });
      }
      if (u.indexOf('wiki-seed.json') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(WIKI_FIXTURE) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) });
    };
    // 不提供 window.getSupabase → 走本地种子回退（离线路径）
    (0, eval)(utilsSrc);
    (0, eval)(kgSrc);
    container = document.getElementById('page-content');
    window.renderKnowledgeGraphPage(container);
    await sleep(200);
  });

  test('默认视图：只渲染考点节点，不自动注入百科层', () => {
    expect($all('.kg-node').length).toBe(2);
    expect($all('.kg-node-wiki').length).toBe(0);
    expect($all('.kg-view-btn').length).toBe(2);
    const wikiBtn = $('#kg-wiki-layer-btn');
    expect(wikiBtn).toBeTruthy();
    expect(wikiBtn.classList.contains('active')).toBe(false);
    expect($('#kg-wordcloud').hidden).toBe(true);
  });

  test('百科词条层：按需注入 wiki 节点与连边，关闭可还原', async () => {
    click($('#kg-wiki-layer-btn'));
    await sleep(150);
    expect($all('.kg-node-wiki').length).toBe(3);            // 种子回退 3 条（每类 ≤25）
    expect($all('.kg-node').length).toBe(5);                 // 考点2 + 词条3
    expect($all('.kg-edge').length).toBeGreaterThanOrEqual(3); // 原1 + 词条连边
    expect($('#kg-wiki-layer-btn').textContent).toContain('开');

    click($('#kg-wiki-layer-btn'));                          // 关闭
    await sleep(150);
    expect($all('.kg-node').length).toBe(2);
    expect($all('.kg-node-wiki').length).toBe(0);
    expect($('#kg-wiki-layer-btn').classList.contains('active')).toBe(false);
  });

  test('词云视图：渲染加权词条与分级字号，点考点词回图谱定位', async () => {
    const cloudBtn = $all('.kg-view-btn').find((b) => b.getAttribute('data-view') === 'cloud');
    click(cloudBtn);
    await sleep(150);
    expect($('#kg-graph-container').hidden).toBe(true);
    expect($('#kg-wordcloud').hidden).toBe(false);

    const words = $all('.kg-cw');
    expect(words.length).toBeGreaterThanOrEqual(6);          // 考点2 + 词条3 + 标签若干
    expect(words.some((w) => /kg-cw-[1-6]/.test(w.className))).toBe(true);
    expect(words.some((w) => w.textContent === '细胞结构')).toBe(true);   // 考点词（权重3）
    expect(words.some((w) => w.textContent === '线粒体')).toBe(true);     // 词条标题（权重2）

    const examWord = words.find((w) => w.textContent === 'DNA 复制');
    expect(examWord).toBeTruthy();
    click(examWord);
    await sleep(80);
    expect($('#kg-graph-container').hidden).toBe(false);
    expect($('#kg-wordcloud').hidden).toBe(true);
    expect($('#kg-search-input').value).toBe('DNA 复制');
    $('#kg-search-input').value = '';                        // 清理搜索，避免影响后续用例
    window.eval('void 0');
  });

  test('词条节点面板：读百科 / AI 讲解 / 练习概念=分类；AI 写预填并跳导师', async () => {
    click($('#kg-wiki-layer-btn'));                          // 重新开启百科层
    await sleep(150);
    const wikiNode = $all('.kg-node-wiki')
      .find((n) => { const t = n.querySelector('text'); return t && t.textContent === '细胞膜'; });
    expect(wikiNode).toBeTruthy();

    click(wikiNode.querySelector('circle'));
    await sleep(60);
    const panel = $('#kg-action-panel');
    expect(panel).toBeTruthy();
    const actions = Array.from(panel.querySelectorAll('.kg-action-btn')).map((b) => b.getAttribute('data-action'));
    expect(actions).toEqual(expect.arrayContaining(['practice', 'wiki', 'ai']));
    expect(actions).not.toContain('classroom-v4');           // 词条无 kgNodeId，不出课堂按钮

    const pr = JSON.parse(sessionStorage.getItem('bioquest_kg_practice') || '{}');
    expect(pr.concept).toBe('细胞生物学');                    // 题库无词条级 concept → 用分类

    click(panel.querySelector('[data-action="ai"]'));
    await sleep(30);
    const prefill = sessionStorage.getItem('bioquest_tutor_prefill');
    expect(prefill).toContain('细胞膜');
    expect(window.location.hash).toBe('#/tutor');
    sessionStorage.removeItem('bioquest_tutor_prefill');
  });

  test('考点节点面板：新增 AI 讲解，保留原四动作', async () => {
    const examNode = $all('.kg-node')
      .find((n) => !n.classList.contains('kg-node-wiki') && n.getAttribute('data-id') === 'cell_structure');
    expect(examNode).toBeTruthy();
    click(examNode.querySelector('circle'));
    await sleep(60);
    const panel = $('#kg-action-panel');
    expect(panel).toBeTruthy();
    const actions = Array.from(panel.querySelectorAll('.kg-action-btn')).map((b) => b.getAttribute('data-action'));
    expect(actions).toEqual(expect.arrayContaining(['practice', 'classroom-v4', 'classroom-v3', 'wrongbook', 'ai']));
    const pr = JSON.parse(sessionStorage.getItem('bioquest_kg_practice') || '{}');
    expect(pr.concept).toBe('细胞结构');                       // 考点节点：concept = 节点标签
    panel.remove();
  });
});
