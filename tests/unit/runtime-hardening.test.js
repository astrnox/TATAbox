/**
 * M-05 / M-07 / M-09 / M-10 / M-13 静态回归测试
 * 断言安全与运行时加固不会被后续改动回退。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('M-05 HTML/SVG 清洗 fail-closed', () => {
  test('AI 渲染统一走 safeHtml，入口缺失时 fail-closed', () => {
    const js = read('js/integrations/ai-chat-enhanced.js');
    expect(js).toMatch(/window\.safeHtml/);
    expect(js).toMatch(/safeHtml 未加载，已降级为纯文本渲染/);
    expect(js).toMatch(/el\.textContent = buffer;/);
    expect(js).toMatch(/el\.textContent = markdown;/);
    expect(read('js/core/utils.js')).toMatch(/return escapeHtml\(s\);/);
  });

  test('Trusted Types 强制模式已启用', () => {
    const headers = read('_headers');
    expect(headers).toMatch(/Content-Security-Policy: require-trusted-types-for 'script'/);
    expect(headers).toMatch(/trusted-types dompurify default/);
    expect(headers).not.toMatch(/Content-Security-Policy-Report-Only/);
    const htaccess = read('.htaccess');
    expect(htaccess).toMatch(/require-trusted-types-for 'script'/);
    expect(htaccess).not.toMatch(/Content-Security-Policy-Report-Only/);
  });

  test('Mermaid SVG 在 DOMPurify 缺失时拒绝插入', () => {
    const js = read('js/integrations/diagram-renderer.js');
    expect(js).toMatch(/已跳过 SVG 渲染/);
    expect(js).toMatch(/return '';/);
    expect(js).not.toMatch(/svg\.replace\(\/<script/);
  });
});

describe('M-07 Service Worker 不缓存整段视频', () => {
  const sw = read('sw.js');

  test('video/audio 走网络直连，不进入 Cache Storage', () => {
    expect(sw).toMatch(/request\.destination === 'video'/);
    expect(sw).toMatch(/request\.destination === 'audio'/);
    expect(sw).toMatch(/event\.respondWith\(fetch\(request\)\)/);
  });
});

describe('M-09 边缘安全响应头', () => {
  const headers = read('_headers');

  test('HSTS / nosniff / frame / referrer / permissions 已下发', () => {
    expect(headers).toMatch(/Strict-Transport-Security: max-age=31536000/);
    expect(headers).toMatch(/X-Content-Type-Options: nosniff/);
    expect(headers).toMatch(/X-Frame-Options: DENY/);
    expect(headers).toMatch(/Referrer-Policy: strict-origin-when-cross-origin/);
    expect(headers).toMatch(/Permissions-Policy: camera=\(self\)/);
  });
});

describe('M-10 账号自助注销', () => {
  const sql = read('sql/migration_v21_account_self_delete.sql');

  test('RPC 删除 auth.users 并保护最后一名管理员', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.delete_my_account/);
    expect(sql).toMatch(/DELETE FROM auth\.users WHERE id = v_uid/);
    expect(sql).toMatch(/最后一名管理员不能自助注销/);
  });

  test('前端注销改走 delete_my_account RPC', () => {
    const js = read('js/core/supabase-client.js');
    expect(js).toMatch(/rpc\('delete_my_account'\)/);
    expect(js).not.toMatch(/from\('profiles'\)\.delete\(\)\.eq\('id', userId\)/);
  });
});

describe('M-13 倒计时与底部安全区', () => {
  test('倒计时日期文案由 TARGET_DATE 生成', () => {
    const js = read('js/engagement/countdown.js');
    expect(js).toMatch(/function syncDateLabel/);
    expect(js).toMatch(/date\.textContent = TARGET_DATE\.getFullYear/);
    expect(js).toMatch(/syncDateLabel\(\);/);
  });

  test('主内容底部留出安全区', () => {
    const css = read('css/globals.css');
    expect(css).toMatch(/#page-content \{[\s\S]*?padding-bottom: calc\(84px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  });
});
