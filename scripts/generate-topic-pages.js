#!/usr/bin/env node
/**
 * TATABOX — 题库主题静态页生成器（SEO，86 个主题页 + 专题索引页）
 * ============================================================
 * 为什么需要静态页：
 *   题库数据（data/bank/*.json）由 JS 在运行时渲染进 quiz.html，
 *   搜索引擎（尤其百度，其 JS 渲染能力弱）看到的是空壳，无法索引题目内容。
 *   本脚本把每个题库主题预渲染为独立的静态 HTML 落地页：
 *     · topics.html        —— 86 个主题的索引枢纽页（内链入口）；
 *     · topics/<id>.html   —— 每主题一页：考点 + 真题逐条答案与解析；
 *   页面为纯静态、零 JS 依赖（仅汉堡菜单增强），爬虫直接可读。
 *
 * 数据来源（单一事实来源，勿在页面里手写内容）：
 *   · data/manifest.json  —— 主题元数据（label/category/relatedModule）与模块划分；
 *   · data/bank/*.json    —— 86 个主题的题目与解析；
 *   · data/topics.json    —— 模块中文名（moduleLabels）。
 *
 * 副作用（幂等，重复运行无差异）：
 *   · 生成/覆盖 topics/ 下的页面与 topics.html；
 *   · 同步 sitemap.xml：重建 /topics/ 相关 URL 条目，其余条目原样保留。
 *
 * 用法：
 *   node scripts/generate-topic-pages.js          # 生成 + 同步 sitemap
 *   npm run gen:topics                            # 同上
 *
 * 说明：产物入库（GitHub Pages 纯静态部署无构建步骤），数据更新后需重跑并提交。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://tatabox.cc.cd';
const OUT_DIR = path.join(ROOT, 'topics');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const GEN_COMMENT =
  '<!-- 本文件由 scripts/generate-topic-pages.js 自动生成，勿手改；修改请编辑生成器后重跑 npm run gen:topics -->';

/* ── 工具 ── */

