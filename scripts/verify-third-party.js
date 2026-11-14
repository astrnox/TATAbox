#!/usr/bin/env node
'use strict';
/*
 * verify-third-party.js — GitHub Issue #104 [P3-2] 第三方资源白名单与完整性校验
 *
 * 纯静态审计脚本，零依赖，不联网。即使 sandbox 配了 HTTPS_PROXY/HTTP_PROXY，
 * 本脚本也不发起任何网络请求 —— 全部输入来自磁盘文件。
 *
 * 覆盖范围（比实现时更全）：
 *   扫描仓库根目录下全部顶层 HTML 页面（index.html 及
 *   quiz/resources/ebook/study/cards/wiki/biology-history/400/401/403/404/500/502/503 等），
 *   而不仅限于 index.html —— 避免"子页面引用未白名单第三方资源"被漏检。
 *
 * 校验内容：
 *   1) 域名白名单：所有页面中所有外部 URL（src/href，http/https 开头，
 *      排除 data: 与 # 锚点）的域名，必须出现在 data/third-party-domains.txt 白名单，
 *      或内置豁免清单内，否则记 violation（未知域名）。
 *   2) 完整性校验（SRI integrity）：
 *        a. 外链样式表 <link rel="stylesheet" href="http...">
 *        b. 外链 <script src="http...">
 *        c. 带 data-css-async 的 KaTeX 样式 preload（<link rel=preload as=style>）
 *      以上三类必须携带 integrity 属性，缺失则记 violation（缺完整性校验）。
 *   例外（仅需白名单、不要求 SRI，均已书面说明理由）：
 *       - fonts.googleapis.com 的 css2 样式表：谷歌按 User-Agent 协商返回不同
 *         @font-face 字节（woff2 / woff 等），单一 SRI 哈希会使部分浏览器字体
 *         被 CSP 拦截，故只白名单、不强加 SRI。
 *
 * 内置豁免域名（无需写入白名单文件即可豁免"未知域名"）：
 *   - supabase.co       仅用于 CSP connect-src，不加载任何静态资源；
 *                       它只出现在 <meta http-equiv="Content-Security-Policy"> 的
 *                       content 区内，正则只匹配 src/href，天然跳过该元信息区域。
 *   - phet.colorado.edu frame 内嵌 iframe 模拟，不加载静态资源（同白名单）。
 *
 * 输出：JSON  { pages, domains, externals:[{page,url,domain,integrity}], violations:[] }
 *   ok=true/false；存在 violation 时 exit 1。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WHITELIST_PATH = path.join(ROOT, 'data', 'third-party-domains.txt');

// 内置豁免域名（只豁免"未知域名"判定；本身仍是允许的，不做 SRI 要求）
const EXEMPT_DOMAINS = new Set([
  'supabase.co', // 仅 CSP connect-src，不加载静态资源
  'phet.colorado.edu', // frame 内嵌 iframe，不加载静态资源
]);

// 例外域名：白名单必达，但 SRI 可豁免（理由见文件头注释）
const NO_SRI_ENFORCE = new Set([
  'fonts.googleapis.com', // UA 协商的字体 CSS，单一 SRI 会误伤部分浏览器
]);

const EXEMPT_NOTE = {
  'supabase.co': 'connect-src 专属（仅在 CSP meta content 中，src/href 不会抓到）',
  'phet.colorado.edu': 'frame 内嵌 iframe，不加载静态资源',
};

function readWhitelist() {
  const txt = fs.readFileSync(WHITELIST_PATH, 'utf8');
  const set = new Set();
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim(); // 去掉行内注释（# 及其后）
    if (!line) continue; // 忽略空行 / 整行注释
    set.add(line);
  }
  return set;
}

// 提取 <link>/<script>/<a> 开始标签，返回其 href/src 及关键属性
function collectTagTokens(html) {
  const tagRe = /<(?:(link)|(script)|(a))\b([^>]*)>/gi;
  const tokens = [];
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const kind = m[1] ? 'link' : m[2] ? 'script' : 'a';
    const attrs = m[4] || '';
    const grab = (name) => {
      const am = new RegExp('\\b' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(attrs);
      if (!am) return null;
      return (am[2] !== undefined ? am[2] : am[3]).trim();
    };
    const href = grab('href');
    const src = grab('src');
    const url = href || src;
    if (!url) continue;
    tokens.push({
      kind,
      url,
      rel: grab('rel'),
      as: grab('as'),
      integrity: grab('integrity'),
      cssAsync: /\bdata-css-async\b/i.test(attrs),
    });
  }
  return tokens;
}

function isHttpUrl(u) {
  return /^https?:\/\//i.test(u);
}

function hostnameOf(u) {
  try {
    return new URL(u).hostname;
  } catch {
    return null;
  }
}

function listHtmlPages() {
  return fs
    .readdirSync(ROOT)
    .filter((f) => {
      if (!f.endsWith('.html')) return false;
      try {
        return fs.statSync(path.join(ROOT, f)).isFile();
      } catch (e) {
        return false;
      }
    })
    .sort();
}

function run() {
  const whitelist = readWhitelist();
  const pages = listHtmlPages();
  const violations = [];
  const externals = [];
  const domains = [];

  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const tokens = collectTagTokens(html);

    for (const t of tokens) {
      if (!isHttpUrl(t.url)) continue; // 本地/相对路径、data:、#锚点全部跳过

      const domain = hostnameOf(t.url);

      // 普通正文外链（<a>）不做域名白名单/SRI 约束：解析里引用任意论文、官网
      // 不应要求改白名单；白名单只用于会实际加载代码/样式的资源标签。
      if (t.kind === 'a') {
        if (!externals.some((e) => e.page === page && e.url === t.url)) {
          externals.push({ page, url: t.url, domain, integrity: false, kind: 'a' });
        }
        continue;
      }

      const recognized = whitelist.has(domain) || EXEMPT_DOMAINS.has(domain);

      // 判定该元素是否属于"必须带 SRI integrity"的静态资源
      const isStyle = t.kind === 'link' && t.rel && /\bstylesheet\b/i.test(t.rel);
      const isKatexPreload =
        t.kind === 'link' &&
        t.rel === 'preload' &&
        t.as === 'style' &&
        t.cssAsync &&
        /katex/i.test(t.url);
      const isExternalScript = t.kind === 'script';

      const requiresSRI = (isStyle || isKatexPreload || isExternalScript) &&
        !(isStyle && NO_SRI_ENFORCE.has(domain)); // 例外：UA 协商 CSS 只白名单不强加 SRI
      const hasIntegrity = Boolean(t.integrity);

      // externals 按 page+url 去重，integrity 反映是否带 integrity 属性
      if (!externals.some((e) => e.page === page && e.url === t.url)) {
        externals.push({ page, url: t.url, domain, integrity: hasIntegrity });
      }
      if (!domains.includes(domain)) domains.push(domain);

      if (!recognized) {
        violations.push(`未知域名（不在白名单/豁免清单）：${domain} → ${page}: ${t.url}`);
      }

      if (requiresSRI && !hasIntegrity) {
        const kindDesc = isExternalScript
          ? '外链脚本 <script src>'
          : isKatexPreload
            ? 'KaTeX 样式 preload (data-css-async)'
            : '外链样式表 <link rel="stylesheet">';
        violations.push(`缺少完整性校验 (integrity 缺失)：${kindDesc} → ${page}: ${t.url}`);
      }
    }
  }

  const ok = violations.length === 0;
  console.log(
    JSON.stringify({ pages, domains: domains.sort(), externals, violations }, null, 2)
  );
  console.log(`\nok=${ok}  pages=${pages.length}  domains=${domains.length}  externals=${externals.length}  violations=${violations.length}  whitelist=${whitelist.size}  exempt=[${[...EXEMPT_DOMAINS].map((d) => `${d}(${EXEMPT_NOTE[d]})`).join(' | ')}]  noSriEnforce=[${[...NO_SRI_ENFORCE].join(' | ')}]`);
  process.exitCode = ok ? 0 : 1;
}

run();