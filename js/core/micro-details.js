/**
 * ============================================================
 * TATABOX — PRD §5 微细节补全模块
 * 包含：图片懒加载、复制题目为Markdown、DELETE确认删除、字体大小
 * ============================================================
 */

// PRD §5-47：图片懒加载（IntersectionObserver）
var ImageLazyLoader = (function () {
  'use strict';
  var observer = null;
  var queue = [];

  function init() {
    if (observer) return;
    if (typeof IntersectionObserver === 'undefined') {
      // 降级：直接加载所有图片
      queue.forEach(function (img) {
        if (img.dataset.src) img.src = img.dataset.src;
      });
      queue = [];
      return;
    }
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '200px 0px' });
    // 处理队列
    queue.forEach(function (img) { observer.observe(img); });
    queue = [];
  }

  function observe(img) {
    if (!img) return;
    if (observer) {
      observer.observe(img);
    } else {
      queue.push(img);
    }
  }

  /** 扫描容器内所有带 data-src 的图片 */
  function scanContainer(container) {
    if (!container) return;
    var imgs = container.querySelectorAll('img[data-src]');
    Array.prototype.forEach.call(imgs, function (img) { observe(img); });
  }

  // 延迟初始化（不阻塞首屏）
  if (document.readyState === 'complete') {
    setTimeout(init, 100);
  } else {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 100); });
  }

  return { observe: observe, scanContainer: scanContainer };
})();

// PRD §5-27：复制题目为 Markdown
function copyQuestionAsMarkdown(questionEl) {
  if (!questionEl) return;
  try {
    var stem = questionEl.querySelector('.question-stem, .quiz-stem, [class*="stem"]');
    var options = questionEl.querySelectorAll('.option-item, .quiz-option, [class*="option"]');
    var explanation = questionEl.querySelector('.explanation, .quiz-explanation, [class*="explanation"]');

    var md = '## 题目\n\n';
    md += (stem ? stem.textContent.trim() : '') + '\n\n';
    if (options.length > 0) {
      options.forEach(function (opt) {
        var key = opt.querySelector('.option-key, .quiz-opt-key') || opt.querySelector('[class*="key"]');
        md += '- ' + (key ? key.textContent.trim() + '. ' : '') + opt.textContent.trim() + '\n';
      });
      md += '\n';
    }
    if (explanation) {
      md += '## 解析\n\n' + explanation.textContent.trim() + '\n';
    }
    md += '\n---\n> 来自 TATABOX';

    navigator.clipboard.writeText(md).then(function () {
      showToast('已复制为 Markdown', 'success', 2000);
    }).catch(function () {
      // 降级：选中文本
      var ta = document.createElement('textarea');
      ta.value = md;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('已复制为 Markdown', 'success', 2000);
    });
  } catch (e) {
    console.warn('[TATABOX] 复制失败:', e);
  }
}

// PRD §5-18：输入 DELETE 确认删除
function confirmDeleteWithTyping(message, callback) {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';

  var panel = document.createElement('div');
  panel.style.cssText = 'background:#fff;border-radius:16px;padding:28px 24px;max-width:400px;width:90%;box-shadow:var(--shadow-floating);font-family:system-ui,sans-serif;';

  panel.innerHTML =
    '<h3 style="font-size:1.1rem;font-weight:700;margin-bottom:8px;color:#1a1a1a;">确认删除</h3>' +
    '<p style="font-size:0.9rem;color:#666;margin-bottom:16px;line-height:1.5;">' + (message || '此操作不可撤销。请输入 <strong>DELETE</strong> 确认删除：') + '</p>' +
    '<input id="delete-confirm-input" type="text" placeholder="输入 DELETE 确认" style="width:100%;padding:10px 12px;border:2px solid #ddd;border-radius:8px;font-size:1rem;outline:none;box-sizing:border-box;font-family:monospace;" autocomplete="off">' +
    '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">' +
    '  <button id="delete-confirm-cancel" style="padding:8px 20px;border-radius:8px;border:1px solid #ddd;background:#fff;color:#666;cursor:pointer;font-size:0.9rem;">取消</button>' +
    '  <button id="delete-confirm-execute" style="padding:8px 20px;border-radius:8px;border:none;background:#c0392b;color:#fff;cursor:pointer;font-size:0.9rem;opacity:0.5;" disabled>确认删除</button>' +
    '</div>';

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  var input = panel.querySelector('#delete-confirm-input');
  var execBtn = panel.querySelector('#delete-confirm-execute');
  var cancelBtn = panel.querySelector('#delete-confirm-cancel');

  input.addEventListener('input', function () {
    var isMatch = input.value.trim() === 'DELETE';
    execBtn.disabled = !isMatch;
    execBtn.style.opacity = isMatch ? '1' : '0.5';
    if (isMatch) {
      input.style.borderColor = '#c0392b';
    } else {
      input.style.borderColor = input.value ? '#e74c3c' : '#ddd';
    }
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !execBtn.disabled) {
      execBtn.click();
    } else if (e.key === 'Escape') {
      cancelBtn.click();
    }
  });

  cancelBtn.addEventListener('click', function () {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  });

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
  });

  execBtn.addEventListener('click', function () {
    if (execBtn.disabled) return;
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (typeof callback === 'function') callback();
  });

  // 聚焦输入框
  setTimeout(function () { input.focus(); }, 100);
}

// PRD §5-35：字体大小选项
var FontSizeManager = (function () {
  'use strict';
  var KEY = 'tatabox_font_size';
  var SIZES = { standard: '100%', large: '112%', xlarge: '125%' };

  function apply(size) {
    var pct = SIZES[size] || SIZES.standard;
    document.documentElement.style.setProperty('--font-scale', pct);
    document.documentElement.style.fontSize = pct;
    try { localStorage.setItem(KEY, size); } catch (e) {}
  }

  function getCurrent() {
    try { return localStorage.getItem(KEY) || 'standard'; } catch (e) { return 'standard'; }
  }

  function getOptions() {
    return [
      { value: 'standard', label: '标准' },
      { value: 'large', label: '大字' },
      { value: 'xlarge', label: '特大' }
    ];
  }

  // 初始化
  var saved = getCurrent();
  if (saved !== 'standard') apply(saved);

  return { apply: apply, getCurrent: getCurrent, getOptions: getOptions };
})();

// 暴露全局
window.copyQuestionAsMarkdown = copyQuestionAsMarkdown;
window.confirmDeleteWithTyping = confirmDeleteWithTyping;
window.ImageLazyLoader = ImageLazyLoader;
window.FontSizeManager = FontSizeManager;