/** HTML 转义（文本与属性共用；属性内引号也一并转义） */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 读 JSON，失败即终止（数据缺失不允许静默生成残页） */
function readJson(p) {
  if (!fs.existsSync(p)) {
    console.error('[FATAL] 缺少数据文件：' + p);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/* ── 数据装配 ── */

/** 6 个每日联赛主题不在 manifest.topics 中，标签在此维护 */
const DAILY_META = {
  daily_league_animal: { label: '每日一练 · 动物生理', category: '每日一练' },
  daily_league_behavior_ecology: { label: '每日一练 · 行为与生态', category: '每日一练' },
  daily_league_biochem_microbe: { label: '每日一练 · 生化与微生物', category: '每日一练' },
  daily_league_cellbio: { label: '每日一练 · 细胞与生化', category: '每日一练' },
  daily_league_genetics_evolution: { label: '每日一练 · 遗传与进化', category: '每日一练' },
  daily_league_plant: { label: '每日一练 · 植物学', category: '每日一练' },
};

const DIFF_LABEL = { league: '联赛', competition: '竞赛', basic: '基础', gaokao: '高考' };

function loadTopics() {
  const manifest = readJson(path.join(ROOT, 'data', 'manifest.json'));
  const topicsJson = readJson(path.join(ROOT, 'data', 'topics.json'));
  const moduleLabels = topicsJson.moduleLabels || {};

  const bankIds = fs
    .readdirSync(path.join(ROOT, 'data', 'bank'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();

  // manifest.topics 可能是数组（[{id,label,...}]）或对象（{id:{...}}），统一为对象
  const topicMeta = {};
  for (const [k, v] of Object.entries(manifest.topics || {})) {
    if (v && typeof v === 'object' && v.id) topicMeta[v.id] = v;
    else topicMeta[k] = v;
  }
  // 80 个常规主题：按 manifest.modules 的模块顺序排列（有策划的呈现顺序）
  const orderedIds = [];
  for (const mod of Object.keys(manifest.modules || {})) {
    for (const id of manifest.modules[mod]) {
      if (bankIds.includes(id)) orderedIds.push(id);
    }
  }
  // 兜底：manifest 未收录但 bank 里存在的主题（不应发生，留防回归）
  for (const id of bankIds) {
    if (!orderedIds.includes(id) && !id.startsWith('daily_')) orderedIds.push(id);
  }
  // 6 个每日联赛主题排最后
  for (const id of bankIds) {
    if (id.startsWith('daily_')) orderedIds.push(id);
  }

  const topics = orderedIds.map((id) => {
    const questions = readJson(path.join(ROOT, 'data', 'bank', id + '.json'));
    const meta = topicMeta[id];
    const daily = DAILY_META[id];
    if (!meta && !daily) {
      console.error(`[FATAL] 主题 ${id} 既不在 manifest.topics 也不在 DAILY_META，请补充元数据。`);
      process.exit(1);
    }
    const qList = Object.values(questions);
    const concepts = [];
    for (const q of qList) {
      if (q.concept && !concepts.includes(q.concept)) concepts.push(q.concept);
    }
    return {
      id,
      label: meta ? meta.label : daily.label,
      category: meta ? meta.category : daily.category,
      module: meta ? meta.relatedModule : null,
      moduleLabel: meta && moduleLabels[meta.relatedModule] ? moduleLabels[meta.relatedModule] : null,
      isDaily: !!daily,
      questions: qList,
      concepts,
    };
  });
  return { topics, manifest, moduleLabels };
}

/* ── 页面骨架 ── */

/** 头部导航：prefix 为相对根目录的路径前缀（'' 或 '../'） */
function headerHtml(prefix, active) {
  const nav = [
    ['index.html', '首页', false],
    ['index.html#/practice', '练习', true],
    ['index.html#/exam', '模考', true],
    ['study.html', '学习', false],
    ['biology-history.html', '生物学史', false],
    ['cards.html', '卡片', false],
    ['quiz.html', '试题', false],
    ['topics.html', '题库专题', false],
    ['resources.html', '资源', false],
    ['wiki.html', '百科', false],
    ['index.html#/knowledge-graph', '图谱', false],
    ['index.html#/diagnosis', '诊断', false],
    ['index.html#/pomodoro', '专注', false],
    ['index.html#/habits', '习惯', false],
    ['index.html#/review', '复习', false],
    ['index.html#/bounties', '悬赏', false],
    ['index.html#/community', '社区', false],
    ['index.html#/analytics', '分析', false],
    ['index.html#/user', '我的', false],
  ];
  const links = nav
    .map(([href, text, hl]) => {
      const cls = [];
      if (hl) cls.push('nav-highlight');
      if (active === text) cls.push('active');
      return `      <a href="${prefix}${href}"${cls.length ? ` class="${cls.join(' ')}"` : ''}>${text}</a>`;
    })
    .join('\n');

  return `  <header class="header">
    <a href="${prefix}index.html" class="header-brand">
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="26" height="26" rx="7.6" stroke="#d4a87e" stroke-width="2.6"/>
        <path d="M16 10.2v11.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M11.2 10.2h9.6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
      </svg>
      TATABOX
    </a>
    <div class="header-right">
      <button class="hamburger" id="hamburgerBtn" aria-label="菜单">
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
      </button>
    </div>
  </header>

  <div class="mobile-nav-overlay" id="mobileOverlay"></div>
  <nav class="mobile-nav" id="mobileNav">
    <div class="mobile-nav-head">
      <a href="${prefix}index.html" class="mobile-nav-brand">
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="26" height="26" rx="7.6" stroke="#d4a87e" stroke-width="2.6"/>
          <path d="M16 10.2v11.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
          <path d="M11.2 10.2h9.6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
        </svg>
        <span class="mobile-nav-title">TATABOX</span>
      </a>
      <button id="mobileNavClose" class="mobile-nav-close" aria-label="关闭菜单">&times;</button>
    </div>
    <div class="mobile-nav-scroll">
${links}
    </div>
  </nav>`;
}

function footerHtml(prefix) {
  return `  <footer class="footer">
    <div class="footer-content">
      <div class="footer-brand">TATABOX — 高中生物学习平台</div>
      <div class="footer-links">
        <a href="${prefix}topics.html">题库专题</a>
        <a href="${prefix}cards.html">知识卡片</a>
        <a href="${prefix}quiz.html">模拟试题</a>
        <a href="${prefix}resources.html">学习资源</a>
        <a href="${prefix}wiki.html">生物百科</a>
      </div>
    </div>
  </footer>`;
}

function headHtml(opts) {
  const { title, description, keywords, canonical, prefix, jsonLd } = opts;
  return `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="keywords" content="${esc(keywords)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>@font-face{font-family:'LXGW WenKai';src:url('${prefix}fonts/lxgw-wenkai.woff2?v=1.522') format('woff2');font-weight:100 900;font-display:swap;}</style>
  <link rel="stylesheet" href="${prefix}css/globals.css">
  <link rel="stylesheet" href="${prefix}css/header.css">
  <link rel="stylesheet" href="${prefix}css/footer.css">
  <link rel="stylesheet" href="${prefix}css/topics.css">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>`;
}

function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      ...(it.item ? { item: it.item } : {}),
    })),
  };
}

