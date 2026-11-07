/**
 * @jest-environment jsdom
 *
 * Issue #15 回归测试：题库分发「同源（Cloudflare 边缘）优先 + jsDelivr 版本化 URL 兜底」
 * 站点部署在 Cloudflare Workers Assets，同源即最优通道，策略为：
 *   1. manifest 携带 git/repo 锚点 → 同源（Cloudflare 边缘）命中，不发 CDN 请求
 *   2. 同源不可达 → 自动回退 jsDelivr 版本化 URL（应用不挂）
 *   3. 同源分片陈旧（SHA-256 与 manifest 不符）→ jsDelivr 兜底拉取最新版
 *   4. 同源与 CDN 连续 3 次不可达 → 会话级禁用 CDN（后续不再尝试）
 *   5. manifest 无 git/repo（本地开发/fork 无锚点）→ 完全同源，不发 CDN 请求
 *   6. 非法 git/repo 字段（注入尝试）→ 拒绝启用 CDN
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const LOADER_SRC = fs.readFileSync(path.join(ROOT, 'js/core/loader.js'), 'utf8');

const SHA_EXPECTED = 'a'.repeat(64);
const SHARD_TEXT = JSON.stringify({
  'BQ-cell-aabbccddeeff0011': {
    question: '细胞膜的主要成分是什么？',
    subQuestions: [
      { label: 'A', text: '磷脂', answer: true },
      { label: 'B', text: '纤维素', answer: false }
    ],
    explanation: '细胞膜主要由磷脂双分子层构成。',
    difficulty: 'easy'
  }
});
const STALE_TEXT = JSON.stringify({ 'BQ-cell-old': { question: '旧版本', subQuestions: [] } });

function makeManifest(extra) {
  const base = {
    rev: 9,
    updated_at: '2026-08-17',
    sources: [{ tag: 'cell', count: 1 }],
    modules: { module1: ['cell'] },
    files: { 'bank/cell.json': SHA_EXPECTED }
  };
  return Object.assign(base, extra || {});
}

function textResponse(text) {
  return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) };
}
function notFound() {
  return { ok: false, status: 404, text: async () => '', json: async () => null };
}

let fetchCalls = [];
/**
 * 安装 fetch mock。mode:
 *   origin-fail  : 同源分片网络不可达，CDN 正常
 *   origin-stale : 同源分片 SHA 与 manifest 不符（陈旧），CDN 返回最新
 *   cdn-fail     : 仅 CDN 不可达（同源正常时不触发）
 *   all-fail     : 同源与 CDN 均不可达（验证 kill-switch）
 *   其余（cdn-ok）: 双通道正常
 */
function installFetch(manifest, mode) {
  fetchCalls = [];
  global.fetch = jest.fn(async (url) => {
    const u = String(url);
    fetchCalls.push(u);
    if (u.indexOf('data/manifest.json') === 0) return textResponse(JSON.stringify(manifest));
    if (u.indexOf('https://cdn.jsdelivr.net/gh/') === 0) {
      if (mode === 'cdn-fail' || mode === 'all-fail') throw new TypeError('network unreachable');
      return textResponse(u.indexOf('bioid-map') !== -1 ? '{}' : SHARD_TEXT);
    }
    if (/^data\/bank\/[\w-]+\.json$/.test(u)) {
      if (mode === 'origin-fail' || mode === 'all-fail') throw new TypeError('origin unreachable');
      if (mode === 'origin-stale') return textResponse(STALE_TEXT);
      return textResponse(SHARD_TEXT);
    }
    if (u === 'data/bioid-map.json') return textResponse('{}');
    return notFound();
  });
}

/**
 * 每个用例全新执行 loader.js（内部闭包状态/manifest 缓存随之重置，
 * window.* 导出会被覆盖；与浏览器「新会话首载」语义一致）。
 * 返回真实的 maintainQuestionBank 引用（loader 自触发的后台维护已替换为 stub）。
 */
function freshLoader() {
  // eslint-disable-next-line no-eval
  (0, eval)(LOADER_SRC);
  const realMaintain = window.maintainQuestionBank;
  window.maintainQuestionBank = function () { return Promise.resolve(null); };
  // 控制 SHA-256 计算（jsdom 无 crypto.subtle 时返回 null 会跳过校验）
  window.FSRSOptimizer = {
    sha256HexAsync: async (text) => (text === SHARD_TEXT ? SHA_EXPECTED : 'f'.repeat(64))
  };
  return realMaintain;
}

const CDN_PREFIX = 'https://cdn.jsdelivr.net/gh/';

