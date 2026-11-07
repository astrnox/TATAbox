/**
 * ============================================================
 * TATABOX — 统一日志（L-03）
 *
 * 目标：
 *   1. 生产环境默认不输出 debug/info，减少浏览器控制台噪音；
 *   2. 统一的 [TATABOX:模块] 前缀，便于按模块过滤；
 *   3. 提供 warnOnce/errorOnce，避免同类告警在循环/重试中刷屏；
 *   4. 不 monkey-patch console，所有输出仍走原生 console 方法。
 *
 * 级别：debug < info < warn < error < off
 *   默认：localhost / 127.0.0.1 / file: → debug；其余（生产）→ warn。
 *   覆盖方式（优先级从高到低）：
 *     · localStorage['tatabox_log_level'] = 'debug' | 'info' | 'warn' | 'error' | 'off'
 *     · URL 参数 ?debug=1 → debug
 *
 * 用法：
 *   var log = window.BQLog.scope('Admin');
 *   log.info('已加载');            // 生产静默
 *   log.warnOnce('data-missing', '表未初始化');  // 同一 key 只告警一次
 * ============================================================
 */
(function () {
  'use strict';

  var LEVELS = { debug: 10, info: 20, warn: 30, error: 40, off: 100 };
  var STORAGE_KEY = 'tatabox_log_level';

  function detectLevel() {
    try {
      var override = localStorage.getItem(STORAGE_KEY);
      if (override && LEVELS[override]) return override;
    } catch (e) { /* localStorage 不可用时按默认 */ }
    try {
      if (/[?&]debug=1(&|$)/.test(location.search)) return 'debug';
      var host = location.hostname;
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || location.protocol === 'file:') {
        return 'debug';
      }
    } catch (e) { /* 忽略 */ }
    return 'warn';
  }

  var currentLevel = detectLevel();
  var seenOnce = Object.create(null);

  function enabled(level) {
    return LEVELS[level] >= LEVELS[currentLevel];
  }

  function emit(method, level, scopeName, args) {
    if (!enabled(level)) return;
    var prefix = scopeName ? '[TATABOX:' + scopeName + '] ' : '[TATABOX] ';
    var consoleObj = (typeof console !== 'undefined') ? console : null;
    if (!consoleObj) return;
    var fn = consoleObj[method] || consoleObj.log;
    if (typeof fn !== 'function') return;
    try {
      // 保留原始参数形态（对象可展开检查），仅在首个参数前加统一前缀
      var callArgs = (typeof args[0] === 'string')
        ? [prefix + args[0]].concat(args.slice(1))
        : [prefix].concat(args);
      fn.apply(consoleObj, callArgs);
    } catch (e) { /* 日志失败绝不影响业务 */ }
  }

  function makeLogger(scopeName) {
    function build(level) {
      return function () {
        emit(level, level, scopeName, Array.prototype.slice.call(arguments));
      };
    }
    function once(level, method, key, rest) {
      var id = (scopeName || '') + '::' + key;
      if (seenOnce[id]) return;
      seenOnce[id] = true;
      emit(level, method, scopeName, rest);
    }
    return {
      debug: build('debug'),
      info: build('info'),
      warn: build('warn'),
      error: build('error'),
      warnOnce: function (key) {
        once('warn', 'warn', key, Array.prototype.slice.call(arguments, 1));
      },
      errorOnce: function (key) {
        once('error', 'error', key, Array.prototype.slice.call(arguments, 1));
      },
      level: function () { return currentLevel; }
    };
  }

  var root = makeLogger('');
  root.scope = function (name) { return makeLogger(String(name || '')); };
  root.setLevel = function (level) {
    if (LEVELS[level]) currentLevel = level;
    return currentLevel;
  };
  root.levels = LEVELS;

  window.BQLog = root;
})();
