/**
 * ============================================================
 * TATABOX — 全真模拟考试模块
 * 72题 × 2分 = 144分满分，限时150分钟
 * 四大模块各18题，严格按2025联赛比例
 * ============================================================
 */

'use strict';

let examStylesInjected = false;

function injectExamStyles() {
  if (examStylesInjected) return;
  examStylesInjected = true;

  const style = document.createElement('style');
  style.id = 'bioquest-exam-styles';
  style.textContent = `
    :root {
      --exam-nav-bg: var(--surface-primary, #ffffff);
      --exam-nav-answered: var(--color-sage, #5a7d5c);
      --exam-nav-current: var(--color-amber, #c4956a);
      --exam-nav-marked: var(--color-amber, #c4956a);
      --exam-nav-unanswered: var(--surface-tertiary, #f0ebe0);
    }

    .exam-start {
      max-width: 800px;
      margin: 0 auto;
    }

    .exam-start-card {
      background: var(--surface-primary, #ffffff);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: var(--radius-lg, 12px);
      padding: 48px;
      box-shadow: var(--shadow-md, 0 2px 8px rgba(44, 62, 48, 0.06));
    }

    .exam-start-header {
      text-align: center;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border-light, #ece8e1);
    }

    .exam-start-badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-amber, #c4956a);
      background: rgba(196, 149, 106, 0.1);
      padding: 4px 16px;
      border-radius: var(--radius-full, 9999px);
      margin-bottom: 16px;
    }

    .exam-start-title {
      font-family: var(--font-serif, 'Noto Serif SC', serif);
      font-size: 1.8rem;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
      margin-bottom: 12px;
    }

    .exam-start-desc {
      font-size: 1.05rem;
      color: var(--text-secondary, #4a4a4a);
    }

    .exam-start-info {
      display: flex;
      flex-direction: column;
      gap: 24px;
      margin-bottom: 32px;
    }

    .exam-start-section h3 {
      font-family: var(--font-serif, 'Noto Serif SC', serif);
      font-size: 1.1rem;
      color: var(--color-deep, #1a3a2a);
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-light, #ece8e1);
    }

    .exam-start-section ul {
      list-style: none;
      padding: 0;
    }

    .exam-start-section ul li {
      position: relative;
      padding: 6px 0 6px 20px;
      font-size: 0.94rem;
      color: var(--text-secondary, #4a4a4a);
      line-height: 1.7;
    }

    .exam-start-section ul li::before {
      content: '•';
      position: absolute;
      left: 4px;
      color: var(--color-amber, #c4956a);
      font-weight: 700;
    }

    .exam-modules-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .exam-module-card {
      background: var(--surface-secondary, #faf7f2);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: var(--radius-md, 8px);
      padding: 20px 16px;
      text-align: center;
      transition: transform var(--transition-fast, 0.15s ease),
                  box-shadow var(--transition-fast, 0.15s ease);
    }

    .exam-module-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md, 0 2px 8px rgba(44, 62, 48, 0.06));
    }

    .exam-module-num {
      font-family: var(--font-serif, 'Noto Serif SC', serif);
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
      margin-bottom: 6px;
    }

    .exam-module-desc {
      font-size: 0.82rem;
      color: var(--text-secondary, #4a4a4a);
      margin-bottom: 8px;
      line-height: 1.4;
    }

    .exam-module-meta {
      font-size: 0.75rem;
      color: var(--color-sage, #5a7d5c);
      font-weight: 600;
    }

    .exam-start-actions {
      text-align: center;
      padding-top: 8px;
    }

    .exam-interface {
      display: flex;
      flex-direction: column;
      height: calc(100vh - var(--header-height, 64px) - 80px);
      background: var(--surface-secondary, #faf7f2);
      border-radius: var(--radius-lg, 12px);
      overflow: hidden;
      border: 1px solid var(--border-light, #ece8e1);
    }

    .exam-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 24px;
      background: var(--color-deep, #1a3a2a);
      color: #fff;
      flex-shrink: 0;
    }

    .exam-topbar-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .exam-topbar-label {
      font-size: 0.85rem;
      font-weight: 600;
      opacity: 0.9;
    }

    .exam-topbar-progress {
      font-size: 0.75rem;
      opacity: 0.6;
      font-family: 'JetBrains Mono', monospace;
    }

    .exam-timer {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 20px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-md, 8px);
      transition: background-color var(--transition-base, 0.25s ease);
    }

    .exam-timer--warning {
      background: rgba(192, 85, 58, 0.35);
      animation: examTimerPulse 1s infinite;
    }

    .exam-timer-icon {
      width: 18px;
      height: 18px;
      opacity: 0.7;
    }

    .exam-timer-display {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.3rem;
      font-weight: 600;
      letter-spacing: 0.05em;
    }

    @keyframes examTimerPulse {
      0%, 100% { background-color: rgba(192, 85, 58, 0.35); }
      50% { background-color: rgba(192, 85, 58, 0.55); }
    }

    .exam-topbar-right {
      display: flex;
      gap: 8px;
    }

    .exam-submit-btn {
      background: var(--color-amber, #c4956a);
      color: var(--color-deep, #1a3a2a);
      font-weight: 700;
      border: none;
    }

    .exam-submit-btn:hover {
      background: var(--color-amber-light, #d4a574);
    }

    .exam-body {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .exam-nav-panel {
      width: 260px;
      flex-shrink: 0;
      background: var(--exam-nav-bg);
      border-right: 1px solid var(--border-light, #ece8e1);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }

    .exam-nav-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-muted, #8a8a8a);
      padding: 16px 16px 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .exam-nav-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 0 16px 12px;
    }

    .exam-nav-legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.7rem;
      color: var(--text-muted, #8a8a8a);
    }

    .exam-nav-dot {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      flex-shrink: 0;
    }

    .exam-nav-dot--unanswered {
      background: var(--exam-nav-unanswered);
      border: 1px solid var(--border-default, #e0dcd5);
    }

    .exam-nav-dot--answered {
      background: var(--exam-nav-answered);
    }

    .exam-nav-dot--marked {
      background: var(--exam-nav-answered);
      border: 2px solid var(--exam-nav-marked);
    }

    .exam-nav-dot--current {
      background: var(--exam-nav-current);
    }

    .exam-nav-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
      padding: 8px 16px;
    }

    .exam-nav-item {
      width: 100%;
      aspect-ratio: 1;
      max-width: 40px;
      max-height: 40px;
      border: 1px solid var(--border-default, #e0dcd5);
      border-radius: var(--radius-sm, 4px);
      background: var(--exam-nav-unanswered);
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary, #4a4a4a);
      cursor: pointer;
      transition: all var(--transition-fast, 0.15s ease);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font-family: 'JetBrains Mono', monospace;
    }

    .exam-nav-item:hover {
      border-color: var(--color-amber, #c4956a);
      transform: scale(1.08);
    }

    .exam-nav-item--answered {
      background: var(--exam-nav-answered);
      border-color: var(--exam-nav-answered);
      color: #fff;
    }

    .exam-nav-item--current {
      background: var(--exam-nav-current);
      border-color: var(--exam-nav-current);
      color: #fff;
      transform: scale(1.12);
      box-shadow: var(--shadow-md);
    }

    .exam-nav-item--marked {
      border: 2px solid var(--exam-nav-marked);
    }

    .exam-nav-item--answered.exam-nav-item--marked {
      border: 2px solid var(--exam-nav-marked);
    }

    .exam-nav-item--current.exam-nav-item--marked {
      border: 2px solid #fff;
      box-shadow: 0 0 0 2px var(--exam-nav-marked), 0 2px 8px rgba(196, 149, 106, 0.4);
    }

    .exam-nav-module-stats {
      padding: 16px;
      margin-top: auto;
      border-top: 1px solid var(--border-light, #ece8e1);
    }

    .exam-nav-module-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted, #8a8a8a);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .exam-nav-module-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      font-size: 0.8rem;
      color: var(--text-secondary, #4a4a4a);
    }

    .exam-nav-module-row span:last-child {
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
      color: var(--color-sage, #5a7d5c);
    }

    .exam-content {
      flex: 1;
      overflow-y: auto;
      padding: 24px 32px;
    }

    .exam-question {
      max-width: 720px;
      margin: 0 auto;
    }

    .exam-q-header {
      margin-bottom: 16px;
    }

    .exam-q-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .exam-q-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-sage, #5a7d5c);
    }

    .exam-q-module {
      font-size: 0.7rem;
      font-weight: 500;
      padding: 2px 10px;
      border-radius: var(--radius-full, 9999px);
      background: rgba(90, 125, 92, 0.1);
      color: var(--color-sage, #5a7d5c);
    }

    .exam-q-score {
      font-size: 0.7rem;
      font-weight: 500;
      padding: 2px 10px;
      border-radius: var(--radius-full, 9999px);
      background: rgba(26, 58, 42, 0.06);
      color: var(--text-secondary, #4a4a4a);
    }

    .exam-q-subject {
      font-size: 0.7rem;
      font-weight: 500;
      padding: 2px 10px;
      border-radius: var(--radius-full, 9999px);
      background: rgba(196, 149, 106, 0.1);
      color: var(--color-amber, #c4956a);
    }

    .exam-q-answered-badge {
      font-size: 0.68rem;
      font-weight: 600;
      padding: 2px 10px;
      border-radius: var(--radius-full, 9999px);
      background: rgba(58, 140, 92, 0.12);
      color: var(--color-success, #3a8c5c);
      display: inline-flex;
    }

    .exam-q-stem {
      font-size: 1.08rem;
      font-weight: 600;
      color: var(--text-primary, #1a1a1a);
      margin-bottom: 12px;
      line-height: 1.7;
    }

    .exam-question-chart {
      margin-bottom: 16px;
      border-radius: var(--radius-md, 8px);
    }

    .exam-q-hint {
      font-size: 0.8rem;
      color: var(--color-amber, #c4956a);
      background: rgba(196, 149, 106, 0.07);
      padding: 8px 14px;
      border-radius: var(--radius-sm, 4px);
      margin-bottom: 16px;
      font-weight: 500;
    }

    .exam-subquestions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 20px;
    }

    .exam-subq {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: var(--surface-primary, #ffffff);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: var(--radius-md, 8px);
      transition: border-color var(--transition-fast, 0.15s ease);
    }

    .exam-subq-label {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 2px solid var(--border-default, #e0dcd5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 700;
      flex-shrink: 0;
      color: var(--text-secondary, #4a4a4a);
      margin-top: 1px;
    }

    .exam-subq-text {
      flex: 1;
      font-size: 0.94rem;
      color: var(--text-primary, #1a1a1a);
      line-height: 1.6;
      padding-top: 2px;
    }

    .exam-subq-toggle {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }

    .exam-toggle-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 14px;
      border: 1.5px solid var(--border-default, #e0dcd5);
      border-radius: var(--radius-sm, 4px);
      background: var(--surface-primary, #ffffff);
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--transition-fast, 0.15s ease);
      color: var(--text-secondary, #4a4a4a);
    }

    .exam-toggle-btn:hover {
      border-color: var(--color-sage, #5a7d5c);
      background: rgba(90, 125, 92, 0.04);
    }

    .exam-toggle-icon {
      font-size: 0.75rem;
    }

    .exam-toggle-true.active {
      background: rgba(58, 140, 92, 0.1);
      border-color: var(--color-success, #3a8c5c);
      color: var(--color-success, #3a8c5c);
      font-weight: 600;
    }

    .exam-toggle-true.active .exam-toggle-icon {
      color: var(--color-success, #3a8c5c);
    }

    .exam-toggle-false.active {
      background: rgba(192, 85, 58, 0.08);
      border-color: var(--color-error, #c0553a);
      color: var(--color-error, #c0553a);
      font-weight: 600;
    }

    .exam-toggle-false.active .exam-toggle-icon {
      color: var(--color-error, #c0553a);
    }

    .exam-q-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 16px;
      border-top: 1px solid var(--border-light, #ece8e1);
      gap: 12px;
      flex-wrap: wrap;
    }

    .exam-mark-btn {
      background: rgba(26, 58, 42, 0.04);
      border: 1px solid var(--border-default, #e0dcd5);
      color: var(--text-secondary, #4a4a4a);
      font-weight: 500;
    }

    .exam-mark-btn:hover {
      background: rgba(196, 149, 106, 0.08);
      border-color: var(--color-amber, #c4956a);
    }

    .exam-mark-btn--active {
      background: rgba(196, 149, 106, 0.12);
      border-color: var(--color-amber, #c4956a);
      color: var(--color-amber, #c4956a);
      font-weight: 600;
    }

    .exam-q-nav-btns {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .exam-q-nav-pos {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.82rem;
      color: var(--text-muted, #8a8a8a);
      min-width: 80px;
      text-align: center;
    }

    .exam-mobile-nav {
      display: none;
      flex-shrink: 0;
      background: var(--surface-primary, #ffffff);
      border-top: 1px solid var(--border-light, #ece8e1);
      padding: 10px 12px;
    }

    .exam-mobile-nav-scroll {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 4px;
      -webkit-overflow-scrolling: touch;
    }

    .exam-mobile-nav-scroll::-webkit-scrollbar {
      height: 3px;
    }

    .exam-question-error {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted, #8a8a8a);
      font-size: 1rem;
    }

    .exam-result {
      max-width: 900px;
      margin: 0 auto;
    }

    .exam-result-card {
      background: var(--surface-primary, #ffffff);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: var(--radius-lg, 12px);
      padding: 48px;
      box-shadow: var(--shadow-md, 0 2px 8px rgba(44, 62, 48, 0.06));
    }

    .exam-result-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .exam-result-header h2 {
      font-family: var(--font-serif, 'Noto Serif SC', serif);
      font-size: 1.5rem;
      color: var(--color-deep, #1a3a2a);
      margin-bottom: 6px;
    }

    .exam-result-header p {
      color: var(--text-muted, #8a8a8a);
      font-size: 0.9rem;
    }

    .exam-result-score {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 32px;
      margin-bottom: 36px;
      padding-bottom: 32px;
      border-bottom: 1px solid var(--border-light, #ece8e1);
    }

    .exam-score-circle {
      width: 130px;
      height: 130px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: 4px solid var(--color-sage, #5a7d5c);
      position: relative;
    }

    .exam-score-circle.exam-grade--excellent { border-color: #3a8c5c; background: rgba(58, 140, 92, 0.06); }
    .exam-score-circle.exam-grade--good { border-color: var(--color-sage, #5a7d5c); background: rgba(90, 125, 92, 0.05); }
    .exam-score-circle.exam-grade--pass { border-color: var(--color-amber, #c4956a); background: rgba(196, 149, 106, 0.06); }
    .exam-score-circle.exam-grade--fail { border-color: var(--color-error, #c0553a); background: rgba(192, 85, 58, 0.05); }

    .exam-score-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 2.2rem;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
    }

    .exam-score-total {
      font-size: 0.8rem;
      color: var(--text-muted, #8a8a8a);
    }

    .exam-score-meta {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .exam-score-percent {
      font-family: 'JetBrains Mono', monospace;
      font-size: 2.4rem;
      font-weight: 700;
      color: var(--color-deep, #1a3a2a);
    }

    .exam-score-grade {
      font-size: 1.1rem;
      font-weight: 700;
      padding: 4px 16px;
      border-radius: var(--radius-full, 9999px);
    }

    .exam-score-grade.exam-grade--excellent { color: #3a8c5c; background: rgba(58, 140, 92, 0.1); }
    .exam-score-grade.exam-grade--good { color: var(--color-sage, #5a7d5c); background: rgba(90, 125, 92, 0.1); }
    .exam-score-grade.exam-grade--pass { color: var(--color-amber, #c4956a); background: rgba(196, 149, 106, 0.1); }
    .exam-score-grade.exam-grade--fail { color: var(--color-error, #c0553a); background: rgba(192, 85, 58, 0.1); }

    .exam-score-time {
      font-size: 0.82rem;
      color: var(--text-muted, #8a8a8a);
      margin-top: 4px;
    }

    .exam-result-modules,
    .exam-result-detail,
    .exam-result-wrong,
    .exam-result-perfect {
      margin-bottom: 32px;
    }

    .exam-result-modules h3,
    .exam-result-detail h3,
    .exam-result-wrong h3 {
      font-family: var(--font-serif, 'Noto Serif SC', serif);
      font-size: 1.1rem;
      color: var(--color-deep, #1a3a2a);
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-light, #ece8e1);
    }

    .exam-modules-score-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .exam-module-score-card {
      background: var(--surface-secondary, #faf7f2);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: var(--radius-md, 8px);
      padding: 20px 16px;
      text-align: center;
    }

    .exam-module-score-name {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--color-deep, #1a3a2a);
      margin-bottom: 2px;
    }

    .exam-module-score-desc {
      font-size: 0.72rem;
      color: var(--text-muted, #8a8a8a);
      margin-bottom: 10px;
    }

    .exam-module-score-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--color-sage, #5a7d5c);
      margin-bottom: 8px;
    }

    .exam-module-score-num span {
      font-size: 0.8rem;
      color: var(--text-muted, #8a8a8a);
      font-weight: 400;
    }

    .exam-module-score-bar {
      height: 6px;
      background: var(--border-light, #ece8e1);
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 6px;
    }

    .exam-module-score-fill {
      height: 100%;
      background: var(--color-sage, #5a7d5c);
      border-radius: 2px;
      transition: width 0.6s ease;
    }

    .exam-module-score-pct {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-secondary, #4a4a4a);
    }

    .exam-detail-grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 6px;
    }

    .exam-detail-item {
      aspect-ratio: 1;
      border-radius: var(--radius-sm, 4px);
      border: 1px solid var(--border-default, #e0dcd5);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 0.68rem;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--transition-fast, 0.15s ease);
      gap: 1px;
    }

    .exam-detail-item:hover {
      transform: scale(1.1);
    }

    .exam-detail-item--correct {
      background: rgba(58, 140, 92, 0.08);
      border-color: rgba(58, 140, 92, 0.3);
      color: var(--color-success, #3a8c5c);
    }

    .exam-detail-item--wrong {
      background: rgba(192, 85, 58, 0.06);
      border-color: rgba(192, 85, 58, 0.3);
      color: var(--color-error, #c0553a);
    }

    .exam-detail-item--partial {
      background: rgba(232, 168, 48, 0.08);
      border-color: rgba(232, 168, 48, 0.3);
      color: var(--color-warning, #e8a830);
    }

    .exam-detail-item--unanswered {
      background: var(--surface-tertiary, #f0ebe0);
      border-color: var(--border-default, #e0dcd5);
      color: var(--text-muted, #8a8a8a);
    }

    .exam-detail-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
    }

    .exam-detail-status {
      font-size: 0.7rem;
    }

    .exam-wrong-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .exam-wrong-item {
      padding: 14px 18px;
      background: var(--surface-secondary, #faf7f2);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: var(--radius-md, 8px);
    }

    .exam-wrong-num {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-sage, #5a7d5c);
      margin-bottom: 4px;
    }

    .exam-wrong-stem {
      font-size: 0.9rem;
      color: var(--text-primary, #1a1a1a);
      margin-bottom: 4px;
      line-height: 1.5;
    }

    .exam-wrong-score {
      font-size: 0.78rem;
      color: var(--color-error, #c0553a);
      font-weight: 500;
    }

    .exam-result-perfect {
      text-align: center;
      padding: 32px;
      background: rgba(58, 140, 92, 0.05);
      border: 1px solid rgba(58, 140, 92, 0.15);
      border-radius: var(--radius-md, 8px);
    }

    .exam-perfect-icon {
      font-size: 3rem;
      margin-bottom: 12px;
    }

    .exam-result-perfect h3 {
      color: var(--color-success, #3a8c5c);
      border: none;
      padding: 0;
      margin-bottom: 8px;
    }

    .exam-result-perfect p {
      color: var(--text-secondary, #4a4a4a);
    }

    .exam-result-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--border-light, #ece8e1);
    }

    .exam-review {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--border-light, #ece8e1);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .exam-review-q {
      padding: 20px 24px;
      background: var(--surface-secondary, #faf7f2);
      border: 1px solid var(--border-light, #ece8e1);
      border-radius: var(--radius-md, 8px);
    }

    .exam-review-q-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }

    .exam-review-q-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-sage, #5a7d5c);
    }

    .exam-review-q-module {
      font-size: 0.7rem;
      padding: 2px 8px;
      border-radius: var(--radius-full, 9999px);
      background: rgba(90, 125, 92, 0.08);
      color: var(--color-sage, #5a7d5c);
    }

    .exam-review-q-tag {
      font-size: 0.68rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: var(--radius-full, 9999px);
    }

    .exam-review-q-tag--correct {
      background: rgba(58, 140, 92, 0.1);
      color: var(--color-success, #3a8c5c);
    }

    .exam-review-q-tag--wrong {
      background: rgba(192, 85, 58, 0.08);
      color: var(--color-error, #c0553a);
    }

    .exam-review-q-tag--unanswered {
      background: rgba(138, 138, 138, 0.1);
      color: var(--text-muted, #8a8a8a);
    }

    .exam-review-q-tag--marked {
      background: rgba(196, 149, 106, 0.1);
      color: var(--color-amber, #c4956a);
    }

    .exam-review-q-stem {
      font-size: 0.98rem;
      font-weight: 600;
      color: var(--text-primary, #1a1a1a);
      margin-bottom: 12px;
      line-height: 1.6;
    }

    .exam-review-subs {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .exam-review-sub {
      padding: 10px 14px;
      border-radius: var(--radius-sm, 4px);
      border: 1px solid var(--border-light, #ece8e1);
      background: var(--surface-primary, #ffffff);
    }

    .exam-review-sub--correct {
      border-color: rgba(58, 140, 92, 0.2);
      background: rgba(58, 140, 92, 0.04);
    }

    .exam-review-sub--wrong {
      border-color: rgba(192, 85, 58, 0.2);
      background: rgba(192, 85, 58, 0.03);
    }

    .exam-review-sub--unanswered {
      border-color: var(--border-default, #e0dcd5);
      background: var(--surface-tertiary, #f0ebe0);
      opacity: 0.7;
    }

    .exam-review-sub-label {
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--text-muted, #8a8a8a);
      margin-bottom: 2px;
    }

    .exam-review-sub-text {
      font-size: 0.9rem;
      color: var(--text-primary, #1a1a1a);
      line-height: 1.5;
      margin-bottom: 6px;
    }

    .exam-review-sub-result {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 0.8rem;
      color: var(--text-secondary, #4a4a4a);
    }

    .exam-review-sub-result strong {
      font-weight: 600;
    }

    .exam-review-sub-icon {
      font-weight: 700;
      font-size: 0.9rem;
    }

    .exam-review-sub-icon--ok {
      color: var(--color-success, #3a8c5c);
    }

    .exam-review-sub-icon--no {
      color: var(--color-error, #c0553a);
    }

    .exam-review-q-exp {
      margin-top: 12px;
      padding: 12px 16px;
      background: rgba(196, 149, 106, 0.06);
      border: 1px solid rgba(196, 149, 106, 0.15);
      border-radius: var(--radius-sm, 4px);
      font-size: 0.85rem;
      line-height: 1.7;
      color: var(--text-secondary, #4a4a4a);
    }

    .exam-exit-opacity {
      opacity: 0;
      transform: translateY(-8px);
    }

    .exam-fade-in {
      animation: examFadeSlideIn 0.35s ease forwards;
    }

    @keyframes examFadeSlideIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .exam-answer-pulse {
      animation: examAnswerPulse 0.5s ease;
    }

    @keyframes examAnswerPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(90, 125, 92, 0.3); }
      50% { box-shadow: 0 0 0 8px rgba(90, 125, 92, 0); }
    }

    .exam-timer--warning {
      transition: background-color 0.3s ease, transform 0.3s ease;
    }

    .exam-nav-btn {
      transition: transform var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease);
    }

    .exam-nav-btn:hover:not(:disabled) {
      transform: scale(1.05);
    }

    @media (max-width: 768px) {
      .exam-start-card {
        padding: 28px 20px;
      }

      .exam-start-title {
        font-size: 1.4rem;
      }

      .exam-modules-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .exam-interface {
        height: auto;
        min-height: calc(100vh - var(--header-height, 64px) - 40px);
        border-radius: var(--radius-md, 8px);
      }

      .exam-topbar {
        padding: 10px 16px;
        flex-wrap: wrap;
        gap: 8px;
      }

      .exam-topbar-label {
        font-size: 0.75rem;
      }

      .exam-timer-display {
        font-size: 1.1rem;
      }

      .exam-body {
        flex-direction: column;
      }

      .exam-nav-panel {
        display: none;
      }

      .exam-content {
        padding: 16px;
      }

      .exam-mobile-nav {
        display: block;
      }

      .exam-q-stem {
        font-size: 1rem;
      }

      .exam-subq {
        flex-direction: column;
        gap: 8px;
      }

      .exam-subq-toggle {
        align-self: flex-end;
      }

      .exam-q-actions {
        flex-direction: column;
        align-items: stretch;
      }

      .exam-q-nav-btns {
        justify-content: center;
      }

      .exam-result-card {
        padding: 24px 16px;
      }

      .exam-result-score {
        flex-direction: column;
        gap: 20px;
      }

      .exam-modules-score-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .exam-detail-grid {
        grid-template-columns: repeat(8, 1fr);
      }

      .exam-result-actions {
        flex-direction: column;
        align-items: stretch;
      }
    }

    @media (max-width: 480px) {
      .exam-modules-grid {
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .exam-module-card {
        padding: 14px 10px;
      }

      .exam-modules-score-grid {
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .exam-module-score-card {
        padding: 14px 10px;
      }

      .exam-detail-grid {
        grid-template-columns: repeat(6, 1fr);
        gap: 4px;
      }

      .exam-detail-item {
        font-size: 0.6rem;
      }
    }
  `;

  document.head.appendChild(style);
}

