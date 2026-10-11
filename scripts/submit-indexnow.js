#!/usr/bin/env node
/**
 * TATABOX — IndexNow 提交脚本（Bing / Yandex / Naver 等即时收录）
 * ============================================================
 * 为什么需要它：
 *   Bing 支持 IndexNow 协议，提交后通常数秒~数分钟内触发抓取，
 *   而等待 bingbot 自然发现可能要数周。Google 不支持该协议，
 *   但 Bing（含 Copilot 搜索）是本脚本的直接目标。
 *
 * 工作原理：
 *   1) 读取仓库根目录下形如 <32位十六进制>.txt 的 IndexNow 密钥文件，
 *      并校验「文件名（去 .txt）」与「文件内容」一致 —— 二者不一致说明
 *      密钥文件被误改，提交会被 Bing 以 keyInvalid 拒绝；
 *   2) 从 sitemap.xml 解析全部 <loc>（单一事实来源，不手工维护 URL 列表）；
 *   3) POST JSON 到 https://api.indexnow.org/indexnow；
 *   4) 输出 JSON 报告。HTTP 200/202 视为成功。
 *
 * 用法：
 *   node scripts/submit-indexnow.js                # 提交 sitemap 全部 URL
 *   node scripts/submit-indexnow.js --dry-run      # 只打印 payload，不联网
 *   node scripts/submit-indexnow.js <url> [url...] # 只提交指定 URL
 *
 * 说明：本脚本需要联网，故**不挂入 CI**（CI 中的 verify-* 脚本均为纯静态审计）。
 *       部署后手动执行，或由 .github/workflows/indexnow.yml 在 push 后自动执行。
 *
 * IndexNow 协议要点（供后续维护参考）：
 *   - 请求体字段：host（不含协议）、key、keyLocation、urlList；
 *   - 密钥文件须通过 https://<host>/<key>.txt 公开可访问；
 *   - 单次最多 10,000 个 URL，超出需分批。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const HOST = 'tatabox.cc.cd';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const KEY_FILE_RE = /^[0-9a-f]{32}\.txt$/i;

/** 读取并校验 IndexNow 密钥文件 */
function readKey() {
  const files = fs.readdirSync(ROOT).filter((f) => KEY_FILE_RE.test(f));
  if (files.length === 0) {
    fail(
      '未找到 IndexNow 密钥文件（根目录下应存在一个形如 <32位hex>.txt 的文件）。\n' +
        '  生成方法：node -e "console.log(require(\'crypto\').randomBytes(16).toString(\'hex\'))"\n' +
        '  然后创建 <该串>.txt，内容即该串本身。'
    );
  }
  if (files.length > 1) {
    fail(`发现多个 IndexNow 密钥文件，必须只保留一个：${files.join(', ')}`);
  }
  const file = files[0];
  const expected = path.basename(file, '.txt').toLowerCase();
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8').trim().toLowerCase();
  if (content !== expected) {
    fail(
      `密钥文件内容与文件名不一致：文件名=${expected}，内容=${content || '(空)'}。\n` +
        '  二者必须相同，否则 Bing 校验 keyLocation 时会返回 keyInvalid。'
    );
  }
  return { key: expected, keyFile: file };
}

/** 从 sitemap.xml 解析全部 <loc> */
function readSitemapUrls() {
  if (!fs.existsSync(SITEMAP_PATH)) {
    fail(`未找到 ${SITEMAP_PATH} —— sitemap.xml 是提交 URL 的单一事实来源，必须存在。`);
  }
  const xml = fs.readFileSync(SITEMAP_PATH, 'utf8');
  const urls = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) urls.push(m[1]);
  if (urls.length === 0) fail('sitemap.xml 中未解析出任何 <loc>，无法提交。');
  return urls;
}

function fail(msg) {
  console.error('[FATAL] ' + msg);
  process.exit(1);
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const positional = argv.filter((a) => !a.startsWith('--'));

  const { key, keyFile } = readKey();

  // 指定 URL 优先；否则以 sitemap 为准
  let urlList;
  let source;
  if (positional.length > 0) {
    urlList = positional;
    source = 'cli-args';
  } else {
    urlList = readSitemapUrls();
    source = 'sitemap.xml';
  }

  // 协议要求：urlList 必须全部属于 host，否则整批被拒
  const foreign = urlList.filter((u) => {
    try {
      return new URL(u).hostname !== HOST;
    } catch {
      return true;
    }
  });
  if (foreign.length > 0) {
    fail(
      `以下 URL 不属于 ${HOST}（IndexNow 要求同 host，否则整批失败）：\n  ` +
        foreign.join('\n  ')
    );
  }

  if (urlList.length > 10000) {
    fail(`单次最多提交 10000 个 URL，当前 ${urlList.length} 个，需分批。`);
  }

  const payload = {
    host: HOST,
    key,
    keyLocation: `https://${HOST}/${keyFile}`,
    urlList,
  };

  const report = {
    host: HOST,
    endpoint: ENDPOINT,
    keyFile,
    keyLocation: payload.keyLocation,
    source,
    urlCount: urlList.length,
    urls: urlList,
    dryRun,
  };

  if (dryRun) {
    report.status = 'dry-run';
    report.payload = payload;
    console.log(JSON.stringify(report, null, 2));
    console.log(
      `\n[dry-run] 未联网。将向 ${ENDPOINT} 提交 ${urlList.length} 个 URL（来源：${source}）。`
    );
    return;
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    report.httpStatus = res.status;
    // IndexNow 成功为 200（已接受）或 202（待校验密钥）
    report.ok = res.status === 200 || res.status === 202;
    report.status = report.ok ? 'submitted' : 'rejected';
    if (!report.ok) report.body = (await res.text()).slice(0, 500);
  } catch (err) {
    report.ok = false;
    report.status = 'network-error';
    report.error = String(err && err.message ? err.message : err);
  }

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    fail(
      `提交失败（status=${report.status}${
        report.httpStatus ? `, http=${report.httpStatus}` : ''
      }）。常见原因：\n` +
        '  · 密钥文件未部署到线上（先 push 再提交）；\n' +
        '  · 网络无法访问 api.indexnow.org；\n' +
        '  · 返回 400 keyInvalid —— 密钥文件内容与 key 字段不一致。'
    );
  }
  console.log(
    `\n[ok] 已提交 ${urlList.length} 个 URL（来源：${source}）。Bing 通常数分钟内开始抓取。`
  );
}

main().catch((err) => fail(String(err && err.stack ? err.stack : err)));
