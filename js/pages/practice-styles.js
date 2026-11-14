/**
 * TATABOX — 练习页样式注入（M-01 渐进拆分）
 * ============================================================
 */
'use strict';

function injectPracticeStyles() {
  if (practiceStylesInjected) return;
  practiceStylesInjected = true;

  const style = document.createElement('style');
  style.id = 'bioquest-practice-styles';
  style.textContent = `
    .practice-answer-correct {
      animation: practiceCorrectPulse 0.5s ease;
    }

    @keyframes practiceCorrectPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(58, 140, 92, 0.3); }
      50% { box-shadow: 0 0 0 8px rgba(58, 140, 92, 0); }
    }

    .practice-answer-wrong {
      animation: practiceWrongShake 0.4s ease;
    }

    @keyframes practiceWrongShake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
      20%, 40%, 60%, 80% { transform: translateX(4px); }
    }

    .practice-fade-in {
      animation: practiceFadeSlide 0.35s ease forwards;
    }

    @keyframes practiceFadeSlide {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* 类别选择器 */
    .practice-category-selector {
      display: flex;
      gap: 6px;
      background: var(--surface-secondary, #f5f3ef);
      border-radius: 8px;
      padding: 4px;
    }

    .practice-category-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      background: transparent;
      color: var(--text-secondary, #666);
    }

    .practice-category-btn:hover {
      background: rgba(90, 125, 92, 0.1);
      color: var(--color-sage, #5a7d5c);
    }

    .practice-category-btn.active {
      background: var(--color-sage, #5a7d5c);
      color: #fff;
      box-shadow: var(--shadow-md);
    }

    /* 练习模式按钮 */
    .practice-mode-selector {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .practice-mode-btn {
      padding: 8px 18px;
      border: 1.5px solid var(--border-default, #e0dcd5);
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      background: var(--surface-primary, #ffffff);
      color: var(--text-secondary, #4a4a4a);
    }
    .practice-mode-btn:hover {
      border-color: var(--color-sage, #5a7d5c);
      color: var(--color-sage, #5a7d5c);
    }
    .practice-mode-btn.active {
      background: var(--color-sage, #5a7d5c);
      border-color: var(--color-sage, #5a7d5c);
      color: #fff;
      box-shadow: var(--shadow-md);
    }
    .practice-mode-btn[data-mode="gaokao"].active {
      background: #3a7d5c;
      border-color: #3a7d5c;
      box-shadow: var(--shadow-md);
    }
    .practice-mode-btn[data-mode="competition"].active {
      background: #5a5a9c;
      border-color: #5a5a9c;
      box-shadow: var(--shadow-md);
    }

    /* 逻辑推理题选项样式 */
    .practice-logic-option {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 16px;
      border: 1.5px solid var(--border, #e0e0e0);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 8px;
    }

    .practice-logic-option:hover {
      border-color: var(--color-sage, #5a7d5c);
      background: rgba(90, 125, 92, 0.04);
    }

    .practice-logic-selected {
      border-color: var(--color-sage, #5a7d5c);
      background: rgba(90, 125, 92, 0.08);
    }

    .practice-logic-correct {
      border-color: var(--success-green, #3a8c5c);
      background: rgba(58, 140, 92, 0.08);
    }

    .practice-logic-wrong {
      border-color: var(--terracotta, #c0553a);
      background: rgba(192, 85, 58, 0.08);
    }

    .practice-logic-marker {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 2px solid var(--border, #e0e0e0);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      flex-shrink: 0;
      transition: all 0.2s;
    }

    .practice-logic-selected .practice-logic-marker {
      border-color: var(--color-sage, #5a7d5c);
      background: var(--color-sage, #5a7d5c);
      color: #fff;
    }

    .practice-logic-correct .practice-logic-marker {
      border-color: var(--success-green, #3a8c5c);
      background: var(--success-green, #3a8c5c);
      color: #fff;
    }

    .practice-logic-wrong .practice-logic-marker {
      border-color: var(--terracotta, #c0553a);
      background: var(--terracotta, #c0553a);
      color: #fff;
    }

    .practice-logic-text {
      font-size: 0.938rem;
      line-height: 1.6;
      padding-top: 2px;
    }

    .practice-shortcut-hint {
      margin-top: 14px;
      padding: 10px 14px;
      border: 1px dashed var(--border-light, #ece8e1);
      border-radius: 8px;
      background: var(--surface-secondary, rgba(0,0,0,0.02));
      font-size: 0.78rem;
      color: var(--text-muted, #8a8a8a);
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      align-items: center;
      line-height: 1.8;
    }
    .practice-count-hint {
      font-size: 0.75rem;
      color: var(--text-muted, #8a8a8a);
    }
    .practice-shortcut-hint kbd {
      display: inline-block;
      min-width: 1.2em;
      padding: 1px 6px;
      border: 1px solid var(--border-light, #d8d4cc);
      border-bottom-width: 2px;
      border-radius: 4px;
      background: var(--surface-primary, #fff);
      color: var(--text-secondary, #555);
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 0.74rem;
      line-height: 1.4;
      text-align: center;
      white-space: nowrap;
    }
    .practice-shortcut-hint .sh-sep {
      color: var(--border-light, #d0ccc4);
    }
    @media (max-width: 640px) {
      .practice-shortcut-hint {
        font-size: 0.72rem;
        gap: 4px 10px;
      }
    }
  `;

  document.head.appendChild(style);
}

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.practice = BQ.practice || {};
  BQ.practice.styles = { injectPracticeStyles: injectPracticeStyles };
})();
