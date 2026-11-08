/**
 * @jest-environment jsdom
 *
 * M-05：统一 safeHtml / setSafeHtml 清洗入口
 * -------------------------------------------------
 * 1) DOMPurify 可用时委托 sanitize；
 * 2) DOMPurify 缺失或 sanitize 抛错时 fail-closed 全量转义；
 * 3) setSafeHtml 不产生可执行节点；
 * 4) 暴露到 window 与 BioQuest 命名空间。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const utilsSrc = fs.readFileSync(path.join(ROOT, 'js/core/utils.js'), 'utf8');

beforeAll(() => {
  (0, eval)(utilsSrc); // eslint-disable-line no-eval
});

afterEach(() => {
  delete window.DOMPurify;
  document.body.innerHTML = '';
});

test('DOMPurify 可用时委托 sanitize', () => {
  window.DOMPurify = {
    sanitize: (s) => String(s).replace(/<script[\s\S]*?<\/script>/gi, '')
  };
  expect(window.safeHtml('<b>ok</b><script>alert(1)</script>')).toBe('<b>ok</b>');
});

test('DOMPurify 缺失时 fail-closed，全量转义', () => {
  const out = window.safeHtml('<img src=x onerror=alert(1)>');
  expect(out).toContain('&lt;img');
  expect(out).toContain('onerror');
  expect(out).not.toContain('<img');
});

test('DOMPurify.sanitize 抛错时同样 fail-closed', () => {
  window.DOMPurify = { sanitize: () => { throw new Error('boom'); } };
  const out = window.safeHtml('<svg onload=alert(1)></svg>');
  expect(out).not.toContain('<svg');
  expect(out).toContain('&lt;svg');
});

test('setSafeHtml 写入转义文本，不产生可执行节点', () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  expect(window.setSafeHtml(el, '<img src=x onerror=alert(1)>')).toBe(true);
  expect(el.querySelector('img')).toBeNull();
  expect(el.textContent).toContain('<img');
  expect(window.setSafeHtml(null, '<b>x</b>')).toBe(false);
});

test('暴露到 window 与 BioQuest 命名空间', () => {
  expect(window.BioQuest.safeHtml).toBe(window.safeHtml);
  expect(window.BioQuest.setSafeHtml).toBe(window.setSafeHtml);
});
