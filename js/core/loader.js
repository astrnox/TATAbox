/**
 * TATABOX — 智能题库加载器
 * 特性：IndexedDB 缓存、模块级按需加载、流式进度回调、断点续传
 */
'use strict';

var _questionCache = {};
var _loadingPromises = {};
var _dbReady = null;
var _abortControllers = {};

/**
 * 对 PostgREST 过滤值进行 URL 编码（G-04）
 * PostgREST 约定 column=operator.value，value 部分需 encodeURIComponent，
 * 避免含特殊字符（如空格、&、#、中文）破坏 URL 解析或注入额外查询参数。
 * @param {string} v - 待编码的过滤值
 * @returns {string} 编码后的安全字符串
 */
function _pgEncode(v) {
  return encodeURIComponent(String(v == null ? '' : v));
}

/**
 * 从本地 JSON 数据中提取题目数组，兼容三种格式：
 *  1) 纯数组 [...]（quiz_m*.json 采用此格式）
 *  2) { 题库: [...] } 或 { questions: [...] }（旧版 quiz.json）
 *  3) { data: [...] }（部分 server 生成格式）
 */
function _extractQuestions(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.题库)) return data.题库;
  if (Array.isArray(data.questions)) return data.questions;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

/* ============================================================
 * IndexedDB 持久化缓存
 * ============================================================ */

function _openDB() {
  if (_dbReady) return _dbReady;
  if (!window.indexedDB) {
    _dbReady = Promise.resolve(null);
    return _dbReady;
  }
  _dbReady = new Promise(function (resolve) {
    var req = indexedDB.open('BioQuestCache', 4);
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('modules')) {
        var store = db.createObjectStore('modules', { keyPath: 'key' });
        store.createIndex('updated', 'updated', { unique: false });
      }
      // Issue #10：分片题库缓存（key=tag，存原始 JSON 文本 + manifest SHA-256）
      if (!db.objectStoreNames.contains('shards')) {
        var shardStore = db.createObjectStore('shards', { keyPath: 'key' });
        shardStore.createIndex('updated', 'updated', { unique: false });
      }
      // Issue #12：索引分片缓存（key=tag，存原始 JSON 文本 + SHA-256，用于启动仅加载索引）
      if (!db.objectStoreNames.contains('indexShards')) {
        var idxStore = db.createObjectStore('indexShards', { keyPath: 'key' });
        idxStore.createIndex('updated', 'updated', { unique: false });
      }
      // Issue #12：解析后的题目表（bioID 主键 + [tag+diff] 复合索引），支持 bulkGet/bulkPut 按需命中
      if (!db.objectStoreNames.contains('questions')) {
        var qStore = db.createObjectStore('questions', { keyPath: 'bioId' });
        qStore.createIndex('tagDiff', ['_shardTag', 'difficulty'], { unique: false });
        qStore.createIndex('updated', 'updated', { unique: false });
      }
    };
    req.onsuccess = function (e) { resolve(e.target.result); };
    req.onerror = function () { resolve(null); };
  });
  return _dbReady;
}

var MODULE_CACHE_TTL = 30 * 60 * 1000; // 缓存有效期 30 分钟
var ALL_CACHE_TTL = 30 * 60 * 1000;
var MIN_VALID_CACHE_SIZE = 50; // 缓存少于 50 题视为无效
// R-01：REST 请求相关命名常量（替代魔法数字）
var REST_PAGE_SIZE = 500;              // 单页拉取题量
var REST_TIMEOUT_FULL = 30 * 1000;     // 整库分页加载超时（30s）
var REST_TIMEOUT_BATCH = 20 * 1000;    // 按需批量加载超时（20s）
var REST_TIMEOUT_FULL_FAST = 3 * 1000; // 首屏快速模式：Supabase 超短超时，3s 内没回来就立刻放弃走本地
var BATCH_OVERFETCH_FACTOR = 3;        // 批量拉取时为覆盖筛选损耗而放大的倍数
var RANDOM_OFFSET_MAX = 100;           // 随机偏移上限，用于分散取样起点
/**
 * 加载模式：
 *  - 'balanced'（默认）：先本地 JSON 秒出首屏 → 后台异步同步 Supabase 刷新缓存
 *  - 'preferLocal'：严格只走本地缓存，不触发任何远程请求（模考/练习首屏场景）
 *  - 'preferRemote'：先尝试 Supabase，超时再走本地 JSON（日常缓存刷新场景）
 */
var LOAD_MODE = {
  BALANCED: 'balanced',
  PREFER_LOCAL: 'preferLocal',
  PREFER_REMOTE: 'preferRemote'
};

function _loadFromDB(moduleKey) {
  return _openDB().then(function (db) {
    if (!db) return null;
    return new Promise(function (resolve) {
      var tx = db.transaction('modules', 'readonly');
      var store = tx.objectStore('modules');
      var req = store.get(moduleKey);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { resolve(null); };
    });
  });
}

function _saveToDB(moduleKey, data) {
  return _openDB().then(function (db) {
    if (!db) return;
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction('modules', 'readwrite');
        var store = tx.objectStore('modules');
        store.put({ key: moduleKey, data: data, updated: Date.now() });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
        tx.onabort = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  });
}

function _isCacheRecordValid(record, ttl) {
  if (!record || !Array.isArray(record.data)) return false;
  if (record.data.length < MIN_VALID_CACHE_SIZE) return false;
  var age = Date.now() - (record.updated || 0);
  return age >= 0 && age < ttl;
}

function _hasCached(moduleKey) {
  return _questionCache[moduleKey] !== undefined;
}

function _getCached(moduleKey) {
  return _questionCache[moduleKey] || null;
}

function _setCached(moduleKey, data) {
  _questionCache[moduleKey] = data;
}

/* ============================================================
 * 中止加载
 * ============================================================ */

function abortLoading(moduleKey) {
  if (_abortControllers[moduleKey]) {
    _abortControllers[moduleKey].abort();
    delete _abortControllers[moduleKey];
  }
}

function abortAllLoading() {
  for (var key in _abortControllers) {
    if (_abortControllers.hasOwnProperty(key)) {
      _abortControllers[key].abort();
    }
  }
  _abortControllers = {};
  _loadingPromises = {};
}

/* ============================================================
 * 核心加载函数
 * ============================================================ */

/**
 * P0-4: 题库防御性过滤 — 排除被隔离的污染题目
 * 隔离标志：
 *   - _needs_review: true  （quiz_auto_generated.json 选项污染）
 *   - _unverified: true    （crawled_competition.json 无答案/无解析）
 *   - _quarantined: true   （通用隔离标志）
 * 即使这些数据被误并入题库或通过 Supabase 同步，本函数也能确保它们不会展示给用户
 * @param {Array} items - 原始题目数组
 * @returns {Array} 过滤后的题目数组
 */
function _filterQuarantinedQuestions(items) {
  if (!Array.isArray(items)) return [];
  var removed = 0;
  var result = [];
  for (var i = 0; i < items.length; i++) {
    var q = items[i];
    if (!q || typeof q !== 'object') { removed++; continue; }
    if (q._needs_review === true) { removed++; continue; }
    if (q._unverified === true) { removed++; continue; }
    if (q._quarantined === true) { removed++; continue; }
    result.push(q);
  }
  if (removed > 0) {

  }
  return result;
}

// 暴露到全局，供 practice.js / quiz.js / exam.js 共用
window._filterQuarantinedQuestions = _filterQuarantinedQuestions;

/* ============================================================
 * 分片题库（Issue #10：manifest + index + bank 三层架构）
 *  - data/manifest.json        版本 + 各分片 SHA-256（完整性校验）
 *  - data/bioid-map.json       oldId -> bioID 迁移映射表
 *  - data/bank/<tag>.json      完整题目内容（按需加载）
 * 每道题统一附带稳定 bioID（q.id / q.bioId），替代前端 hash 生成的临时 ID。
 * 加载策略：内存缓存 → IndexedDB 分片缓存（SHA 一致复用）→ 拉取并校验落缓存
 * ============================================================ */

var _shardManifest = null;  // data/manifest.json
var _manifestRev = null;    // manifest 版本标识（rev/updated_at），用于启动时判断题库是否更新
var _bioidMap = null;       // data/bioid-map.json  oldId -> bioID
var _shardMemCache = {};    // tag -> { json: string, sha: string }（本会话内存缓存）
var _shardStoreReady = null;
var _maintenanceRunning = null; // Issue #11：启动后台维护单例

/* ============================================================
 * Issue #15：题库分发 jsDelivr CDN 主通道
 *  - manifest（版本真源）始终走同源 + 缓存破坏，保证新鲜；
 *  - 重资源（bank/index/bioid-map）走版本化 CDN URL：
 *      https://cdn.jsdelivr.net/gh/<repo>@<git-sha>/data/...
 *    commit 锚定 URL 天然长缓存，manifest.rev/git 变化即整体换 URL；
 *  - 三级回退：CDN → 同源直连 → IndexedDB 离线缓存；
 *  - SHA-256 与 manifest 不符（CDN 陈旧/fork 数据不一致）视为未命中，
 *    自动降级同源；连续网络失败达到阈值后会话级禁用 CDN（国内不可达场景）。
 * ============================================================ */

