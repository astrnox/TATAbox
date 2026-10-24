/**
 * ============================================================
 * TATABOX — 数据持久化模块（双层存储）
 * 主存储：Supabase PostgreSQL（云端同步）
 * 缓存层：localStorage（离线回退 + 快速读写）
 * ============================================================
 */

'use strict';

var STORAGE_PREFIX = 'bioquest_';

var KEYS = {
  SETTINGS: STORAGE_PREFIX + 'settings',
  RECORDS: STORAGE_PREFIX + 'records',
  FAVORITES: STORAGE_PREFIX + 'favorites',
  WRONG_QUESTIONS: STORAGE_PREFIX + 'wrong_questions',
  SPECIMENS: STORAGE_PREFIX + 'specimens',          // 标本馆（9.1）：已掌握错题的馆藏档案
  STATS: STORAGE_PREFIX + 'stats',
  DEVICE_ID: STORAGE_PREFIX + 'device_id',
  PROFILE: STORAGE_PREFIX + 'profile',
  QUESTION_RATINGS: STORAGE_PREFIX + 'question_ratings',       // { [bioId]: { up, down } } 题目评分聚合
  QUESTION_MY_VOTES: STORAGE_PREFIX + 'question_my_votes',     // { [bioId]: 1 | -1 } 当前用户对题目的投票
  QUESTION_RECYCLED: STORAGE_PREFIX + 'question_recycled',     // [bioId, ...] 回收站题目
  QUESTION_OVERRIDES: STORAGE_PREFIX + 'question_overrides'    // { [bioId]: {...} } 管理员对本地题库的修改覆盖
};

/* ============================================================
 * 底层工具
 * ============================================================ */

function safeGetJSON(key, defaultValue) {
  var raw;
  try {
    raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    // P1-14(旧)：加载时进行哈希校验，检测篡改 / 截断损坏，避免把脏数据注入运行时
    if (_isIntegrityProtected(key)) {
      var ok = _verifyIntegrity(key, raw);
      if (ok === 'tampered') {
        console.warn('[TATABOX Storage] ' + key + ' 完整性校验失败，判定为被篡改或损坏，已忽略该数据。');
        return defaultValue;
      }
    }
    var parsed = JSON.parse(raw);
    return (parsed === null || parsed === undefined) ? defaultValue : parsed;
  } catch (e) {
    console.warn('[TATABOX Storage] 读取 ' + key + ' 失败:', e.message);
    return defaultValue;
  }
}

function safeSetJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    // P1-14(旧)：写入成功后记录旁路哈希，供后续加载时校验；失败不影响本次写入
    if (_isIntegrityProtected(key)) _recordIntegrity(key);
    return true;
  } catch (e) {
    var isQuota = !!(e && (e.name === 'QuotaExceededError' || e.code === 22 ||
      String(e).toLowerCase().indexOf('quota') !== -1));
    // P1-15：配额超限时先清理可重建的缓存类键再重试一次，避免关键数据静默丢失
    if (isQuota && _evictCacheOnce() > 0) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        if (_isIntegrityProtected(key)) _recordIntegrity(key);
        return true;
      } catch (e2) {
        console.warn('[TATABOX Storage] 写入 ' + key + ' 失败（清理缓存后配额仍不足）:', e2.message);
        return false;
      }
    }
    if (isQuota) {
      var usage = getStorageUsage();
      if (usage.percent > 80 && !_quotaWarnFired) {
        _quotaWarnFired = true;
        console.warn('[TATABOX Storage] localStorage 已用约 ' + usage.percent.toFixed(0) + '%，接近配额，可能发生数据写入失败。建议导出备份并清理缓存数据。');
      }
      return false;
    }
    console.warn('[TATABOX Storage] 写入 ' + key + ' 失败:', e.message);
    return false;
  }
}

var _quotaWarnFired = false;

/**
 * 估算 localStorage 已用字节数与占比（约 5MB 上限），供配额监控（P1-15）。
 * @returns {{bytes:number, limit:number, percent:number}}
 */
function getStorageUsage() {
  var bytes = 0;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      var v = localStorage.getItem(k);
      bytes += (k ? k.length : 0) + (v ? (v.length * 1) : 0); // 每个字符约 1 字节估算
    }
  } catch (e) {}
  var limit = 5 * 1024 * 1024; // 约 5MB
  return { bytes: bytes, limit: limit, percent: Math.min(100, bytes / limit * 100) };
}

/* ============================================================
 * P1-14(旧)：数据版本控制 + 完整性（篡改/损坏）校验
 * 方案：存储值保持原始格式不变（不打包成 envelope，避免破坏跨模块直接读取），
 *      仅维护一份「旁路校验元数据」bioquest_meta：{ v, checksums, updatedAt }，
 *      写入成功时记录该键的值哈希，加载时复算比对，不匹配即判定为被篡改/截断。
 * 说明：纯前端无法做到防篡改（用户可随意改 localStorage），此处目标是把
 *      「肉眼难以察觉的脏数据/截断」显式化为「忽略 + 报错」，避免脏数据污染运行时。
 * ============================================================ */

var STORAGE_SCHEMA_VERSION = 1;          // 存储结构 schema 版本号，便于未来做格式迁移
var INTEGRITY_META_KEY = STORAGE_PREFIX + 'meta';
var _integrityCache = null;              // 内存缓存的元数据副本，避免每次读写都 parse

function _isIntegrityProtected(key) {
  // 只对「由 storage.js 全程写入」的键做自动校验，避免因其他模块直接 setItem
  // （quiz.js / supabase.js / supabase-client.js 会直接写 records/favorites/...）
  // 造成的旁路哈希不同步 → 误判为篡改。目前受保护域 = 设置 + 进度快照。
  return key === KEYS.SETTINGS ||
    (typeof key === 'string' && key.indexOf(PROGRESS_PREFIX) === 0);
}

/**
 * FNV-1a 32 位字符串哈希 -> 8 位十六进制字符串（用于本地数据轻量校验）。
 */
function _hashString(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return ('000000000' + h.toString(16)).slice(-8);
}

function _loadMeta() {
  if (_integrityCache) return _integrityCache;
  var m;
  try {
    var raw = localStorage.getItem(INTEGRITY_META_KEY);
    m = raw ? JSON.parse(raw) : null;
  } catch (e) { m = null; }
  if (!m || typeof m !== 'object' || typeof m.checksums !== 'object') {
    m = { v: STORAGE_SCHEMA_VERSION, checksums: {}, updatedAt: Date.now() };
  }
  _integrityCache = m;
  return m;
}

function _saveMeta() {
  var m = _loadMeta();
  try {
    localStorage.setItem(INTEGRITY_META_KEY, JSON.stringify({ v: m.v, checksums: m.checksums, updatedAt: m.updatedAt }));
  } catch (e) {
    // 元数据写入失败仅影响后续校验能力，不影响业务写入本身
  }
}

// 多标签一致性（P1-14 修复）：其他标签页写入 localStorage 会在本页触发 storage 事件，
// 此时失效内存缓存，避免用旧的 checksum 校验新写入的值而被误判为“篡改”→ 数据被忽略。
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', function () { _integrityCache = null; });
}

/**
 * 写入成功后记录指定键的旁路哈希。校验元数据本身不属于受保护键，不会递归。
 */
function _recordIntegrity(key) {
  var raw;
  try { raw = localStorage.getItem(key); } catch (e) { return; }
  if (raw === null) return;
  var m = _loadMeta();
  m.checksums[key] = _hashString(raw);
  m.updatedAt = Date.now();
  _saveMeta();
}

/**
 * 校验指定键的旁路哈希。
 * @returns {'ok'|'untracked'|'tampered'} untracked 表示尚无旁路哈希（旧数据），按通过处理
 */
function _verifyIntegrity(key, raw) {
  var m = _loadMeta();
  if (typeof m.checksums[key] !== 'string') return 'untracked';
  if (_hashString(raw) !== m.checksums[key]) {
    return 'tampered';
  }
  return 'ok';
}

