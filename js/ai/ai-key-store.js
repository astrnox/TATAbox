/**
 * ============================================================
 * TATABOX — AI API Key 安全存取单例
 * 【P1-3】消除明文 Key 直接暴露在 window 全局的问题
 * 【M-05】会话内记住改为 WebCrypto AES-GCM 封装（密钥不可导出）
 *
 * 设计要点：
 *  1. Key 仅存在于本模块的闭包内存中，不挂到 window 的普通可枚举属性；
 *  2. 对外仅暴露 get/set/clear/isRemember/whenReady 接口；
 *  3. 用户显式勾选「会话内记住」时：
 *     - 生成不可导出的 AES-GCM 密钥（extractable=false），持久化到 IndexedDB；
 *     - sessionStorage 只保存 `{v:2, iv, ct}` 密文，关闭标签页即清除；
 *     - 刷新后由 whenReady() 异步解密回内存，get() 保持同步语义；
 *  4. 降级：浏览器不支持 WebCrypto / IndexedDB 时退回会话级明文
 *     （与旧版行为一致，不阻断功能）；
 *  5. 兼容旧版：localStorage 残留明文 Key 搬入内存后立即擦除；
 *     旧版 sessionStorage 明文会在首次加载时自动升级为 v2 密文。
 *
 * 残余风险说明（评审需知）：
 *  纯前端应用无法真正向页面自身脚本隐藏 Key——同源脚本在任意时刻都能调用
 *  get() 或在 fetch 前读取。密文封装降低的是「静态存储被离线扫描」的风险，
 *  真正的密钥隔离仍须依赖后端代理（见 ai-client.js 的 server.py 透传模式）。
 * ============================================================
 */