/* ── 主题详情页 ── */

function questionHtml(q, i, diffLabel) {
  const subs = Array.isArray(q.subQuestions) ? q.subQuestions : [];
  const opts = subs
    .map((s) => {
      const yes = s.answer === true;
      return `          <li>
            <span class="tp-opt-label">${esc(s.label || '')}</span>
            <span class="tp-opt-text">${esc(s.text)}</span>
            <span class="tp-ans ${yes ? 'tp-ans-yes' : 'tp-ans-no'}">${yes ? '正确' : '错误'}</span>
          </li>`;
    })
    .join('\n');

  const refs = Array.isArray(q.references) && q.references.length > 0
    ? `\n        <p class="tp-q-ref">参考文献：${q.references
        .map((r) => esc([r.authors, r.title, r.journal, r.year, r.doi ? 'DOI:' + r.doi : ''].filter(Boolean).join('，')))
        .join('；')}</p>`
    : '';

  return `      <article class="tp-q">
        <h3 class="tp-q-stem"><span class="tp-q-no">第 ${i + 1} 题</span>${esc(q.question)}</h3>
${subs.length ? `        <ul class="tp-q-opts">\n${opts}\n        </ul>` : ''}
        <details class="tp-q-exp">
          <summary>查看答案与解析（${esc(diffLabel)}难度）</summary>
          <div class="tp-exp-body">${esc(q.explanation)}</div>
        </details>${refs}
      </article>`;
}