var _cdnBase = null;          // https://cdn.jsdelivr.net/gh/<repo>@<sha>（manifest 加载后解析）
var _cdnFailCount = 0;        // 连续网络失败计数
var _cdnDisabled = false;     // 会话级 kill-switch
var CDN_FETCH_TIMEOUT = 8000; // CDN 单请求超时
var CDN_MAX_FAILURES = 3;     // 连续失败阈值，达到后本会话禁用 CDN
var CDN_BASE_TEMPLATE = 'https://cdn.jsdelivr.net/gh/';

/**
 * 从 manifest 解析 CDN 基址（git 锚点 + repo slug 均合法才启用）。
 * @param {Object} mf - data/manifest.json
 * @returns {string|null}
 */
function _resolveCdnBase(mf) {
  if (!mf || !mf.git || !mf.repo) return null;
  var sha = String(mf.git);
  var repo = String(mf.repo);
  // 安全校验：仅接受 40/7-40 位十六进制 commit 与 owner/repo slug，防注入
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return null;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return CDN_BASE_TEMPLATE + repo + '@' + sha;
}

/**
 * 带超时的 fetch（CDN/网络请求统一走这里，避免不可达时长时间挂起）。
 * @returns {Promise<Response>}
 */
function _fetchWithTimeout(url, timeoutMs, signal) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 8000);
  // 外部 signal 联动（调用方 abort 时同步取消内部请求）
  if (signal) {
    if (signal.aborted) { clearTimeout(timer); return Promise.reject(new DOMException('Aborted', 'AbortError')); }
    signal.addEventListener('abort', function () { controller.abort(); }, { once: true });
  }
  return fetch(url, { signal: controller.signal }).then(function (r) {
    clearTimeout(timer);
    return r;
  }, function (err) {
    clearTimeout(timer);
    throw err;
  });
}

/**
 * Issue #15：题库重资源统一取数通道。
 * 站点已部署在 Cloudflare Workers Assets（全球边缘缓存），同源即最优通道，
 * 因此策略为「同源（Cloudflare）优先 → SHA 校验 → jsDelivr 兜底」。
 * @param {string} path 相对路径，如 'data/bank/cell_structure.json'
 * @param {string|null} expectedSha manifest 期望的 SHA-256（可空）
 * @param {AbortSignal|null} signal
 * @returns {Promise<{text:string, via:string}>} via: 'origin' | 'cdn'
 */
function _fetchShardText(path, expectedSha, signal) {
  function fromOrigin() {
    return _fetchWithTimeout(path, 15000, signal).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + path);
      return r.text();
    }).then(function (text) {
      return { text: text, via: 'origin' };
    });
  }

  function fromCdn() {
    return _fetchWithTimeout(_cdnBase + '/' + path, CDN_FETCH_TIMEOUT, signal).then(function (r) {
      if (!r.ok) throw new Error('CDN HTTP ' + r.status + ': ' + path);
      return r.text();
    }).then(function (text) {
      _cdnFailCount = 0; // 成功即重置连续失败计数
      return { text: text, via: 'cdn' };
    }).catch(function (err) {
      // 调用方主动中止：不计数、不降级（上层自有中止逻辑）
      if (err && (err.name === 'AbortError') && signal && signal.aborted) {
        throw err;
      }
      // CDN 不可达/超时：计数 + 触发本会话禁用
      _cdnFailCount++;
      if (_cdnFailCount >= CDN_MAX_FAILURES) {
        _cdnDisabled = true;
        console.warn('[Loader] jsDelivr 连续 ' + _cdnFailCount + ' 次不可达，本会话禁用 CDN（同源直连）');
      }
      throw err;
    });
  }

  // 校验分片与 manifest 版本一致；不一致视为未命中，交给下一通道
  function checkSha(res) {
    if (!expectedSha) return Promise.resolve(res);
    return _sha256Hex(res.text).then(function (actual) {
      if (actual && actual !== expectedSha) {
        console.warn('[Loader] 分片陈旧（' + path + '），降级下一通道');
        return null;
      }
      return res;
    });
  }

  // 本地开发（file://）或非 http(s) 页面环境无法走 CDN
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return fromOrigin();
  // 页面本身就部署在 jsDelivr 上时（预览场景），无需再绕 CDN
  if (location.hostname === 'cdn.jsdelivr.net') return fromOrigin();

  // 同源（Cloudflare 边缘）优先；jsDelivr 兜底
  return fromOrigin()
    .then(checkSha)
    .then(function (res) {
      if (res) return res;
      // 同源分片陈旧 → jsDelivr 兜底
      if (!_cdnBase || _cdnDisabled) throw new Error('STALE_ORIGIN');
      return fromCdn().then(checkSha).then(function (res2) {
        if (res2) return res2;
        throw new Error('STALE_CDN');
      });
    })
    .catch(function (err) {
      // 调用方主动中止：不降级
      if (err && (err.name === 'AbortError') && signal && signal.aborted) {
        throw err;
      }
      // 同源网络失败（非陈旧）且 CDN 可用 → CDN 兜底
      if (err && err.message !== 'STALE_ORIGIN' && err.message !== 'STALE_CDN' && _cdnBase && !_cdnDisabled) {
        return fromCdn().then(checkSha).then(function (res) {
          if (res) return res;
          throw new Error('STALE_CDN');
        });
      }
      throw err;
    });
}

// 分片归属映射：新题库 tag 前缀 -> 旧前端 module 标识
var TAG_TO_MODULE = { m1: 'module_1', m2: 'module_2', m3: 'module_3', m4: 'module_4' };
var MODULE_TO_TAG = { 1: 'm1', 2: 'm2', 3: 'm3', 4: 'm4' };
// 「全量」场景按生成器 SOURCES 优先级加载全部分片（回退默认集）
var ALL_SHARD_TAGS = ['m1', 'm2', 'm3', 'm4', 'pool', 'logic', 'comp', 'qdb'];

/**
 * 按模块解析考点 tag 列表（以 manifest.modules 为准，数据真源）。
 * manifest.modules = { module1: [tag...], module2: [...], ... }（Issue #10 考点分片）。
 * 兼容旧 manifest（module -> 单 tag 字符串 / 缺省时回退 MODULE_TO_TAG）。
 */
function _moduleToTags(mf, moduleNum) {
  var key = 'module' + moduleNum;
  if (mf && mf.modules) {
    var list = mf.modules[key];
    if (Array.isArray(list) && list.length > 0) return list;
    if (typeof list === 'string') return [list];
  }
  var legacy = MODULE_TO_TAG[moduleNum];
  return legacy ? [legacy] : [];
}

function _loadManifest(signal) {
  if (_shardManifest) return Promise.resolve(_shardManifest);
  return _fetchJSON('data/manifest.json', signal).then(function (mf) {
    _shardManifest = (mf && mf.files) ? mf : null;
    if (_shardManifest) {
      _manifestRev = mf.rev || mf.updated_at || null;
      _applyManifestSideEffects(mf);
    }
    return _shardManifest;
  }).catch(function () {
    _shardManifest = null;
    return null;
  });
}

/**
 * manifest 就绪后的副作用：解析 CDN 基址（Issue #15）+ 持久化版本号（Issue #16）。
 */
function _applyManifestSideEffects(mf) {
  var base = _resolveCdnBase(mf);
  // 基址变化时重置会话失败计数，允许新版本重新尝试 CDN
  if (base && base !== _cdnBase) { _cdnFailCount = 0; }
  _cdnBase = base;
  if (_manifestRev) {
    try { localStorage.setItem('bq_manifest_rev', String(_manifestRev)); } catch (e) {}
  }
}

/**
 * Issue #11：强制从网络拉取最新 manifest（带缓存破坏参数 + 短超时）。
 * 用于启动时判断题库是否有更新；失败（离线/超时/网络波动）静默返回 null，
 * 上层保持旧缓存，保证离线可用。
 * @returns {Promise<{manifest:Object, changed:boolean}|null>}
 */
function _loadManifestFresh(timeoutMs) {
  var url = 'data/manifest.json?v=' + Date.now();
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 5000);
  return fetch(url, { signal: controller.signal }).then(function (r) {
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (mf) {
    if (mf && mf.files) {
      var changed = !_shardManifest || (_manifestRev !== (mf.rev || mf.updated_at));
      _shardManifest = mf;
      _manifestRev = mf.rev || mf.updated_at || null;
      _applyManifestSideEffects(mf);
      return { manifest: mf, changed: changed };
    }
    return null;
  }).catch(function () {
    clearTimeout(timer);
    return null;
  });
}

function _loadBioIdMap(signal) {
  if (_bioidMap) return Promise.resolve(_bioidMap);
  // 数据体系重构（#150）后 bioid-map.json 已从 manifest.files 移除。
  // 未注册时不再发起请求，直接使用空映射表——既避免每次题库加载产生 404 噪声，
  // 也避免 E2E 的"本机静态资源无 4xx/5xx"检查拦截。
  var expected = (_shardManifest && _shardManifest.files && _shardManifest.files['bioid-map.json']) || null;
  if (!expected) {
    _bioidMap = {};
    window.bioIdMap = _bioidMap;
    return Promise.resolve(_bioidMap);
  }
  return _fetchShardText('data/bioid-map.json', expected, signal).then(function (res) {
    return JSON.parse(res.text);
  }).then(function (map) {
    _bioidMap = map || {};
    window.bioIdMap = _bioidMap;
    // 数据就绪后，把旧 hash/数字 ID 引用的错题/收藏/记录迁移到 bioID
    if (typeof window.migrateLocalDataToBioId === 'function') {
      try { window.migrateLocalDataToBioId(); } catch (e) {}
    }
    return _bioidMap;
  }).catch(function () {
    _bioidMap = {};
    window.bioIdMap = _bioidMap;
    return _bioidMap;
  });
}

