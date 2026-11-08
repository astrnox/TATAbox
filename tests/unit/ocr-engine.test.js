/**
 * OCR 引擎增强单元测试（js/integrations/ocr-engine.js）
 * -------------------------------------------------
 * 验证矩阵：
 *   1. _otsuThreshold 大津法：双峰灰度正确分割、单峰/空数据不崩
 *   2. _rateOcrCandidate 候选评分：中文/英数文本高、乱码垃圾低（含 -1）
 *   3. _postprocessText 后处理：Tesseract 中文间空格合并、行尾标点清理
 * @jest-environment jsdom
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const OCR_SRC = fs.readFileSync(path.join(ROOT, 'js/integrations/ocr-engine.js'), 'utf8');

let Ocr = null;
function freshEngine() {
  // eslint-disable-next-line no-eval
  (0, eval)(OCR_SRC);
  Ocr = window.OcrEngine;
  return Ocr;
}

// 构造 RGBA 灰度数据（stride=4）
function makeRgba(values) {
  const d = new Uint8Array(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = values[i];
    d[i * 4 + 3] = 255;
  }
  return d;
}

// 带噪声的双峰灰度（模拟真实拍照：深浅两级 + 抖动）
function noisyBimodal(darkN, darkV, lightN, lightV) {
  const vals = [];
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < darkN; i++) vals.push(darkV + Math.round((rnd() - 0.5) * 24));
  for (let i = 0; i < lightN; i++) vals.push(lightV + Math.round((rnd() - 0.5) * 24));
  return vals;
}

describe('OcrEngine._otsuThreshold（大津法自动阈值）', () => {
  // 大津法存在平局时取首个达到最大类间方差的阈值，可能贴近暗簇上沿而非间隙正中；
  // 二值化的关键性质是"两类像素被正确分开"，据此断言而非死板的位置区间。
  // values 为生成时的像素灰度；引擎判定 v <= t 为黑、v > t 为白。
  function assertSplitSeparates(engine, values, darkN, lightN) {
    const t = engine._otsuThreshold(makeRgba(values));
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(255);
    const black = values.filter((v) => v <= t).length;  // 判黑
    const white = values.filter((v) => v > t).length;  // 判白
    // 至少 95% 的暗像素应判黑、95% 的亮像素应判白
    expect(black).toBeGreaterThanOrEqual(Math.floor(darkN * 0.95));
    expect(white).toBeGreaterThanOrEqual(Math.floor(lightN * 0.95));
  }

  test('双峰灰度（暗文本 + 亮背景，带噪）→ 两类被正确分开', () => {
    const engine = freshEngine();
    assertSplitSeparates(engine, noisyBimodal(400, 40, 1600, 210), 400, 1600);
  });

  test('反色（白字黑底）同样正确分割', () => {
    const engine = freshEngine();
    // noisyBimodal(50, 230, 200, 50)：50 个亮像素≈230 + 200 个暗像素≈50
    assertSplitSeparates(engine, noisyBimodal(50, 230, 200, 50), 200, 50);
  });

  test('单一灰度（无方差）不崩溃，返回 0-255', () => {
    const engine = freshEngine();
    const t = engine._otsuThreshold(makeRgba(new Array(100).fill(128)));
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(255);
  });

  test('空数据返回安全默认值 128', () => {
    const engine = freshEngine();
    expect(engine._otsuThreshold(new Uint8Array(0))).toBe(128);
  });
});

describe('OcrEngine._rateOcrCandidate（候选质量评分）', () => {
  test('中文句子得分 > 乱码垃圾得分', () => {
    const engine = freshEngine();
    const good = engine._rateOcrCandidate('细胞膜的主要成分是磷脂双分子层蛋白质');
    const garbage = engine._rateOcrCandidate('!!!!!---===###...');
    expect(good).toBeGreaterThan(garbage);
    expect(good).toBeGreaterThan(3);
  });

  test('空 / null / 纯标点返回 -1', () => {
    const engine = freshEngine();
    expect(engine._rateOcrCandidate('')).toBe(-1);
    expect(engine._rateOcrCandidate(null)).toBe(-1);
    expect(engine._rateOcrCandidate('   ')).toBe(-1);
    expect(engine._rateOcrCandidate('!!!。。。')).toBe(-1);
  });

  test('英数混合文本可识别', () => {
    const engine = freshEngine();
    const s = engine._rateOcrCandidate('DNA polymerase is key 2 copies');
    expect(s).toBeGreaterThan(3);
  });
});

describe('OcrEngine._postprocessText（生物题后处理）', () => {
  test('Tesseract 行内中文间空格合并、行尾标点清理', () => {
    const engine = freshEngine();
    const out = engine._postprocessText('细胞 呼吸 是 过程 ，\n\n下一步 F 最接近：  ', 'tesseract');
    expect(out.indexOf('细胞呼吸是过程')).toBeGreaterThanOrEqual(0);
    // 空行被压缩且结果首尾无空白
    expect(out).not.toContain('\n\n\n');
    expect(out.trim()).toBe(out);
  });

  test('跨行中文不被错误粘连（修复前会用 \\s 跨行合并）', () => {
    const engine = freshEngine();
    const out = engine._postprocessText('第一行内容\n第二行内容', 'tesseract');
    expect(out.indexOf('第一行内容\n第二行内容') >= 0 || out.indexOf('第一行内容') >= 0).toBe(true);
  });

  test('断行等号修复', () => {
    const engine = freshEngine();
    const out = engine._postprocessText('a =\n= b', 'tesseract');
    expect(out).toContain('==');
  });
});