/**
 * 对外校验接口：扫描受保护域（设置 + 全部进度快照），返回整体状态（供工具/审计/设置页展示）。
 * @returns {{version:number, protectedKeys:string[], tampered:string[], untracked:string[], ok:string[]}}
 */
function verifyStorageIntegrity() {
  var m = _loadMeta();
  var all = [KEYS.SETTINGS];
  try {
    for (var z = 0; z < localStorage.length; z++) {
      var kz = localStorage.key(z);
      if (kz && kz.indexOf(PROGRESS_PREFIX) === 0) all.push(kz);
    }
  } catch (e) {}
  var result = { version: m.v, protectedKeys: all, tampered: [], untracked: [], ok: [] };
  for (var i = 0; i < all.length; i++) {
    var key = all[i];
    var raw;
    try { raw = localStorage.getItem(key); } catch (e) { raw = null; }
    if (raw === null) {
      result.untracked.push(key); // 键尚不存在，暂无数据可校验
      continue;
    }
    var r = _verifyIntegrity(key, raw);
    if (r === 'tampered') result.tampered.push(key);
    else if (r === 'untracked') result.untracked.push(key);
    else result.ok.push(key);
  }
  return result;
}
window.verifyStorageIntegrity = verifyStorageIntegrity;
// 便于旧数据迁移时主动补记旁路哈希（例如首次升级后触发一次全量记录）
function backfillStorageIntegrity() {
  var filled = 0;
  var all = [KEYS.SETTINGS];
  try {
    for (var z = 0; z < localStorage.length; z++) {
      var kz = localStorage.key(z);
      if (kz && kz.indexOf(PROGRESS_PREFIX) === 0) all.push(kz);
    }
  } catch (e) {}
  for (var i = 0; i < all.length; i++) {
    var raw;
    try { raw = localStorage.getItem(all[i]); } catch (e) { raw = null; }
    if (raw === null) continue;
    _recordIntegrity(all[i]);
    filled++;
  }
  return filled;
}
window.backfillStorageIntegrity = backfillStorageIntegrity;

/**
 * 清除可重建的缓存类键（题面缓存/横幅/预览等），用于配额超限时的保守回收。
 * @returns {number} 实际删除的键数量
 */
function _evictCacheOnce() {
  var removed = 0;
  try {
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && (k.indexOf('cache') !== -1 || k.indexOf('banner') !== -1 || k.indexOf('preview') !== -1)) {
        try { localStorage.removeItem(k); removed++; } catch (e) {}
      }
    }
  } catch (e) {}
  return removed;
}

/**
 * 清除全部业务数据（P1-17 GDPR/个保法：删除所有本地数据）。
 *   - Web Storage：清 bioquest_* 前缀的 localStorage 与 sessionStorage 键，
 *     保留 Supabase 账号会话 token（sb-*）以维持登录；
 *   - IndexedDB：删除 bioquest-store（Dexie 用户数据：cards/reviews/wrongbook/sessions/settings）
 *     与 BioQuestCache（可重建的模块缓存 DB）。
 * 由于 IndexedDB 删除为异步，本函数返回 Promise<boolean[]>；调用方可 .then 感知结果。
 */
function clearAllLocalData() {
  _integrityCache = null; // 清库后丢弃内存中的校验元数据缓存，避免残留陈旧哈希
  return new Promise(function (resolve) {
    // 1) Web Storage
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf('bioquest_') === 0) localStorage.removeItem(k);
      }
    } catch (e) {}
    try {
      for (var j = sessionStorage.length - 1; j >= 0; j--) {
        var sk = sessionStorage.key(j);
        if (sk && sk.indexOf('bioquest_') === 0) sessionStorage.removeItem(sk);
      }
    } catch (e) {}

    // 2) IndexedDB：优先走 DataStore.clearAll()（会先关闭 Dexie 连接再删库），
    //    覆盖 bioquest-store 用户数据库；BioQuestCache 为可重建模块缓存，一并删除。
    var idbCalls = [];
    if (typeof window.DataStore === 'object' && typeof window.DataStore.clearAll === 'function') {
      idbCalls.push(window.DataStore.clearAll());
    } else {
      idbCalls.push(_deleteIndexedDb('bioquest-store'));
    }
    idbCalls.push(_deleteIndexedDb('BioQuestCache'));

    Promise.all(idbCalls).then(function (results) {
      if (results.join('').indexOf('false') !== -1) {
        console.warn('[TATABOX Storage] 部分 IndexedDB 数据库删除未完成（可能因其他标签页仍打开）。建议关闭其他标签页后重试。');
      }
      resolve(results);
    }, function () {
      resolve([]);
    });
  });
}

/**
 * 直接调用 indexedDB.deleteDatabase（尽力而为，异步）。
 * @returns {Promise<boolean>}
 */
function _deleteIndexedDb(name) {
  return new Promise(function (resolve) {
    if (typeof indexedDB !== 'object' || !indexedDB) { resolve(false); return; }
    var req;
    try { req = indexedDB.deleteDatabase(name); } catch (e) { resolve(false); return; }
    req.onsuccess = function () { resolve(true); };
    req.onerror = function () { resolve(false); };
    req.onblocked = function () { resolve(false); };
  });
}

/**
 * 字符串 hash 函数，将任意字符串转换为稳定的 32 位正整数
 * 用于生成题目数字 ID，避免 parseInt 返回 NaN
 */
