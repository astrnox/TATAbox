/**
 * ============================================================
 * TATABOX — PRD §5-46：多标签页数据同步 (BroadcastChannel)
 * 使用 BroadcastChannel API 在多个标签页之间同步答题状态
 * ============================================================
 */
(function () {
  'use strict';
  if (typeof BroadcastChannel === 'undefined') return;

  var channel = new BroadcastChannel('bioquest-sync');
  var _lastSync = 0;

  channel.onmessage = function (e) {
    var data = e.data;
    if (!data || !data.type) return;
    // 避免自己发的消息
    if (data._origin && data._origin === Date.now().toString()) return;

    switch (data.type) {
      case 'answer-update':
        // 另一个标签页答题了，触发本地同步
        if (typeof window.__syncPracticeState === 'function') {
          window.__syncPracticeState(data.payload);
        }
        break;
      case 'theme-change':
        if (data.theme && typeof window.toggleTheme === 'function') {
          window.toggleTheme(data.theme);
        }
        break;
      case 'storage-invalidate':
        // 数据被修改，通知其他标签页重新加载
        var key = data.key;
        if (key && typeof window.__onStorageInvalidate === 'function') {
          window.__onStorageInvalidate(key);
        }
        break;
    }
  };

  // 广播答题状态
  window.__broadcastAnswer = function (payload) {
    if (Date.now() - _lastSync < 300) return; // 节流
    _lastSync = Date.now();
    channel.postMessage({
      type: 'answer-update',
      payload: payload,
      _origin: Date.now().toString()
    });
  };

  // 广播主题变化
  window.__broadcastTheme = function (theme) {
    channel.postMessage({
      type: 'theme-change',
      theme: theme,
      _origin: Date.now().toString()
    });
  };

  // 广播存储失效
  window.__broadcastStorageInvalidate = function (key) {
    channel.postMessage({
      type: 'storage-invalidate',
      key: key,
      _origin: Date.now().toString()
    });
  };

  // 拦截 localStorage setItem 广播
  var origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    origSetItem.call(this, key, value);
    if (key && (key.indexOf('tatabox_') === 0 || key.indexOf('bioquest_') === 0)) {
      try {
        channel.postMessage({
          type: 'storage-invalidate',
          key: key,
          _origin: Date.now().toString()
        });
      } catch (e) {}
    }
  };

  console.log('[TATABOX] BroadcastChannel 多标签页同步已启动');
})();