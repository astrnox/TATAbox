/**
 * ============================================================
 * TATABOX — 离线题库包（M-14）
 * 与 Service Worker 通信，把分片题库 / 联赛真题写入独立缓存，
 * 断网后仍可刷题；提供按需下载、状态查询与一键清理。
 * 只缓存公开题库数据，不涉及任何用户隐私数据。
 * ============================================================
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  /**
   * 通过 MessageChannel 与 SW 点对点通信（与 app.js 的 _sendSwMessage 同协议）。
   * @param {Object} payload
   * @param {number} timeoutMs
   * @returns {Promise<Object>}
   */
  function send(payload, timeoutMs) {
    return new Promise(function (resolve) {
      if (!('serviceWorker' in navigator)) {
        resolve({ error: '当前浏览器不支持离线缓存' });
        return;
      }
      navigator.serviceWorker.ready.then(function (reg) {
        var worker = navigator.serviceWorker.controller || reg.active;
        if (!worker) {
          resolve({ error: '离线服务未就绪，请刷新页面后重试' });
          return;
        }
        var channel = new MessageChannel();
        var settled = false;
        var timer = setTimeout(function () {
          if (settled) return;
          settled = true;
          resolve({ error: '离线缓存超时，请检查网络后重试' });
        }, timeoutMs || 15000);
        channel.port1.onmessage = function (event) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(event.data || {});
        };
        worker.postMessage(payload, [channel.port2]);
      }).catch(function (err) {
        resolve({ error: (err && err.message) || '离线服务未就绪' });
      });
    });
  }

  /**
   * M-07：下载前检查存储配额，避免写满磁盘后静默失败。
   * 无法读取 estimate 的环境直接放行（按浏览器默认行为处理）。
   * @param {number} minBytes 预计需要的最小空闲字节数
   * @returns {Promise<Object|boolean>} true 表示充足；否则返回 { error }
   */
  function ensureQuota(minBytes) {
    return new Promise(function (resolve) {
      var st = navigator.storage;
      if (!st || typeof st.estimate !== 'function') { resolve(true); return; }
      st.estimate().then(function (est) {
        var quota = (est && est.quota) || 0;
        var usage = (est && est.usage) || 0;
        var free = quota - usage;
        if (quota && free < minBytes) {
          resolve({
            error: '可用存储空间不足：需要约 ' + Math.ceil(minBytes / 1048576) +
              ' MB，当前仅剩 ' + Math.max(0, Math.floor(free / 1048576)) + ' MB'
          });
        } else {
          resolve(true);
        }
      }).catch(function () { resolve(true); });
    });
  }

  function downloadWithQuota(level, minBytes, timeoutMs) {
    return ensureQuota(minBytes).then(function (ok) {
      return ok === true ? send({ type: 'CACHE_OFFLINE_BANK', level: level }, timeoutMs) : ok;
    });
  }

  window.OfflineBank = {
    /** 核心包：manifest + 全部分片 + 101 题精练 + 40 题逻辑 */
    downloadCore: function () {
      return downloadWithQuota('core', 10 * 1048576, 180000);
    },
    /** 完整包：核心包 + 2,873 道联赛真题（resource/all.json，约 4.7MB） */
    downloadFull: function () {
      return downloadWithQuota('full', 30 * 1048576, 180000);
    },
    clear: function () {
      return send({ type: 'CLEAR_OFFLINE_BANK' }, 15000);
    },
    status: function () {
      return send({ type: 'OFFLINE_BANK_STATUS' }, 15000);
    }
  };
})();
