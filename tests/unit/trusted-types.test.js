/**
 * @jest-environment jsdom
 *
 * M-05：Trusted Types 默认策略
 * -------------------------------------------------
 * 1) 默认策略的 createHTML 必须走 safeHtml（DOMPurify 优先、缺失转义）；
 * 2) createScript / createScriptURL 必须 fail-closed；
 * 3) index / SW / 响应头均接入该策略。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let policy = null;

beforeAll(() => {
  (0, eval)(read('js/core/utils.js')); // eslint-disable-line no-eval
  window.trustedTypes = {
    createPolicy: (name, rules) => {
      policy = rules;
      return rules;
    }
  };
  (0, eval)(read('js/core/trusted-types.js')); // eslint-disable-line no-eval
});

afterAll(() => {
  delete window.trustedTypes;
});

test('默认策略 createHTML 走 safeHtml（DOMPurify 消毒）', () => {
  window.DOMPurify = { sanitize: (s) => String(s).replace(/<script[\s\S]*?<\/script>/gi, '') };
  const out = policy.createHTML('<b>ok</b><script>alert(1)</script>');
  expect(out).toBe('<b>ok</b>');
  delete window.DOMPurify;
});

test('DOMPurify 缺失时默认策略 fail-closed', () => {
  delete window.DOMPurify;
  const out = policy.createHTML('<img src=x onerror=alert(1)>');
  expect(out).not.toContain('<img');
  expect(out).toContain('&lt;img');
});

test('createScriptURL 放行正常脚本、拒绝伪协议', () => {
  expect(policy.createScriptURL('/js/core/app.js')).toBe('/js/core/app.js');
  expect(policy.createScriptURL('https://cdn.jsdelivr.net/x.js')).toBe('https://cdn.jsdelivr.net/x.js');
  expect(() => policy.createScriptURL('javascript:alert(1)')).toThrow();
  expect(() => policy.createScriptURL('data:text/javascript,alert(1)')).toThrow();
});

test('createScript 直接抛错', () => {
  expect(() => policy.createScript('alert(1)')).toThrow();
});

test('index / SW / 响应头均已接入', () => {
  const html = read('index.html');
  expect(html.indexOf('js/core/utils.js')).toBeLessThan(html.indexOf('js/core/trusted-types.js'));
  expect(read('sw.js')).toContain("'./js/core/trusted-types.js'");
  expect(read('_headers')).toContain('trusted-types dompurify default');
});