function _openShardStore() {
  if (_shardStoreReady) return _shardStoreReady;
  _shardStoreReady = _openDB().then(function (db) {
    if (!db) return null;
    return db.objectStoreNames.contains('shards') ? db : null;
  });
  return _shardStoreReady;
}

function _loadShardFromDB(tag) {
  return _openShardStore().then(function (db) {
    if (!db) return null;
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction('shards', 'readonly');
        var req = tx.objectStore('shards').get(tag);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  });
}

function _saveShardToDB(tag, json, sha) {
  return _openShardStore().then(function (db) {
    if (!db) return;
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction('shards', 'readwrite');
        tx.objectStore('shards').put({ key: tag, json: json, sha: sha, updated: Date.now() });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
        tx.onabort = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  });
}

function _sha256Hex(text) {
  // Issue #14：优先走 Web Worker（js/algo/fsrs.worker.js）并行计算，避免主线程 Long Task；
  // Worker 不可用（离线/受限环境）回退 crypto.subtle。
  if (typeof window !== 'undefined' && window.FSRSOptimizer &&
      typeof window.FSRSOptimizer.sha256HexAsync === 'function') {
    return window.FSRSOptimizer.sha256HexAsync(text).then(function (res) {
      if (res) return res;
      return _sha256HexSubtle(text);
    }).catch(function () { return _sha256HexSubtle(text); });
  }
  return _sha256HexSubtle(text);
}

function _sha256HexSubtle(text) {
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest && typeof TextEncoder === 'function') {
    var enc = new TextEncoder();
    return crypto.subtle.digest('SHA-256', enc.encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }
  return Promise.resolve(null);
}

/* ============================================================
 * Issue #12：索引层（indexShards + questions 表）
 *  - data/index/<tag>.json 提供每题的轻量元信息（tags/diff/module/src/year）
 *  - 启动先仅加载索引 → 内存 Map<bioID, meta>，筛选在内存完成，
 *    再惰性拉取命中所属的 bank 分片正文，避免整包读取。
 * ============================================================ */

var _indexMemCache = {};        // tag -> index 分片对象（本会话内存缓存）
var _indexShardStoreReady = null;
var _bioIndexMap = null;        // Map<bioID, meta> 索引查询层
var _indexLoaded = false;
var _indexLoading = null;

function _openIndexShardStore() {
  if (_indexShardStoreReady) return _indexShardStoreReady;
  _indexShardStoreReady = _openDB().then(function (db) {
    if (!db) return null;
    return db.objectStoreNames.contains('indexShards') ? db : null;
  });
  return _indexShardStoreReady;
}

function _loadIndexShardFromDB(tag) {
  return _openIndexShardStore().then(function (db) {
    if (!db) return null;
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction('indexShards', 'readonly');
        var req = tx.objectStore('indexShards').get(tag);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  });
}

function _saveIndexShardToDB(tag, json, sha) {
  return _openIndexShardStore().then(function (db) {
    if (!db) return;
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction('indexShards', 'readwrite');
        tx.objectStore('indexShards').put({ key: tag, json: json, sha: sha, updated: Date.now() });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
        tx.onabort = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  });
}

/**
 * 加载单个 index 分片（manifest SHA 校验 + 增量刷新，逻辑与 bank 分片一致）。
 * @returns {Promise<string>} index 分片原始 JSON 文本
 */
function _loadIndexShard(tag, expectedSha, signal) {
  var mem = _indexMemCache[tag];
  if (mem) return Promise.resolve(mem.json);

  return _loadIndexShardFromDB(tag).then(function (rec) {
    if (rec && rec.json && (!expectedSha || rec.sha === expectedSha)) {
      _indexMemCache[tag] = { json: rec.json, sha: rec.sha || '' };
      return rec.json;
    }
    // Issue #15：索引分片走 CDN 优先 + SHA 校验 + 同源回退
    return _fetchShardText('data/index/' + tag + '.json', expectedSha, signal).then(function (res) {
      var text = res.text;
      JSON.parse(text); // 预防脏数据
      _indexMemCache[tag] = { json: text, sha: '' };
      if (expectedSha) {
        _sha256Hex(text).then(function (actual) {
          if (actual && actual !== expectedSha) {
            console.warn('[Loader] 索引分片 ' + tag + ' SHA-256 校验失败，按 manifest 为准');
            _saveIndexShardToDB(tag, text, '');
          } else if (actual) {
            _indexMemCache[tag].sha = actual;
            _saveIndexShardToDB(tag, text, actual);
          }
        });
      } else {
        _saveIndexShardToDB(tag, text, '');
      }
      return text;
    }).catch(function (err) {
      // 拉取失败：降级复用旧索引缓存，保证离线可用
      if (rec && rec.json) {
        _indexMemCache[tag] = { json: rec.json, sha: rec.sha || '' };
        return rec.json;
      }
      throw err;
    });
  });
}

/**
 * 构建内存索引查询层（汇聚全部 index 分片 → Map<bioID, meta>）。
 * 仅在 manifest 已加载时使用其 files 清单，否则按 biosource sonar 回退为空。
 * @returns {Promise<Map<string,Object>|null>} bioID -> meta
 */
function _loadIndexMap(signal) {
  if (_indexLoaded) return Promise.resolve(_bioIndexMap);
  if (_indexLoading) return _indexLoading;

  _indexLoading = _loadManifest(signal).then(function (mf) {
    var map = new Map();
    if (!mf) return map;
    var tags = Object.keys(mf.files || {})
      .filter(function (k) { return /^index\/.+\.json$/.test(k); })
      .map(function (k) { return k.replace(/^index\//, '').replace(/\.json$/, ''); });
    if (tags.length === 0) return map;

    return Promise.all(tags.map(function (tag) {
      var expected = (mf.files && mf.files['index/' + tag + '.json']) || null;
      return _loadIndexShard(tag, expected, signal).then(function (text) {
        var obj;
        try { obj = JSON.parse(text); } catch (e) { return; }
        if (!obj || typeof obj !== 'object') return;
        Object.keys(obj).forEach(function (bioId) {
          var meta = obj[bioId];
          if (!meta || typeof meta !== 'object') return;
          meta.bioId = bioId;
          map.set(bioId, meta);
        });
      }).catch(function () {});
    })).then(function () {
      _bioIndexMap = map;
      _indexLoaded = true;
      return map;
    });
  }).catch(function () {
    _bioIndexMap = new Map();
    _indexLoaded = true;
    return _bioIndexMap;
  });

  return _indexLoading;
}

/**
 * 校验某 bank 分片的每个 bioID 是否都应存在于索引层。
 * 若索引==正文 数量不吻合且相差较大，说明版本不一致，需整体刷新。
 * @returns {boolean} 是否一致（无法判断时返回 true，避免误伤）
 */
function _isShardConsistentWithIndex(tag, items) {
  if (!_bioIndexMap || _indexLoaded !== true) return true;
  var indexCount = 0;
  _bioIndexMap.forEach(function (meta, bioId) {
    if (meta.src === tag) indexCount++;
  });
  if (indexCount === 0) return true; // 无法交叉核对
  var bankCount = (items && items.length) || 0;
  var diff = Math.abs(indexCount - bankCount);
  return diff <= Math.max(5, Math.ceil(indexCount * 0.1));
}

/* ============================================================
 * Issue #12：解析后题目缓存（IndexedDB questions 表，bulkGet/bulkPut）
 * ============================================================ */

function _openQuestionStore() {
  return _openDB().then(function (db) {
    if (!db) return null;
    return db.objectStoreNames.contains('questions') ? db : null;
  });
}

function _bulkGetQuestionsByIds(bioIds) {
  if (!bioIds || bioIds.length === 0) return Promise.resolve([]);
  return _openQuestionStore().then(function (db) {
    if (!db) return [];
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction('questions', 'readonly');
        var store = tx.objectStore('questions');
        var results = {};
        var pending = bioIds.length;
        var done = false;
        function finish() {
          if (done) return;
          done = true;
          var arr = [];
          for (var i = 0; i < bioIds.length; i++) {
            if (results[bioIds[i]]) arr.push(results[bioIds[i]]);
          }
          resolve(arr);
        }
        bioIds.forEach(function (id) {
          var req = store.get(id);
          req.onsuccess = function () {
            if (req.result) results[id] = req.result;
            pending--;
            if (pending <= 0) finish();
          };
          req.onerror = function () { pending--; if (pending <= 0) finish(); };
        });
        // 保险：1.5s 内无论是否完成都返回当前结果
        setTimeout(finish, 1500);
      } catch (e) { resolve([]); }
    });
  });
}

function _bulkPutQuestions(items) {
  if (!items || items.length === 0) return Promise.resolve();
  return _openQuestionStore().then(function (db) {
    if (!db) return;
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction('questions', 'readwrite');
        var store = tx.objectStore('questions');
        var now = Date.now();
        items.forEach(function (q) {
          var rec = q;
          try { rec.updated = now; } catch (e) {}
          store.put(rec);
        });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
        tx.onabort = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  });
}