let QData = [];
let examQuestions = [];
let currentIndex = 0;
let userAnswers = {};
let markedQuestions = {};
let timeRemaining = 9000;
let timerInterval = null;
let examSubmitted = false;
let examStarted = false;
let examStartTime = null;
let dataLoaded = false;

const EXAM_TOTAL = 72;
// 实际本次考试的题量（题库不足 72 时按实际可用数量组卷，动态缩小）
let EXAM_TOTAL_ACTUAL = EXAM_TOTAL;
const QUESTIONS_PER_MODULE = 18;
const POINTS_PER_QUESTION = 2;
// 4 子题联赛阶梯 —— 唯一权威在 js/core/question-model.js（此处引用防漂移）
const LEAGUE_SCORE_TABLE = QuestionModel.LEAGUE_SCORE_TABLE;
const TOTAL_SCORE = 144;
const TOTAL_TIME = 9000;
const WARNING_TIME = 600;

const MODULE_GROUPS = {
  1: { name: '模块一', desc: '生物化学、细胞生物学、分子生物学', fields: [1] },
  2: { name: '模块二', desc: '植物学、植物生理学、微生物学', fields: [2] },
  3: { name: '模块三', desc: '动物学、动物生理学、生态学', fields: [3] },
  4: { name: '模块四', desc: '遗传学、进化生物学、生物信息学', fields: [4] }
};