function detailPage(t, allTopics) {
  const canonical = `${SITE}/topics/${t.id}.html`;
  const diffLabel = DIFF_LABEL[(t.questions[0] || {}).difficulty] || '联赛';
  const n = t.questions.length;
  const related = allTopics
    .filter((x) => x.id !== t.id && (x.category === t.category || x.module === t.module))
    .slice(0, 8);

  const title = `${t.label}真题与解析 — ${t.category}题库专题 | TATABOX`;
  const description =
    `TATABOX ${t.label}专题收录${n}道${diffLabel}真题与逐条解析` +
    (t.concepts.length ? `，考点覆盖${t.concepts.slice(0, 2).join('、')}等` : '') +
    `，属${t.category}题库，附正确答案、判断依据与相关主题练习。`;
  const keywords = [t.label, t.category, ...t.concepts.slice(0, 3), '生物竞赛真题', 'TATABOX'].join(',');

  const concepts = t.concepts.map((c) => `<li>${esc(c)}</li>`).join('');
  const questions = t.questions.map((q, i) => questionHtml(q, i, diffLabel)).join('\n');
  const relLinks = related
    .map(
      (r) =>
        `<li><a href="${r.id}.html">${esc(r.label)}</a><span class="tp-rel-cat">${esc(r.category)}</span></li>`
    )
    .join('\n');

  const metaBits = [t.category, t.moduleLabel, `${n} 道真题`].filter(Boolean).join(' · ');

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
${headHtml({
  title,
  description,
  keywords,
  canonical,
  prefix: '../',
  jsonLd: breadcrumbLd([
    { name: '首页', item: `${SITE}/` },
    { name: '题库专题', item: `${SITE}/topics.html` },
    { name: t.label },
  ]),
})}
<body>
${headerHtml('../', '试题')}

  <main class="tp-main">
    <section class="section">
      <div class="container">
        ${GEN_COMMENT}
        <nav class="tp-crumb" aria-label="面包屑">
          <a href="../index.html">首页</a><span class="tp-crumb-sep">/</span>
          <a href="../topics.html">题库专题</a><span class="tp-crumb-sep">/</span>
          <span aria-current="page">${esc(t.category)}</span>
        </nav>
        <h1 class="tp-title">${esc(t.label)}</h1>
        <p class="tp-meta">${esc(metaBits)}</p>
        <p class="tp-intro">${esc(t.label)}是 TATABOX 生物题库中的${esc(t.category)}主题，本页静态展示该主题全部真题：每题给出题干、逐条判断项的对错结论与依据解析，方便搜索引擎收录与考生直接复习。做完题可前往<a href="../quiz.html">模拟试题</a>在线组卷检验。</p>

        <h2 class="tp-h2">覆盖考点</h2>
        <ul class="tp-tags">${concepts}</ul>

        <h2 class="tp-h2">真题与解析（共 ${n} 题）</h2>
${questions}

        <h2 class="tp-h2">相关主题</h2>
        <ul class="tp-rel">
${relLinks}
        </ul>

        <p class="tp-cta">
          <a class="tp-btn" href="../quiz.html">去在线组卷做题</a>
          <a class="tp-btn tp-btn-ghost" href="../topics.html">返回题库专题</a>
        </p>
      </div>
    </section>
  </main>

${footerHtml('../')}

  <script src="../js/core/utils.js?v=20260814b"></script>
  <script src="../js/core/hamburger.js?v=20260814b"></script>
  <script>
    if (window.BioQuestHamburger) {
      window.BioQuestHamburger.render();
      window.BioQuestHamburger.init();
    }
  </script>
</body>
</html>
`;
}

/* ── 索引枢纽页 topics.html ── */

function hubPage(topics, moduleLabels) {
  const canonical = `${SITE}/topics.html`;
  const regular = topics.filter((t) => !t.isDaily);
  const daily = topics.filter((t) => t.isDaily);
  const totalQ = topics.reduce((s, t) => s + t.questions.length, 0);

  const title = `${topics.length} 个生物题库专题 — 联赛真题与解析 | TATABOX`;
  const description =
    `TATABOX 生物题库共 ${topics.length} 个专题、${totalQ} 道联赛真题，` +
    '按细胞与分子、植物与微生物、动物与生态、遗传与进化四大模块组织，每专题附逐条答案与解析。';
  const keywords = '生物题库专题,生物联赛真题,高中生物题库,生物竞赛刷题,真题解析,考点分类,TATABOX';

  const modOrder = Object.keys(moduleLabels);
  const sections = modOrder
    .map((mod) => {
      const list = regular.filter((t) => t.module === mod);
      if (!list.length) return '';
      return `        <h2 class="tp-h2">${esc(moduleLabels[mod])}</h2>
        <div class="tp-grid">
${list.map((t) => hubCard(t)).join('\n')}
        </div>`;
    })
    .filter(Boolean)
    .join('\n');

  const dailyCards = daily.map((t) => hubCard(t)).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
${headHtml({
  title,
  description,
  keywords,
  canonical,
  prefix: '',
  jsonLd: breadcrumbLd([
    { name: '首页', item: `${SITE}/` },
    { name: '题库专题' },
  ]),
})}
<body>
${headerHtml('', '试题')}

  <main class="tp-main">
    <section class="section">
      <div class="container">
        ${GEN_COMMENT}
        <nav class="tp-crumb" aria-label="面包屑">
          <a href="index.html">首页</a><span class="tp-crumb-sep">/</span>
          <span aria-current="page">题库专题</span>
        </nav>
        <h1 class="tp-title">生物题库专题</h1>
        <p class="tp-meta">${topics.length} 个专题 · ${totalQ} 道联赛真题 · 4 大模块</p>
        <p class="tp-intro">本页是 TATABOX 生物题库的专题索引：${topics.length} 个知识点主题全部静态收录，每题给出逐条答案与解析。点击进入专题页复习，或前往<a href="quiz.html">模拟试题</a>在线组卷实战。</p>

${sections}

        <h2 class="tp-h2">每日一练</h2>
        <div class="tp-grid">
${dailyCards}
        </div>
      </div>
    </section>
  </main>

${footerHtml('')}

  <script src="js/core/utils.js?v=20260814b"></script>
  <script src="js/core/hamburger.js?v=20260814b"></script>
  <script>
    if (window.BioQuestHamburger) {
      window.BioQuestHamburger.render();
      window.BioQuestHamburger.init();
    }
  </script>
</body>
</html>
`;
}