function _getQuestionsByTagDiff(tag, diff) {
  return _openQuestionStore().then(function (db) {
    if (!db) return [];
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction('questions', 'readonly');
        var idx = tx.objectStore('questions').index('tagDiff');
        var range = IDBKeyRange.bound([tag, diff || ''], [tag, diff || '\uffff']);
        idx.getAll(range).onsuccess = function (e) { resolve(e.target.result || []); };
        idx.getAll(range).onerror = function () { resolve([]); };
      } catch (e) { resolve([]); }
    });
  });
}

/**
 * 加载单个 bank 分片（manifest SHA-256 完整性校验 + 增量刷新）
 * 命中缓存（sha 与 manifest 一致）直接复用；否则拉取校验后落缓存。
 * @returns {Promise<string>} 分片原始 JSON 文本
 */
function _loadShardBank(tag, expectedSha, signal) {
  var mem = _shardMemCache[tag];
  if (mem) return Promise.resolve(mem.json);

  return _loadShardFromDB(tag).then(function (rec) {
    // 缓存可用且与 manifest 版本一致 → 复用（增量刷新：只拉变化的）
    if (rec && rec.json && (!expectedSha || rec.sha === expectedSha)) {
      _shardMemCache[tag] = { json: rec.json, sha: rec.sha || '' };
      return rec.json;
    }
    // 缓存缺失或版本不符 → 拉取（Issue #15：CDN 优先 + SHA 校验 + 同源回退）
    return _fetchShardText('data/bank/' + tag + '.json', expectedSha, signal).then(function (res) {
      var text = res.text;
      // 先校验 JSON 可解析，避免缓存脏数据
      JSON.parse(text);
      _shardMemCache[tag] = { json: text, sha: '' };
      if (expectedSha) {
        _sha256Hex(text).then(function (actual) {
          if (actual && actual !== expectedSha) {
            console.warn('[Loader] 分片 ' + tag + ' SHA-256 校验失败（manifest=' + expectedSha.slice(0, 12) + ' actual=' + actual.slice(0, 12) + '），按 manifest 为准');
            _saveShardToDB(tag, text, '');
          } else if (actual) {
            _shardMemCache[tag].sha = actual;
            _saveShardToDB(tag, text, actual);
          }
        });
      } else {
        _saveShardToDB(tag, text, '');
      }
      return text;
    }).catch(function (err) {
      // 拉取失败：降级复用旧缓存，保证离线可用
      if (rec && rec.json) {
        _shardMemCache[tag] = { json: rec.json, sha: rec.sha || '' };
        return rec.json;
      }
      throw err;
    });
  });
}

/**
 * 把 bank 分片对象（bioID -> question）转成数组并附上稳定 bioID。
 * 同时把解析后的题目落库到 questions 表（bulkPut），供索引筛选后按需命中。
 * @param {string} rawText 分片原始 JSON
 * @param {string} tag 分片标签
 * @param {boolean} persist 是否写入 questions 表（默认 true）
 */
function _bankToItems(rawText, tag, persist) {
  var bankObj;
  try { bankObj = JSON.parse(rawText); } catch (e) { return []; }
  var items = [];
  var keys = Object.keys(bankObj || {});
  for (var i = 0; i < keys.length; i++) {
    var bioId = keys[i];
    var q = bankObj[bioId];
    if (!q || typeof q !== 'object') continue;
    q.id = bioId;   // 稳定 bioID 作为题目 ID（替代 hash 生成）
    q.bioId = bioId;
    q._shardTag = tag;
    // 本地题库图片：bank 分片存 image 元数据（file/caption/...），
    // 渲染端（renderChart）只认 q.chart，此处统一映射为 file 路径
    if ((q.chart === undefined || q.chart === null) && q.image && q.image.file) {
      q.chart = q.image.file;
    }
    if (q.module === undefined || q.module === null) {
      q.module = TAG_TO_MODULE[tag] || ('module_' + tag);
    }
    items.push(q);
  }
  if (persist !== false && items.length > 0) {
    _bulkPutQuestions(items);
  }
  return items;
}

/**
 * 按 tag 列表加载分片并合并为题目数组
 */
function _loadShardTags(tags, onProgress, signal) {
  return _loadManifest(signal).then(function (mf) {
    if (!mf) { _shardManifest = null; return []; }
    // Issue #12：索引查询层仅在使用 loadQuestionsByFilter 时惰性加载，
    // 常规 loadQuestions 不预热索引，避免为常见路径引入 2MB 索引拉取开销。
    // 异步预热迁移映射表（不阻塞题库返回）
    _loadBioIdMap(signal);
    var jobs = tags.map(function (tag) {
      var expected = (mf.files && mf.files['bank/' + tag + '.json']) || null;
      return _loadShardBank(tag, expected, signal).then(function (text) {
        var items = _bankToItems(text, tag);
        if (onProgress) {
          try { onProgress(1, tags.length, tag, items.length); } catch (e) {}
        }
        return items;
      }).catch(function () { return []; });
    });
    return Promise.all(jobs).then(function (arrs) {
      var result = [];
      for (var i = 0; i < arrs.length; i++) result = result.concat(arrs[i]);
      return result;
    });
  });
}

function _loadByModulesShards(modules, onProgress, signal) {
  return _loadManifest(signal).then(function (mf) {
    // 每个模块可能对应多个考点分片（Issue #10），展平后按 tag 拉取
    var tags = [];
    for (var i = 0; i < modules.length; i++) {
      tags = tags.concat(_moduleToTags(mf, modules[i]));
    }
    return _loadShardTags(tags, onProgress, signal).then(function (items) {
      // 写模块级缓存，供 getCachedModule / isModuleCached 使用
      for (var j = 0; j < modules.length; j++) {
        var mTags = _moduleToTags(mf, modules[j]);
        var sub = items.filter(function (q) { return mTags.indexOf(q._shardTag) !== -1; });
        _setCached('module_' + modules[j], sub);
      }
      return items;
    });
  });
}

function _loadAllShards(onProgress, signal) {
  // 以 manifest.sources 为准（数据真源，避免硬编码列表过期）；缺失时回退默认分片集
  return _loadManifest(signal).then(function (mf) {
    var tags;
    if (mf && Array.isArray(mf.sources) && mf.sources.length > 0) {
      tags = mf.sources.map(function (s) { return s.tag; });
    } else {
      tags = ALL_SHARD_TAGS.filter(function (t) { return t !== 'pool'; });
    }
    return _loadShardTags(tags, onProgress, signal);
  });
}

function loadQuestions(moduleFilter, options) {
  options = options || {};
  var onProgress = options.onProgress || null;
  var signal = options.signal || null;
  var forceRefresh = options.forceRefresh || false;
  var mode = options.mode || LOAD_MODE.BALANCED;
  var onBackgroundDone = options.onBackgroundDone || null; // 后台增量刷新完成回调

  if (forceRefresh) clearQuestionCache();

  if (moduleFilter && Array.isArray(moduleFilter) && moduleFilter.length > 0) {
    return _loadByModules(moduleFilter, onProgress, signal, forceRefresh, mode, onBackgroundDone);
  }
  return _loadAll(onProgress, signal, forceRefresh, mode, onBackgroundDone);
}

/**
 * 流式加载：逐个模块加载，每完成一个模块立即回调
 * 返回一个 Promise，resolve 时传入全部数据
 */
function loadQuestionsStream(moduleFilter, options) {
  options = options || {};
  var onModuleReady = options.onModuleReady || null;
  var onProgress = options.onProgress || null;
  var signal = options.signal || null;
  var forceRefresh = options.forceRefresh || false;

  if (forceRefresh) clearQuestionCache();

  var modules = (moduleFilter && Array.isArray(moduleFilter) && moduleFilter.length > 0)
    ? moduleFilter
    : [1, 2, 3, 4];

  var allResults = [];
  var completed = 0;
  var total = modules.length;

  function loadNext(index) {
    if (index >= modules.length) {
      return Promise.resolve(allResults);
    }
    var m = modules[index];
    if (signal && signal.aborted) return Promise.resolve(allResults);

    // 如果已缓存且不强刷，直接从内存读取
    if (!forceRefresh && _hasCached('module_' + m)) {
      var cached = _getCached('module_' + m);
      if (cached && cached.length > 0) {
        allResults.push(cached);
        completed++;
        if (onProgress) onProgress(completed, total, m, cached.length);
        if (onModuleReady) onModuleReady(m, cached);
      }
      return loadNext(index + 1);
    }

    return _fetchModule(m, null, signal).then(function (items) {
      completed++;
      if (onProgress) onProgress(completed, total, m, items.length);
      allResults.push(items);
      if (onModuleReady) onModuleReady(m, items);
      return loadNext(index + 1);
    }).catch(function (err) {
      console.error('[Loader] 模块 ' + m + ' 加载失败:', err);
      completed++;
      if (onProgress) onProgress(completed, total, m, 0);
      return loadNext(index + 1);
    });
  }

  return loadNext(0).then(function () {
    return allResults.reduce(function (acc, arr) { return acc.concat(arr); }, []);
  });
}

