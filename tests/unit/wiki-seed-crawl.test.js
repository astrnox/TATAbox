/**
 * wiki-seed.json 全量抓取质量回归（wiki_crawler.py v2 · 2026-10-20 首批 30 关键词）
 * ---------------------------------------------------------------
 * 背景：旧抓取走 prop=extracts 纯文本，图片/表格全丢；v2 改为
 * extracts+wikitext 组合抓取，并修复 Commons SVG 缩略图 .png 后缀
 * （缺后缀 404 → 用户看到“图片和图表没抓”）。
 * 本测试锁住首批 30 个关键词（细胞生物学块）的抓取产物质量。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wiki-seed.json'), 'utf8'));
const crawlerSrc = fs.readFileSync(path.join(ROOT, 'tools/python/wiki_crawler.py'), 'utf8');

// 解析 TERMS 列表前 30 条（教材词条名）
const termsBlock = crawlerSrc.slice(crawlerSrc.indexOf('TERMS = ['), crawlerSrc.indexOf('ZH_TITLE_FALLBACKS'));
const terms30 = Array.from(termsBlock.matchAll(/\("([^"]+)",\s*"([^"]+)"/g)).slice(0, 30).map((m) => ({ title: m[1], category: m[2] }));

const byTitle = new Map(seed.entries.map((e) => [e.title, e]));
const imgRe = /!\[[^\]]*\]\((https:\/\/upload\.wikimedia\.org[^)]+)\)/g;

function imagesOf(entry) {
  return Array.from((entry.content || '').matchAll(imgRe)).map((m) => m[1]);
}

describe('wiki-seed 首批 30 关键词抓取产物', () => {
  test('30 条教材词条全部存在且来源为维基', () => {
    expect(terms30).toHaveLength(30);
    for (const t of terms30) {
      const e = byTitle.get(t.title);
      expect(e).toBeTruthy();                       // 缺失 -> 报词条名
      expect(e.source).toBe('wikipedia');
      expect(e.sourceUrl).toMatch(/^https:\/\/zh\.wikipedia\.org\//);
      expect(e.category).toBe(t.category);
      expect(e.content.length).toBeGreaterThanOrEqual(350);   // 最短实测 388 字（源页面较短）
      expect(e.summary.length).toBeGreaterThan(0);
    }
  });

  test('图片：≥22/30 含真实配图，累计 ≥80 张（旧版为 0）', () => {
    let withImg = 0;
    let total = 0;
    for (const t of terms30) {
      const imgs = imagesOf(byTitle.get(t.title));
      total += imgs.length;
      if (imgs.length > 0) withImg += 1;
    }
    expect(withImg).toBeGreaterThanOrEqual(22);      // 实测 24/30
    expect(total).toBeGreaterThanOrEqual(80);        // 实测 99
  });

  test('SVG 缩略图全部带 .png 后缀（Commons 约定，否则 404）', () => {
    const svgThumbs = [];
    for (const t of terms30) {
      for (const u of imagesOf(byTitle.get(t.title))) {
        if (/\.svg(\?|$)/i.test(u.split('/').pop().split('?')[0]) || u.includes('.svg/')) svgThumbs.push(u);
        if (u.includes('.svg.png')) svgThumbs.push(u);
      }
    }
    // 至少存在带 .svg.png 的修复实例（实测 27），且不存在裸 .svg 直链结尾的缩略图
    expect(svgThumbs.length).toBeGreaterThanOrEqual(10);
    for (const t of terms30) {
      for (const u of imagesOf(byTitle.get(t.title))) {
        const file = decodeURIComponent(u.split('/').pop());
        const isBareSvg = /\.svg$/i.test(file);
        expect(isBareSvg).toBe(false);               // 裸 .svg 结尾 = 404 链接
      }
    }
  });

  test('表格：wikitext {|…|} 已转 Markdown 表格（≥5 个词条含 | --- 分隔行）', () => {
    let tabled = 0;
    for (const t of terms30) {
      if ((byTitle.get(t.title).content || '').includes('| ---')) tabled += 1;
    }
    expect(tabled).toBeGreaterThanOrEqual(5);        // 实测 21 块
  });

  test('标题回退映射：教材名在维基无独立条目时内容来自正确页面', () => {
    // 细胞自噬 → 自噬；细胞核仁 → 核仁（sourceUrl 不含原教材名也能对上）
    const zi = byTitle.get('细胞自噬');
    expect(zi.sourceUrl).toContain('%E8%87%AA%E5%99%AC');     // 自噬
    const ren = byTitle.get('细胞核仁');
    expect(ren.sourceUrl).toContain('%E6%A0%B8%E4%BB%81');    // 核仁
  });

  test('种子文件整体：id 唯一、结构字段齐全、版本日期已更新', () => {
    const ids = seed.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of seed.entries) {
      for (const f of ['id', 'title', 'summary', 'content', 'category', 'tags', 'source', 'sourceUrl']) {
        expect(Object.prototype.hasOwnProperty.call(e, f)).toBe(true);
      }
    }
    // 首批 30（2026-10-20）之后类目分层抓取持续追加，只锁下限
    expect(seed.entries.length).toBeGreaterThanOrEqual(41);
    expect(seed.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