function hashQuestionId(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
window.hashQuestionId = hashQuestionId;

/**
 * Issue #10：解析题目稳定 bioID
 *   - 已是 bioID（BQ-…）原样返回；
 *   - 旧 hash/数字 ID 通过 window.bioIdMap（bioid-map.json）映射为 bioID；
 *   - 无法解析则原样返回（回退逻辑由调用方保证）。
 */
function resolveQuestionBioId(id) {
  if (id === undefined || id === null || id === '') return id;
  var s = String(id);
  if (/^BQ-[A-Za-z0-9]+-[0-9a-f]{12}$/.test(s)) return s;
  if (window.bioIdMap && Object.prototype.hasOwnProperty.call(window.bioIdMap, s)) {
    return window.bioIdMap[s];
  }
  return s;
}
window.resolveQuestionBioId = window.resolveQuestionBioId || resolveQuestionBioId;

/**
 * Issue #10：将旧 hash/数字 ID 引用的本地数据迁移到稳定 bioID。
 * 覆盖 favorites（ID 数组）、wrong_questions（{qId}）、records（questions[].questionId/.id）。
 * 幂等：已迁移项（BQ-…）保持不变，重复调用安全。
 * 由 loader.js 在 bioid-map.json 加载就绪后触发。
 * @returns {number} 发生迁移的数据类别数（0 = 无需迁移）
 */
function migrateLocalDataToBioId() {
  var map = window.bioIdMap;
  if (!map || typeof map !== 'object') return 0;
  var resolve = window.resolveQuestionBioId || resolveQuestionBioId;
  var migrated = 0;

  // favorites：旧 hash/数字 ID -> bioID
  var favs = safeGetJSON(KEYS.FAVORITES, []);
  if (Array.isArray(favs)) {
    var newFavs = favs.map(function (id) { return resolve(id); });
    if (JSON.stringify(newFavs) !== JSON.stringify(favs)) {
      safeSetJSON(KEYS.FAVORITES, newFavs);
      migrated++;
    }
  }

  // wrong_questions：{ qId: 旧ID } -> bioID
  var wrongs = safeGetJSON(KEYS.WRONG_QUESTIONS, []);
  if (Array.isArray(wrongs)) {
    var wrongChanged = false;
    for (var i = 0; i < wrongs.length; i++) {
      if (wrongs[i] && wrongs[i].qId) {
        var wBio = resolve(wrongs[i].qId);
        if (wBio !== String(wrongs[i].qId)) {
          wrongs[i].qId = wBio;
          wrongChanged = true;
        }
      }
    }
    if (wrongChanged) {
      safeSetJSON(KEYS.WRONG_QUESTIONS, wrongs);
      migrated++;
    }
  }

  // records：questions[].questionId/.id -> bioID
  var records = safeGetJSON(KEYS.RECORDS, []);
  if (Array.isArray(records)) {
    var recChanged = false;
    for (var r = 0; r < records.length; r++) {
      var qs = records[r] && records[r].questions;
      if (!Array.isArray(qs)) continue;
      for (var q = 0; q < qs.length; q++) {
        var item = qs[q];
        if (!item) continue;
        var oldRef = item.questionId || item.id;
        if (oldRef) {
          var rBio = resolve(oldRef);
          if (rBio !== String(oldRef)) {
            if (item.questionId !== undefined) item.questionId = rBio;
            else item.id = rBio;
            recChanged = true;
          }
        }
      }
    }
    if (recChanged) {
      safeSetJSON(KEYS.RECORDS, records);
      migrated++;
    }
  }

  if (migrated > 0) {
    console.info('[TATABOX Storage] 已迁移 ' + migrated + ' 类本地数据到稳定 bioID');
  }
  return migrated;
}
window.migrateLocalDataToBioId = migrateLocalDataToBioId;

/**
 * 获取设备 ID（唯一标识）
 */
function getDeviceId() {
  var id = localStorage.getItem(KEYS.DEVICE_ID);
  if (!id) {
    id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
    localStorage.setItem(KEYS.DEVICE_ID, id);
  }
  return id;
}

/* ============================================================
 * 用户设置
 * ============================================================ */

function saveSetting(key, value) {
  var settings = safeGetJSON(KEYS.SETTINGS, {});
  settings[key] = value;
  return safeSetJSON(KEYS.SETTINGS, settings);
}

function loadSetting(key, defaultValue) {
  var settings = safeGetJSON(KEYS.SETTINGS, {});
  return settings.hasOwnProperty(key) ? settings[key] : defaultValue;
}

function getAllSettings() {
  return safeGetJSON(KEYS.SETTINGS, {});
}

/* ============================================================
 * Issue #130：离线写操作队列接入
 *  - 离线时把收藏/错题/练习记录的云端同步操作推入 OfflineQueue
 *    （IndexedDB），网络恢复后由 offline-queue.js 自动重放；
 *  - 在线时行为完全不变（直接调用 supabase 同步函数）。
 * ============================================================ */

function _registerOfflineQueueHandlers() {
  if (typeof window === 'undefined' || typeof window.OfflineQueue !== 'object' ||
      typeof window.OfflineQueue.register !== 'function') return;
  if (_offlineQueueRegistered) return;
  _offlineQueueRegistered = true;

  // 练习记录（存储完整 record 结构，重放时原样调用）
  window.OfflineQueue.register('practice-record', function (record) {
    if (typeof window.syncPracticeRecordToSupabase !== 'function') {
      return Promise.reject(new Error('同步 API 未就绪'));
    }
    return Promise.resolve(window.syncPracticeRecordToSupabase(record)).then(function (r) {
      if (r && r.ok === false && r.error) throw new Error(r.error);
    });
  });

  // 收藏 / 取消收藏
  window.OfflineQueue.register('favorite', function (payload) {
    var op;
    if (payload.isFav) {
      op = (typeof window.saveFavorite === 'function')
        ? window.saveFavorite(payload.qId, 1, '', '')
        : Promise.resolve({ ok: false, error: 'saveFavorite 未就绪' });
    } else {
      op = (typeof window.deleteFavorite === 'function')
        ? window.deleteFavorite(payload.qId)
        : Promise.resolve({ ok: false, error: 'deleteFavorite 未就绪' });
    }
    return Promise.resolve(op).then(function (r) {
      if (r && r.ok === false && r.error) throw new Error(r.error);
    });
  });

  // 错题上报（与 _syncWrongToSupabase 的 payload 结构一致）
  window.OfflineQueue.register('wrong-question', function (payload) {
    if (typeof window.saveWrongQuestion !== 'function') {
      return Promise.reject(new Error('saveWrongQuestion 未就绪'));
    }
    return Promise.resolve(window.saveWrongQuestion(payload)).then(function (r) {
      if (r && r.ok === false && r.error) throw new Error(r.error);
    });
  });
}
var _offlineQueueRegistered = false;

/**
 * 离线时把写操作入队并返回 true（调用方直接 return，跳过即时同步）；
 * 在线或队列不可用时返回 false（走原有同步逻辑）。
 */
function _enqueueIfOffline(opType, payload) {
  try {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) return false;
    if (typeof window.OfflineQueue !== 'object' || typeof window.OfflineQueue.enqueue !== 'function') return false;
    _registerOfflineQueueHandlers();
    window.OfflineQueue.enqueue(opType, payload);
    return true;
  } catch (e) {
    return false;
  }
}

/* ============================================================
 * 练习记录
 * ============================================================ */

function saveRecord(record) {
  if (!record) return false;

  var records = safeGetJSON(KEYS.RECORDS, []);

  var fullRecord = {
    id: record.id || 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
    timestamp: record.timestamp || Date.now(),
    // 本地时区日期（与打卡/趋势聚合口径一致，避免 UTC 错位一天；
    // 兜底兼容 utils 尚未就绪的极端时序）
    date: record.date || (typeof localDateStr === 'function' ? localDateStr() : new Date().toISOString().split('T')[0]),
    totalQuestions: record.totalQuestions || 0,
    correctCount: record.correctCount || 0,
    score: record.score || 0,
    totalScore: record.totalScore || 0,
    duration: record.duration || 0,
    module: record.module || 'general',
    questions: record.questions || []
  };

  records.push(fullRecord);

  var maxRecords = 200;
  if (records.length > maxRecords) {
    records.splice(0, records.length - maxRecords);
  }

  var saved = safeSetJSON(KEYS.RECORDS, records);

  try { if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') { window.dispatchEvent(new CustomEvent('bq:record-saved', { detail: { record: fullRecord } })); } } catch (e) {}

  // P0-3: Dual-write 到 Supabase（fire-and-forget，不阻塞 UI）
  _syncPracticeRecordToSupabase(fullRecord);

  return saved;
}

/**
 * P0-3: 异步同步单条练习记录到 Supabase
 * 仅登录用户触发；失败静默（localStorage 已是数据源）
 */
function _syncPracticeRecordToSupabase(fullRecord) {
  if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) return;
  if (typeof window.syncPracticeRecordToSupabase !== 'function') return;
  try {
    // 把 storage.js 格式转换为 supabase-client.js 期望的格式
    var moduleNum = 1;
    var modStr = String(fullRecord.module || '');
    if (/^module[_-]?(\d+)/i.test(modStr)) {
      moduleNum = parseInt(RegExp.$1, 10) || 1;
    } else if (fullRecord.moduleNum) {
      moduleNum = parseInt(fullRecord.moduleNum, 10) || 1;
    }
    var answers = Array.isArray(fullRecord.questions) ? fullRecord.questions.map(function (q, idx) {
      // 「正确」统一为「题级全对」：
      //   - 考试记录（q.correctSubs/totalSubs）：正确子项数 = 总子项数
      //   - 练习记录（仅有满分恒为 2 的 q.score）：得分 = 满分 2 即全对
      var isFullCorrect = q.totalSubs && q.correctSubs
        ? q.correctSubs === q.totalSubs
        : ((q.score || 0) >= 2 - 1e-6);
      return {
        question_id: q.questionId || q.id || idx,
        question: q.question || '',
        subject: q.subject || '',
        concept: q.concept || '',
        userAnswers: q.userAnswers || {},
        correct: isFullCorrect,
        score: q.score || 0
      };
    }) : [];
    var record = {
      answers: answers,
      module_num: moduleNum,
      subject: fullRecord.module || '',
      // 会话总分（得分），而非答对数——答对数由 answers/correctCount 提供
      score: fullRecord.score || 0,
      duration: fullRecord.duration || 0,
      is_correct: fullRecord.totalQuestions > 0 && fullRecord.correctCount === fullRecord.totalQuestions,
      question_id: (answers[0] && answers[0].question_id) || 0
    };
    // Issue #130：离线时入队，网络恢复后自动重放，避免练习记录丢失
    if (_enqueueIfOffline('practice-record', record)) return;
    window.syncPracticeRecordToSupabase(record).catch(function (e) {
      console.warn('[storage] syncPracticeRecordToSupabase 失败:', e && e.message);
    });
  } catch (e) {
    console.warn('[storage] _syncPracticeRecordToSupabase 异常:', e && e.message);
  }
}

