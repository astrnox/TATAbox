#!/usr/bin/env node
/**
 * TATABOX — 百度普通收录「API 提交」脚本
 * ============================================================
 * 为什么需要它：
 *   百度不支持 IndexNow，也不会因为 sitemap.xml 存在就立刻来抓 ——
 *   新站在百度的自然爬取周期以周/月计。百度搜索资源平台提供
 *   「普通收录 → API 提交」接口，推送后通常数小时~数天内触发抓取，
 *   是百度侧唯一可用的"主动加速"手段。
 *
 * 前置条件（均在 https://ziyuan.baidu.com 完成，免费）：
 *   1) 注册百度搜索资源平台，完成站点验证（文件/metatxt 方式均可），
 *      站点填 https://tatabox.cc.cd；
 *   2) 「普通收录 → API 提交」页面会给出一个 32 位 token；
 *   3) 把 token 交给本脚本：环境变量 BAIDU_TOKEN（CI 中为 Actions secret
 *      BAIDU_TOKEN）。**不要把 token 提交进仓库** —— 它等同于
 *      「以本站点名义推送 URL」的凭证，泄露后他人可滥用你的配额。
 *
 * 协议要点：
 *   - 端点：POST http://data.zz.baidu.com/urls?site=<站点>&token=<token>
 *   - 请求体：纯文本，每行一个 URL（不是 JSON）
 *   - 成功响应：{"remain": <当日剩余配额>, "success": <本次成功条数>}
 *   - 失败响应：{"error": <错误码>, "message": "..."}（401=token 无效，
 *     400=site 参数与验证站点不符；另有每日配额限制）
 *
 * 用法：
 *   node scripts/submit-baidu.js --dry-run          # 打印将提交的内容，不联网
 *   BAIDU_TOKEN=xxx node scripts/submit-baidu.js     # 实际提交 sitemap 全部 URL
 *   BAIDU_TOKEN=xxx node scripts/submit-baidu.js <url> [url...]  # 只提交指定 URL
 *
 * 说明：本脚本需要联网且依赖 token，故不挂入 CI 门禁；由
 *       .github/workflows/baidu-push.yml 在配置了 secret 时自动执行。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const HOST = 'tatabox.cc.cd';
const SITE = `https://${HOST}`;
const ENDPOINT = 'http://data.zz.baidu.com/urls';
// 百度对单次提交的 URL 数量与每日配额均有限制（随站点等级浮动），
// 分批提交避免整批被拒；数量以百度官方文档为准。
const BATCH_SIZE = 1000;

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

async function pushBatch(token, urls) {
  const url = `${ENDPOINT}?site=${encodeURIComponent(SITE)}&token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: urls.join('\n'),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { httpStatus: res.status, body };
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const positional = argv.filter((a) => !a.startsWith('--'));

  let urlList;
  let source;
  if (positional.length > 0) {
    urlList = positional;
    source = 'cli-args';
  } else {
    urlList = readSitemapUrls();
    source = 'sitemap.xml';
  }

  // 百度只收本验证站点下的 URL，混入外链整批会被拒
  const foreign = urlList.filter((u) => {
    try {
      return new URL(u).hostname !== HOST;
    } catch {
      return true;
    }
  });
  if (foreign.length > 0) {
    fail(
      `以下 URL 不属于 ${SITE}（百度要求与验证站点一致，否则整批失败）：\n  ` +
        foreign.join('\n  ')
    );
  }

  const token = (process.env.BAIDU_TOKEN || '').trim();

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          endpoint: ENDPOINT,
          site: SITE,
          token: token ? token.slice(0, 6) + '…(env BAIDU_TOKEN)' : '(未设置，仅 dry-run)',
          source,
          urlCount: urlList.length,
          urls: urlList,
          dryRun: true,
        },
        null,
        2
      )
    );
    console.log(
      `\n[dry-run] 未联网。将向 ${ENDPOINT}?site=${SITE}&token=<token> 提交 ` +
        `${urlList.length} 个 URL（来源：${source}）。`
    );
    return;
  }

  if (!token) {
    fail(
      '未设置环境变量 BAIDU_TOKEN。\n' +
        '  获取方式：百度搜索资源平台 → 普通收录 → API 提交 → 复制 token。\n' +
        '  用法：BAIDU_TOKEN=<token> node scripts/submit-baidu.js'
    );
  }

  const batches = [];
  for (let i = 0; i < urlList.length; i += BATCH_SIZE) {
    batches.push(urlList.slice(i, i + BATCH_SIZE));
  }

  let ok = true;
  for (const [i, batch] of batches.entries()) {
    let result;
    try {
      result = await pushBatch(token, batch);
    } catch (err) {
      console.log(
        JSON.stringify({ batch: i + 1, status: 'network-error', error: String(err && err.message) })
      );
      ok = false;
      continue;
    }
    const accepted = result.body && typeof result.body.success === 'number';
    const report = {
      batch: i + 1,
      httpStatus: result.httpStatus,
      submitted: batch.length,
      status: accepted ? 'submitted' : 'rejected',
      response: result.body,
      urls: batch,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!accepted) ok = false;
  }

  if (!ok) {
    fail(
      '百度推送失败。常见原因：\n' +
        '  · token 无效（error=401）—— 在 ziyuan.baidu.com 重新复制；\n' +
        '  · site 参数与验证站点不符（error=400）—— 站点须为 ' + SITE + '；\n' +
        '  · 配额用尽 —— 次日重置，或在平台「普通收录 → 手动提交」兜底；\n' +
        '  · 网络无法访问 data.zz.baidu.com。'
    );
  }
  console.log(
    `\n[ok] 已推送 ${urlList.length} 个 URL（来源：${source}）。百度通常数小时~数天内开始抓取，` +
      '可在搜索资源平台「普通收录 → 抓取索引量」观察进度。'
  );
}

main().catch((err) => fail(String(err && err.stack ? err.stack : err)));
