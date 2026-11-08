/**
 * TATABOX — 练习页网络拉取与分数同步（M-01 渐进拆分）
 * ============================================================
 */
'use strict';

function _fetchLocalJsonWithRetry(url, attempts, timeoutMs) {
  attempts = attempts || 2;
  timeoutMs = timeoutMs || 15000;
  var lastErr = null;
  function attempt(i) {
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, timeoutMs);
    }
    return fetch(url, controller ? { signal: controller.signal } : {})
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
        return res.json();
      })
      .then(function (body) {
        clearTimeout(timer);
        return { ok: true, data: body };
      })
      .catch(function (err) {
        clearTimeout(timer);
        lastErr = (err && err.name === 'AbortError') ? new Error('加载超时') : err;
        if (i < attempts) {
          return new Promise(function (resolve) { setTimeout(resolve, 500 * i); })
            .then(function () { return attempt(i + 1); });
        }
        return { ok: false, error: lastErr };
      });
  }
  return attempt(1);
}

var PRACTICE_SYNC_DEBOUNCE_MS = 300;     // 分数同步防抖时间
var PRACTICE_PANEL_FADE_MS = 250;         // 筛选面板淡出延迟（重渲染前等待过渡完成）
var PRACTICE_PULL_TICK_MS = 1000;         // 拉取冷却倒计时刷新间隔
var PRACTICE_LAST_Q_BANNER_MS = 1200;     // 最后一题横幅展示时长

var SYNC_INTERVAL = 5; // 每答几题同步一次（可配置）
var _syncAnswerCounter = 0;
var _syncDebounceTimer = null;
var _syncPending = false;

/**
 * 将最新分数同步到服务器（带防抖，避免频繁调用）
 * @param {Object} scoreData - { bio_score, total_answered, total_correct, accuracy, practice_count }
 */
function syncScoreToServer(scoreData) {
  if (!scoreData) return;
  _syncPending = true;

  // 防抖：300ms 内多次调用只执行最后一次
  if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(function() {
    _syncDebounceTimer = null;
    if (!_syncPending) return;
    _syncPending = false;

    // 优先使用 Supabase 直连同步
    if (typeof window.updateBioScore === 'function' && typeof window.getSupabase === 'function' && window.getSupabase()) {
      window.updateBioScore(scoreData.bio_score || 0, {
        practice_count: scoreData.practice_count || 0,
        total_answered: scoreData.total_answered || 0,
        total_correct: scoreData.total_correct || 0,
        accuracy: scoreData.accuracy || 0
      }).catch(function() {});
    }
  }, PRACTICE_SYNC_DEBOUNCE_MS);
}

/**
 * 检查是否需要触发同步（每 SYNC_INTERVAL 题触发一次）
 * 应在每次提交答案后调用
 */
function checkAndSyncScore() {
  _syncAnswerCounter++;
  if (_syncAnswerCounter >= SYNC_INTERVAL) {
    _syncAnswerCounter = 0;
    try {
      var stats = typeof getStats === 'function' ? getStats() : null;
      if (stats && typeof calcBioScore === 'function') {
        var bioResult = calcBioScore(stats);
        syncScoreToServer({
          bio_score: bioResult.score,
          total_answered: stats.totalAnswered || 0,
          total_correct: stats.totalCorrect || 0,
          accuracy: stats.accuracy || 0,
          practice_count: stats.totalAnswered || 0
        });
      }
    } catch(e) {}
  }
}

/** 重置同步计数器（新会话开始时调用） */
function resetSyncCounter() {
  _syncAnswerCounter = 0;
  _syncPending = false;
  if (_syncDebounceTimer) { clearTimeout(_syncDebounceTimer); _syncDebounceTimer = null; }
}

window.syncScoreToServer = syncScoreToServer;
window.checkAndSyncScore = checkAndSyncScore;
window.resetSyncCounter = resetSyncCounter;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.practice = BQ.practice || {};
  BQ.practice.sync = { syncScoreToServer: syncScoreToServer, checkAndSyncScore: checkAndSyncScore, resetSyncCounter: resetSyncCounter };
})();
