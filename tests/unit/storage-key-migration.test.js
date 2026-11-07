/**
 * @jest-environment jsdom
 *
 * M-12：旧品牌存储键兼容迁移回归
 * 1) bioquest_* 旧键会被复制为 tatabox_*，旧键保留供旧页面使用；
 * 2) 新键已存在时不覆盖，避免旧数据回灌；
 * 3) 业务代码统一写新前缀，备份导出标识保持兼容。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('M-12 存储键兼容迁移', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  function loadUtils() {
    // eslint-disable-next-line no-eval
    (0, eval)(read('js/core/utils.js'));
  }

  test('旧 bioquest_* 键复制为 tatabox_*，且保留旧键', () => {
    localStorage.setItem('bioquest_settings', '{"theme":"dark"}');
    sessionStorage.setItem('bioquest_ai_key_session', 'sk-test');
    loadUtils();
    expect(localStorage.getItem('tatabox_settings')).toBe('{"theme":"dark"}');
    expect(localStorage.getItem('bioquest_settings')).toBe('{"theme":"dark"}');
    expect(sessionStorage.getItem('tatabox_ai_key_session')).toBe('sk-test');
  });

  test('新键已存在时不覆盖，避免旧数据回灌', () => {
    localStorage.setItem('bioquest_settings', 'old');
    localStorage.setItem('tatabox_settings', 'new');
    loadUtils();
    expect(localStorage.getItem('tatabox_settings')).toBe('new');
  });

  test('业务代码统一写新前缀，备份导出标识保持兼容', () => {
    const utils = read('js/core/utils.js');
    expect(utils).toMatch(/OLD_PREFIX = 'bioquest_'/);
    expect(utils).toMatch(/NEW_PREFIX = 'tatabox_'/);
    expect(read('js/core/storage.js')).toMatch(/STORAGE_PREFIX = 'tatabox_'/);
    expect(read('js/core/storage.js')).toMatch(/bioquest_full_backup/);
  });
});
