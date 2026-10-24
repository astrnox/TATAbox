#!/usr/bin/env node
/**
 * TATABOX — manifest CDN 锚点一致性校验（PR #25 修复配套）
 * ============================================================
 * 背景：generate-bio-shards.js 会把「生成环境的 origin slug + HEAD SHA」写入
 * data/manifest.json 的 { git, repo }，前端据此构造 jsDelivr 版本化 URL：
 *   https://cdn.jsdelivr.net/gh/<repo>@<git>/data/...
 * 若贡献者在自己的 fork 中生成 manifest 并提交（如 PR #25 曾写入
 * repo=qian163/TATABOX），合并部署后全部题库重资源会指向第三方 fork：
 * 应用靠「SHA 不符→降级同源」「404→回退」自愈不会立刻挂，
 * 但版本化 CDN 分发对官方部署实际失效，并隐式依赖第三方 fork 常驻。
 *
 * CI 的「分片确定性比对」明确排除了 manifest.json（日期元数据），
 * 抓不到这类错误 —— 本脚本补上这道门禁。
 *
 * 校验规则：
 *   1. repo / git 字段存在且格式合法（slug / 7-40 位十六进制 commit）；
 *   2. repo 必须等于当前仓库 origin 的 slug（fork 生成的锚点直接 FAIL）；
 *   3. git 必须是「本仓库」的 commit：
 *      a) 等于当前 HEAD（部署前生成）→ PASS；
 *      b) 本地对象库存在（cat-file）→ PASS（合并后重跑生成器的常态：
 *         锚点指向修正 commit 的父提交）；
 *      c) 否则尝试 git fetch --depth=1 origin <sha> 单拉该 commit：
 *         上游存在（曾 push 过）→ PASS；不存在 → FAIL（fork/幻觉 SHA）。
 *
 * 运行：node scripts/verify-manifest-anchor.js   （已挂 CI 与 npm test）
 * 逃生口（本地 fork 开发且不打算提交题库变更）：先 git checkout -- data/manifest.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'data', 'manifest.json');

const REPO_SLUG_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COMMIT_SHA_RE = /^[0-9a-f]{7,40}$/i;

function fail(msg) {
  console.error('[FATAL] ' + msg);
  process.exit(1);
}

/** 执行 git 命令；返回 stdout 字符串，失败返回 null（cmd 失败不视为脚本崩溃）。 */
function git(args, opts) {
  try {
    return execSync('git ' + args, Object.assign({
      cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000
    }, opts)).toString().trim();
  } catch (e) {
    return null;
  }
}

/** 从 origin remote URL 解析 owner/repo slug；解析不出返回 null。 */
function originSlug() {
  const url = git('remote get-url origin');
  if (!url) return null;
  const m = url.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\s*$/i);
  if (!m) return null;
  const slug = (m[1] + '/' + m[2]).replace(/\.git$/, '');
  return REPO_SLUG_RE.test(slug) ? slug : null;
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) fail('data/manifest.json 不存在，请先运行 node scripts/generate-bio-shards.js');

  let mf;
  try {
    mf = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    fail('data/manifest.json JSON 解析失败: ' + e.message);
  }

  const repo = mf.repo;
  const gitSha = mf.git;
  if (!repo || !REPO_SLUG_RE.test(repo)) {
    fail('manifest.repo 缺失或格式非法（期望 owner/repo，实际: ' + JSON.stringify(repo) + '）');
  }
  if (!gitSha || !COMMIT_SHA_RE.test(gitSha)) {
    fail('manifest.git 缺失或格式非法（期望 7-40 位十六进制 commit，实际: ' + JSON.stringify(gitSha) + '）');
  }

  const slug = originSlug();
  if (slug === null) {
    console.warn('[warn] 无法解析 origin remote，跳过 repo 归属比对（CI 环境不应出现）');
  } else if (repo !== slug) {
    fail(
      'manifest.repo=' + repo + ' 与本仓库 origin=' + slug + ' 不一致！\n' +
      '  该锚点通常是在贡献者 fork 中运行生成器产生的：合并部署后 jsDelivr 会把\n' +
      '  题库重资源（bank/index/bioid-map）指向第三方 fork，版本化分发失效。\n' +
      '  修复：在上游 main 上运行 node scripts/generate-bio-shards.js 并提交；\n' +
      '  或在 fork 中生成时显式指定 --repo=' + slug + ' --git=<上游存在的 commit>'
    );
  }

  const head = git('rev-parse HEAD');
  if (!head) fail('无法读取当前 HEAD（git rev-parse 失败），锚点归属无法校验');

  if (gitSha === head) {
    console.log('[ok] 锚点 git == HEAD（' + gitSha.slice(0, 12) + '，部署态生成）');
  } else if (git('cat-file -e ' + gitSha) !== null) {
    // 注意：不要写成 <sha>^{commit}——Windows 下 execSync 走 cmd，'^' 是转义符，
    // 会被吞掉导致本地已有对象仍判为「不存在」而误走 fetch 分支
    console.log('[ok] 锚点 git=' + gitSha.slice(0, 12) + ' 存在于本地对象库（生成于历史 commit，正常）');
  } else {
    // 浅克隆（如 CI checkout depth=1）拿不到历史对象：单拉该 commit 验证其确实属于本仓库
    console.log('[info] 锚点 git=' + gitSha.slice(0, 12) + ' 不在本地对象库，尝试从 origin 单拉校验归属 …');
    const fetched = git('fetch --depth=1 origin ' + gitSha, { timeout: 60000 });
    if (fetched === null) {
      fail(
        'manifest.git=' + gitSha + ' 不属于本仓库（fetch 验证失败）！\n' +
        '  该 commit 可能来自贡献者 fork 或从未 push 到上游，jsDelivr 按 repo@git 拉取将 404。\n' +
        '  修复：在上游 main 上运行 node scripts/generate-bio-shards.js 并提交'
      );
    }
    console.log('[ok] 锚点 git=' + gitSha.slice(0, 12) + ' 已确认存在于 origin（fetch 成功）');
  }

  console.log('[pass] manifest CDN 锚点一致性校验通过（repo=' + repo + '）');
}

main();