function _loadByModules(modules, onProgress, signal, forceRefresh, mode, onBackgroundDone) {
  mode = mode || LOAD_MODE.BALANCED;
  var needed = [];
  for (var i = 0; i < modules.length; i++) {
    var m = modules[i];
    // 本地题库模式（PREFER_LOCAL）一律重新读取本地分片/JSON，避免读入
    // 上次云端后台刷新写入的 Supabase 全量缓存（如 700 题的脏数据）。
    if (forceRefresh || mode === LOAD_MODE.PREFER_LOCAL || !_hasCached('module_' + m)) {
      needed.push(m);
    }
  }

  if (needed.length === 0) {
    var result = [];
    for (var i2 = 0; i2 < modules.length; i2++) {
      var cached = _getCached('module_' + modules[i2]);
      if (cached) result = result.concat(cached);
    }
    // 即使缓存命中也做后台"静默刷新"：下次进入就拿到新题
    if (mode === LOAD_MODE.BALANCED && typeof onBackgroundDone === 'function') {
      _backgroundRefreshModules(modules, onBackgroundDone);
    }
    return Promise.resolve(result);
  }

  if (mode === LOAD_MODE.PREFER_LOCAL || mode === LOAD_MODE.BALANCED) {
    return _loadByModulesLocal(modules, onProgress, signal).then(function (localItems) {
      // 已经把结果给用户了；后台再跑 Supabase 同步（不阻塞 resolve）
      if (mode === LOAD_MODE.BALANCED) {
        _backgroundRefreshModules(modules, onBackgroundDone);
      }
      return localItems;
    });
  }

  // 顺序加载模块，避免并发请求被浏览器/SDK abort
  var chain = Promise.resolve();
  needed.forEach(function (m) {
    chain = chain.then(function () {
      return _fetchModule(m, onProgress, signal);
    });
  });

  return chain.then(function () {
    var result = [];
    for (var j = 0; j < modules.length; j++) {
      var cached2 = _getCached('module_' + modules[j]);
      if (cached2) result = result.concat(cached2);
    }
    return result;
  });
}

/**
 * 模块级本地加载：优先走分片题库（manifest + bank，附 bioID），
 * 分片不可用（manifest 缺失 / 拉取为空）时回退旧版 quiz_mX.json。
 */
function _loadByModulesLocal(modules, onProgress, signal) {
  return _loadByModulesShards(modules, onProgress, signal).then(function (shardItems) {
    if (shardItems && shardItems.length > 0) return shardItems;
    return _loadByModulesLocalJSON(modules, onProgress, signal);
  });
}

/**
 * 直接读取 quiz_m1~m4.json，不经过 IndexedDB，不经过 Supabase，100-300ms 必返回
 */
function _loadByModulesLocalJSON(modules, onProgress, signal) {
  var pending = modules.length;
  var completed = 0;
  var bucket = {};
  return Promise.all(modules.map(function (m) {
    var url = 'data/quiz_m' + m + '.json';
    return _fetchJSON(url, signal).then(function (raw) {
      var items = _filterQuarantinedQuestions(_extractQuestions(raw));
      bucket[m] = items;
      _setCached('module_' + m, items);
      completed++;
      if (onProgress) {
        try { onProgress(completed, modules.length, m, items.length); } catch (e) {}
      }
      return items;
    }).catch(function (err) {
      console.warn('[Loader] 本地 quiz_m' + m + '.json 读取失败:', err && err.message ? err.message : err);
      bucket[m] = [];
      return [];
    });
  })).then(function (arrs) {
    // 按 modules 顺序拼接
    var result = [];
    for (var k = 0; k < modules.length; k++) {
      var arr = bucket[modules[k]] || [];
      for (var j = 0; j < arr.length; j++) result.push(arr[j]);
    }
    return result;
  });
}

/**
 * 后台增量刷新：不阻塞页面首屏，用超时 30s 的 Supabase 同步，刷新到 IndexedDB + 内存缓存
 * onBackgroundDone(mode, items)  刷新完成后可选回调（用于扩展后台指标统计）
 */
function _backgroundRefreshModules(modules, onBackgroundDone) {
  if (!modules || modules.length === 0) return;
  var done = 0;
  var hasError = false;
  modules.forEach(function (m) {
    try {
      var dbKey = 'quiz_module_' + m;
      _fetchFromSupabase(m, REST_TIMEOUT_FULL).then(function (items) {
        if (items && items.length > 0) {
          items = _filterQuarantinedQuestions(items);
          _setCached('module_' + m, items);
          _saveToDB(dbKey, items);
        }
      }).catch(function (err) {
        // 后台同步：AbortError/超时/网络波动均静默降级，不污染控制台 error
        hasError = true;
        if (err && err.name === 'AbortError') return;
        console.debug('[Loader] 后台同步模块 ' + m + ' 放弃（非致命）');
      }).then(function () {
        done++;
        if (done === modules.length && typeof onBackgroundDone === 'function') {
          try { onBackgroundDone(hasError ? 'error' : 'ok', modules.length); } catch (e) {}
        }
      });
    } catch (e) {
      done++;
      hasError = true;
      if (done === modules.length && typeof onBackgroundDone === 'function') {
        try { onBackgroundDone('error', modules.length); } catch (e) {}
      }
    }
  });
}

function _fetchModuleAndCache(dbKey, moduleNum, signal) {
  return _fetchFromSupabase(moduleNum)
    .then(function (items) {
      if (items && items.length > 0) {
        // P0-4: 防御性过滤，确保 Supabase 数据也不会包含污染题目
        items = _filterQuarantinedQuestions(items);
        _saveToDB(dbKey, items);
        return { source: 'supabase', data: items };
      }
      // Supabase 返回空数据，回退到本地 JSON
      return _fetchJSON('data/quiz_m' + moduleNum + '.json', signal).then(function (data) {
        var items = _filterQuarantinedQuestions(_extractQuestions(data));
        _saveToDB(dbKey, items);
        return { source: 'fetch', data: items };
      });
    })
    .catch(function () {
      // Supabase 不可用，回退到本地 JSON
      return _fetchJSON('data/quiz_m' + moduleNum + '.json', signal).then(function (data) {
        var items = _filterQuarantinedQuestions(_extractQuestions(data));
        _saveToDB(dbKey, items);
        return { source: 'fetch', data: items };
      });
    });
}

function _loadModuleFromDBOrFetch(moduleNum, signal) {
  var dbKey = 'quiz_module_' + moduleNum;
  return _loadFromDB(dbKey).then(function (record) {
    if (_isCacheRecordValid(record, MODULE_CACHE_TTL)) {

      return { source: 'db', data: record.data };
    }
    // 缓存无效或过期，优先从 Supabase 直连获取
    return _fetchModuleAndCache(dbKey, moduleNum, signal);
  });
}

function _fetchFromSupabase(moduleNum, timeoutMs) {
  var sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
  var SUPABASE_URL = typeof window.SUPABASE_URL !== 'undefined' ? window.SUPABASE_URL :
    (sb && sb.supabaseUrl) || 'https://qxehkfucvmxuojjkdaqy.supabase.co';
  var SUPABASE_ANON_KEY = typeof window.SUPABASE_ANON_KEY !== 'undefined' ? window.SUPABASE_ANON_KEY :
    (sb && sb.supabaseKey) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZWhrZnVjdm14dW9qamtkYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjU2ODUsImV4cCI6MjEwMjIwMTY4NX0.lbiJxhFvy0t_J4qSeoP6K0r53M4KaEDSKkRlZu03ze8';

  var moduleLabel = (moduleNum !== null && moduleNum !== undefined) ? 'module_' + moduleNum : null;
  var pageSize = REST_PAGE_SIZE;
  var timeout = typeof timeoutMs === 'number' ? timeoutMs : REST_TIMEOUT_FULL;

  // 使用直接 REST API fetch 替代 SDK 查询，避免 SDK 内部自动取消并发请求导致 ERR_ABORTED
  function fetchPage(start, signal) {
    var url = SUPABASE_URL + '/rest/v1/questions?select=*&offset=' + start + '&limit=' + pageSize;
    if (moduleLabel) url += '&module=eq.' + _pgEncode(moduleLabel);

    return fetch(url, {
      signal: signal,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      }
    }).then(function(r) {
      if (!r.ok) throw new Error('Supabase REST HTTP ' + r.status);
      return r.json();
    }).then(function(rows) {
      return rows || [];
    });
  }

  function fetchAll(signal) {
    var all = [];
    function next(start) {
      return fetchPage(start, signal).then(function(rows) {
        if (!rows || rows.length === 0) return all;
        all = all.concat(rows);
        if (rows.length < pageSize) return all;
        return next(start + pageSize);
      });
    }
    return next(0);
  }

  // 整库分页加载超时；使用 AbortController 取消挂起请求
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeout);

  return Promise.race([
    fetchAll(controller.signal).then(function(rows) {
      clearTimeout(timer);

      return rows.map(function(q) { return _normalizeQuestion(q); });
    }).catch(function(err) {
      clearTimeout(timer);
      // AbortError 是预期内的"超时放弃"，降级成 warn 以免用户以为出了致命错
      if (err && err.name === 'AbortError') {
        console.warn('[Loader] Supabase 查询超时（' + Math.round(timeout / 1000) + 's），已放弃并回退本地');
      } else {
        console.error('[Loader] Supabase 查询失败:', err);
      }
      return [];
    }),
    new Promise(function(resolve) {
      setTimeout(function() { resolve([]); }, timeout);
    })
  ]);
}

