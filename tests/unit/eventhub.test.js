/**
 * TATABOX — Issue #105：EventHub 事件监听集中管理单元测试
 *
 * 覆盖：
 *   1. on/off（元素模式）正确配对，解除后不再触发；
 *   2. once 一次性触发后自动移除；
 *   3. cleanup(scope) 按作用域批量解除；
 *   4. off(scope) 字符串首参的 scope 模式不误伤元素模式；
 *   5. on() 返回的取消函数可定向解除；
 *   6. 页面卸载（pagehide）时全部监听被清理。
 *
 * 说明：EventHub 在 utils.js 中定义；测试用简化 DOM 事件目标
 * （自实现 add/removeEventListener）在 node 环境下验证，不强依赖 jsdom。
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'js', 'core', 'utils.js');

// 从 utils.js 中抽取 EventHub IIFE（避免整文件依赖其它全局函数）
// 注意：Windows checkout 为 CRLF，先归一化为 LF，锚点字符串才可匹配
const source = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('/* ============================================================\n * Issue #105');
if (start < 0) throw new Error('utils.js 中未找到 EventHub 定义');
const end = source.lastIndexOf('})();');
const hubSource = source.slice(start, end + 5);

// 简化事件目标（模拟 addEventListener/removeEventListener 语义）
function makeEventTarget() {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, handler) { (listeners[type] = listeners[type] || []).push(handler); },
    removeEventListener(type, handler) {
      const arr = listeners[type] || [];
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    },
    fire(type) { (listeners[type] || []).slice().forEach(h => h({ type })); }
  };
}

// 在沙箱中执行 EventHub 定义，返回 window.EventHub
function loadHub() {
  const windowObj = { addEventListener() {} };
  new Function('window', hubSource)(windowObj);
  return windowObj.EventHub;
}

describe('Issue #105 EventHub', () => {
  test('on/off 元素模式：解除后不再触发', () => {
    const hub = loadHub();
    const t = makeEventTarget();
    let calls = 0;
    const h = () => { calls++; };
    hub.on(t, 'click', h);
    t.fire('click');
    expect(calls).toBe(1);
    hub.off(t, 'click', h);
    t.fire('click');
    expect(calls).toBe(1); // 已解除
  });

  test('once：一次性触发后自动移除', () => {
    const hub = loadHub();
    const t = makeEventTarget();
    let calls = 0;
    hub.once(t, 'click', () => { calls++; });
    t.fire('click');
    t.fire('click');
    expect(calls).toBe(1);
  });

  test('cleanup(scope) 按作用域批量解除，不影响其它 scope', () => {
    const hub = loadHub();
    const t = makeEventTarget();
    let a = 0, b = 0;
    hub.on(t, 'click', () => a++, { scope: 'route:quiz' });
    hub.on(t, 'click', () => b++, { scope: 'global' });
    t.fire('click');
    expect(a).toBe(1);
    expect(b).toBe(1);
    const removed = hub.cleanup('route:quiz');
    t.fire('click');
    expect(a).toBe(1); // 已清理
    expect(b).toBe(2); // 未受影响
    expect(removed).toBeGreaterThan(0);
  });

  test('off(scope) 字符串首参不误伤元素模式（off(target,type,h)）', () => {
    const hub = loadHub();
    const t = makeEventTarget();
    let a = 0;
    const h = () => { a++; };
    hub.on(t, 'change', h);
    hub.off(t, 'change', h);   // 元素模式（target 是对象，首参非字符串）
    t.fire('change');
    expect(a).toBe(0);
  });

  test('on() 返回的取消函数可定向解除', () => {
    const hub = loadHub();
    const t = makeEventTarget();
    let a = 0;
    const cancel = hub.on(t, 'click', () => a++, { scope: 's1' });
    t.fire('click');
    cancel();
    t.fire('click');
    expect(a).toBe(1);
  });

  test('页面卸载（pagehide）时全部监听被清理', () => {
    const windowObj = { addEventListener(type, fn) { if (type === 'pagehide') this.pagehide = fn; } };
    new Function('window', hubSource)(windowObj);
    const hub = windowObj.EventHub;
    const t = makeEventTarget();
    let a = 0;
    hub.on(t, 'click', () => a++);
    windowObj.pagehide();
    // 事件目标上的监听已被 clearAll 移除 → 不再触发
    t.fire('click');
    expect(a).toBe(0);
  });
});