const STORAGE_KEY = 'bioquest_exam_state';

async function loadQuizData() {
  if (dataLoaded) return true;

  var target = AppState.rootElement || document.getElementById('page-content');
  // Show loading screen
  if (target) {
    target.innerHTML = `
      <div class="exam-loading-screen">
        <div class="exam-loading-content">
          <div class="exam-loading-icon" aria-hidden="true">
            <div class="bq-loader-dna" role="status" aria-label="加载中">
              <span class="bq-dna-strand bq-dna-strand--left"><i></i><i></i><i></i><i></i></span>
              <span class="bq-dna-strand bq-dna-strand--right"><i></i><i></i><i></i><i></i></span>
              <span class="bq-dna-rung"></span>
            </div>
          </div>
          <h3 class="exam-loading-title">正在加载题库</h3>
          <p class="exam-loading-status" id="examLoadingStatus">正在连接…</p>
          <div class="exam-loading-bar-wrap">
            <div class="exam-loading-bar bq-progress-shimmer" id="examLoadingBar" style="width:0%"></div>
          </div>
          <p class="exam-loading-hint" id="examLoadingHint">首次加载可能需要几秒，后续将使用缓存</p>
        </div>
      </div>
    `;
  }

  try {
    // 更新进度显示
    const updateProgress = (pct, status, hint) => {
      var bar = document.getElementById('examLoadingBar');
      var statusEl = document.getElementById('examLoadingStatus');
      var hintEl = document.getElementById('examLoadingHint');
      if (bar) bar.style.width = pct + '%';
      if (statusEl) statusEl.textContent = status;
      if (hintEl) hintEl.textContent = hint;
    };

    updateProgress(10, '正在加载题库…', '正在从服务器获取数据');

    // 主动确保 loader.js 已加载（解决 loader.js 未在 index.html 预加载的问题）
    if (typeof window.loadQuestions !== 'function' &&
        typeof window.ensureQuestionLoaderReady === 'function') {
      updateProgress(15, '正在初始化题库加载器…', '加载本地题库引擎');
      try {
        await window.ensureQuestionLoaderReady({ timeout: 8000, attempts: 2 });
      } catch (e) {
        console.warn('[TATABOX Exam] loader.js 加载失败，回退本地 JSON:', e);
      }
    }

    // 优先使用 loader.js 加载（支持 Supabase + 本地 JSON 回退 + 格式自动转换）
    // → P0-5: 首屏秒开：走 preferLocal / BALANCED 模式，直接读本地 quiz_m1~m4.json（≤300ms），
    //         后台静默刷新 Supabase，避免"一直卡在 30s 超时"
    // → 设置页「题库数据源=本地题库」时彻底改走 PREFER_LOCAL，不触发任何 Supabase 请求
    var allQuestions = [];
    try {
      if (typeof window.loadQuestions === 'function') {
        var qSource = (typeof loadSetting === 'function') ? loadSetting('question_source', 'cloud') : 'cloud';
        var sourceMode = (window.LoaderMode && window.LoaderMode.PREFER_LOCAL)
          ? window.LoaderMode.PREFER_LOCAL
          : 'preferLocal';
        var loadOpts = {
          mode: (qSource === 'local')
            ? sourceMode
            : ((window.LoaderMode && window.LoaderMode.BALANCED) || 'balanced'),
          onProgress: function (done, total, m, n) {
            var pct = 15 + Math.round((done / Math.max(1, total)) * 60);
            updateProgress(pct, '正在加载题库…', (m ? ('模块 ' + m + ' +' + n + ' 题') : '合并本地题库'));
          },
          onBackgroundDone: function (status) {
            console.info('[TATABOX Exam] 后台题库同步完成：', status);
          }
        };
        allQuestions = await window.loadQuestions([1, 2, 3, 4], loadOpts);
        updateProgress(75, '正在合并题目…', '已加载 ' + (allQuestions ? allQuestions.length : 0) + ' 道');
      }
    } catch (e) {
      console.warn('[TATABOX Exam] loadQuestions 失败，回退本地:', e);
    }

    if (!allQuestions || allQuestions.length === 0) {
      updateProgress(30, '正在加载本地题库…', '正在读取 data/quiz.json');
      var res = await fetch('data/quiz.json');
      if (!res.ok) {
        throw new Error('无法加载题库文件: ' + res.status);
      }
      var json = await res.json();
      allQuestions = json.questions || json.题库 || [];
    }

    // P0-4: 应用隔离过滤（loadQuestions 路径已过滤，本地 fetch 路径需要补充过滤）
    if (typeof window._filterQuarantinedQuestions === 'function') {
      allQuestions = window._filterQuarantinedQuestions(allQuestions);
    }

    // 超长知识讲义型题目过滤 + 清洗（单选项 >600 字、总分量 >4000 字 → 剔除；其余选项超 300 字截断）
    if (typeof window.filterQuestionList === 'function') {
      allQuestions = window.filterQuestionList(allQuestions);
    }

    updateProgress(80, '正在筛选有效题目…', '筛选符合要求的题目');

    // MTF 题过滤：subQuestions 数组且至少 2 个子判断题（兼容 4/5/6 子题格式）
    QData = allQuestions.filter(function (q) {
      return q && Array.isArray(q.subQuestions) && q.subQuestions.length >= 2;
    });

    if (QData.length < EXAM_TOTAL) {
      console.warn('[TATABOX Exam] 题库题数不足: 只有 ' + QData.length + ' 题，需要 ' + EXAM_TOTAL + ' 题（将动态缩小题量）');
      // 题库不足时动态缩小考试题量，而非阻断考试
      if (QData.length >= 20) {
        EXAM_TOTAL_ACTUAL = QData.length;
      } else {
        EXAM_TOTAL_ACTUAL = QData.length;
      }
    } else {
      EXAM_TOTAL_ACTUAL = EXAM_TOTAL;
    }

    updateProgress(100, '题库加载完成', `已加载 ${QData.length} 道题目`);
    
    dataLoaded = true;

    return true;
  } catch (err) {
    console.error('[TATABOX Exam] 加载题目数据失败', err);
    QData = [];
    var status = document.getElementById('examLoadingStatus');
    if (status) status.textContent = '加载失败: ' + errText(err);
    var hint = document.getElementById('examLoadingHint');
    if (hint) hint.textContent = '请确保 data/quiz.json 文件存在且格式正确';
    return false;
  }
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * v4.0 确定性随机数生成器（LCG）—— 用于固定试卷的稳定洗牌
 * 同一种子每次产生相同的随机序列，保证 fixed_2024 / fixed_2025 试卷可复现
 * @param {string|number} seed - 种子（通常是试卷模式字符串）
 * @returns {function(): number} 返回 [0,1) 之间的伪随机数
 */
function seededRandom(seed) {
  var s = 0;
  if (typeof seed === 'string') {
    for (var i = 0; i < seed.length; i++) {
      s = ((s * 31) + seed.charCodeAt(i)) & 0x7fffffff;
    }
  } else {
    s = seed | 0;
  }
  if (s === 0) s = 1;
  return function () {
    // LCG 参数（glibc 同款）
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * v4.0 确定性洗牌——同一 seed 产生相同顺序
 * @param {Array} arr
 * @param {string|number} seed
 * @returns {Array} 洗牌后的新数组
 */
function seededShuffle(arr, seed) {
  var rng = seededRandom(seed);
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

/**
 * 模块字段归一化匹配
 * 题库中 q.module 可能是 "module_3" 字符串或数字 3，本函数统一处理
 * @param {*} qModule - 题目的 module 字段
 * @param {number} moduleKey - 模块编号 1/2/3/4
 * @returns {boolean}
 */
function _matchModule(qModule, moduleKey) {
  if (qModule == null) return false;
  if (typeof qModule === 'number') return qModule === moduleKey;
  var s = String(qModule);
  return s === 'module_' + moduleKey || s === 'module' + moduleKey || s === String(moduleKey);
}

/**
 * 题目去重键——按题干文本去重，避免题库中的文本重复题目在同一份试卷中重复出现
 * @param {Object} q
 * @returns {string}
 */
function _questionDedupeKey(q) {
  if (!q) return '__null__';
  // 优先用题干文本；题干缺失时回退到子题串
  if (q.question && typeof q.question === 'string') return 'q:' + q.question;
  if (Array.isArray(q.subQuestions)) {
    return 's:' + q.subQuestions.map(function (s) { return (s && s.text) || ''; }).join('|');
  }
  return 'o:' + JSON.stringify(q);
}

/**
 * 对题目数组按题干文本去重（保留首次出现的题目）
 * 用于在组卷前清理题库中的文本重复条目
 * @param {Array} arr
 * @returns {Array}
 */
function _dedupeQuestions(arr) {
  if (!Array.isArray(arr)) return [];
  var seen = new Set();
  var result = [];
  for (var i = 0; i < arr.length; i++) {
    var key = _questionDedupeKey(arr[i]);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(arr[i]);
  }
  return result;
}

function pickQuestionsByModule(moduleKey) {
  const pool = _dedupeQuestions(QData.filter((q) => _matchModule(q.module, moduleKey)));
  const shuffled = shuffleArray(pool);
  return shuffled.slice(0, QUESTIONS_PER_MODULE);
}

// 修复 P1-2：多套卷支持
// 试卷模式：'random'（随机组卷）| 'fixed_2024' | 'fixed_2025'（固定真题卷）
const EXAM_PAPERS = {
  random: { name: '随机组卷', desc: '从题库随机抽取 72 题（模块均分）', duration: 150 },
  fixed_2024: { name: '2024 联赛模拟卷', desc: '固定题序，模拟 2024 年联赛', duration: 150 },
  fixed_2025: { name: '2025 联赛模拟卷', desc: '固定题序，模拟 2025 年联赛', duration: 150 }
};
let currentPaperMode = 'random';

/**
 * 根据试卷模式构建题目
 * - random: 按 buildExamPaper 原逻辑随机组卷
 * - fixed_XXXX: 用 seededShuffle 确定性洗牌，同一试卷每次题目相同
 *   不同试卷（fixed_2024 / fixed_2025）使用不同种子，题目顺序与选取都不同
 */
function buildExamPaperWithMode(paperMode) {
  currentPaperMode = paperMode || 'random';

  if (currentPaperMode === 'random') {
    buildExamPaper();
    return;
  }

  // 固定试卷：用确定性洗牌（seededShuffle）保证可复现
  examQuestions = [];
  var seedStr = currentPaperMode; // 'fixed_2024' 或 'fixed_2025'
  // 已选题目键集合（按题干文本去重，避免题库文本重复导致同卷重复）
  var usedKeys = new Set();
  // 每个模块用独立的子种子（seedStr + moduleKey），避免模块间序列耦合
  for (const moduleKey of [1, 2, 3, 4]) {
    var pool = _dedupeQuestions(QData.filter((q) => _matchModule(q.module, moduleKey)))
      .filter((q) => !usedKeys.has(_questionDedupeKey(q)));
    var picked = seededShuffle(pool, seedStr + '_m' + moduleKey).slice(0, QUESTIONS_PER_MODULE);
    picked.forEach((q) => usedKeys.add(_questionDedupeKey(q)));

    // 模块题量不足时，从未使用的其他模块题目中确定性补足
    if (picked.length < QUESTIONS_PER_MODULE) {
      var others = _dedupeQuestions(QData.filter((q) => !_matchModule(q.module, moduleKey)))
        .filter((q) => !usedKeys.has(_questionDedupeKey(q)));
      var extra = seededShuffle(others, seedStr + '_extra_m' + moduleKey)
        .slice(0, QUESTIONS_PER_MODULE - picked.length);
      extra.forEach((q) => usedKeys.add(_questionDedupeKey(q)));
      picked = picked.concat(extra);
    }

    examQuestions.push(...picked);
  }

  // 固定卷生成后校验总题量，不足时给出明确错误提示并阻止考试
  if (examQuestions.length < EXAM_TOTAL) {
    var actualCount = examQuestions.length;
    examQuestions = [];
    _showError('固定试卷生成失败：题库题量不足（当前可用 ' + actualCount + ' 题，需要 ' + EXAM_TOTAL + ' 题）。请尝试“随机抽题”模式或稍后重试。');
    return;
  }
}

function buildExamPaper() {
  examQuestions = [];
  // 已选题目键集合（按题干文本去重，避免题库文本重复导致同卷重复）
  var usedKeys = new Set();

  for (const moduleKey of [1, 2, 3, 4]) {
    const questions = pickQuestionsByModule(moduleKey)
      .filter((q) => !usedKeys.has(_questionDedupeKey(q)));
    questions.forEach((q) => usedKeys.add(_questionDedupeKey(q)));

    // 模块题量不足时，从未使用的其他模块题目中随机补足
    if (questions.length < QUESTIONS_PER_MODULE) {
      const remaining = QData.filter((q) => !usedKeys.has(_questionDedupeKey(q)));
      const extra = shuffleArray(remaining).slice(0, QUESTIONS_PER_MODULE - questions.length);
      extra.forEach((q) => usedKeys.add(_questionDedupeKey(q)));
      questions.push(...extra);
    }

    examQuestions.push(...questions);
  }
}

function autoSave() {
  if (examSubmitted) return;

  const state = {
    examQuestions,
    currentIndex,
    userAnswers,
    markedQuestions,
    timeRemaining,
    examStarted,
    examStartTime
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[TATABOX Exam] 自动保存失败:', e.message);
  }
}

function clearExamState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}

function restoreExamState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;

    const state = JSON.parse(raw);
    if (!state || !state.examStarted || !Array.isArray(state.examQuestions) || state.examQuestions.length !== EXAM_TOTAL) {
      return false;
    }

    examQuestions = state.examQuestions;
    currentIndex = state.currentIndex || 0;
    userAnswers = state.userAnswers || {};
    markedQuestions = state.markedQuestions || {};
    timeRemaining = typeof state.timeRemaining === 'number' ? Math.max(0, state.timeRemaining) : TOTAL_TIME;
    examStarted = state.examStarted;
    examStartTime = state.examStartTime || Date.now();

    const elapsed = Math.floor((Date.now() - examStartTime) / 1000);
    timeRemaining = Math.max(0, TOTAL_TIME - elapsed);

    return true;
  } catch (e) {
    return false;
  }
}

function formatExamTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getExamModuleKey(questionIndex) {
  return Math.floor(questionIndex / QUESTIONS_PER_MODULE) + 1;
}

function getModuleGroup(moduleKey) {
  return MODULE_GROUPS[moduleKey] || { name: `模块${moduleKey}`, desc: '' };
}

// 单题判卷 —— 薄封装，唯一实现在 js/core/question-model.js 的 gradeQuestion(q, ua, 'exam')
// （固定 72 题 × 4 子题 × 2 分，阶梯 0/0/0.2/1/2）
function calcQuestionScore(qIndex) {
  const q = examQuestions[qIndex];
  if (!q) return { correct: 0, total: 4, score: 0 };
  const g = QuestionModel.gradeQuestion(q, userAnswers[qIndex], 'exam');
  return { correct: g.correct, total: g.total, score: g.score };
}

function isSubQuestionCorrect(qIndex, subIdx) {
  const q = examQuestions[qIndex];
  if (!q) return false;
  return QuestionModel.isSubCorrect(q, subIdx, userAnswers[qIndex]);
}

function isQuestionFullyAnswered(qIndex) {
  const ans = userAnswers[qIndex];
  if (!ans) return false;
  for (let i = 0; i < 4; i++) {
    if (ans[i] === undefined || ans[i] === null) return false;
  }
  return true;
}

function countAnsweredInModule(moduleKey) {
  const start = (moduleKey - 1) * QUESTIONS_PER_MODULE;
  const end = start + QUESTIONS_PER_MODULE;
  let count = 0;
  for (let i = start; i < end; i++) {
    if (isQuestionFullyAnswered(i)) count++;
  }
  return count;
}

function getModuleScore(moduleKey) {
  const start = (moduleKey - 1) * QUESTIONS_PER_MODULE;
  const end = start + QUESTIONS_PER_MODULE;
  let score = 0;
  for (let i = start; i < end; i++) {
    score += calcQuestionScore(i).score;
  }
  return score;
}

function getTotalScore() {
  let score = 0;
  for (let i = 0; i < examQuestions.length; i++) {
    score += calcQuestionScore(i).score;
  }
  return score;
}

function getUnansweredCount() {
  let count = 0;
  for (let i = 0; i < examQuestions.length; i++) {
    if (!isQuestionFullyAnswered(i)) count++;
  }
  return count;
}

function getAllCorrectAnswers(qIndex) {
  const q = examQuestions[qIndex];
  if (!q || !q.subQuestions) return {};
  const result = {};
  q.subQuestions.forEach((sub, i) => {
    result[i] = sub.answer;
  });
  return result;
}

function getModuleWrongQuestions(moduleKey) {
  const start = (moduleKey - 1) * QUESTIONS_PER_MODULE;
  const end = start + QUESTIONS_PER_MODULE;
  const wrongList = [];

  for (let i = start; i < end; i++) {
    const q = examQuestions[i];
    if (!q) continue;
    let hasWrong = false;
    for (let j = 0; j < 4; j++) {
      if (!isSubQuestionCorrect(i, j)) {
        hasWrong = true;
        break;
      }
    }
    if (hasWrong) {
      wrongList.push({ index: i, question: q });
    }
  }

  return wrongList;
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  const timerEl = document.getElementById('examTimer');
  const timerDisplay = document.getElementById('examTimerDisplay');

  timerInterval = setInterval(() => {
    timeRemaining--;

    if (timerDisplay) {
      timerDisplay.textContent = formatExamTime(timeRemaining);
    }

    if (timerEl && timeRemaining <= WARNING_TIME) {
      timerEl.classList.add('exam-timer--warning');
    }

    if (timeRemaining % 10 === 0) {
      autoSave();
    }

    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      if (!examSubmitted) {
        submitExam(true);
      }
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function renderExamStartPage(target) {
  clearExamState();

  // 题库数据源（与设置页共享同一键）：'cloud' 云端同步 / 'local' 本地题库
  var qSource = (typeof loadSetting === 'function') ? loadSetting('question_source', 'cloud') : 'cloud';

  target.innerHTML = `
    <div class="exam-start animate-fade-in">
      <div class="exam-start-card">
        <div class="exam-start-header">
          <div class="exam-start-badge">全真模拟考试</div>
          <h2 class="exam-start-title">2025 年全国中学生生物学联赛</h2>
          <p class="exam-start-desc">72题 × 2分 = 144分满分，限时150分钟</p>
        </div>

        <div class="exam-start-info">
          <div class="exam-start-section">
            <h3>题库数据源</h3>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px;">
              <select class="practice-select" id="examQuestionSource" style="min-width:150px;padding:8px 12px;border:1px solid var(--border-default,#ddd);border-radius:8px;font-size:0.9rem;background:var(--surface-primary,#fff);color:var(--text-primary,#1a1a1a);">
                <option value="cloud" ${qSource === 'cloud' ? 'selected' : ''}>云端同步</option>
                <option value="local" ${qSource === 'local' ? 'selected' : ''}>本地题库</option>
              </select>
              <span style="font-size:0.85rem;color:var(--text-secondary,#6b7f74);" id="exam-source-hint">
                ${qSource === 'local'
                  ? '仅从站点内 data/ 读取题目，不发远程请求'
                  : '云端优先，本地兜底（默认）'}
              </span>
            </div>
          </div>

          <div class="exam-start-section">
            <h3>选择试卷</h3>
            <div class="exam-paper-selector" style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
              <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border:1px solid var(--border-default,#ddd);border-radius:8px;">
                <input type="radio" name="paperMode" value="random" checked style="margin-top:4px;">
                <div>
                  <strong>随机组卷</strong>
                  <div style="font-size:0.85rem;color:var(--text-secondary,#6b7f74);margin-top:2px;">从题库随机抽取 72 题（模块均分），每次题目不同</div>
                </div>
              </label>
              <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border:1px solid var(--border-default,#ddd);border-radius:8px;">
                <input type="radio" name="paperMode" value="fixed_2024" style="margin-top:4px;">
                <div>
                  <strong>2024 联赛模拟卷</strong>
                  <div style="font-size:0.85rem;color:var(--text-secondary,#6b7f74);margin-top:2px;">固定题序，模拟 2024 年联赛难度</div>
                </div>
              </label>
              <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border:1px solid var(--border-default,#ddd);border-radius:8px;">
                <input type="radio" name="paperMode" value="fixed_2025" style="margin-top:4px;">
                <div>
                  <strong>2025 联赛模拟卷</strong>
                  <div style="font-size:0.85rem;color:var(--text-secondary,#6b7f74);margin-top:2px;">固定题序，模拟 2025 年联赛难度</div>
                </div>
              </label>
            </div>
          </div>

          <div class="exam-start-section">
            <h3>考试说明</h3>
            <ul>
              <li>本试卷共 <strong>72</strong> 题，分为四个模块，严格按照2025联赛比例出题</li>
              <li>每题包含 4 个子选项（A/B/C/D），每个子选项需独立判断正误</li>
              <li>每题满分 2 分（每个子选项 0.5 分），总分 <strong>144</strong> 分</li>
              <li>考试限时 <strong>150</strong> 分钟（2小时30分），时间用完将自动交卷</li>
              <li>作答自动保存至本地，刷新页面不丢失进度</li>
              <li>剩余时间不足 <strong>10</strong> 分钟时，计时器将变红提醒</li>
            </ul>
          </div>

          <div class="exam-start-section">
            <h3>答题须知</h3>
            <ul>
              <li>每个子选项需分别判断「正确」或「错误」</li>
              <li>可使用「标记疑问」功能标记不确定的题目，方便复查</li>
              <li>点击题号导航可快速跳转到任意题目</li>
              <li>交卷后将显示详细成绩单和答案解析</li>
            </ul>
          </div>
        </div>

        <div class="exam-start-actions">
          <button class="btn btn-primary btn-lg" id="examStartBtn">
            开始考试
          </button>
        </div>
      </div>
    </div>
  `;

  // 考试页题库数据源切换：保存设置；若题库已加载则置为未加载，下次开始考试按新源重载
  var examSourceSelect = document.getElementById('examQuestionSource');
  if (examSourceSelect) {
    examSourceSelect.addEventListener('change', function () {
      var val = examSourceSelect.value;
      if (typeof saveSetting === 'function') saveSetting('question_source', val);
      var hintEl = document.getElementById('exam-source-hint');
      if (hintEl) {
        hintEl.textContent = val === 'local'
          ? '仅从站点内 data/ 读取题目，不发远程请求'
          : '云端优先，本地兜底（默认）';
      }
      if (dataLoaded) dataLoaded = false; // 强制下次组卷按新数据源重新加载
showToast(val === 'local' ? '已切换为本地题库，开始考试时将读取 data/ 题目' : '已切换为云端同步');
    });
  }

  var btn = document.getElementById('examStartBtn');
  if (btn) {
    btn.addEventListener('click', function() {
      // 修复 P1-2：读取用户选择的试卷模式
      var selectedPaper = 'random';
      var radios = document.getElementsByName('paperMode');
      for (var i = 0; i < radios.length; i++) {
        if (radios[i].checked) { selectedPaper = radios[i].value; break; }
      }
      startExam(target, selectedPaper);
    });
  }
}

async function startExam(target, paperMode) {
  if (!dataLoaded) {
    await loadQuizData();
  }

  if (!dataLoaded || QData.length === 0) {
    alert('题库加载失败或为空，请检查 data/quiz.json 文件或网络连接。');
    return;
  }
  // 题库不足 72 题时动态缩小题量（已在 loadQuizData 中设置 EXAM_TOTAL_ACTUAL），不阻断考试
  if (QData.length < EXAM_TOTAL) {
    console.warn('[TATABOX Exam] 题库不足 72 题，本次考试题量缩小为 ' + EXAM_TOTAL_ACTUAL + ' 题');
  }

  clearExamState();
  // 修复 P1-2：根据试卷模式组卷（随机 / 2024 模拟 / 2025 模拟）
  buildExamPaperWithMode(paperMode || 'random');
  currentIndex = 0;
  userAnswers = {};
  markedQuestions = {};
  timeRemaining = TOTAL_TIME;
  examSubmitted = false;
  examStarted = true;
  examStartTime = Date.now();

  autoSave();
  renderExamInterface(target);
  startTimer();
}

function renderExamInterface(target) {
  const totalAnswered = examQuestions.filter((_, i) => isQuestionFullyAnswered(i)).length;

  target.innerHTML = `
    <div class="exam-interface">
      <div class="exam-topbar" id="examTopbar">
        <div class="exam-topbar-left">
          <span class="exam-topbar-label">TATABOX 全真模拟考试</span>
          <span class="exam-topbar-progress">${totalAnswered} / ${EXAM_TOTAL} 已答</span>
        </div>
        <div class="exam-timer" id="examTimer">
          <svg class="exam-timer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="exam-timer-display" id="examTimerDisplay">${formatExamTime(timeRemaining)}</span>
        </div>
        <div class="exam-topbar-right">
          <button class="btn btn-sm exam-submit-btn" id="examSubmitBtn">交卷</button>
        </div>
      </div>

      <div class="exam-body">
        <div class="exam-nav-panel" id="examNavPanel">
          <div class="exam-nav-title">题号导航</div>
          <div class="exam-nav-legend">
            <span class="exam-nav-legend-item"><span class="exam-nav-dot exam-nav-dot--unanswered"></span> 未答</span>
            <span class="exam-nav-legend-item"><span class="exam-nav-dot exam-nav-dot--answered"></span> 已答</span>
            <span class="exam-nav-legend-item"><span class="exam-nav-dot exam-nav-dot--marked"></span> 已标记</span>
            <span class="exam-nav-legend-item"><span class="exam-nav-dot exam-nav-dot--current"></span> 当前</span>
          </div>
          <div class="exam-nav-grid" id="examNavGrid"></div>
          <div class="exam-nav-module-stats" id="examNavModuleStats"></div>
        </div>

        <div class="exam-content" id="examContent">
          ${renderQuestionHTML(currentIndex)}
        </div>
      </div>

      <div class="exam-mobile-nav" id="examMobileNav">
        <div class="exam-mobile-nav-scroll" id="examMobileNavScroll"></div>
      </div>
    </div>
  `;

  renderNavGrid();
  renderMobileNavGrid();
  renderModuleStats();
  bindExamEvents(target);

  if (timeRemaining <= WARNING_TIME) {
    const timerEl = document.getElementById('examTimer');
    if (timerEl) timerEl.classList.add('exam-timer--warning');
  }
}

function renderQuestionHTML(qIndex) {
  const q = examQuestions[qIndex];
  if (!q) return '<div class="exam-question-error">题目数据异常</div>';

  const moduleKey = getExamModuleKey(qIndex);
  const mod = getModuleGroup(moduleKey);
  const isMarked = !!markedQuestions[qIndex];
  const isAnswered = isQuestionFullyAnswered(qIndex);

  const userAns = userAnswers[qIndex] || {};

  let html = `
    <div class="exam-question" id="examQ-${qIndex}">
      <div class="exam-q-header">
        <div class="exam-q-meta">
          <span class="exam-q-num">第 ${qIndex + 1} 题</span>
          <span class="exam-q-module">${mod.name}</span>
          ${typeof renderDifficultyTag === 'function' ? renderDifficultyTag(q.id || qIndex, q.difficulty || 3) : ''}
          <span class="exam-q-score">2分</span>
          ${q.subject ? '<span class="exam-q-subject">' + q.subject + '</span>' : ''}
          ${isAnswered ? '<span class="exam-q-answered-badge">已答</span>' : ''}
        </div>
        <button class="exam-q-feedback-btn" title="反馈题目问题" data-qindex="${qIndex}" style="background:transparent;border:1px solid var(--border-light,#ece8e1);border-radius:8px;padding:3px 10px;font-size:0.72rem;cursor:pointer;color:var(--text-muted,#8a8a8a);display:flex;align-items:center;gap:4px;transition:all 0.15s;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          反馈
        </button>
      </div>
      <div class="exam-q-stem">${q.question.replace(/\n/g, '<br>')}</div>
      ${(typeof window !== 'undefined' && window.BioQuestFigure) ? window.BioQuestFigure.render(q, { alt: '题目配图' }) : renderChart(q.chart)}
      <div class="exam-q-hint">请对以下 4 个子选项分别判断正误（每题2分，按2025联赛标准阶梯赋分：对2个得0.2分，对3个得1分，全对得2分）</div>
      <div class="exam-subquestions">
  `;

  (q.subQuestions || []).forEach((sub, subIdx) => {
    const selected = userAns[subIdx];
    html += `
      <div class="exam-subq" id="examSubQ-${qIndex}-${subIdx}">
        <div class="exam-subq-label">${sub.label}</div>
        <div class="exam-subq-text">${sub.text}</div>
        <div class="exam-subq-toggle">
          <button class="exam-toggle-btn exam-toggle-true${selected === true ? ' active' : ''}"
            data-q="${qIndex}" data-sub="${subIdx}" data-val="true">
            <span class="exam-toggle-icon">V</span> 正确
          </button>
          <button class="exam-toggle-btn exam-toggle-false${selected === false ? ' active' : ''}"
            data-q="${qIndex}" data-sub="${subIdx}" data-val="false">
            <span class="exam-toggle-icon">X</span> 错误
          </button>
        </div>
      </div>
    `;
  });

  html += `
      </div>
      <div class="exam-q-actions">
        <button class="btn btn-sm exam-mark-btn${isMarked ? ' exam-mark-btn--active' : ''}" id="examMarkBtn">
          ${isMarked ? '[M] 已标记' : '[ ] 标记疑问'}
        </button>
        <div class="exam-q-nav-btns">
          <button class="btn btn-sm btn-secondary exam-nav-btn" id="examPrevBtn"${qIndex === 0 ? ' disabled' : ''}>
            ← 上一题
          </button>
          <span class="exam-q-nav-pos">${qIndex + 1} / ${EXAM_TOTAL}</span>
          <button class="btn btn-sm btn-secondary exam-nav-btn" id="examNextBtn"${qIndex === EXAM_TOTAL - 1 ? ' disabled' : ''}>
            下一题 →
          </button>
        </div>
      </div>
    </div>
  `;

  return html;
}

function renderNavGrid() {
  const grid = document.getElementById('examNavGrid');
  if (!grid) return;

  let html = '';
  for (let i = 0; i < EXAM_TOTAL; i++) {
    const isAnswered = isQuestionFullyAnswered(i);
    const isMarked = !!markedQuestions[i];
    const isCurrent = i === currentIndex;

    let cls = 'exam-nav-item';
    if (isCurrent) cls += ' exam-nav-item--current';
    else if (isAnswered) cls += ' exam-nav-item--answered';
    if (isMarked) cls += ' exam-nav-item--marked';

    html += `<button class="${cls}" data-index="${i}" title="第${i + 1}题">${i + 1}</button>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.exam-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      if (idx === currentIndex) return;
      currentIndex = idx;
      refreshQuestionContent();
      renderNavGrid();
      renderMobileNavGrid();
      autoSave();
    });
  });

  const currentBtn = grid.querySelector(`[data-index="${currentIndex}"]`);
  if (currentBtn) {
    currentBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function renderMobileNavGrid() {
  const scroll = document.getElementById('examMobileNavScroll');
  if (!scroll) return;

  let html = '';
  for (let i = 0; i < EXAM_TOTAL; i++) {
    const isAnswered = isQuestionFullyAnswered(i);
    const isMarked = !!markedQuestions[i];
    const isCurrent = i === currentIndex;

    let cls = 'exam-nav-item';
    if (isCurrent) cls += ' exam-nav-item--current';
    else if (isAnswered) cls += ' exam-nav-item--answered';
    if (isMarked) cls += ' exam-nav-item--marked';

    html += `<button class="${cls}" data-index="${i}">${i + 1}</button>`;
  }

  scroll.innerHTML = html;

  scroll.querySelectorAll('.exam-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      if (idx === currentIndex) return;
      currentIndex = idx;
      refreshQuestionContent();
      renderNavGrid();
      renderMobileNavGrid();
      autoSave();
    });
  });

  const currentBtn = scroll.querySelector(`[data-index="${currentIndex}"]`);
  if (currentBtn) {
    currentBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth', inline: 'center' });
  }
}

function renderModuleStats() {
  const statsEl = document.getElementById('examNavModuleStats');
  if (!statsEl) return;

  let html = '<div class="exam-nav-module-title">模块进度</div>';
  for (let m = 1; m <= 4; m++) {
    const answered = countAnsweredInModule(m);
    const mod = MODULE_GROUPS[m];
    html += `
      <div class="exam-nav-module-row">
        <span>${mod.name}</span>
        <span>${answered}/${QUESTIONS_PER_MODULE}</span>
      </div>
    `;
  }

  statsEl.innerHTML = html;
}

function refreshQuestionContent() {
  const content = document.getElementById('examContent');
  if (!content) return;

  content.innerHTML = renderQuestionHTML(currentIndex);
  bindQuestionEvents();

  const qEl = content.querySelector('.exam-question');
  if (qEl) {
    qEl.classList.remove('exam-fade-in');
    void qEl.offsetWidth;
    qEl.classList.add('exam-fade-in');
  }
}

function bindQuestionEvents() {
  const content = document.getElementById('examContent');
  if (!content) return;

  content.querySelectorAll('.exam-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (examSubmitted) return;
      const q = parseInt(btn.dataset.q);
      const sub = parseInt(btn.dataset.sub);
      const val = btn.dataset.val === 'true';
      selectOption(q, sub, val);
    });
  });

  const markBtn = document.getElementById('examMarkBtn');
  if (markBtn) {
    markBtn.addEventListener('click', toggleMark);
  }

  const prevBtn = document.getElementById('examPrevBtn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex--;
        refreshQuestionContent();
        renderNavGrid();
        renderMobileNavGrid();
        autoSave();
      }
    });
  }

  const nextBtn = document.getElementById('examNextBtn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentIndex < EXAM_TOTAL - 1) {
        currentIndex++;
        refreshQuestionContent();
        renderNavGrid();
        renderMobileNavGrid();
        autoSave();
      }
    });
  }
}

function bindExamEvents(target) {
  document.removeEventListener('keydown', handleExamKeydown);

  bindQuestionEvents();

  // 题目反馈按钮委托事件
  target.addEventListener('click', function(e) {
    var feedbackBtn = e.target.closest('.exam-q-feedback-btn');
    if (!feedbackBtn) return;
    e.preventDefault();
    var qIndex = parseInt(feedbackBtn.getAttribute('data-qindex'));
    if (isNaN(qIndex)) return;
    var q = examQuestions[qIndex];
    if (q && typeof showQuestionFeedbackModal === 'function') {
      showQuestionFeedbackModal(q.id || qIndex, q.question || '');
    }
  });

  const submitBtn = document.getElementById('examSubmitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      if (examSubmitted) return;
      const unanswered = getUnansweredCount();
      let msg = '确定要交卷吗？';

      if (unanswered > 0) {
        msg += `\n\n你还有 ${unanswered} 道题未作答，交卷后这些题目将计为0分。`;
      }

      msg += '\n\n交卷后无法修改答案。';

      if (confirm(msg)) {
        submitExam(false);
      }
    });
  }

  document.addEventListener('keydown', handleExamKeydown);
}

function handleExamKeydown(e) {
  if (examSubmitted) return;

  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (currentIndex > 0) {
      currentIndex--;
      refreshQuestionContent();
      renderNavGrid();
      renderMobileNavGrid();
      autoSave();
    }
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (currentIndex < EXAM_TOTAL - 1) {
      currentIndex++;
      refreshQuestionContent();
      renderNavGrid();
      renderMobileNavGrid();
      autoSave();
    }
  } else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    toggleMark();
  }
}

function selectOption(qIndex, subIdx, value) {
  if (examSubmitted) return;

  if (!userAnswers[qIndex]) {
    userAnswers[qIndex] = {};
  }

  userAnswers[qIndex][subIdx] = value;

  var subBtn = document.querySelector('#examSubQ-' + qIndex + '-' + subIdx);
  if (subBtn) {
    var trueBtn = subBtn.querySelector('.exam-toggle-true');
    var falseBtn = subBtn.querySelector('.exam-toggle-false');
    if (trueBtn) trueBtn.classList.toggle('active', value === true);
    if (falseBtn) falseBtn.classList.toggle('active', value === false);
  }

  var isAnswered = isQuestionFullyAnswered(qIndex);
  var meta = document.querySelector('.exam-q-meta');
  if (meta) {
    var badge = meta.querySelector('.exam-q-answered-badge');
    if (isAnswered) {
      if (!badge) {
        var newBadge = document.createElement('span');
        newBadge.className = 'exam-q-answered-badge';
        newBadge.textContent = '已答';
        meta.appendChild(newBadge);
      }
    } else if (badge) {
      badge.remove();
    }
  }

  if (isAnswered && subBtn) {
    subBtn.classList.remove('exam-answer-pulse');
    void subBtn.offsetWidth;
    subBtn.classList.add('exam-answer-pulse');
  }

  renderNavGrid();
  renderMobileNavGrid();
  renderModuleStats();
  updateTopbarProgress();
  autoSave();
}

function toggleMark() {
  if (examSubmitted) return;

  markedQuestions[currentIndex] = !markedQuestions[currentIndex];

  const markBtn = document.getElementById('examMarkBtn');
  if (markBtn) {
    if (markedQuestions[currentIndex]) {
      markBtn.classList.add('exam-mark-btn--active');
      markBtn.innerHTML = '[M] 已标记';
    } else {
      markBtn.classList.remove('exam-mark-btn--active');
      markBtn.innerHTML = '[ ] 标记疑问';
    }
  }

  renderNavGrid();
  renderMobileNavGrid();
  autoSave();
}

function updateTopbarProgress() {
  const totalAnswered = examQuestions.filter((_, i) => isQuestionFullyAnswered(i)).length;
  const progressEl = document.querySelector('.exam-topbar-progress');
  if (progressEl) {
    progressEl.textContent = `${totalAnswered} / ${EXAM_TOTAL} 已答`;
  }
}

function submitExam(isAuto) {
  // 触发每日打卡
  if (typeof recordDailyCheckIn === 'function') {
    recordDailyCheckIn();
  }
  // 触发考试成就
  if (typeof checkAchievement === 'function') {
    // 获取考试次数（从 localStorage）
    var examCount = parseInt(localStorage.getItem('bioquest_exam_count') || '0') + 1;
    localStorage.setItem('bioquest_exam_count', String(examCount));
    checkAchievement('exam', examCount);
  }

  stopTimer();
  examSubmitted = true;

  // 记录所有题目的难度统计
  if (typeof recordQuestionAnswer === 'function' && typeof QData !== 'undefined' && QData) {
    try {
      var qKeys = Object.keys(QData);
      for (var qi = 0; qi < qKeys.length; qi++) {
        var q = QData[qKeys[qi]];
        if (!q) continue;
        var userAns = userAnswers[parseInt(qKeys[qi])] || {};
        var isCorrect = (userAns[0] || -1) === q.answer;
        recordQuestionAnswer(q.id || qKeys[qi], isCorrect, q.difficulty || 3);

        // v4.0 苏格拉底同学触发：答错/答对上报（用于共情模式检测）
        if (typeof window.BioQuestClassmate === 'object' && window.BioQuestClassmate) {
          try {
            if (isCorrect) {
              if (typeof window.BioQuestClassmate.onCorrectAnswer === 'function') {
                window.BioQuestClassmate.onCorrectAnswer();
              }
            } else {
              if (typeof window.BioQuestClassmate.onWrongAnswer === 'function') {
                window.BioQuestClassmate.onWrongAnswer({
                  question: q.question || (q.subQuestions && q.subQuestions[0] && q.subQuestions[0].question) || '',
                  concept: q.subject || q.module || '',
                  subject: q.subject || q.module || '',
                  source: 'exam'
                });
              }
            }
          } catch (e) { /* 静默失败，不影响考试流程 */ }
        }
      }
    } catch (e) { /* 静默 */ }
  }

  clearExamState();

  const examInterface = document.querySelector('.exam-interface');
  if (!examInterface) return;

  const container = examInterface.parentElement || (typeof AppState !== 'undefined' && AppState.rootElement) || document.getElementById('page-content');
  if (!container) return;

  document.removeEventListener('keydown', handleExamKeydown);

  if (isAuto) {
    alert('考试时间已到，系统将自动交卷！');
  }

  renderResultPage(container);
}

function renderResultPage(target) {
  const score = getTotalScore();
  const percentage = Math.round((score / TOTAL_SCORE) * 100);

  const moduleScores = {};
  const moduleWrongs = {};
  for (let m = 1; m <= 4; m++) {
    moduleScores[m] = getModuleScore(m);
    moduleWrongs[m] = getModuleWrongQuestions(m);
  }

  let totalWrong = 0;
  const allWrongList = [];
  for (let m = 1; m <= 4; m++) {
    moduleWrongs[m].forEach((item) => {
      allWrongList.push({ ...item, moduleKey: m });
    });
    totalWrong += moduleWrongs[m].length;
  }

  const duration = Math.floor((Date.now() - examStartTime) / 1000);
  const durationStr = formatExamTime(duration);

  let gradeLabel = '';
  let gradeClass = '';
  if (percentage >= 90) { gradeLabel = '优秀'; gradeClass = 'exam-grade--excellent'; }
  else if (percentage >= 75) { gradeLabel = '良好'; gradeClass = 'exam-grade--good'; }
  else if (percentage >= 60) { gradeLabel = '合格'; gradeClass = 'exam-grade--pass'; }
  else { gradeLabel = '需努力'; gradeClass = 'exam-grade--fail'; }

  target.innerHTML = `
    <div class="exam-result animate-fade-in">
      <div class="exam-result-card">
        <div class="exam-result-header">
          <h2>考试成绩单</h2>
          <p>2025 年全国中学生生物学联赛 全真模拟</p>
        </div>

        <div class="exam-result-score">
          <div class="exam-score-circle ${gradeClass}">
            <div class="exam-score-value">${score}</div>
            <div class="exam-score-total">/ ${TOTAL_SCORE}</div>
          </div>
          <div class="exam-score-meta">
            <div class="exam-score-percent">${percentage}%</div>
            <div class="exam-score-grade ${gradeClass}">${gradeLabel}</div>
            <div class="exam-score-time">用时: ${durationStr}</div>
          </div>
        </div>

        <div class="exam-result-modules">
          <h3>各模块得分明细</h3>
          <div class="exam-modules-score-grid">
            ${[1, 2, 3, 4].map((m) => {
              const mod = MODULE_GROUPS[m];
              const modScore = moduleScores[m];
              const modPercent = Math.round((modScore / 36) * 100);
              return `
                <div class="exam-module-score-card">
                  <div class="exam-module-score-name">${mod.name}</div>
                  <div class="exam-module-score-desc">${mod.desc}</div>
                  <div class="exam-module-score-num">${modScore} <span>/ 36</span></div>
                  <div class="exam-module-score-bar">
                    <div class="exam-module-score-fill" style="width:${modPercent}%"></div>
                  </div>
                  <div class="exam-module-score-pct">${modPercent}%</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="exam-result-detail">
          <h3>答题正确率统计</h3>
          <div class="exam-detail-grid">
            ${examQuestions.map((q, i) => {
              const result = calcQuestionScore(i);
              const correctSubs = result.correct;
              const allCorrect = correctSubs === 4;
              const noneCorrect = correctSubs === 0 && isQuestionFullyAnswered(i);
              const unanswered = !isQuestionFullyAnswered(i);

              let cls = 'exam-detail-item';
              let status = '';
              if (unanswered) { cls += ' exam-detail-item--unanswered'; status = '未答'; }
              else if (allCorrect) { cls += ' exam-detail-item--correct'; status = 'V'; }
              else if (noneCorrect) { cls += ' exam-detail-item--wrong'; status = 'X'; }
              else { cls += ' exam-detail-item--partial'; status = '△'; }

              return `<div class="${cls}" title="第${i + 1}题: ${status} (${correctSubs}/4)">
                <span class="exam-detail-num">${i + 1}</span>
                <span class="exam-detail-status">${status}</span>
              </div>`;
            }).join('')}
          </div>
        </div>

        ${totalWrong > 0 ? `
        <div class="exam-result-wrong">
          <h3>错题列表 (${totalWrong} 题)</h3>
          <div class="exam-wrong-list">
            ${allWrongList.map((item) => {
              const mod = MODULE_GROUPS[item.moduleKey];
              const q = item.question;
              const result = calcQuestionScore(item.index);
              return `
                <div class="exam-wrong-item">
                  <div class="exam-wrong-num">第 ${item.index + 1} 题 · ${mod.name}</div>
                  <div class="exam-wrong-stem">${q.question}</div>
                  ${(typeof window !== 'undefined' && window.BioQuestFigure) ? window.BioQuestFigure.render(q, { alt: '题目配图' }) : ''}
                  <div class="exam-wrong-score">${result.correct}/4 正确 (${result.score.toFixed(1)}分)</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        ` : `
        <div class="exam-result-perfect">
          <div class="exam-perfect-icon">!</div>
          <h3>全部正确</h3>
          <p>72 道题全部答对，满分。</p>
        </div>
        `}

        <div class="exam-result-actions">
          <button class="btn btn-primary" id="examReviewBtn">查看每道题解析</button>
          <button class="btn btn-success" id="examSaveRecordBtn">保存成绩到学习记录</button>
          <button class="btn btn-secondary" id="examRetryBtn">重新考试</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('examRetryBtn').addEventListener('click', () => {
    const saveBtn = document.getElementById('examSaveRecordBtn');
    if (saveBtn && !saveBtn.disabled) saveBtn.click();
    examSubmitted = false;
    examStarted = false;
    clearExamState();
    userAnswers = {};
    markedQuestions = {};
    currentIndex = 0;
    timeRemaining = TOTAL_TIME;
    loadQuizData().then(() => {
      renderExamStartPage(target);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.getElementById('examReviewBtn').addEventListener('click', () => {
    renderReviewMode(target);
    target.scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('examSaveRecordBtn').addEventListener('click', () => {
    saveExamRecord(score, duration);
    document.getElementById('examSaveRecordBtn').textContent = 'V 已保存';
    document.getElementById('examSaveRecordBtn').disabled = true;
  });

  document.querySelectorAll('.exam-detail-item').forEach((item) => {
    item.addEventListener('click', () => {
      const numText = item.querySelector('.exam-detail-num').textContent;
      const idx = parseInt(numText) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < EXAM_TOTAL) {
        scrollToReviewQuestion(idx, target);
      }
    });
  });

  // 满分成就检查
  if (score >= TOTAL_SCORE && typeof checkAchievement === 'function') {
    checkAchievement('exam_perfect', 1);
  }
}

function renderReviewMode(target) {
  let html = '<div class="exam-review">';

  examQuestions.forEach((q, qIndex) => {
    const moduleKey = getExamModuleKey(qIndex);
    const mod = getModuleGroup(moduleKey);
    const isMarked = !!markedQuestions[qIndex];
    const userAns = userAnswers[qIndex] || {};

    const correctSubs = calcQuestionScore(qIndex).correct;
    const isFullyCorrect = correctSubs === 4;
    const isUnanswered = !isQuestionFullyAnswered(qIndex);

    let scoreTag;
    if (isUnanswered) {
      scoreTag = '<span class="exam-review-q-tag exam-review-q-tag--unanswered">未答</span>';
    } else if (isFullyCorrect) {
      scoreTag = '<span class="exam-review-q-tag exam-review-q-tag--correct">正确</span>';
    } else {
      scoreTag = '<span class="exam-review-q-tag exam-review-q-tag--wrong">' + correctSubs + '/4</span>';
    }
    const markTag = isMarked ? '<span class="exam-review-q-tag exam-review-q-tag--marked">已标记</span>' : '';

    html += `
      <div class="exam-review-q" id="reviewQ-${qIndex}">
        <div class="exam-review-q-header">
          <span class="exam-review-q-num">第 ${qIndex + 1} 题</span>
          <span class="exam-review-q-module">${mod.name}</span>
          ${scoreTag}
          ${markTag}
        </div>
        <div class="exam-review-q-stem">${q.question.replace(/\n/g, '<br>')}</div>
        ${(typeof window !== 'undefined' && window.BioQuestFigure) ? window.BioQuestFigure.render(q, { alt: '题目配图' }) : renderChart(q.chart)}
        <div class="exam-review-subs">
    `;

    (q.subQuestions || []).forEach((sub, subIdx) => {
      const userChoice = userAns[subIdx];
      const correct = sub.answer;
      const isCorrect = userChoice === correct;
      const notAnswered = userChoice === undefined || userChoice === null;

      html += `
        <div class="exam-review-sub ${notAnswered ? 'exam-review-sub--unanswered' : (isCorrect ? 'exam-review-sub--correct' : 'exam-review-sub--wrong')}">
          <div class="exam-review-sub-label">${sub.label}</div>
          <div class="exam-review-sub-text">${sub.text}</div>
          <div class="exam-review-sub-result">
            <span>你的答案: <strong>${notAnswered ? '未答' : (userChoice ? '正确' : '错误')}</strong></span>
            <span>正确答案: <strong>${correct ? '正确' : '错误'}</strong></span>
            ${isCorrect && !notAnswered ? '<span class="exam-review-sub-icon exam-review-sub-icon--ok">V</span>' :
              (!notAnswered ? '<span class="exam-review-sub-icon exam-review-sub-icon--no">X</span>' : '')}
          </div>
        </div>
      `;
    });

    html += `
        </div>
        ${q.explanation ? `<div class="exam-review-q-exp">${renderExplanationWithImages(q.explanation)}</div>` : ''}
      </div>
    `;
  });

  html += '</div>';

  const resultCard = document.querySelector('.exam-result-card');
  if (resultCard) {
    const existingReview = resultCard.querySelector('.exam-review');
    if (existingReview) existingReview.remove();
    resultCard.insertAdjacentHTML('beforeend', html);
  } else {
    target.insertAdjacentHTML('beforeend', html);
  }
}

function scrollToReviewQuestion(qIndex, target) {
  const review = document.querySelector('.exam-review');
  if (!review) return;

  const existingReview = document.getElementById(`reviewQ-${qIndex}`);
  if (!existingReview) {
    renderReviewMode(target);
    setTimeout(() => {
      const el = document.getElementById(`reviewQ-${qIndex}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return;
  }

  existingReview.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function saveExamRecord(score, duration) {
  const totalSubPerQuestion = 4;
  const perQuestionTotal = TOTAL_SCORE / EXAM_TOTAL; // 2 分/题
  const hasSession = typeof window !== 'undefined' &&
    window.BioQuestSession && typeof window.BioQuestSession.question === 'function';

  // 统一落盘入口（js/core/record-session.js）：逐题 question —— 模块统计
  // （module_1..4，与排行榜/考试成绩同构）+ 难度自适应 + 错题本（云端复习卡）。
  // 考试不给信用点（MODULE_POINTS 无 exam 配置），故 points:false 明确关闭。
  if (hasSession) {
    examQuestions.forEach((q, i) => {
      const r = calcQuestionScore(i);
      const qBio = (q && (q.id || q.bioId)) || '';
      // recordWrongAnswer 需要 id/question_id：分片未注入 id 时用稳定 bioID 兜底
      const qRef = (qBio && !q.id) ? Object.assign({}, q, { id: qBio }) : q;
      window.BioQuestSession.question({
        module: 'exam',
        q: qRef,
        correct: r.correct === totalSubPerQuestion,
        moduleKey: 'module_' + getExamModuleKey(i),
        points: false
      });
    });
  }

  // 本地错题本（子题级，错题列表页按 bioId#sub 引用，保持历史行为）
  for (let i = 0; i < examQuestions.length; i++) {
    for (let j = 0; j < 4; j++) {
      if (!isSubQuestionCorrect(i, j)) {
        const moduleKey = getExamModuleKey(i);
        if (typeof addWrongQuestion === 'function') {
          // Issue #10：优先用题目稳定 bioID 引用（旧 hash 合成 ID 不可稳定映射回题库）
          const examQ = examQuestions[i];
          const qBio = (examQ && (examQ.id || examQ.bioId)) || '';
          const wId = qBio
            ? String(qBio) + '#sub' + (j + 1)
            : String(hashQuestionId('exam_' + i + '_sub' + j));
          addWrongQuestion(wId, `module_${moduleKey}`, examQ?.subQuestions?.[j]?.text || examQ?.question || '');
        }
      }
    }
  }

  // 收尾落盘：练习记录 saveRecord + bio 分六维重算与云端同步。
  // 模块统计/错题/难度已由上面的 question() 逐题写入，stats:false 防双计。
  if (hasSession && typeof window.BioQuestSession.finish === 'function') {
    window.BioQuestSession.finish({
      module: 'exam',
      duration,
      questions: examQuestions.map((q, i) => {
        const r = calcQuestionScore(i);
        // Issue #10：用稳定 bioID 引用题目（q.id/bioId 由分片加载注入）
        const qBio = (q && (q.id || q.bioId)) || '';
        return {
          q,
          questionId: qBio || `exam_${i}`,
          question: q.question,
          subject: q.subject,
          userAnswers: userAnswers[i] || {},
          // 分值口径：72 题 × 2 分 = 144，逐题分由 gradeQuestion 阶梯给出
          score: r.score,
          totalScore: perQuestionTotal,
          correctSubs: r.correct,
          totalSubs: totalSubPerQuestion,
          moduleKey: 'module_' + getExamModuleKey(i),
          // 统一口径：全对才算对（与 practice 纪录一致）
          correct: r.correct === totalSubPerQuestion
        };
      }),
      stats: false,
      checkin: false
    });
  }
}

function initExam(target) {
  try {
    injectExamStyles();

    if (!target) {
      if (typeof AppState !== 'undefined' && AppState.rootElement) {
        target = AppState.rootElement;
      } else {
        target = document.getElementById('page-content');
      }
    }

    if (!target) {
      console.error('[TATABOX Exam] initExam 找不到目标容器');
      return;
    }

    if (examStarted && !examSubmitted) {
      timeRemaining = Math.max(0, TOTAL_TIME - Math.floor((Date.now() - examStartTime) / 1000));
      renderExamInterface(target);
      startTimer();
      return;
    }

    if (examSubmitted) {
      renderResultPage(target);
      return;
    }

    const restored = restoreExamState();
    if (restored && examStarted && !examSubmitted) {
      if (timeRemaining > 0) {
        const confirmRestore = confirm(
          `检测到未完成的考试记录。\n\n剩余时间: ${formatExamTime(timeRemaining)}\n已完成: ${examQuestions.filter((_, i) => isQuestionFullyAnswered(i)).length} / ${EXAM_TOTAL} 题\n\n是否继续上次的考试？`
        );
        if (confirmRestore) {
          renderExamInterface(target);
          startTimer();
          return;
        }
      }
      clearExamState();
      examStarted = false;
      examSubmitted = false;
      userAnswers = {};
      markedQuestions = {};
      currentIndex = 0;
      timeRemaining = TOTAL_TIME;
    }

    loadQuizData().then(function(ok) {
      if (ok) {
        renderExamStartPage(target);
      } else {
        // loadQuizData 已在目标容器内渲染错误提示，无需额外操作
        console.warn('[TATABOX Exam] 题库加载失败，已显示错误提示');
      }
    }).catch(function(err) {
      console.error('[TATABOX Exam] loadQuizData 异常:', err);
      target.innerHTML = '<div class="bq-empty-block">' +
        '<p class="bq-error-title">考试模块加载失败</p>' +
        '<p class="bq-note">' + escapeHtml(err && err.message ? err.message : '请刷新页面重试') + '</p>' +
        '<button data-on=\'["_cspReload"]\' style="padding:8px 20px;background:var(--color-sage);color:#fff;border:none;border-radius:8px;cursor:pointer;">刷新页面</button>' +
        '</div>';
    });
  } catch (err) {
    console.error('[TATABOX Exam] initExam 异常:', err);
    if (target) {
      target.innerHTML = '<div class="bq-empty-block">' +
        '<p class="bq-error-title">考试模块初始化失败</p>' +
        '<p class="bq-note">请刷新页面或稍后重试</p>' +
        '<button data-on=\'["_cspReload"]\' style="padding:8px 20px;background:var(--color-sage);color:#fff;border:none;border-radius:8px;cursor:pointer;">刷新页面</button>' +
        '</div>';
    }
  }
}

// 挂载到 window 对象，供 app.js 调用
window.initExam = initExam;
