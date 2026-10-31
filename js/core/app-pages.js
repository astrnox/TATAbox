/**
 * TATABOX — 路由页面渲染桩（M-01 自 app.js 拆分）
 * ------------------------------------------------------------
 * 由 index.html 在 app.js 之后以 defer 加载；返回首页/练习/考试等页面骨架，
 * 具体模块由 app-modules.js 的 doRouteRender 懒加载后再接管。
 * ============================================================
 */
'use strict';

function renderPracticePage(target) {

  if (typeof window.initPractice === 'function') {
    window.initPractice(target);
  } else {
    target.innerHTML = `
      <div class="bq-empty-block-lg">
        <div class="bq-fs-2rem bq-mb-12"></div>
        <p class="bq-text-muted">练习模块加载中…</p>
      </div>
    `;
    // 如果全局函数还没有，延迟再试
    setTimeout(() => {
      if (typeof window.initPractice === 'function') {
        window.initPractice(target);
      }
    }, 200);
  }
}

/**
 * 模拟考试页面渲染
 * @param {HTMLElement} target - 渲染目标元素
 */
function renderExamPage(target) {

  // 确保 target 正确
  if (!target) {
    target = document.getElementById('page-content');
  }
  
  if (typeof window.initExam === 'function') {
    try {
      window.initExam(target);
    } catch (err) {
      console.error('初始化考试模块失败:', err);
      target.innerHTML = `
        <div class="bq-empty-block-lg">
          <div class="bq-fs-2rem bq-mb-12"></div>
          <p class="bq-text-error">加载考试模块失败，请刷新页面重试</p>
          <p style="color:var(--text-muted);font-size:0.9rem;margin-top:8px;">错误信息: ${errText(err)}</p>
        </div>
      `;
    }
  } else {
    target.innerHTML = `
      <div class="bq-empty-block-lg">
        <div class="bq-fs-2rem bq-mb-12"></div>
        <p class="bq-text-muted">考试模块加载中…</p>
        <p class="bq-hint bq-hint--mt">如长时间未响应，请刷新页面</p>
      </div>
    `;
    
    // 多次尝试初始化
    let attempts = 0;
    const tryInit = () => {
      attempts++;
      if (typeof window.initExam === 'function') {
        window.initExam(target);
      } else if (attempts < 10) {
        setTimeout(tryInit, 200);
      } else {
        target.innerHTML = `
          <div class="bq-empty-block-lg">
            <div class="bq-fs-2rem bq-mb-12"></div>
            <p class="bq-text-error">考试模块加载超时，请刷新页面重试</p>
            <button style="margin-top:16px;padding:8px 20px;background:var(--color-amber);border:none;border-radius:8px;cursor:pointer;" data-on='["_cspReload"]'>刷新页面</button>
          </div>
        `;
      }
    };
    tryInit();
  }
}

/**
 * 学习分析页面渲染
 * @param {HTMLElement} target - 渲染目标元素
 */
function renderAnalyticsPage(target) {

  if (typeof window.initAnalytics === 'function') {
    window.initAnalytics(target);
  } else {
    target.innerHTML = `
      <div class="bq-empty-block-lg">
        <div class="bq-fs-2rem bq-mb-12"></div>
        <p class="bq-text-muted">分析模块加载中…</p>
      </div>
    `;
    setTimeout(() => {
      if (typeof window.initAnalytics === 'function') {
        window.initAnalytics(target);
      }
    }, 200);
  }
}

/**
 * 用户中心页面渲染
 * @param {HTMLElement} target - 渲染目标元素
 */
function renderUserPage(target) {

  if (typeof window.initUser === 'function') {
    window.initUser(target);
  } else {
    target.innerHTML = `
      <div class="bq-empty-block-lg">
        <div class="bq-fs-2rem bq-mb-12"></div>
        <p class="bq-text-muted">用户模块加载中…</p>
      </div>
    `;
    setTimeout(() => {
      if (typeof window.initUser === 'function') {
        window.initUser(target);
      }
    }, 200);
  }
}

/**
 * 知识卡片页面渲染 — Anki 风格间隔重复
 */
function renderCardsPage() {
  var container = document.getElementById('page-content');
  if (!container) return;

  container.innerHTML = `
    <div style="max-width:720px;margin:0 auto;padding:40px 20px 60px;">
      <!-- P1：页头统一使用全局组件（不再逐页写内联字号/样式） -->
      <div class="bq-section-header">
        <h2 class="bq-section-header__title">间隔重复记忆卡</h2>
        <p class="bq-section-header__desc">基于 FSRS 的间隔重复复习 · 选择牌组开始学习</p>
      </div>

      <!-- 牌组选择器（动态渲染） -->
      <div id="anki-deck-selector"></div>

      <!-- 卡片学习区域 -->
      <div id="anki-card-area">
        <div class="anki-card-container" id="anki-card-area-inner">
          <div class="anki-card" id="anki-card">
              <div class="anki-face anki-front-face" id="anki-front"></div>
              <div class="anki-face anki-back-face" id="anki-back"></div>
          </div>
        </div>
        <div class="anki-progress-bar" id="anki-progress-bar"></div>
      </div>

      <div class="anki-shortcut-hint" style="margin-top:14px;">
        <span><kbd>空格</kbd> 翻转</span>
        <span><kbd>1</kbd> 再来一次</span>
        <span><kbd>2</kbd> 一般</span>
        <span><kbd>3</kbd> 简单</span>
      </div>
    </div>
  `;

  // 加载 cards.js 模块（如果尚未加载）
  if (typeof window.AnkiSystem === 'undefined') {
    var script = document.createElement('script');
    script.src = 'js/pages/cards.js';
    script.onload = function () {

    };
    document.head.appendChild(script);
  } else {
    // 已加载，重新初始化
    if (typeof window.AnkiSystem.loadData === 'function') {
      window.AnkiSystem.loadData();
    }
  }
}

/**
 * HTML 转义 — 统一使用 window.escapeHtml（Q-01）
 * 规范实现在 js/core/utils.js，避免各模块重复定义导致转义字符集不一致
 */
var escapeHtml = (typeof window !== 'undefined' ? window : globalThis).escapeHtml; // 规范实现见 js/core/utils.js（Q-01 统一）

/**
 * 重新初始化首页关键组件（倒计时、Hero 动画、滚动动画）
 * 这些组件位于首屏或影响全局交互，需要立即执行。
 * 首次进入时会标记 _AppState._homePaintedReady，
 * 配合 finishRouting → bioquest:app-ready 实现"加载界面期间就加载好"。
 */

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.app = BQ.app || {};
  BQ.app.pages = { renderPracticePage: renderPracticePage, renderExamPage: renderExamPage, renderAnalyticsPage: renderAnalyticsPage, renderUserPage: renderUserPage, renderCardsPage: renderCardsPage };
})();