function getRecords(options) {
  options = options || {};
  var module = options.module || null;
  var limit = options.limit || null;
  var offset = options.offset || 0;
  var records = safeGetJSON(KEYS.RECORDS, []);

  // 确保 records 是数组
  if (!Array.isArray(records)) {
    records = [];
  }

  records.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });

  if (module) {
    records = records.filter(function (r) { return r.module === module; });
  }

  if (offset > 0) {
    records = records.slice(offset);
  }

  if (limit !== null && limit > 0) {
    records = records.slice(0, limit);
  }

  return records;
}

function clearRecords() {
  return safeSetJSON(KEYS.RECORDS, []);
}

/* ============================================================
 * 收藏题目管理
 * ============================================================ */

function toggleFavorite(qId) {
  if (!qId) return false;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);

  var favorites = safeGetJSON(KEYS.FAVORITES, []);
  var index = favorites.indexOf(qId);

  if (index === -1) {
    favorites.push(qId);
    safeSetJSON(KEYS.FAVORITES, favorites);
    _syncFavoriteToSupabase(qId, true);
    return true;
  } else {
    favorites.splice(index, 1);
    safeSetJSON(KEYS.FAVORITES, favorites);
    _syncFavoriteToSupabase(qId, false);
    return false;
  }
}

function getFavorites() {
  var favs = safeGetJSON(KEYS.FAVORITES, []);
  return Array.isArray(favs) ? favs : [];
}

function isFavorite(qId) {
  if (!qId) return false;
  // Issue #10：与 toggleFavorite 一致，先解析为稳定 bioID 再比对，避免旧 ID 失配
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  var favorites = safeGetJSON(KEYS.FAVORITES, []);
  return favorites.includes(qId);
}

function _syncFavoriteToSupabase(qId, isFav) {
  if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) return;
  var bioId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  // Issue #130：离线时入队，网络恢复后自动重放
  if (_enqueueIfOffline('favorite', { qId: bioId, isFav: !!isFav })) return;
  if (isFav) {
    if (typeof window.saveFavorite === 'function') {
      window.saveFavorite(bioId, 1, '', '');
    } else {
      saveFavorite(bioId, 1, '', '');
    }
  } else {
    if (typeof window.deleteFavorite === 'function') {
      window.deleteFavorite(bioId);
    } else {
      deleteFavorite(bioId);
    }
  }
}

/* ============================================================
 * 题目评分 / 投票 / 回收站 / 管理员覆盖
 * 数据来源：localStorage（QUESTION_RATINGS 等键），配合 js/core/rating.js
 * 的纯函数算法（带中性先验的平滑评分、权重映射、回收判定）使用。
 * ============================================================ */

/**
 * 用户对题目点赞/点踩/取消投票。
 * @param {string} qId 题目 bioId
 * @param {number} vote 1=点赞, -1=点踩, 0=取消
 * @returns {{up:number, down:number, myVote:number}} 更新后的聚合与我的投票
 */
function rateQuestion(qId, vote) {
  if (!qId) return null;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  vote = (vote === 1 || vote === -1) ? vote : 0;

  var ratings = safeGetJSON(KEYS.QUESTION_RATINGS, {});
  if (!ratings || typeof ratings !== 'object') ratings = {};
  var rec = ratings[qId] || { up: 0, down: 0 };

  var myVotes = safeGetJSON(KEYS.QUESTION_MY_VOTES, {});
  if (!myVotes || typeof myVotes !== 'object') myVotes = {};
  var prev = myVotes[qId] || 0;

  // 先撤销旧投票，再应用新投票
  if (prev === 1) rec.up = Math.max(0, (rec.up || 0) - 1);
  else if (prev === -1) rec.down = Math.max(0, (rec.down || 0) - 1);

  if (vote === 1) rec.up = (rec.up || 0) + 1;
  else if (vote === -1) rec.down = (rec.down || 0) + 1;

  if (vote === 0) delete myVotes[qId];
  else myVotes[qId] = vote;

  // 评分归零则删除记录，避免残留无意义数据
  if ((rec.up || 0) <= 0 && (rec.down || 0) <= 0) delete ratings[qId];
  else ratings[qId] = { up: rec.up || 0, down: rec.down || 0 };

  safeSetJSON(KEYS.QUESTION_RATINGS, ratings);
  safeSetJSON(KEYS.QUESTION_MY_VOTES, myVotes);

  // 触发评分变化事件（页面刷新 tag / 权重）
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('bq:question-rated', {
        detail: { qId: qId, up: ratings[qId] ? ratings[qId].up : 0, down: ratings[qId] ? ratings[qId].down : 0, myVote: myVotes[qId] || 0 }
      }));
    }
  } catch (e) {}

  return { up: ratings[qId] ? ratings[qId].up : 0, down: ratings[qId] ? ratings[qId].down : 0, myVote: myVotes[qId] || 0 };
}

/**
 * 读取单题评分聚合（不含算法计算）。
 * @returns {{up:number, down:number}|null}
 */
function getQuestionRating(qId) {
  if (!qId) return null;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  var ratings = safeGetJSON(KEYS.QUESTION_RATINGS, {});
  var rec = (ratings && typeof ratings === 'object') ? ratings[qId] : null;
  return rec ? { up: rec.up || 0, down: rec.down || 0 } : null;
}

/**
 * 我的投票（1=赞, -1=踩, 0=未投）。
 */
function getMyVote(qId) {
  if (!qId) return 0;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  var myVotes = safeGetJSON(KEYS.QUESTION_MY_VOTES, {});
  return (myVotes && typeof myVotes === 'object' && myVotes[qId]) ? myVotes[qId] : 0;
}

/**
 * 全部题目评分聚合（供管理员界面 / 诊断工具使用）。
 * @returns {Object} { [bioId]: { up, down } }
 */
function getAllQuestionRatings() {
  var ratings = safeGetJSON(KEYS.QUESTION_RATINGS, {});
  return (ratings && typeof ratings === 'object') ? ratings : {};
}

/**
 * 管理员重新给题目评分（直接覆盖 up/down 计数；用于误判后的纠偏）。
 * @returns {boolean}
 */
function adminSetQuestionRating(qId, up, down) {
  if (!qId) return false;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  up = Math.max(0, parseInt(up, 10) || 0);
  down = Math.max(0, parseInt(down, 10) || 0);
  var ratings = safeGetJSON(KEYS.QUESTION_RATINGS, {});
  if (!ratings || typeof ratings !== 'object') ratings = {};
  if (up === 0 && down === 0) delete ratings[qId];
  else ratings[qId] = { up: up, down: down };
  return safeSetJSON(KEYS.QUESTION_RATINGS, ratings);
}

/**
 * 移入回收站（低分题目自动调用；管理员也可手动调用）。
 * @returns {boolean}
 */
function recycleQuestion(qId) {
  if (!qId) return false;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  var list = safeGetJSON(KEYS.QUESTION_RECYCLED, []);
  if (!Array.isArray(list)) list = [];
  if (list.indexOf(qId) === -1) {
    list.push(qId);
    safeSetJSON(KEYS.QUESTION_RECYCLED, list);
  }
  return true;
}

/**
 * 从回收站恢复题目。
 */
function unrecycleQuestion(qId) {
  if (!qId) return false;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  var list = safeGetJSON(KEYS.QUESTION_RECYCLED, []);
  if (!Array.isArray(list)) list = [];
  var idx = list.indexOf(qId);
  if (idx !== -1) {
    list.splice(idx, 1);
    safeSetJSON(KEYS.QUESTION_RECYCLED, list);
    return true;
  }
  return false;
}

/**
 * 判断题目是否在回收站。
 */
function isQuestionRecycled(qId) {
  if (!qId) return false;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  var list = safeGetJSON(KEYS.QUESTION_RECYCLED, []);
  return Array.isArray(list) && list.indexOf(qId) !== -1;
}

/**
 * 获取全部回收站题目 bioId 列表。
 */