/**
 * 按条件从 Supabase 拉取一小批题目（用于按需练习）
 * options: { modules, difficulties, targets, concept, count }
 * 使用直接 REST API fetch 替代 SDK 查询，避免 SDK 内部自动取消并发请求导致 ERR_ABORTED
 */
function fetchQuestionsBatch(options) {
  options = options || {};
  var sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
  var SUPABASE_URL = typeof window.SUPABASE_URL !== 'undefined' ? window.SUPABASE_URL :
    (sb && sb.supabaseUrl) || 'https://qxehkfucvmxuojjkdaqy.supabase.co';
  var SUPABASE_ANON_KEY = typeof window.SUPABASE_ANON_KEY !== 'undefined' ? window.SUPABASE_ANON_KEY :
    (sb && sb.supabaseKey) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZWhrZnVjdm14dW9qamtkYXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjU2ODUsImV4cCI6MjEwMjIwMTY4NX0.lbiJxhFvy0t_J4qSeoP6K0r53M4KaEDSKkRlZu03ze8';

  var modules = options.modules || ['module_1', 'module_2', 'module_3', 'module_4'];
  var difficulties = options.difficulties || [];
  var targets = options.targets || [];
  var concept = options.concept || null;
  var count = Math.min(Math.max(options.count || 10, 1), 50);

  // 难度映射：前端 easy/medium/hard 兼容后端 basic/league/national
  var diffAlias = {
    easy: ['easy', 'basic'],
    medium: ['medium', 'league'],
    hard: ['hard', 'national']
  };
  var acceptedDiffs = [];
  difficulties.forEach(function(d) {
    (diffAlias[d] || [d]).forEach(function(v) {
      if (acceptedDiffs.indexOf(v) < 0) acceptedDiffs.push(v);
    });
  });

  // 目标群体：'both' 表示不限制目标
  var acceptedTargets = targets.filter(function(t) { return t !== 'both'; });

  // 构建 REST API URL
  var url = SUPABASE_URL + '/rest/v1/questions?select=*';

  // 模块过滤
  if (modules.length === 1) {
    url += '&module=eq.' + _pgEncode(modules[0]);
  } else if (modules.length > 1) {
    url += '&module=in.(' + modules.map(_pgEncode).join(',') + ')';
  }

  // 目标群体过滤
  if (acceptedTargets.length === 1) {
    url += '&target=eq.' + _pgEncode(acceptedTargets[0]);
  } else if (acceptedTargets.length > 1) {
    url += '&target=in.(' + acceptedTargets.map(_pgEncode).join(',') + ')';
  }

  // 随机偏移 + 分页
  var offset = Math.floor(Math.random() * Math.max(1, RANDOM_OFFSET_MAX));
  url += '&order=id.desc&offset=' + offset + '&limit=' + (count * BATCH_OVERFETCH_FACTOR);

  // 批量加载超时，使用 AbortController 取消挂起请求
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, REST_TIMEOUT_BATCH);

  return Promise.race([
    fetch(url, {
      signal: controller.signal,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      }
    }).then(function(r) {
      if (!r.ok) throw new Error('Supabase REST HTTP ' + r.status);
      return r.json();
    }).then(function(rows) {
      clearTimeout(timer);
      if (!rows || rows.length === 0) return [];
      var normalized = rows.map(function(q) { return _normalizeQuestion(q); }).filter(Boolean);

      // 客户端过滤难度与概念
      var filtered = normalized.filter(function(q) {
        if (!q || !q.subQuestions || q.subQuestions.length < 2) return false;
        if (acceptedDiffs.length > 0 && acceptedDiffs.indexOf(q.difficulty) < 0) return false;
        if (concept) {
          var inConcept = q.concept === concept;
          var inTags = q.tags && q.tags.indexOf(concept) >= 0;
          var inQuestion = q.question && q.question.indexOf(concept) >= 0;
          var inExplanation = q.explanation && q.explanation.indexOf(concept) >= 0;
          if (!inConcept && !inTags && !inQuestion && !inExplanation) return false;
        }
        return true;
      });

      return filtered.slice(0, count);
    }).catch(function(err) {
      clearTimeout(timer);
      console.error('[Loader] 批量拉取失败:', err);
      return [];
    }),
    new Promise(function(resolve) {
      setTimeout(function() { resolve([]); }, 20000);
    })
  ]);
}

window.fetchQuestionsBatch = fetchQuestionsBatch;

function _normalizeQuestion(q) {
  // 兼容两种后端格式：
  // 1) 前端本地格式：type, question, subQuestions, explanation, subject, concept, difficulty, chart, year
  // 2) server.py 生成格式：stem, options, answer, analysis, knowledge, module, difficulty, target, subject, concept, tags
  if (!q) return null;

  // server.py 格式（单选/判断/多重判断）-> 转前端 MTF 兼容格式
  if (q.stem && q.options) {
    var labels = Object.keys(q.options).sort();
    // 兼容两种 answer 格式：单选 "A" 或 多重判断 {"A": true, "B": false, ...}
    var isMultiJudge = (typeof q.answer === 'object' && q.answer !== null);
    var subQuestions = labels.map(function(label) {
      return {
        label: label,
        text: q.options[label],
        answer: isMultiJudge ? (q.answer[label] === true) : (q.answer === label)
      };
    });
    // module 归一化：数字转字符串
    var mod = q.module;
    if (typeof mod === 'number') mod = 'module_' + mod;
    return {
      id: q.id || null,
      type: q.type || (isMultiJudge ? 'multi_judge' : 'mtf'),
      question: q.stem,
      subQuestions: subQuestions,
      explanation: q.analysis || q.explanation || '',
      subject: q.subject || (q.knowledge && q.knowledge[0]) || '',
      concept: q.concept || (q.knowledge && q.knowledge[1]) || '',
      difficulty: q.difficulty || 'medium',
      chart: q.chart || (q.image && q.image.file) || q.image_url || q.imageUrl || null,
      year: q.year || null,
      module: mod,
      target: q.target || _inferTarget(q),
      tags: q.tags || [],
      source: 'supabase'
    };
  }

  // 原生前端格式：没有 target 字段时按难度推断
  var diff0 = String(q.difficulty || 'easy').toLowerCase();
  return {
    id: q.id || null,
    type: q.type, question: q.question,
    subQuestions: q.sub_questions || q.subQuestions || [],
    explanation: q.explanation || '', subject: q.subject || '',
    concept: q.concept || '',
    difficulty: q.difficulty || 'easy',
    chart: q.chart || (q.image && q.image.file) || q.image_url || q.imageUrl || null, year: q.year || null,
    module: q.module,
    target: q.target || (diff0 === 'easy' ? 'high_school' : (diff0 === 'hard' ? 'competition' : 'both')),
    source: 'local'
  };
}

// 根据题目难度推断目标群体（缺失 target 字段时使用）
function _inferTarget(q) {
  if (!q) return 'both';
  var d = String(q.difficulty || 'easy').toLowerCase();
  if (d === 'basic' || d === 'easy') return 'high_school';
  if (d === 'national' || d === 'league' || d === 'hard') return 'competition';
  return 'both';
}

function _fetchJSON(url, signal) {
  return fetch(url, { signal: signal }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + url);
    return r.json();
  });
}

function _fetchAPI(path, signal) {
  return fetch(path, { signal: signal }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + path);
    return r.json();
  });
}

function _fetchModule(moduleNum, onProgress, signal) {
  var key = 'module_' + moduleNum;
  if (_loadingPromises[key]) return _loadingPromises[key];

  _loadingPromises[key] = _loadModuleFromDBOrFetch(moduleNum, signal)
    .then(function (result) {
      var items = result.data;
      _setCached(key, items);
      if (onProgress) onProgress(moduleNum, items.length);
      _loadingPromises[key] = null;
      return items;
    })
    .catch(function (err) {
      _loadingPromises[key] = null;
      throw err;
    });

  return _loadingPromises[key];
}

function _loadAll(onProgress, signal, forceRefresh, mode, onBackgroundDone) {
  mode = mode || LOAD_MODE.BALANCED;
  // 本地题库模式（PREFER_LOCAL）不读缓存，直接走本地分片，避免命中云端脏缓存
  if (mode !== LOAD_MODE.PREFER_LOCAL && !forceRefresh && _hasCached('_all')) return Promise.resolve(_getCached('_all'));

  if (mode === LOAD_MODE.PREFER_LOCAL || mode === LOAD_MODE.BALANCED) {
    // 首屏秒开：优先走分片（manifest+bank，附 bioID）；分片缺失回退 data/quiz.json
    return _loadAllShards(onProgress, signal).then(function (shardItems) {
      if (shardItems && shardItems.length > 0) {
        _setCached('_all', shardItems);
        if (onProgress) { try { onProgress(0, shardItems.length); } catch (e) {} }
        if (mode === LOAD_MODE.BALANCED) {
          _backgroundRefreshAll(onBackgroundDone);
        }
        return shardItems;
      }
      return _fetchJSON('data/quiz.json', signal).then(function (data) {
        var items = _filterQuarantinedQuestions(_extractQuestions(data));
        _setCached('_all', items);
        if (onProgress) { try { onProgress(0, items.length); } catch (e) {} }
        // 后台再刷一次 Supabase（不阻塞）
        if (mode === LOAD_MODE.BALANCED) {
          _backgroundRefreshAll(onBackgroundDone);
        }
        return items;
      }).catch(function () {
        // 本地 quiz.json 也没读到，只好走 IndexedDB→Supabase 原链路
        return _loadAllRemote(onProgress, signal, forceRefresh, onBackgroundDone);
      });
    });
  }

  return _loadAllRemote(onProgress, signal, forceRefresh, onBackgroundDone);
}

