/**
 * @jest-environment jsdom
 *
 * M-05：AI Key 会话存储回归
 * jsdom 无 IndexedDB / 无 WebCrypto.subtle，覆盖降级路径与旧版迁移；
 * 同时静态断言加密实现存在（不可导出 AES-GCM + 密文槽）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function loadStore() {
  delete window.BioQuestKeyStore;
  // eslint-disable-next-line no-eval
  (0, eval)(read('js/ai/ai-key-store.js'));
  return window.BioQuestKeyStore;
}

describe('M-05 AI Key 会话存储', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  test('不支持 WebCrypto/IndexedDB 时降级为会话级明文，get 仍同步可用', () => {
    const store = loadStore();
    store.set('sk-test-123456', true);
    expect(sessionStorage.getItem('tatabox_ai_key_session')).toBe('sk-test-123456');
    expect(store.get()).toBe('sk-test-123456');
    expect(store.isRemember()).toBe(true);

    store.set('sk-test-123456', false);
    expect(sessionStorage.getItem('tatabox_ai_key_session')).toBeNull();
    expect(store.get()).toBe('sk-test-123456'); // 未勾选记住：仅保留内存

    store.set('', false);
    expect(store.get()).toBe('');
  });

  test('旧版 localStorage 明文 Key 搬入内存后立即擦除', () => {
    localStorage.setItem('tatabox_ai_key_config', JSON.stringify({
      provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-legacy-987654'
    }));
    const store = loadStore();
    expect(store.get()).toBe('sk-legacy-987654');
    const cfg = JSON.parse(localStorage.getItem('tatabox_ai_key_config'));
    expect(cfg.apiKey).toBe('');
    expect(localStorage.getItem('tatabox_ai_key_config')).not.toContain('sk-legacy');
  });

  test('clear 同时清理会话 Key 与记住偏好', () => {
    const store = loadStore();
    store.set('sk-test-123456', true);
    store.clear();
    expect(store.get()).toBe('');
    expect(sessionStorage.getItem('tatabox_ai_key_session')).toBeNull();
    expect(store.isRemember()).toBe(false);
  });

  test('whenReady 可用，且实现使用不可导出 AES-GCM + IndexedDB 密文槽', async () => {
    const store = loadStore();
    await expect(store.whenReady()).resolves.toBeUndefined();
    const src = read('js/ai/ai-key-store.js');
    expect(src).toMatch(/generateKey\(\{ name: 'AES-GCM', length: 256 \}, false,/);
    expect(src).toMatch(/indexedDB\.open\(_DB_NAME/);
    expect(src).toMatch(/tatabox_ai_key_session_v2/);
    expect(src).not.toMatch(/localStorage\.setItem\(.*apiKey/);
  });
});