function getRecycledQuestionIds() {
  var list = safeGetJSON(KEYS.QUESTION_RECYCLED, []);
  return Array.isArray(list) ? list : [];
}

/**
 * 管理员覆盖本地题目内容（修改题干/选项/解析等）。
 * 存储格式：{ [bioId]: { updatedAt, patch } }，patch 为题目字段的部分更新。
 * @returns {boolean}
 */
function setQuestionOverride(qId, patch) {
  if (!qId || !patch || typeof patch !== 'object') return false;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  var overrides = safeGetJSON(KEYS.QUESTION_OVERRIDES, {});
  if (!overrides || typeof overrides !== 'object') overrides = {};
  overrides[qId] = { updatedAt: Date.now(), patch: patch };
  return safeSetJSON(KEYS.QUESTION_OVERRIDES, overrides);
}

/**
 * 读取单题管理员覆盖（无则 null）。
 */
function getQuestionOverride(qId) {
  if (!qId) return null;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  var overrides = safeGetJSON(KEYS.QUESTION_OVERRIDES, {});
  var o = (overrides && typeof overrides === 'object') ? overrides[qId] : null;
  return (o && o.patch && typeof o.patch === 'object') ? o.patch : null;
}

/**
 * 清空单题管理员覆盖。
 */
function clearQuestionOverride(qId) {
  if (!qId) return false;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  var overrides = safeGetJSON(KEYS.QUESTION_OVERRIDES, {});
  if (!overrides || typeof overrides !== 'object' || !overrides[qId]) return false;
  delete overrides[qId];
  return safeSetJSON(KEYS.QUESTION_OVERRIDES, overrides);
}

/**
 * 应用管理员覆盖到题目对象（返回浅拷贝，不改动原对象）。
 * @param {Object} q 题目对象
 * @returns {Object} 应用覆盖后的题目副本
 */
function applyQuestionOverride(q) {
  if (!q || typeof q !== 'object') return q;
  var patch = getQuestionOverride(getQuestionBioIdSafe(q));
  if (!patch) return q;
  return Object.assign({}, q, patch);
}

function getQuestionBioIdSafe(q) {
  if (!q) return '';
  var raw = q.bioId || q.id;
  if (raw === undefined || raw === null || raw === '') {
    raw = String(hashQuestionId((q.question || '') + (q.concept || '')));
  }
  return String((window.resolveQuestionBioId || resolveQuestionBioId)(raw));
}
window.getQuestionBioIdSafe = getQuestionBioIdSafe;

/* —— 题目评分 / 投票 / 回收站 / 管理员覆盖：显式暴露到全局（浏览器 script 与测试均可用） —— */
window.rateQuestion = rateQuestion;
window.getQuestionRating = getQuestionRating;
window.getMyVote = getMyVote;
window.getMyVoteForQuestion = getMyVote;
window.getAllQuestionRatings = getAllQuestionRatings;
window.adminSetQuestionRating = adminSetQuestionRating;
window.setQuestionRating = adminSetQuestionRating;
window.recycleQuestion = recycleQuestion;
window.unrecycleQuestion = unrecycleQuestion;
window.restoreQuestion = unrecycleQuestion;
window.isQuestionRecycled = isQuestionRecycled;
window.getRecycledQuestionIds = getRecycledQuestionIds;
window.setQuestionOverride = setQuestionOverride;
window.saveQuestionOverride = setQuestionOverride;
window.getQuestionOverride = getQuestionOverride;
window.clearQuestionOverride = clearQuestionOverride;
window.applyQuestionOverride = applyQuestionOverride;

/* ============================================================
 * 错题管理
 * ============================================================ */

function addWrongQuestion(qId, module, questionText, fullQuestion) {
  if (!qId) return false;
  // 兼容对象入参（quiz.js 等调用 addWrongQuestion(question)：完整题目对象）
  if (typeof qId === 'object') {
    var obj = qId;
    fullQuestion = fullQuestion || obj;
    questionText = questionText || obj.question_text || obj.question || '';
    module = module || obj.module || obj.subject || 'general';
    qId = obj.question_id || obj.bioId || obj.id || obj.qId || '';
  }
  if (!qId) return false;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  module = module || 'general';
  questionText = questionText || '';

  var wrongQuestions = safeGetJSON(KEYS.WRONG_QUESTIONS, []);
  var existing = null;
  for (var i = 0; i < wrongQuestions.length; i++) {
    if (wrongQuestions[i].qId === qId) {
      existing = wrongQuestions[i];
      break;
    }
  }

  if (existing) {
    var origTs = existing.timestamp || Date.now();
    existing.wrongCount = (existing.wrongCount || 1) + 1;
    existing.timestamp = Date.now();
    // 触碰时补齐早期条目缺失的展示字段（错题本列表/FSRS 徽标依赖）
    if (!existing.id) existing.id = qId;
    if (!existing.question_text && questionText) {
      existing.question_text = questionText;
      existing.questionText = questionText;
    }
    if (!existing.subject) existing.subject = (fullQuestion && fullQuestion.subject) || module;
    if (!existing.concept && fullQuestion && fullQuestion.concept) existing.concept = fullQuestion.concept;
    if (!existing.created_at) existing.created_at = new Date(origTs).toISOString();
  } else {
    var ts = Date.now();
    wrongQuestions.push({
      id: qId,
      qId: qId,
      module: module,
      questionText: questionText,
      question_text: questionText,
      subject: (fullQuestion && fullQuestion.subject) || module,
      concept: (fullQuestion && fullQuestion.concept) || '',
      created_at: new Date(ts).toISOString(),
      timestamp: ts,
      wrongCount: 1,
      fullQuestion: typeof fullQuestion === 'object' ? fullQuestion : null
    });
  }

  safeSetJSON(KEYS.WRONG_QUESTIONS, wrongQuestions);
  // 标本馆口径（设计方案 9.1）：同题再次做错 → 自动出馆重新排队列，
  // 首次做错日期（collectedAt）保留原值，入馆日期清空待重记。
  _specimenExit(qId, 'relapsed');
  _syncWrongToSupabase(qId, module, questionText, existing ? existing.wrongCount : 1);
  return true;
}

function getWrongQuestions(options) {
  options = options || {};
  var module = options.module || null;
  var wrongQuestions = safeGetJSON(KEYS.WRONG_QUESTIONS, []);

  // 确保 wrongQuestions 是数组
  if (!Array.isArray(wrongQuestions)) {
    wrongQuestions = [];
  }

  // 读取归一化：历史上多条写入路径字段不一（quiz 对象入参 / 早期 {qId,questionText}），
  // 统一补齐错题本列表渲染与 FSRS 徽标联接所需的规范字段
  wrongQuestions = wrongQuestions.map(function (item) {
    if (!item || typeof item !== 'object') return item;
    var fq = (item.fullQuestion && typeof item.fullQuestion === 'object') ? item.fullQuestion : {};
    var text = item.question_text || item.questionText || fq.question || '';
    var ts = item.timestamp || (item.created_at ? Date.parse(item.created_at) : 0) || 0;
    var norm = Object.assign({}, item);
    norm.id = item.id || item.qId || '';
    norm.qId = item.qId || item.id || '';
    norm.question_id = item.question_id || norm.qId;
    norm.question_text = text;
    norm.questionText = item.questionText || text;
    norm.subject = item.subject || fq.subject || item.module || '';
    norm.concept = item.concept || fq.concept || '';
    norm.created_at = item.created_at || (ts ? new Date(ts).toISOString() : '');
    norm.timestamp = ts;
    norm.module = item.module || norm.subject || 'general';
    return norm;
  });

  wrongQuestions.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });

  if (module) {
    wrongQuestions = wrongQuestions.filter(function (item) { return item.module === module; });
  }

  return wrongQuestions;
}

function removeWrongQuestion(qId) {
  if (!qId) return false;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);

  var wrongQuestions = safeGetJSON(KEYS.WRONG_QUESTIONS, []);
  var index = -1;
  for (var i = 0; i < wrongQuestions.length; i++) {
    if (wrongQuestions[i].qId === qId) {
      index = i;
      break;
    }
  }
  if (index === -1) return false;

  wrongQuestions.splice(index, 1);
  safeSetJSON(KEYS.WRONG_QUESTIONS, wrongQuestions);

  if (window.isLoggedIn && window.isLoggedIn()) {
    if (typeof window.deleteWrongQuestion === 'function') {
      window.deleteWrongQuestion(qId);
    } else {
      deleteWrongQuestion(qId);
    }
  }

  return true;
}