function _loadAllRemote(onProgress, signal, forceRefresh, onBackgroundDone) {
  return _loadFromDB('quiz_all').then(function (record) {
    if (!forceRefresh && _isCacheRecordValid(record, ALL_CACHE_TTL)) {

      _setCached('_all', record.data);
      return record.data;
    }
    // 优先从 Supabase 直连获取
    return _fetchFromSupabase(null, REST_TIMEOUT_FULL_FAST)
      .then(function (items) {
        if (items && items.length > 0) {
          // P0-4: 防御性过滤
          items = _filterQuarantinedQuestions(items);
          _setCached('_all', items);
          _saveToDB('quiz_all', items);
          if (onProgress) onProgress(0, items.length);
          return items;
        }
        // Supabase 返回空数据，回退到本地 JSON
        return _fetchJSON('data/quiz.json', signal).then(function (data) {
          var items = _filterQuarantinedQuestions(_extractQuestions(data));
          _setCached('_all', items);
          _saveToDB('quiz_all', items);
          if (onProgress) onProgress(0, items.length);
          return items;
        });
      })
      .catch(function () {
        // Supabase 不可用，回退到本地 JSON
        return _fetchJSON('data/quiz.json', signal).then(function (data) {
          var items = _filterQuarantinedQuestions(_extractQuestions(data));
          _setCached('_all', items);
          _saveToDB('quiz_all', items);
          if (onProgress) onProgress(0, items.length);
          return items;
        });
      });
  });
}

function _backgroundRefreshAll(onBackgroundDone) {
  try {
    _fetchFromSupabase(null, REST_TIMEOUT_FULL).then(function (items) {
      if (items && items.length > 0) {
        items = _filterQuarantinedQuestions(items);
        _setCached('_all', items);
        _saveToDB('quiz_all', items);
      }
    }).catch(function () {}).then(function () {
      if (typeof onBackgroundDone === 'function') {
        try { onBackgroundDone('ok'); } catch (e) {}
      }
    });
  } catch (e) {
    if (typeof onBackgroundDone === 'function') {
      try { onBackgroundDone('error'); } catch (e2) {}
    }
  }
}

/* ============================================================
 * 缓存管理
 * ============================================================ */

function clearQuestionCache() {
  _questionCache = {};
  _loadingPromises = {};
}

function _clearIndexedDB() {
  return _openDB().then(function (db) {
    if (!db) return;
    try {
      var tx = db.transaction('modules', 'readwrite');
      var store = tx.objectStore('modules');
      store.clear();
    } catch (e) {}
  });
}

function clearAllCaches() {
  clearQuestionCache();
  return _clearIndexedDB();
}

function getCachedModule(moduleNum) {
  return _getCached('module_' + moduleNum) || null;
}

function getCachedAll() {
  return _getCached('_all') || null;
}

function isModuleCached(moduleNum) {
  return _hasCached('module_' + moduleNum);
}

/**
 * Issue #11：启动后台维护（哈希校验 + 增量刷新）
 * 流程：
 *  1. 空闲时拉取最新 manifest（cache-busting，短超时）判断题库是否有更新；
 *  2. 仅对「新增 / SHA 变化」的 bank 分片执行拉取 → 解析 → 落库 questions 表；
 *  3. 全程分片串行 + requestIdleCallback 让出主线程，避免 Long Task；
 *  4. 离线 / 超时静默降级，不阻塞也不污染控制台。
 * @returns {Promise<{changed:boolean, refreshed:number}|null>}
 */
