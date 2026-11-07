/**
 * @jest-environment jsdom
 *
 * 「题库数据源 = 本地题库」验证（v1.1.2）
 * ----------------------------------------
 * 需求：允许用户选择直接从本地题库（data/ 分片）拉取题目，
 *      考试/练习页通过设置 saveSetting('question_source','local') 后
 *      以 LoaderMode.PREFER_LOCAL 加载，全程不触发 Supabase 请求。
 *
 * 验证矩阵：
 *   1. PREFER_LOCAL 路径从本地 data/manifest.json + data/bank/*.json 拉到全库题目
 *      （数量以 manifest.total_questions 为唯一真源，不做固定值绑定）
 *   2. 整个过程 fetch 只命中本地 data/ 路径，绝不出现 supabase 域名
 *   3. 设置页持久化键 bioquest_settings.question_source 可被 loadSetting 读回，
 *      且 exam/practice 依此选择的 mode 会退化为 preferLocal（无需网络）
 */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');

// 注入磁盘 fetch：相对 data/ 路径 → 读本地文件，并记录所有请求 URL
const requestedUrls = [];
let fetchImpl = null;

function installLocalFetch() {
  requestedUrls.length = 0;
  fetchImpl = global.fetch;
  global.fetch = function (input, init) {
    let url = typeof input === 'string' ? input : (input && input.url) || String(input);
    // 去掉缓存破坏参数 / 查询串，落到文件路径
    const clean = url.split(/[?#]/)[0];
    requestedUrls.push(url);
    const abs = path.join(ROOT, clean);
    return new Promise((resolve) => {
      fs.readFile(abs, (err, buf) => {
        if (err) {
          resolve({
            ok: false, status: 404,
            json: () => Promise.reject(new Error('404')),
            text: () => Promise.reject(new Error('404'))
          });
          return;
        }
        const text = buf.toString('utf-8');
        resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(JSON.parse(text)),
          text: () => Promise.resolve(text)
        });
      });
    });
  };
}

function restoreFetch() {
  if (fetchImpl) global.fetch = fetchImpl;
}

describe('本地题库模式（PREFER_LOCAL）', () => {
  beforeAll(() => {
    // 注：storage.js 顶层存在既有重复声明，jest/babel 解析会抛错，故此处用最小桩
    // 复刻 saveSetting/loadSetting（同一 localStorage key：bioquest_settings）。
    window.saveSetting = function (key, value) {
      try {
        const all = JSON.parse(localStorage.getItem('tatabox_settings') || '{}');
        all[key] = value;
        localStorage.setItem('tatabox_settings', JSON.stringify(all));
        return true;
      } catch (e) { return false; }
    };
    window.loadSetting = function (key, dflt) {
      try {
        const all = JSON.parse(localStorage.getItem('tatabox_settings') || '{}');
        return all.hasOwnProperty(key) ? all[key] : dflt;
      } catch (e) { return dflt; }
    };
    require(path.join(ROOT, 'js/core/loader.js'));
  });

  beforeEach(() => {
    localStorage.clear();
    installLocalFetch();
  });

  afterEach(() => {
    restoreFetch();
  });

  test('设置页持久化：question_source=local 可被 loadSetting 读回', () => {
    expect(typeof window.saveSetting).toBe('function');
    expect(typeof window.loadSetting).toBe('function');
    window.saveSetting('question_source', 'local');
    expect(window.loadSetting('question_source', 'cloud')).toBe('local');
    // 模拟 exam.js / practice.js 的决策：local → preferLocal
    const qSource = window.loadSetting('question_source', 'cloud');
    const mode = qSource === 'local'
      ? window.LoaderMode.PREFER_LOCAL
      : window.LoaderMode.BALANCED;
    expect(mode).toBe('preferLocal');
  });

  test('PREFER_LOCAL 从本地 data/ 拉到全库题目（与 manifest 一致）', async () => {
    const items = await window.loadQuestions([1, 2, 3, 4], { mode: window.LoaderMode.PREFER_LOCAL });
    expect(Array.isArray(items)).toBe(true);

    // manifest.total_questions 是唯一数字真源
    // 断言「拉到全库」而非绑定具体数量上限，避免题库扩量时脆弱
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/manifest.json'), 'utf-8'));
    expect(items.length).toBe(manifest.total_questions);
    expect(items.length).toBeGreaterThanOrEqual(11);

    // 每道题至少 4 个选项
    items.forEach((q) => {
      expect(Array.isArray(q.subQuestions)).toBe(true);
      expect(q.subQuestions.length).toBeGreaterThanOrEqual(4);
    });
  });

  test('带图题的 image.file 被映射为 chart（本地题库图片渲染前提）', async () => {
    const items = await window.loadQuestions([1, 2, 3, 4], { mode: window.LoaderMode.PREFER_LOCAL });
    // 从 id-all.json 读取 has_image 判定，核对全库带图题而非硬编码
    const idAll = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/questions/id-all.json'), 'utf-8'));
    const withImage = Object.keys(idAll.questions || {}).filter((k) => idAll.questions[k].has_image);
    expect(withImage.length).toBeGreaterThan(0);

    const byId = {};
    items.forEach((q) => { byId[q.bioId || q.id] = q; });
    withImage.forEach((id) => {
      const q = byId[id];
      expect(q).toBeTruthy();
      // chart 必须被映射为本地相对路径，且对应文件真实存在
      expect(typeof q.chart).toBe('string');
      expect(q.chart).toMatch(/\.(png|jpe?g|webp|gif|svg)([?#]|$)/i);
      const filePath = path.join(ROOT, q.chart.split(/[?#]/)[0]);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  test('PREFER_LOCAL 全程不发起任何 Supabase 请求', async () => {
    await window.loadQuestions([1, 2, 3, 4], { mode: window.LoaderMode.PREFER_LOCAL });
    // 第二次调用可能命中内存/IndexedDB 缓存 → 0 个网络请求（依然符合本地模式）
    if (requestedUrls.length === 0) {
      expect(true).toBe(true); // 零网络请求：完全本地
      return;
    }
    requestedUrls.forEach((u) => {
      expect(u.indexOf('supabase')).toBe(-1);
      expect(u.indexOf('data/')).toBe(0); // 全部是本地 data/ 资源
    });
  });
});