/* ============================================================
 * 标本馆（设计方案 9.1）——已掌握错题的馆藏档案
 * 数据口径（写死，防止馆藏量撒谎）：
 *  - 入馆：引擎判定"已掌握"后由 specAddSpecimen 单点写入，同时移出待处理队列；
 *  - 出馆：同题再次做错 → addWrongQuestion 内 _specimenExit('relapsed') 自动出馆
 *          重新排队列（collectedAt 保留、enteredAt 清空待重记）；
 *  - 手动：specRemoveSpecimen 供用户主动"移出馆藏"重练。
 * ============================================================ */

function getSpecimens() {
  var list = safeGetJSON(KEYS.SPECIMENS, []);
  if (!Array.isArray(list)) list = [];
  // 只显示在馆标本（enteredAt > 0）；已出馆记录保留采集日期、待重记入馆日期
  list = list.filter(function (s) { return s && (s.enteredAt || 0) > 0; });
  // 新入馆在前
  list.sort(function (a, b) { return (b.enteredAt || 0) - (a.enteredAt || 0); });
  return list;
}

function getSpecimenCount() {
  var list = safeGetJSON(KEYS.SPECIMENS, []);
  if (!Array.isArray(list)) return 0;
  return list.filter(function (s) { return s && (s.enteredAt || 0) > 0; }).length;
}

/**
 * 入馆（引擎单点写入；同时把该题移出待处理错题队列）
 * @param {{qId:string, subject?:string, module?:string, text?:string, collectedAt?:number}} spec
 *        collectedAt = 首次做错日期（取自队列记录 timestamp），缺省取当前时间
 */
function specAddSpecimen(spec) {
  if (!spec || !spec.qId) return false;
  var qId = (window.resolveQuestionBioId || resolveQuestionBioId)(spec.qId);
  var list = safeGetJSON(KEYS.SPECIMENS, []);
  if (!Array.isArray(list)) list = [];

  var now = Date.now();
  var exist = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].qId === qId) { exist = list[i]; break; }
  }
  if (exist) {
    exist.enteredAt = now;
    exist.subject = spec.subject || exist.subject;
    exist.module = spec.module || exist.module;
    exist.text = spec.text || exist.text;
  } else {
    list.push({
      qId: qId,
      subject: spec.subject || '',
      module: spec.module || '',
      text: spec.text || '',
      collectedAt: spec.collectedAt || now,
      enteredAt: now
    });
  }
  safeSetJSON(KEYS.SPECIMENS, list);

  // 已掌握 → 移出待处理队列（本地 + 云端 dual-write 走 removeWrongQuestion 既有路径）
  if (typeof removeWrongQuestion === 'function' && _getWrongIndex(qId) !== -1) {
    removeWrongQuestion(qId);
  }
  _broadcastSpecimen();
  return true;
}

function _getWrongIndex(qId) {
  var wrongQuestions = safeGetJSON(KEYS.WRONG_QUESTIONS, []);
  if (!Array.isArray(wrongQuestions)) return -1;
  for (var i = 0; i < wrongQuestions.length; i++) {
    if (wrongQuestions[i].qId === qId) return i;
  }
  return -1;
}

/** 出馆（供 addWrongQuestion 的 relapse 路径调用；reason: relapsed | manual）
 *  口径（9.1）：不删除记录——采集日期（collectedAt）保留原值，
 *  仅清空入馆日期（enteredAt=0，"清空待重记"）；再次掌握时重新写入。 */
function _specimenExit(qId, reason) {
  if (!qId) return false;
  var list = safeGetJSON(KEYS.SPECIMENS, []);
  if (!Array.isArray(list)) return false;
  var changed = false;
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].qId === qId && (list[i].enteredAt || 0) > 0) {
      list[i].enteredAt = 0;
      changed = true;
      break;
    }
  }
  if (!changed) return false;
  safeSetJSON(KEYS.SPECIMENS, list);
  _broadcastSpecimen();
  return true;
}

/**
 * 手动"移出馆藏"（重新进入错题队列，供用户主动重练）
 * 云端 review_cards/wrong_questions 行保留不动（重练依赖 FSRS 状态），
 * 仅把队列侧补回：由调用方用原题数据重建本地队列。
 */
function specRemoveSpecimen(qId) {
  if (!qId) return false;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);
  return _specimenExit(qId, 'manual');
}

function _broadcastSpecimen() {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('bq:specimen-changed'));
    }
  } catch (e) {}
}

function _syncWrongToSupabase(qId, module, questionText, wrongCount) {
  if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) return;
  qId = (window.resolveQuestionBioId || resolveQuestionBioId)(qId);

  // 尝试获取完整题目对象（含选项、答案等）
  var wrongQuestions = safeGetJSON(KEYS.WRONG_QUESTIONS, []);
  var fullQuestion = null;
  for (var i = 0; i < wrongQuestions.length; i++) {
    if (wrongQuestions[i].qId === qId && wrongQuestions[i].fullQuestion) {
      fullQuestion = wrongQuestions[i].fullQuestion;
      break;
    }
  }

  var payload = {
    question_id: qId,
    module_num: parseInt(module) || 1,
    question_text: questionText || '',
    subject: '',
    wrong_count: wrongCount || 1
  };

  // 如果有完整题目，序列化存入 extra 字段
  if (fullQuestion) {
    try {
      payload.extra_data = JSON.stringify({
        options: fullQuestion.options || null,
        answer: fullQuestion.answer || null,
        explanation: fullQuestion.explanation || '',
        sub_questions: fullQuestion.subQuestions || null
      });
    } catch(e) {}
  }

  // Issue #130：离线时入队，网络恢复后自动重放（payload 与队列重放结构一致）
  if (_enqueueIfOffline('wrong-question', payload)) return;
  if (typeof window.saveWrongQuestion === 'function') {
    window.saveWrongQuestion(payload);
  } else {
    saveWrongQuestion(payload);
  }
}

/* ============================================================
 * 学习统计
 * ============================================================ */

function updateStats(module, correct) {
  if (!module) return false;

  var stats = safeGetJSON(KEYS.STATS, {});

  if (!stats[module]) {
    stats[module] = {
      totalAnswered: 0,
      totalCorrect: 0,
      accuracy: 0
    };
  }

  stats[module].totalAnswered += 1;
  if (correct) {
    stats[module].totalCorrect += 1;
  }

  stats[module].accuracy = stats[module].totalAnswered > 0
    ? Math.round((stats[module].totalCorrect / stats[module].totalAnswered) * 100)
    : 0;

  return safeSetJSON(KEYS.STATS, stats);
}

function getStats(module) {
  var stats = safeGetJSON(KEYS.STATS, {});

  if (module) {
    return stats[module] || {
      totalAnswered: 0,
      totalCorrect: 0,
      accuracy: 0
    };
  }

  var overall = {
    totalAnswered: 0,
    totalCorrect: 0,
    modules: {}
  };
  for (var key in stats) {
    if (stats.hasOwnProperty(key)) {
      overall.modules[key] = stats[key];
    }
  }

  for (var mod in stats) {
    if (stats.hasOwnProperty(mod)) {
      overall.totalAnswered += stats[mod].totalAnswered || 0;
      overall.totalCorrect += stats[mod].totalCorrect || 0;
    }
  }

  overall.accuracy = overall.totalAnswered > 0
    ? Math.round((overall.totalCorrect / overall.totalAnswered) * 100)
    : 0;

  return overall;
}

/* ============================================================
 * 数据导出 / 导入（支持 AES-GCM 加密）
 * ============================================================ */

/**
 * AES-GCM 加密备份数据
 * @param {string} jsonString - 要加密的 JSON 字符串
 * @returns {Promise<Object>} 加密后的备份对象
 */