function hubCard(t) {
  return `          <a class="tp-card" href="topics/${t.id}.html">
            <span class="tp-card-t">${esc(t.label)}</span>
            <span class="tp-card-s">${esc(t.category)} · ${t.questions.length} 题</span>
          </a>`;
}

/* ── sitemap 同步：重建 /topics/ 条目，其余原样保留 ── */

function syncSitemap(topics) {
  const xml = fs.readFileSync(SITEMAP_PATH, 'utf8');
  const blocks = xml.match(/  <url>[\s\S]*?<\/url>/g) || [];
  const curated = blocks.filter((b) => !/<loc>https:\/\/tatabox\.cc\.cd\/topics(\/|\.html)/.test(b));
  const lastmod = (readJson(path.join(ROOT, 'data', 'manifest.json')).updated_at || '').slice(0, 10);

  const topicUrls = [{ loc: `${SITE}/topics.html`, pr: '0.8' }].concat(
    topics.map((t) => ({ loc: `${SITE}/topics/${t.id}.html`, pr: '0.6' }))
  );
  const topicBlocks = topicUrls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n` +
        `    <changefreq>weekly</changefreq>\n    <priority>${u.pr}</priority>\n  </url>`
    )
    .join('\n');

  const all = curated.concat([topicBlocks]).join('\n');
  const out = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  TATABOX 站点地图（主题条目由 scripts/generate-topic-pages.js 维护）
  范围：7 个 canonical 内容页 + 1 个题库专题索引页（topics.html）
        + ${topics.length} 个题库主题页（topics/*.html，静态真题与解析）。
  排除项及原因：
    · study.html                   —— 0 秒跳板（meta refresh → index.html#/study），
      其 canonical 指向首页，按 sitemap 协议"只收录 canonical URL"不纳入；
      且 hash 路由（#/xxx）本身不可被搜索引擎索引，这是纯前端 SPA 的固有限制；
    · 400/401/403/404/500/502/503.html、_loader-test.html
                                   —— 已在页内声明 meta noindex，无索引价值；
    · microscope-3d/index.html     —— 独立原型，未被主站任何内链引用；
    · data/ *.json、archive/、tests/ —— 非 HTML 资源，不在 sitemap 协议范围。
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all}
</urlset>
`;
  fs.writeFileSync(SITEMAP_PATH, out);
  return { kept: curated.length, topics: topicUrls.length };
}

/* ── main ── */

function main() {
  const { topics, moduleLabels } = loadTopics();

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let written = 0;
  for (const t of topics) {
    const p = path.join(OUT_DIR, t.id + '.html');
    fs.writeFileSync(p, detailPage(t, topics));
    written++;
  }

  const hubPath = path.join(ROOT, 'topics.html');
  fs.writeFileSync(hubPath, hubPage(topics, moduleLabels));

  const sm = syncSitemap(topics);

  const totalQ = topics.reduce((s, t) => s + t.questions.length, 0);
  console.log(
    JSON.stringify(
      {
        detailPages: written,
        hub: path.relative(ROOT, hubPath),
        sitemap: { keptCurated: sm.kept, topicUrls: sm.topics },
        topics: topics.length,
        questions: totalQ,
      },
      null,
      2
    )
  );
  console.log('[ok] 题库主题静态页生成完成');
}

main();