function maintainQuestionBank() {
  if (_maintenanceRunning) return _maintenanceRunning;
  _maintenanceRunning = true;

  var task = _loadManifestFresh(5000).then(function (result) {
    if (!result || !result.manifest) { _maintenanceRunning = false; return null; }
    var mf = result.manifest;
    var files = mf.files || {};
    var bankTags = Object.keys(files)
      .filter(function (k) { return /^bank\/.+\.json$/.test(k); })
      .map(function (k) { return k.replace(/^bank\//, '').replace(/\.json$/, ''); });
    if (bankTags.length === 0) { _maintenanceRunning = false; return { changed: false, refreshed: 0 }; }

    // 首访带宽保护：首次会话不后台预热 bank 分片（80 个文件约 14MB），
    // 避免新用户刚进站就被大流量下载拖慢，造成"进度条走完页面还在加载/卡网速"。
    // 置位标记后，从下一次访问起（分片已随用户使用按需进入 SW/内存缓存）再在空闲时后台预热。
    var warmedOnce = false;
    try { warmedOnce = localStorage.getItem('bioquest_bank_warmed_once') === '1'; } catch (e) {}
    if (!warmedOnce) {
      try { localStorage.setItem('bioquest_bank_warmed_once', '1'); } catch (e) {}
      _maintenanceRunning = false;
      return { changed: result.changed, refreshed: 0, deferred: true };
    }

    return new Promise(function (resolveOuter) {
      var refreshed = 0;
      var idx = 0;
      function next() {
        if (idx >= bankTags.length) { resolveOuter({ changed: result.changed, refreshed: refreshed }); return; }
        var tag = bankTags[idx++];
        var expected = files['bank/' + tag + '.json'] || null;
        // 逐 tag 拉取（内部缓存命中/SHA 一致会复用），完成后让出主线程
        _loadShardBank(tag, expected, null).then(function () {
          refreshed++;
          // 注意：这里不再调用 _bankToItems()（JSON.parse 整片 + bulkPut 进 questions 表）。
          // 空闲期在 80+ 个分片上做同步 parse/写入会制造大量 Long Task，
          // 导致用户刚加载完点"练习/模考"时页面卡死几秒。
          // 分片原始 JSON 已由 _loadShardBank 存入 IndexedDB shards 表（含 SHA），
          // 首次真正拉题时再由 _bankToItems 惰性解析落库。
        }).catch(function () {
          // 单个分片失败不影响整体
        }).then(function () {
          if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(next, { timeout: 3000 });
          } else {
            setTimeout(next, 20);
          }
        });
      }
      // 空闲后再开始，避免抢首屏资源
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(next, { timeout: 6000 });
      } else {
        setTimeout(next, 1500);
      }
    });
  }).then(function (r) {
    _maintenanceRunning = false;
    return r;
  }).catch(function () {
    _maintenanceRunning = false;
    return null;
  });

  _maintenanceRunning = task;
  return _maintenanceRunning;
}

/**
 * Issue #12：基于内存索引层的条件筛选加载。
 * options: { tags:[], diffs:[], modules:[], concept, count, fallbackAll }
 * 命中索引 Map → 得到 bioID 集 → 惰性从 questions 表 / bank 分片补齐正文。
 * 索引未就绪时按 fallbackAll 回退到全量加载（默认 true），保证行为不退化。
 * @returns {Promise<Array>} 匹配的题目数组
 */
function loadQuestionsByFilter(options) {
  options = options || {};
  var fallbackAll = options.fallbackAll !== false;
  return _loadIndexMap(null).then(function (map) {
    var matched = [];
    if (map && map.size > 0) {
      map.forEach(function (meta, bioId) {
        if (options.tags && options.tags.length > 0) {
          var hasTag = false;
          for (var i = 0; i < options.tags.length; i++) {
            if (meta.tags && meta.tags.indexOf(options.tags[i]) !== -1) { hasTag = true; break; }
            if (meta.src === options.tags[i]) { hasTag = true; break; }
          }
          if (!hasTag) return;
        }
        if (options.modules && options.modules.length > 0) {
          var m = meta.module || '';
          if (options.modules.indexOf(m) === -1) {
            // 兼容 module_1 与数字模块名
            var numMatch = m.match(/module[_-](\d+)/);
            var norm = numMatch ? 'module_' + numMatch[1] : m;
            var modValid = options.modules.indexOf(norm) !== -1;
            if (!modValid && options.modules.indexOf(parseInt(norm.replace('module_', ''), 10)) === -1) return;
          }
        }
        if (options.diffs && options.diffs.length > 0 && options.diffs.indexOf(meta.diff) === -1) return;
        if (options.concept) {
          var inTag = meta.tags && meta.tags.indexOf(options.concept) !== -1;
          if (!inTag && meta.src !== options.concept) return;
        }
        matched.push(bioId);
        if (options.count && matched.length >= options.count) {
          map = null; // 到达预期数提前终止
          return;
        }
      });
    }

    if (matched.length === 0) {
      if (fallbackAll) return loadQuestions(null, { mode: LOAD_MODE.PREFER_LOCAL });
      return [];
    }

    // 惰性补齐正文：先查 questions 表，缺失的按 tag 分组从 bank 分片拉取
    return _bulkGetQuestionsByIds(matched).then(function (cached) {
      var byId = {};
      cached.forEach(function (q) { byId[q.bioId] = q; });
      var missingTags = {};
      matched.forEach(function (id) {
        if (!byId[id]) {
          var meta = null;
          // 重新查 Map
          if (_bioIndexMap) { meta = _bioIndexMap.get(id); }
          var tag = (meta && meta.src) || id.split('-')[1] || null;
          if (tag) missingTags[tag] = missingTags[tag] || [];
          if (tag) missingTags[tag].push(id);
        }
      });
      var tagKeys = Object.keys(missingTags);
      if (tagKeys.length === 0) {
        return matched.map(function (id) { return byId[id]; }).filter(Boolean);
      }
      return _loadManifest(null).then(function (mf) {
        var files = (mf && mf.files) || {};
        var jobs = tagKeys.map(function (tag) {
          var expected = files['bank/' + tag + '.json'] || null;
          return _loadShardBank(tag, expected, null).then(function (text) {
            var all = _bankToItems(text, tag, false);
            return all.filter(function (q) { return missingTags[tag].indexOf(q.bioId) !== -1; });
          }).catch(function () { return []; });
        });
        return Promise.all(jobs).then(function (arrs) {
          var extraById = {};
          arrs.forEach(function (arr) {
            arr.forEach(function (q) { extraById[q.bioId] = q; });
          });
          var result = [];
          matched.forEach(function (id) {
            if (byId[id]) result.push(byId[id]);
            else if (extraById[id]) result.push(extraById[id]);
          });
          return result;
        });
      });
    });
  });
}

window.loadQuestions = loadQuestions;
window.loadQuestionsStream = loadQuestionsStream;
window.loadQuestionsByFilter = loadQuestionsByFilter;
window.maintainQuestionBank = maintainQuestionBank;
window.loadIndexMap = _loadIndexMap;
window.clearQuestionCache = clearQuestionCache;
window.clearAllCaches = clearAllCaches;
window.abortLoading = abortLoading;
window.abortAllLoading = abortAllLoading;
window.isModuleCached = isModuleCached;
window.LoaderMode = LOAD_MODE;
// Issue #15：CDN 分发诊断接口（状态查询 / 手动重置 kill-switch）
window.BioQuestCDN = {
  getBase: function () { return _cdnBase; },
  isEnabled: function () { return !!_cdnBase && !_cdnDisabled; },
  reset: function () { _cdnDisabled = false; _cdnFailCount = 0; }
};
// Issue #16：当前题库版本号（manifest rev），供「检查更新」比对
window.getManifestRev = function () { return _manifestRev; };
/**
 * 读取本地题库题目总数（manifest.total_questions 为数据真源）。
 * 用于首页/后台等「题库总量」动态展示；云端模式由调用方另行查询云端数量。
 * @returns {Promise<number|null>} 无法获取时返回 null
 */
window.getQuestionBankCount = function () {
  try {
    if (_shardManifest && _shardManifest.total_questions) {
      return Promise.resolve(_shardManifest.total_questions);
    }
    return _loadManifest(null).then(function (mf) {
      return (mf && mf.total_questions) || null;
    }).catch(function () { return null; });
  } catch (e) {
    return Promise.resolve(null);
  }
};
/**
 * 读取「可练题总数」＝ 模块精编题（manifest.total_questions）
 *                       + 逻辑推理题（data/logic_questions.json）
 *                       + 联赛真题（resource/count.json 的 playable）。
 * 首页「题库总量」与练习页默认「可用题目」共用同一口径：
 * 练习页默认类别为「全部」，题库 = 基础知识题 + 逻辑推理题 + 联赛真题，
 * 若首页只显示 manifest.total_questions 会与练习页数字对不上。
 * @returns {Promise<number|null>} 无法获取模块题数时返回 null；逻辑/联赛题读取失败按 0 计
 */
var _playableCountCache = null;
window.getPlayableQuestionCount = function () {
  if (_playableCountCache !== null) return Promise.resolve(_playableCountCache);
  var moduleCountP = (typeof window.getQuestionBankCount === 'function')
    ? window.getQuestionBankCount()
    : Promise.resolve(null);
  var logicCountP = _fetchJSON('data/logic_questions.json', null)
    .then(function (data) {
      var arr = Array.isArray(data)
        ? data
        : (data && (data['题库'] || data.questions || data.items));
      if (!Array.isArray(arr) && data && typeof data === 'object') arr = Object.values(data);
      return (arr && arr.length) || 0;
    })
    .catch(function () { return 0; });
  // 联赛真题池计数：build-league-pool.js 生成的轻量 count.json（不拉 4.6MB 全量）
  var leagueCountP = _fetchJSON('resource/count.json', null)
    .then(function (data) {
      return (data && (data.playable || 0)) || 0;
    })
    .catch(function () { return 0; });
  return Promise.all([moduleCountP, logicCountP, leagueCountP]).then(function (r) {
    var moduleCount = r[0];
    if (!moduleCount) return null;
    var total = moduleCount + r[1] + r[2];
    _playableCountCache = total;
    return total;
  }).catch(function () { return null; });
};
// Issue #10：分片题库 API（供外部按需刷新 / 迁移 / 查询 bioID 映射）
window.loadAllShards = _loadAllShards;
window.loadBioIdMap = _loadBioIdMap;
window.bioIdMap = window.bioIdMap || null;

/**
 * 字符串 hash 函数（与 storage.js / generate-bio-shards.js 算法一致）。
 * 将任意字符串转换为稳定的 32 位正整数，用于复算旧题目数字 ID。
 * 供 quiz.js 等未加载 storage.js 的页面使用。
 */
window.hashQuestionId = function (str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
};

/**
 * 解析题目 bioID：
 *   - 已是 bioID（BQ-…）原样返回；
 *   - 旧 hash/数字 ID 通过 bioid-map 映射为稳定 bioID；
 *   - 无法解析则原样返回（回退逻辑由调用方保证）。
 */
window.resolveQuestionBioId = function (id) {
  if (id === undefined || id === null || id === '') return id;
  var s = String(id);
  if (/^BQ-[A-Za-z0-9]+-[0-9a-f]{12}$/.test(s)) return s;
  if (window.bioIdMap && Object.prototype.hasOwnProperty.call(window.bioIdMap, s)) {
    return window.bioIdMap[s];
  }
  return s;
};

/**
 * 确保 loader.js 已加载并就绪（供 practice.js / exam.js 按需调用）
 * 解决：loader.js 不在 index.html 中预加载，且 app.js 误匹配 cell-loader.js
 *       导致 loader.js 从未加载、fetchQuestionsBatch 不存在的问题
 * @param {Object} opts - { timeout: 8000, attempts: 2 }
 * @returns {Promise<boolean>} 是否就绪
 */
window.ensureQuestionLoaderReady = function (opts) {
  opts = opts || {};
  var timeout = opts.timeout || 8000;
  var attempts = opts.attempts || 2;

  // 已就绪：直接返回
  if (typeof window.fetchQuestionsBatch === 'function' &&
      typeof window.loadQuestions === 'function') {
    return Promise.resolve(true);
  }

  // 动态注入 loader.js（带版本号防缓存）
  function injectScript() {
    return new Promise(function (resolve) {
      // 避免重复注入
      var existing = document.querySelector('script[data-bioquest-loader="1"]');
      if (existing) {
        // 已注入但还未就绪，等待其 load 事件
        if (typeof window.fetchQuestionsBatch === 'function') {
          resolve(true);
          return;
        }
        existing.addEventListener('load', function () { resolve(true); });
        existing.addEventListener('error', function () { resolve(false); });
        return;
      }

      var s = document.createElement('script');
      s.src = 'js/core/loader.js?v=20260809a';
      s.setAttribute('data-bioquest-loader', '1');
      s.async = true;
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
  }

  // 等待 fetchQuestionsBatch 真正可用（注入后可能需要一帧时间）
  function waitForReady(deadline) {
    return new Promise(function (resolve) {
      function check() {
        if (typeof window.fetchQuestionsBatch === 'function' &&
            typeof window.loadQuestions === 'function') {
          resolve(true);
        } else if (Date.now() > deadline) {
          resolve(false);
        } else {
          setTimeout(check, 50);
        }
      }
      check();
    });
  }

  // 重试逻辑
  function tryLoad(attemptLeft) {
    var deadline = Date.now() + timeout;
    return injectScript().then(function () {
      return waitForReady(deadline);
    }).then(function (ok) {
      if (ok) return true;
      if (attemptLeft > 1) {
        // 重试前清理失败的 script 标签
        var fail = document.querySelector('script[data-bioquest-loader="1"]');
        if (fail && typeof window.fetchQuestionsBatch !== 'function') {
          fail.parentNode.removeChild(fail);
        }
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(tryLoad(attemptLeft - 1)); }, 300);
        });
      }
      return false;
    });
  }

  return tryLoad(attempts);
};

/* ============================================================
 * Issue #11：启动后台维护自触发
 * SPA（loader.js 每会话仅加载一次），页面稳定后后台校验题库哈希并增量刷新，
 * 全程 idle/请求空闲，不阻塞首屏渲染与交互。
 * ============================================================ */
(function () {
  function scheduleMaintenance() {
    // 页面 load 完成、主线程空闲后再启动，避免抢首屏
    if (document.readyState === 'complete') {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(function () { window.maintainQuestionBank(); }, { timeout: 8000 });
      } else {
        setTimeout(function () { window.maintainQuestionBank(); }, 2500);
      }
    } else {
      window.addEventListener('load', function () {
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(function () { window.maintainQuestionBank(); }, { timeout: 8000 });
        } else {
          setTimeout(function () { window.maintainQuestionBank(); }, 2500);
        }
      });
    }
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') scheduleMaintenance();
})();