describe('Issue #15：同源优先分发与 CDN 兜底', () => {
  test('manifest 带 git/repo 锚点 → 同源（Cloudflare 边缘）命中，不发 CDN 请求', async () => {
    freshLoader();
    installFetch(makeManifest({ git: '0f1e2d3c4b5a697887966554433221100fffeedd', repo: 'astrnox/BioQuest' }), 'cdn-ok');
    const items = await window.loadAllShards();
    expect(items.length).toBe(1);
    expect(items[0].question).toContain('细胞膜');
    // 同源优先：未发任何 CDN 请求
    const cdnBank = fetchCalls.filter((u) =>
      u.indexOf(CDN_PREFIX + 'astrnox/BioQuest@0f1e2d3c4b5a697887966554433221100fffeedd/data/bank/cell.json') === 0);
    expect(cdnBank.length).toBe(0);
    // 分片由同源拿到
    expect(fetchCalls).toContain('data/bank/cell.json');
  });

  test('同源不可达 → 自动回退 jsDelivr 版本化 URL，功能不挂', async () => {
    freshLoader();
    installFetch(makeManifest({ rev: 10, git: 'abc123def4567890abc123def4567890abcdef12', repo: 'astrnox/BioQuest' }), 'origin-fail');
    const items = await window.loadAllShards();
    // 最终内容来自 CDN（含"细胞膜"题）
    expect(items.length).toBe(1);
    expect(items[0].question).toContain('细胞膜');
    // 同源有尝试、失败后回退 CDN 版本化 URL
    expect(fetchCalls).toContain('data/bank/cell.json');
    const cdnBank = fetchCalls.filter((u) =>
      u.indexOf(CDN_PREFIX + 'astrnox/BioQuest@abc123def4567890abc123def4567890abcdef12/data/bank/cell.json') === 0);
    expect(cdnBank.length).toBe(1);
    expect(window.BioQuestCDN.isEnabled()).toBe(true); // 未达阈值仍启用
  });

  test('同源分片陈旧（SHA 不符）→ jsDelivr 兜底拉取最新版', async () => {
    freshLoader();
    installFetch(makeManifest({ rev: 11, git: '1111111111111111111111111111111111111111', repo: 'astrnox/BioQuest' }), 'origin-stale');
    const items = await window.loadAllShards();
    // 最终拿到的是 CDN 最新内容（含"细胞膜"题），而非同源陈旧内容
    expect(items.length).toBe(1);
    expect(items[0].question).toContain('细胞膜');
    // 同源被尝试过（返回陈旧内容触发兜底）
    expect(fetchCalls).toContain('data/bank/cell.json');
    expect(fetchCalls.some((u) => u.indexOf(CDN_PREFIX) === 0 && u.indexOf('/data/bank/cell.json') !== -1)).toBe(true);
  });

  test('manifest 无 git/repo 锚点 → 不发任何 CDN 请求（同源直连）', async () => {
    freshLoader();
    installFetch(makeManifest({ rev: 12 }), 'cdn-ok');
    const items = await window.loadAllShards();
    expect(items.length).toBe(1);
    expect(fetchCalls.filter((u) => u.indexOf(CDN_PREFIX) === 0).length).toBe(0);
    expect(fetchCalls).toContain('data/bank/cell.json');
  });

  test('非法 git/repo 字段（注入尝试）→ 拒绝启用 CDN', async () => {
    freshLoader();
    installFetch(makeManifest({ rev: 14, git: 'evil; rm -rf /', repo: '../../etc/passwd' }), 'cdn-ok');
    await window.loadAllShards();
    expect(fetchCalls.filter((u) => u.indexOf(CDN_PREFIX) === 0).length).toBe(0);
  });
});

describe('Issue #15：会话级 kill-switch', () => {
  test('同源与 CDN 连续 3 次不可达后，后续分片不再尝试 CDN', async () => {
    const realMaintain = freshLoader();
    const manifest = makeManifest({
      rev: 13, git: '2222222222222222222222222222222222222222', repo: 'astrnox/BioQuest'
    });
    // 4 个 bank 分片；后台维护按 tag 串行加载（真实串行路径，验证 kill-switch 时序）
    manifest.sources = [
      { tag: 'cell', count: 1 }, { tag: 'enzyme', count: 1 },
      { tag: 'virus', count: 1 }, { tag: 'mendel', count: 1 }
    ];
    manifest.files = {
      'bank/cell.json': SHA_EXPECTED, 'bank/enzyme.json': SHA_EXPECTED,
      'bank/virus.json': SHA_EXPECTED, 'bank/mendel.json': SHA_EXPECTED
    };
    // 同源与 CDN 均不可达：每个分片「同源失败 → CDN 失败」计数，第 3 次后禁用
    installFetch(manifest, 'all-fail');

    // 首访带宽保护：全新会话（localStorage 无标记）会跳过后台预热，
    // 因此本用例先置位标记模拟"回访用户"，验证预热阶段的 CDN kill-switch 时序。
    try { localStorage.setItem('tatabox_bank_warmed_once', '1'); } catch (e) {}

    const result = await realMaintain();
    expect(result).not.toBeNull();
    // 串行第 4 个分片不再尝试 CDN（连续 3 次失败后被禁用）
    const cdnCalls = fetchCalls.filter((u) => u.indexOf(CDN_PREFIX) === 0);
    expect(cdnCalls.length).toBe(3);
    // 每个分片均至少尝试过同源
    ['cell', 'enzyme', 'virus', 'mendel'].forEach((t) => {
      expect(fetchCalls).toContain('data/bank/' + t + '.json');
    });
  }, 15000);
});