(function () {
  'use strict';

  if (window.BioQuestKeyStore) return; // 幂等，避免重复装载覆盖

  var _key = '';                                          // 页面内存中的 Key
  var _cryptoKey = null;                                  // 不可导出 AES-GCM 密钥（内存缓存）
  var _SESSION_KEY = 'tatabox_ai_key_session';            // v1 明文槽（兼容 / 降级）
  var _SESSION_CIPHER = 'tatabox_ai_key_session_v2';      // v2 密文槽
  var _REMEMBER_FLAG = 'tatabox_ai_key_remember';         // 「会话内记住」偏好（非敏感）
  var _LEGACY_CFG = 'tatabox_ai_key_config';              // 旧版 localStorage 明文槽
  var _DB_NAME = 'tatabox-ai-key';
  var _DB_STORE = 'keys';
  var _DB_ITEM = 'session';

  var _readyResolve;
  var _readyPromise = new Promise(function (resolve) { _readyResolve = resolve; });

  function _isValid(k) {
    return typeof k === 'string' && k.length >= 8;
  }

  function _readPlainSession() {
    try { return sessionStorage.getItem(_SESSION_KEY) || ''; } catch (e) { return ''; }
  }

  function _readCipher() {
    try {
      var raw = sessionStorage.getItem(_SESSION_CIPHER);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function _writeCipher(payload) {
    try { sessionStorage.setItem(_SESSION_CIPHER, JSON.stringify(payload)); } catch (e) {}
  }

  function _removeSessionKeys() {
    try {
      sessionStorage.removeItem(_SESSION_KEY);
      sessionStorage.removeItem(_SESSION_CIPHER);
    } catch (e) {}
  }

  function _b64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function _unb64(str) {
    var bin = atob(str);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function _hasWebCrypto() {
    return !!(window.crypto && window.crypto.subtle && window.indexedDB);
  }

  // 旧版迁移：localStorage 残留明文 Key → 搬入内存并立即擦除
  function _migrateLegacy() {
    try {
      var raw = localStorage.getItem(_LEGACY_CFG);
      if (!raw) return '';
      var cfg = JSON.parse(raw);
      if (cfg && _isValid(cfg.apiKey)) {
        var k = cfg.apiKey;
        cfg.apiKey = '';
        localStorage.setItem(_LEGACY_CFG, JSON.stringify(cfg));
        return k;
      }
    } catch (e) { /* 损坏数据则忽略 */ }
    return '';
  }

  /* ---------------- IndexedDB：持久化不可导出 CryptoKey ---------------- */

  function _openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('indexeddb-unavailable')); return; }
      var req;
      try { req = window.indexedDB.open(_DB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        try { req.result.createObjectStore(_DB_STORE); } catch (e) {}
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('indexeddb-open-failed')); };
    });
  }

  function _idbGet(db) {
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction(_DB_STORE, 'readonly');
        var req = tx.objectStore(_DB_STORE).get(_DB_ITEM);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error || new Error('indexeddb-get-failed')); };
      } catch (e) { reject(e); }
    });
  }

  function _idbPut(db, value) {
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction(_DB_STORE, 'readwrite');
        tx.objectStore(_DB_STORE).put(value, _DB_ITEM);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error || new Error('indexeddb-put-failed')); };
      } catch (e) { reject(e); }
    });
  }

  function _getCryptoKey() {
    if (_cryptoKey) return Promise.resolve(_cryptoKey);
    return _openDb().then(function (db) {
      return _idbGet(db).then(function (existing) {
        if (existing) {
          db.close();
          _cryptoKey = existing;
          return existing;
        }
        return window.crypto.subtle
          .generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
          .then(function (k) {
            return _idbPut(db, k).then(function () {
              db.close();
              _cryptoKey = k;
              return k;
            });
          });
      });
    });
  }

  function _encrypt(plain) {
    return _getCryptoKey().then(function (ck) {
      var iv = new Uint8Array(12);
      window.crypto.getRandomValues(iv);
      return window.crypto.subtle
        .encrypt({ name: 'AES-GCM', iv: iv }, ck, new TextEncoder().encode(plain))
        .then(function (buf) {
          return { v: 2, iv: _b64(iv), ct: _b64(new Uint8Array(buf)) };
        });
    });
  }

  function _decrypt(payload) {
    return _getCryptoKey().then(function (ck) {
      return window.crypto.subtle
        .decrypt({ name: 'AES-GCM', iv: _unb64(payload.iv) }, ck, _unb64(payload.ct))
        .then(function (buf) { return new TextDecoder().decode(buf); });
    });
  }

  // 加密落盘；失败时调用方退回明文路径
  function _persistEncrypted(k) {
    return _encrypt(k).then(function (payload) {
      _writeCipher(payload);
      try { sessionStorage.removeItem(_SESSION_KEY); } catch (e) {}
      return true;
    });
  }

  function _fallbackPlain(k) {
    try {
      sessionStorage.setItem(_SESSION_KEY, k);
      sessionStorage.removeItem(_SESSION_CIPHER);
    } catch (e) { /* Safari 隐私模式等：仅保留内存 */ }
  }

  /* ---------------- 初始化：同步明文恢复 + 异步密文恢复 ---------------- */

  function _restoreSession() {
    var plain = _readPlainSession();
    if (_isValid(plain)) _key = plain;
    var cipher = _readCipher();

    if (!cipher && !_isValid(plain)) { _readyResolve(); return; }
    if (!_hasWebCrypto()) { _readyResolve(); return; }

    var task;
    if (_isValid(_key)) {
      // 旧明文/刚输入：升级为密文
      task = _persistEncrypted(_key);
    } else if (cipher && typeof cipher.ct === 'string' && typeof cipher.iv === 'string') {
      task = _decrypt(cipher).then(function (text) {
        if (_isValid(text)) _key = text;
        return true;
      });
    } else {
      _readyResolve();
      return;
    }

    task.catch(function (e) {
      console.warn('[AIKeyStore] 会话密钥恢复失败，已降级为未记住状态:', e);
      try { sessionStorage.removeItem(_SESSION_CIPHER); } catch (er) {}
    }).then(function () { _readyResolve(); });
  }

  var store = {
    get: function () {
      if (_key) return _key;                       // 优先内存
      var plain = _readPlainSession();             // 降级 / 首屏同步恢复
      if (_isValid(plain)) { _key = plain; return plain; }
      var legacy = _migrateLegacy();               // 旧版残量迁移
      if (legacy) { _key = legacy; return legacy; }
      return '';
    },
    set: function (k, remember) {
      _key = (typeof k === 'string') ? k : '';
      var r = !!remember;
      if (r && _key) {
        if (_hasWebCrypto()) {
          _persistEncrypted(_key).catch(function () { _fallbackPlain(_key); });
        } else {
          _fallbackPlain(_key);
        }
      } else {
        _removeSessionKeys();
      }
      try {
        if (r) localStorage.setItem(_REMEMBER_FLAG, '1');
        else localStorage.removeItem(_REMEMBER_FLAG);
      } catch (e) { /* 忽略偏好写入失败 */ }
    },
    clear: function () {
      _key = '';
      _removeSessionKeys();
      try { localStorage.removeItem(_REMEMBER_FLAG); } catch (e) {}
    },
    isRemember: function () {
      try { return localStorage.getItem(_REMEMBER_FLAG) === '1'; } catch (e) { return false; }
    },
    // 会话密钥异步恢复完成（供个人页在恢复后刷新展示）
    whenReady: function () { return _readyPromise; }
  };

  // 以「不可枚举」方式暴露，避免被 Object.keys(window) 等常规枚举直接发现
  try {
    Object.defineProperty(window, 'BioQuestKeyStore', { value: store, enumerable: false, configurable: true, writable: false });
  } catch (e) {
    window.BioQuestKeyStore = store;
  }

  _restoreSession();
})();