async function encryptBackup(jsonString) {
  var enc = new TextEncoder();
  var keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode('bioquest_backup_key'));
  var key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt']);
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(jsonString));

  // 手动转 Base64，避免 String.fromCharCode.apply 对大数组栈溢出
  var ivBase64 = uint8ToBase64(iv);
  var dataBase64 = uint8ToBase64(new Uint8Array(encrypted));

  return {
    encrypted: true,
    iv: ivBase64,
    data: dataBase64,
    version: '2.0.0'
  };
}

/**
 * AES-GCM 解密备份数据
 * @param {Object} backupObj - 加密的备份对象 { encrypted, iv, data, version }
 * @returns {Promise<string>} 解密后的 JSON 字符串
 */
async function decryptBackup(backupObj) {
  var enc = new TextEncoder();
  var dec = new TextDecoder();
  var keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode('bioquest_backup_key'));
  var key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['decrypt']);
  var iv = base64ToUint8(backupObj.iv);
  var data = base64ToUint8(backupObj.data);
  var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
  return dec.decode(decrypted);
}

/**
 * Uint8Array 转 Base64（循环方式，避免 apply 栈溢出）
 */
function uint8ToBase64(uint8Arr) {
  var binary = '';
  for (var i = 0; i < uint8Arr.length; i++) {
    binary += String.fromCharCode(uint8Arr[i]);
  }
  return btoa(binary);
}

/**
 * Base64 转 Uint8Array
 */
function base64ToUint8(base64) {
  var binary = atob(base64);
  var uint8 = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    uint8[i] = binary.charCodeAt(i);
  }
  return uint8;
}

/**
 * 导出数据
 * @param {Object} options - 导出选项 { encrypted: boolean }，默认 encrypted=true
 * @returns {Promise<Object|null>} 导出的数据对象
 */
async function exportData(options) {
  options = options || {};
  var useEncryption = options.encrypted !== false;

  try {
    var records = safeGetJSON(KEYS.RECORDS, []);
    var stats = getStats();

    var data = {
      version: '2.0.0',
      exportDate: new Date().toISOString(),
      deviceId: getDeviceId(),
      appVersion: '2.0.0',
      exportType: 'bioquest_full_backup',
      practiceCount: records.length,
      totalAnswered: stats.totalAnswered || 0,
      totalCorrect: stats.totalCorrect || 0,
      accuracy: stats.accuracy || 0,
      settings: safeGetJSON(KEYS.SETTINGS, {}),
      records: records,
      favorites: safeGetJSON(KEYS.FAVORITES, []),
      wrongQuestions: safeGetJSON(KEYS.WRONG_QUESTIONS, []),
      stats: safeGetJSON(KEYS.STATS, {}),
      habits: safeGetJSON('bioquest_habits', []),
      habitLogs: safeGetJSON('bioquest_habit_logs', []),
      badges: safeGetJSON('bioquest_badges', []),
      progress: getAllLocalProgress()
    };

    // 如果 calcBioScore 函数存在，计算并包含 Bio Score
    if (typeof calcBioScore === 'function') {
      try {
        var bioScoreResult = calcBioScore(stats);
        data.bioScore = bioScoreResult;
      } catch (e) {
        console.warn('[TATABOX Storage] 计算 Bio Score 失败:', e.message);
      }
    }

    var json = JSON.stringify(data, null, 2);
    var blob, fileExt, mimeType;

    if (useEncryption) {
      var encryptedObj = await encryptBackup(json);
      var encryptedJson = JSON.stringify(encryptedObj, null, 2);
      blob = new Blob([encryptedJson], { type: 'application/octet-stream' });
      fileExt = '.bqb';
    } else {
      blob = new Blob([json], { type: 'application/json' });
      fileExt = '.json';
    }

    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'bioquest-backup-' + new Date().toISOString().split('T')[0] + fileExt;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return data;
  } catch (e) {
    console.error('[TATABOX Storage] 数据导出失败:', e.message);
    return null;
  }
}

/**
 * 导入数据（支持加密和明文格式）
 * @param {string} jsonString - 导入的 JSON 字符串
 * @returns {Promise<boolean>} 是否导入成功
 */
async function importData(jsonString) {
  try {
    var raw = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

    if (!raw || typeof raw !== 'object') {
      throw new Error('无效的数据格式');
    }

    var data;

    // 检测是否为加密数据
    if (raw.encrypted === true && raw.iv && raw.data) {
      try {
        var decryptedStr = await decryptBackup(raw);
        data = JSON.parse(decryptedStr);
      } catch (e) {
        throw new Error('解密失败，文件可能已损坏或密钥不匹配');
      }
    } else {
      data = raw;
    }

    // 版本兼容性检查
    var dataVersion = data.version || '1.0.0';
    var currentVersion = '2.0.0';

    if (!data || typeof data !== 'object') {
      throw new Error('无效的数据格式');
    }

    if (data.settings) safeSetJSON(KEYS.SETTINGS, data.settings);

    if (data.records) {
      var existingRecords = safeGetJSON(KEYS.RECORDS, []);
      var existingIds = {};
      for (var i = 0; i < existingRecords.length; i++) {
        existingIds[existingRecords[i].id] = true;
      }
      var newRecords = [];
      for (var j = 0; j < data.records.length; j++) {
        if (!existingIds[data.records[j].id]) {
          newRecords.push(data.records[j]);
        }
      }
      safeSetJSON(KEYS.RECORDS, existingRecords.concat(newRecords));
    }

    if (data.favorites) {
      var existingFavs = safeGetJSON(KEYS.FAVORITES, []);
      var merged = [];
      var seen = {};
      for (var k = 0; k < existingFavs.length; k++) {
        seen[existingFavs[k]] = true;
        merged.push(existingFavs[k]);
      }
      for (var m = 0; m < data.favorites.length; m++) {
        if (!seen[data.favorites[m]]) {
          merged.push(data.favorites[m]);
          seen[data.favorites[m]] = true;
        }
      }
      safeSetJSON(KEYS.FAVORITES, merged);
    }

    if (data.wrongQuestions) {
      var existingWrong = safeGetJSON(KEYS.WRONG_QUESTIONS, []);
      var existingWrongIds = {};
      for (var n = 0; n < existingWrong.length; n++) {
        existingWrongIds[existingWrong[n].qId] = true;
      }
      var newWrong = [];
      for (var p = 0; p < data.wrongQuestions.length; p++) {
        if (!existingWrongIds[data.wrongQuestions[p].qId]) {
          newWrong.push(data.wrongQuestions[p]);
        }
      }
      safeSetJSON(KEYS.WRONG_QUESTIONS, existingWrong.concat(newWrong));
    }

    if (data.stats) {
      // 备份是同一设备的全量快照（见 exportData：导出完整 KEYS.STATS）。
      // 直接「覆盖」而非相加合并，否则重复导入同一备份会让
      // totalAnswered/totalCorrect 翻倍累积（records/favorites 均有去重，stats 必须一致）。
      var mergedStats = {};
      for (var mod in data.stats) {
        if (data.stats.hasOwnProperty(mod)) {
          var src = data.stats[mod] || {};
          var dst = {
            totalAnswered: src.totalAnswered || 0,
            totalCorrect: src.totalCorrect || 0,
            accuracy: src.accuracy || 0
          };
          if (dst.totalAnswered > 0) {
            dst.accuracy = Math.round((dst.totalCorrect / dst.totalAnswered) * 100);
          }
          mergedStats[mod] = dst;
        }
      }
      safeSetJSON(KEYS.STATS, mergedStats);
    }

    // Issue #13：恢复进度快照（LWW：仅当导入项较新时覆盖）
    if (data && data.progress && typeof data.progress === 'object') {
      for (var pk in data.progress) {
        if (!data.progress.hasOwnProperty(pk)) continue;
        var pmeta = data.progress[pk];
        if (!pmeta || pmeta.data === undefined) continue;
        var existingProgress = loadProgress(pk);
        if (!existingProgress || (pmeta.updatedAt || 0) >= (existingProgress.updatedAt || 0)) {
          _saveProgressLocalOnly(pk, pmeta.data, pmeta.updatedAt || 0);
        }
      }
    }

    return true;
  } catch (e) {
    console.error('[TATABOX Storage] 数据导入失败:', e.message);
    return false;
  }
}

