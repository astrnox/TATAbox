/**
 * TATABOX — vendor 初始化模块
 * 在所有 vendor 库加载完成后统一初始化（mermaid/PDF.js worker 等）
 */
(function () {
  'use strict';

  // L-03：统一日志；logger 未加载时退回 console，保证模块可独立运行
  var log = (window.BQLog && typeof window.BQLog.scope === 'function')
    ? window.BQLog.scope('VendorInit')
    : console;

  var BV = {
    mermaid: false,
    pdfjs: false,
    katex: false,
    three: false
  };

  // 防止重复初始化的标志位（任何路径完成初始化后置 true）
  var _bioquestInit = false;

  function initMermaid() {
    if (typeof window.mermaid === 'undefined') return;
    try {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
        fontFamily: 'inherit'
      });
      BV.mermaid = true;
    } catch (e) { log.warn('Mermaid 初始化失败:', e); }
  }

  function initPDFJS() {
    if (typeof window.pdfjsLib === 'undefined') return;
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js?v=20260723d';
      BV.pdfjs = true;
    } catch (e) { log.warn('PDF.js 配置失败:', e); }
  }

  function initKatex() {
    if (typeof window.katex === 'undefined') return;
    try { BV.katex = true; } catch (e) { log.warn('KaTeX 初始化失败:', e); }
  }

  function initThree() {
    if (typeof window.THREE === 'undefined') return;
    try { BV.three = true; } catch (e) { log.warn('THREE 初始化失败:', e); }
  }

  // DOMContentLoaded 后初始化（带重复初始化保护）
  function init() {
    // 防止重复初始化：即使部分 vendor 失败也只跑一次
    if (_bioquestInit) {
      log.info('已初始化过，跳过');
      return;
    }
    // 进入即置位，保证任何路径（含异常）完成后标志位都为 true，
    // 避免重复初始化或“永远加载不完成”
    _bioquestInit = true;

    // 每个 vendor 独立 try/catch，单个失败不阻塞其他 vendor
    try { initMermaid(); } catch (e) { log.warn('Mermaid 异常:', e); }
    try { initPDFJS(); } catch (e) { log.warn('PDF.js 异常:', e); }
    try { initKatex(); } catch (e) { log.warn('KaTeX 异常:', e); }
    try { initThree(); } catch (e) { log.warn('THREE 异常:', e); }

    window.BioQuestVendor = BV;
    // 派发事件供其他模块监听
    try {
      document.dispatchEvent(new CustomEvent('bioquest:vendor-ready', { detail: BV }));
    } catch (e) {}
    log.info('vendor 初始化完成:', BV);
  }

  // readyState 检查：loading 时等 DOMContentLoaded，
  // interactive/complete 时立即执行（避免错过 DOMContentLoaded 后重复注册）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /**
   * vendor 初始化状态对象，记录 mermaid/pdfjs/katex/three 各库的初始化结果。
   * @type {Object}
   */
  window.BioQuestVendor = BV;
})();
