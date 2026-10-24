/**
 * @jest-environment jsdom
 *
 * 知识图谱 v5.0 回归：百科层「25/类 → 60/类」补量
 * ---------------------------------------------------------------
 * 场景：先开启百科层（未选分类，每类 25 条），再勾选某分类，
 *       期望该分类继续补足到 60 条，而不是被「已注入」标记挡住。
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
    { id: 'cell_structure', label: '细胞结构', category: '细胞生物学', description: '细胞的基本结构', relatedModule: 'module1' }
  ],
  edges: []
};

// 细胞生物学 30 条（> 未选分类时的 25 上限）+ 分子生物学 1 条
const WIKI_ENTRIES = [];
for (let i = 1; i <= 30; i++) {
  WIKI_ENTRIES.push({
    id: 'cell-' + i, title: '细胞词条' + i, category: '细胞生物学',
    tags: ['细胞生物学'], summary: '', content: ''
  });
}
WIKI_ENTRIES.push({
  id: 'mol-1', title: '分子词条', category: '分子生物学',
  tags: ['分子生物学'], summary: '', content: ''
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('知识图谱百科层：勾选分类后补量到 60/类', () => {
  let window, document;

  const $all = (s) => Array.from(document.querySelectorAll(s));
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  beforeAll(async () => {
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
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ entries: WIKI_ENTRIES }) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) });
    };
    (0, eval)(utilsSrc);
    (0, eval)(kgSrc);
    window.renderKnowledgeGraphPage(document.getElementById('page-content'));
    await sleep(200);
  });

  test('未选分类时每类最多 25 条', async () => {
    click(document.getElementById('kg-wiki-layer-btn'));
    await sleep(150);
    expect($all('.kg-node-wiki').length).toBe(26);   // 25 细胞 + 1 分子
  });

  test('勾选分类后该分类补足到 60/类（此处数据共 30 条）', async () => {
    const btn = $all('.kg-filter-btn[data-category]')
      .find((b) => b.getAttribute('data-category') === '细胞生物学');
    expect(btn).toBeTruthy();
    click(btn);
    await sleep(200);
    expect($all('.kg-node-wiki').length).toBe(31);   // 30 细胞 + 1 分子
  });
});
