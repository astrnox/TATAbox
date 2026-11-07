/**
 * 备份加密回归：PBKDF2 密码派生 + 旧版 v2 兼容
 * -------------------------------------------------
 * 1) v3 备份必须使用用户密码派生密钥（PBKDF2-HMAC-SHA256）；
 * 2) 密码错误 / 缺失时拒绝解密；
 * 3) 历史 v2 备份（常量派生密钥）仍可无密码解密，避免旧备份失效。
 */
const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const STORAGE_SRC = fs.readFileSync(path.join(ROOT, 'js/core/storage.js'), 'utf8');

function makeLocalStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] || null; },
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); }
  };
}

function loadStorage() {
  const windowObj = { addEventListener() {} };
  const sessionStorage = {
    length: 0, key() { return null; }, getItem() { return null; },
    setItem() {}, removeItem() {}, clear() {}
  };
  const factory = new Function(
    'window', 'localStorage', 'sessionStorage', 'navigator', 'indexedDB', 'console', 'crypto',
    STORAGE_SRC + '\n;return { encryptBackup, decryptBackup, BACKUP_KDF_ITERATIONS, uint8ToBase64, base64ToUint8 };'
  );
  return factory(windowObj, makeLocalStorage(), sessionStorage, { onLine: true }, undefined, console, webcrypto);
}

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return Buffer.from(s, 'binary').toString('base64');
}

// 复刻历史 v2 备份：SHA-256(常量) → AES-GCM
async function makeLegacyBackup(plain) {
  const material = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode('bioquest_backup_key'));
  const key = await webcrypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const enc = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return { encrypted: true, iv: b64(iv), data: b64(new Uint8Array(enc)), version: '2.0.0' };
}

describe('备份加密（PBKDF2 + AES-GCM）', () => {
  jest.setTimeout(30000);

  test('v3 备份：密码派生密钥，round-trip 一致', async () => {
    const api = loadStorage();
    const plain = JSON.stringify({ version: '2.0.0', records: [{ id: 'a' }] });
    const backup = await api.encryptBackup(plain, 'correct horse battery');

    expect(backup.v).toBe(3);
    expect(backup.kdf).toBe('PBKDF2-SHA256');
    expect(backup.iterations).toBe(api.BACKUP_KDF_ITERATIONS);
    expect(backup.salt.length).toBeGreaterThan(0);
    expect(backup.data.length).toBeGreaterThan(0);
    // 明文不得出现在备份对象中
    expect(JSON.stringify(backup)).not.toContain('records');

    await expect(api.decryptBackup(backup, 'correct horse battery')).resolves.toBe(plain);
    await expect(api.decryptBackup(backup, 'wrong password')).rejects.toBeTruthy();
  });

  test('v3 备份缺少密码时拒绝解密', async () => {
    const api = loadStorage();
    const backup = await api.encryptBackup('{"a":1}', 'password123');
    await expect(api.decryptBackup(backup)).rejects.toThrow('PASSWORD_REQUIRED');
  });

  test('导出未提供密码时拒绝加密（不再回退常量密钥）', async () => {
    const api = loadStorage();
    await expect(api.encryptBackup('{"a":1}')).rejects.toThrow('PASSWORD_REQUIRED');
  });

  test('历史 v2 备份仍可无密码解密（兼容旧文件）', async () => {
    const api = loadStorage();
    const plain = '{"legacy":true}';
    const legacy = await makeLegacyBackup(plain);
    await expect(api.decryptBackup(legacy)).resolves.toBe(plain);
  });
});