function getStorageUsage() {
  try {
    var used = 0;
    for (var key in KEYS) {
      if (KEYS.hasOwnProperty(key)) {
        var value = localStorage.getItem(KEYS[key]);
        if (value) {
          used += KEYS[key].length + value.length;
        }
      }
    }
    var available = 5 * 1024 * 1024;
    return { used: used, available: available };
  } catch (e) {
    return { used: 0, available: 0 };
  }
}

/* ============================================================
 * Issue #134：大数据压缩（lz-string，同步、零网络依赖）
 *  - 依赖 js/vendor/lz-string.min.js（MIT，已在 vendor 完整性清单登记）；
 *  - 仅对超过阈值的进度快照自动做 Base64 压缩，压缩无效（无明显收益）时
 *    自动回退明文，保证不会出现「压缩反而更大」的负优化；
 *  - 信封格式：{ __bqz:1, s:"<compressToBase64 输出>" }，读写路径
 *    （saveProgress / loadProgress / getAllLocalProgress）自动编解码，
 *    其它模块无感知；未加载 lz-string 时整体透明禁用。
 * ============================================================ */
var _LZ = null;
if (typeof window !== 'undefined' && window.LZString &&
    typeof window.LZString.compressToBase64 === 'function' &&
    typeof window.LZString.decompressFromBase64 === 'function') {
  _LZ = window.LZString;
}
var COMPRESS_THRESHOLD = 2048; // 明文 JSON 超过该字符数才考虑压缩
var PROGRESS_Z_MARK = '__bqz';

function _maybeCompressMeta(meta) {
  if (!_LZ) return meta;
  var json;
  try { json = JSON.stringify(meta); } catch (e) { return meta; }
  if (!json || json.length <= COMPRESS_THRESHOLD) return meta;
  var compressed = _LZ.compressToBase64(json);
  // 压缩后仍不小于明文（≈信封开销 24 字符），放弃压缩避免负优化
  if (compressed.length + 24 >= json.length) return meta;
  return { __bqz: 1, s: compressed };
}

function _decompressMeta(parsed) {
  if (!(parsed && parsed.__bqz === 1 && typeof parsed.s === 'string' && _LZ)) {
    return parsed;
  }
  try {
    var json = _LZ.decompressFromBase64(parsed.s);
    if (json) {
      var restored = JSON.parse(json);
      return restored && typeof restored === 'object' ? restored : parsed;
    }
  } catch (e) {
    console.warn('[TATABOX Storage] 进度快照解压失败，按损坏处理：', e.message);
  }
  return parsed;
}

/* ============================================================
 * Issue #13：用户进度快照（localStorage 键值 + LWW 云端同步）
 * 进度键前缀：bioquest_progress_<key>，值格式 { updatedAt, deviceId, data }
 * 配套表：user_progress（sql/migration_v8_user_progress.sql）
 * 同步：pushUserProgressToSupabase / pullUserProgressFromSupabase（supabase-client.js）
 * ============================================================ */
var PROGRESS_PREFIX = 'bioquest_progress_';
var _progressSyncTimers = {};
var _progressSyncInflight = null;

/**
 * 保存一条进度快照到本地，并触发防抖云端同步。
 * 供各模块（如 fsrs-algorithm）在数据变更时调用，非阻塞。
 * @param {string} key - 进度键（如 'fsrs_cards'、'stats'）
 * @param {*} data - 快照数据（JSON 可序列化）
 * @returns {{updatedAt:number, deviceId:string, data:*} | null}
 */
function saveProgress(key, data) {
  if (!key) return null;
  var meta = { updatedAt: Date.now(), deviceId: getDeviceId(), data: data };
  // Issue #134：大 payload 自动压缩存储（压缩无收益时自动回退明文）
  safeSetJSON(PROGRESS_PREFIX + key, _maybeCompressMeta(meta));
  scheduleProgressSync(key);
  return meta;
}

/**
 * 读取进度快照（自动解压 Issue #134 的压缩信封；兼容明文旧数据）。
 */
function loadProgress(key) {
  if (!key) return null;
  return _decompressMeta(safeGetJSON(PROGRESS_PREFIX + key, null));
}

/**
 * 收集本地全部进度快照：{ key: { updatedAt, deviceId, data } }
 * 用于备份导出 / 云端上传。
 */
function getAllLocalProgress() {
  var result = {};
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(PROGRESS_PREFIX) === 0) {
        // Issue #134：自动解压压缩信封后再判断 data 字段
        var meta = _decompressMeta(safeGetJSON(k, null));
        if (meta && meta.data !== undefined) result[k.slice(PROGRESS_PREFIX.length)] = meta;
      }
    }
  } catch (e) {}
  return result;
}

/**
 * 仅写本地（不触发再次同步），用于接收云端拉取结果，避免同步回环。
 */
function _saveProgressLocalOnly(key, data, updatedAt) {
  if (!key) return;
  safeSetJSON(PROGRESS_PREFIX + key, {
    updatedAt: typeof updatedAt === 'number' && updatedAt > 0 ? updatedAt : Date.now(),
    deviceId: getDeviceId() || 'local',
    data: data
  });
}

/**
 * 防抖安排一次云端同步（默认 3s），把高频写入（如连续复习）聚合成一次上传。
 * 避免每次评分都触发整份快照上传，同时保证会话结束后不久即完成持久化。
 */
function scheduleProgressSync(key) {
  if (typeof setTimeout !== 'function') return;
  if (_progressSyncTimers[key]) clearTimeout(_progressSyncTimers[key]);
  _progressSyncTimers[key] = setTimeout(function () {
    delete _progressSyncTimers[key];
    syncLocalProgressToCloud([key]).catch(function () {});
  }, 3000);
}

/**
 * 将本地进度同步到云端（LWW），并拉取远端较新快照覆盖本地。
 * @param {string[]|undefined} [keys] - 指定只同步这些键；缺省同步所有本地键
 * @returns {Promise<{ok:boolean, push?:Object, merge?:Array, error?:string}>}
 */
function syncLocalProgressToCloud(keys) {
  if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) {
    return Promise.resolve({ ok: false, error: '未登录' });
  }
  if (typeof window.pushUserProgressToSupabase !== 'function' ||
      typeof window.pullUserProgressFromSupabase !== 'function') {
    return Promise.resolve({ ok: false, error: '同步 API 未就绪' });
  }
  if (_progressSyncInflight) return _progressSyncInflight;

  var local = getAllLocalProgress();
  var wanted = (Array.isArray(keys) && keys.length) ? keys : Object.keys(local);

  _progressSyncInflight = (async function () {
    try {
      // 1) 推送本地较新快照到云端
      var pushResults = {};
      for (var i = 0; i < wanted.length; i++) {
        var key = wanted[i];
        var meta = local[key];
        if (!meta) continue;
        var r = await window.pushUserProgressToSupabase(key, meta.data, meta.updatedAt);
        pushResults[key] = r;
      }

      // 2) 拉取远端快照，LWW 合并到本地
      var merge = [];
      var remote = await window.pullUserProgressFromSupabase();
      if (remote && remote.length) {
        for (var j = 0; j < remote.length; j++) {
          var row = remote[j];
          var localMeta = local[row.key];
          if (!localMeta || row.updated_at > (localMeta.updatedAt || 0)) {
            // 本地缺失或云端较新 → 采用云端
            _saveProgressLocalOnly(row.key, row.data, row.updated_at);
            merge.push({ key: row.key, direction: 'pull' });
          } else {
            merge.push({ key: row.key, direction: 'local' });
          }
        }
      }
      return { ok: true, push: pushResults, merge: merge };
    } catch (e) {
      return { ok: false, error: e && e.message };
    } finally {
      _progressSyncInflight = null;
    }
  })();
  return _progressSyncInflight;
}

// 供 fsrs-algorithm / 登录流调用
window.saveProgress = saveProgress;
window.loadProgress = loadProgress;
window.syncLocalProgressToCloud = syncLocalProgressToCloud;