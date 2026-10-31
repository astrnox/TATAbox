/**
 * TATABOX — 捐赠弹窗（M-01 自 app.js 拆分）
 * ------------------------------------------------------------
 * 由 index.html 在 app.js 之后以 defer 加载；window.openDonation 保持原入口。
 * 该弹窗本身采用固定深色视觉（与主题无关），焦点陷阱依赖可选 A11y 模块。
 * ============================================================
 */
'use strict';

var _donationFocusTrap = null;

function openDonation() {
  const styleId = 'bioquest-donation-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .donation-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(5, 10, 7, 0.88);
        animation: donationFadeIn 0.25s ease;
      }

      .donation-overlay.closing {
        animation: donationFadeOut 0.2s ease forwards;
      }

      @keyframes donationFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes donationFadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }

      .donation-modal {
        position: relative;
        width: 90vw;
        max-width: 400px;
        max-height: 90vh;
        overflow-y: auto;
        background: #111613;
        border: 1px solid rgba(58, 140, 92, 0.2);
        border-radius: var(--radius-lg, 12px);
        padding: 36px 32px 28px;
        box-shadow: var(--shadow-floating)
                    0 20px 48px rgba(26, 42, 24, 0.25);
        animation: donationSlideUp 0.3s ease;
      }

      @keyframes donationSlideUp {
        from { opacity: 0; transform: translateY(24px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .donation-close {
        position: absolute;
        top: 12px;
        right: 14px;
        width: 32px;
        height: 32px;
        border: none;
        background: rgba(255, 255, 255, 0.1);
        cursor: pointer;
        color: #e8e6e2;
        font-size: 1.4rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        line-height: 1;
      }
      .donation-close:hover {
        background: rgba(232, 168, 48, 0.2);
        color: #f5d491;
      }

      .donation-title {
        font-family: var(--font-serif, 'Noto Serif SC', serif);
        font-size: 1.45rem;
        font-weight: 700;
        color: #f5d491;
        text-align: center;
        margin-bottom: 16px;
        text-shadow: 0 0 12px rgba(232, 168, 48, 0.35);
      }

      .donation-desc {
        font-size: 0.95rem;
        color: #e8e6e2;
        text-align: center;
        line-height: 1.7;
        margin-bottom: 28px;
      }

      .donation-qr-area {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(232, 168, 48, 0.08);
        border: 1px solid rgba(232, 168, 48, 0.25);
        border-radius: var(--radius-md, 8px);
        margin-bottom: 20px;
      }

      .donation-link-btn {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 14px 28px;
        border-radius: var(--radius-md, 8px);
        background: #e8a830;
        color: #1a2f1d;
        font-weight: 700;
        font-size: 1rem;
        text-decoration: none;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        box-shadow: var(--shadow-lg);
      }
      .donation-link-btn:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg);
      }
      .donation-link-btn svg {
        width: 22px;
        height: 22px;
        stroke-width: 2.5;
      }

      .donation-thanks {
        text-align: center;
        font-size: 0.95rem;
        font-weight: 600;
        color: #e8a830;
        text-shadow: 0 0 8px rgba(232, 168, 48, 0.35);
      }

      [data-theme="dark"] .donation-overlay {
        background: rgba(0, 0, 0, 0.75);
      }

      [data-theme="light"] .donation-modal {
        background: #1a2a1e;
      }
      [data-theme="light"] .donation-desc {
        color: #f0eee9;
      }
      [data-theme="light"] .donation-title {
        color: #f5d491;
      }

      @media (max-width: 480px) {
        .donation-modal {
          padding: 24px 20px 20px;
        }
        .donation-title {
          font-size: 1.25rem;
        }
        .donation-qr-img {
          width: 160px;
          height: 160px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement('div');
  overlay.className = 'donation-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '赞赏支持');

  overlay.innerHTML = `
    <div class="donation-modal">
      <button class="donation-close" aria-label="关闭">&times;</button>
      <div class="donation-title">赞赏支持</div>
      <div class="donation-desc">TATABOX 是开源免费的高中生物学习平台。如果您觉得这个项目有帮助，欢迎通过爱发电支持我们持续维护和更新。</div>
      <div class="donation-qr-area">
        <a href="https://ifdian.net/a/astrnox" target="_blank" rel="noopener noreferrer" class="donation-link-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          在爱发电支持我们
        </a>
      </div>
      <div class="donation-thanks">感谢您的支持！</div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const closeDonation = () => {
    if (_donationFocusTrap) { _donationFocusTrap.release(); _donationFocusTrap = null; }
    overlay.classList.add('closing');
    overlay.addEventListener('animationend', () => {
      overlay.remove();
      document.body.style.overflow = '';
    }, { once: true });
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDonation();
  });

  overlay.querySelector('.donation-close').addEventListener('click', closeDonation);

  if (window.BioQuestA11y && typeof window.BioQuestA11y.trapFocus === 'function') {
    _donationFocusTrap = window.BioQuestA11y.trapFocus(overlay, {
      onEscape: closeDonation,
      initialFocus: overlay.querySelector('.donation-close')
    });
  }
}

window.openDonation = openDonation;

// 注册到全站唯一命名空间（window.BioQuest，Q-03 约定；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.app = BQ.app || {};
  BQ.app.donation = { openDonation: openDonation };
})();

