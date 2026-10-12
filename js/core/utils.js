/**
 * ============================================================
 * TATABOX — 工具函数集合
 * 提供常用的通用工具函数
 * ============================================================
 */

'use strict';

/**
 * TATABOX 全局命名空间（Q-03 保守实施）
 * 作为全站公共工具与常量的规范挂载点。新代码应优先使用 BioQuest.* 路径；
 * 旧的 window.* 平铺别名保留以向后兼容，避免一次性迁移 40+ 全局导致回归。
 * 已注册：escapeHtml、loadScriptOnce（均提供 window.* 别名）
 */
var TATABOX = (typeof window !== 'undefined' ? window.BioQuest : null) || {};
if (typeof window !== 'undefined') { window.BioQuest = TATABOX; }

/**
 * ═══ 全站图标系统（P0 设计整改）═══
 * 统一替代散落在各页面的 emoji（奖杯 / 奖牌 / 对勾 / 警告等）。
 * 约定：
 *   - 线性风格：24 viewBox / stroke 1.8 / currentColor（随文字颜色）；
 *   - 默认 16px，用外层类覆盖尺寸（如 .bq-result-icon svg 为 32px）；
 *   - 颜色只用 color 控制，不要在图标上写 fill。
 * 用法：el.innerHTML = BQ_ICONS.check + ' 已完成'
 */
var BQ_ICONS = (function () {
  function svg(inner, size) {
    var s = size || 16;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      inner + '</svg>';
  }
  return {
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    checkCircle: svg('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>'),
    alert: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/>'),
    trophy: svg('<path d="M8 4h8v6a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5.5a2.5 2.5 0 0 0 3 4"/><path d="M16 6h2.5a2.5 2.5 0 0 1-3 4"/><path d="M12 14v4"/><path d="M8.5 21h7"/>'),
    flag: svg('<path d="M5 21V4"/><path d="M5 4h11l-1.5 3.5L16 11H5"/>'),
    /* 大尺寸场景（成功页/空态）用带圈图标 */
    checkCircleLarge: svg('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>', 32)
  };
})();
TATABOX.icons = BQ_ICONS;
if (typeof window !== 'undefined') { window.BQ_ICONS = BQ_ICONS; }

/**
 * Fisher-Yates 洗牌算法
 * 原地随机打乱数组顺序
 * @template T
 * @param {T[]} array - 需要打乱的数组
 * @returns {T[]} 原数组引用（已原地打乱）
 */
function shuffle(array) {
  if (!Array.isArray(array)) {
    console.warn('[TATABOX Utils] shuffle 需要数组参数');
    return array;
  }

  const arr = array;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 格式化秒数为 HH:MM:SS 格式
 * @param {number} seconds - 总秒数
 * @param {Object} [options] - 格式化选项
 * @param {boolean} [options.showHours=true] - 是否始终显示小时
 * @param {boolean} [options.padHours=false] - 是否补零小时
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(seconds, options = {}) {
  const { showHours = true, padHours = false } = options;

  if (typeof seconds !== 'number' || seconds < 0 || !isFinite(seconds)) {
    return showHours ? '00:00:00' : '00:00';
  }

  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  if (showHours || hrs > 0) {
    const hoursStr = padHours || hrs > 0 ? pad(hrs) : String(hrs);
    return `${hoursStr}:${pad(mins)}:${pad(secs)}`;
  }

  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * 防抖函数
 * 在连续调用时只执行最后一次，适用于搜索输入、窗口调整等场景
 * @param {Function} fn - 需要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(fn, delay) {
  if (typeof fn !== 'function') {
    throw new TypeError('[TATABOX Utils] debounce 需要函数作为第一个参数');
  }

  let timer = null;

  function debounced(...args) {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, delay);
  }

  debounced.cancel = function () {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

/**
 * 节流函数
 * 在指定时间间隔内只执行一次，适用于滚动、鼠标移动等高频事件
 * @param {Function} fn - 需要节流的函数
 * @param {number} delay - 节流间隔（毫秒）
 * @returns {Function} 节流后的函数
 */
function throttle(fn, delay) {
  if (typeof fn !== 'function') {
    throw new TypeError('[TATABOX Utils] throttle 需要函数作为第一个参数');
  }

  let lastTime = 0;
  let timer = null;

  function throttled(...args) {
    const now = Date.now();
    const remaining = delay - (now - lastTime);

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      lastTime = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastTime = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remaining);
    }
  }

  throttled.cancel = function () {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    lastTime = 0;
  };

  return throttled;
}

/**
 * 生成唯一标识符
 * 使用时间戳 + 随机数组合生成
 * @param {Object} [options] - 生成选项
 * @param {string} [options.prefix=''] - ID 前缀
 * @param {number} [options.length=10] - 随机部分的长度
 * @returns {string} 生成的唯一ID
 */
function generateId(options = {}) {
  const { prefix = '', length = 10 } = options;

  const timestamp = Date.now().toString(36);
  const randomPart = Math.random()
    .toString(36)
    .slice(2, 2 + length);

  return `${prefix}${timestamp}_${randomPart}`;
}

/**
 * 防 XSS 攻击 — HTML 转义
 * 将特殊字符转换为 HTML 实体
 * @param {string} str - 需要转义的字符串
 * @returns {string} 转义后的安全字符串
 */
function escapeHtml(str) {
  if (typeof str !== 'string') {
    return String(str ?? '');
  }

  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };

  return str.replace(/[&<>"'/`=]/g, (char) => entityMap[char]);
}

/**
 * 统一错误文本提取 —— 全站错误兜底的唯一入口。
 * 收敛此前散落各处的 `xxx.message || '未知错误'` 复制粘贴样板。
 * @param {*} err - Error / { message } / { error } / 字符串 / 空值
 * @param {string} [fallback] - 提取不到有效文本时的兜底文案，默认「未知错误」
 * @returns {string}
 */
function errText(err, fallback) {
  var fb = fallback || '未知错误';
  if (err == null) return fb;
  if (typeof err === 'string') return err || fb;
  if (typeof err.message === 'string' && err.message) return err.message;
  if (typeof err.error === 'string' && err.error) return err.error;
  return fb;
}

/**
 * toast 动效样式（一次性注入）。showToast / showUndoToast 共用。
 */
function ensureToastStyle() {
  if (typeof document === 'undefined' || !document.getElementById) return;
  if (document.getElementById('toast-style')) return;
  var style = document.createElement('style');
  style.id = 'toast-style';
  style.textContent = '@keyframes toastSlideUp{from{transform:translateX(-50%) translateY(20px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}@keyframes toastSlideDown{from{transform:translateX(-50%) translateY(0);opacity:1}to{transform:translateX(-50%) translateY(20px);opacity:0}}';
  document.head.appendChild(style);
}

/**
 * 显示 Toast 通知（全站唯一实现，Q-01 统一；原先散在 app.js 导致无 app.js 页面静默丢提示）
 * P1-12（Issue #121）增强：
 *   - 第二参数兼容两种形态：'error'|'success'|'info'（类型化样式）或数字（毫秒时长）；
 *   - 增加 role="alert" + aria-live，读屏用户可感知错误/状态提示。
 * @param {string} message 提示文本
 * @param {string|number} [typeOrDuration] 'error'|'success'|'info' 或毫秒数
 * @param {number} [duration] 显示时长（毫秒），默认 success/info 3000、error 4500
 */
function showToast(message, typeOrDuration, duration) {
  var type = 'info';
  if (typeOrDuration === 'error' || typeOrDuration === 'success' || typeOrDuration === 'info') {
    type = typeOrDuration;
  } else if (typeof typeOrDuration === 'number' && typeOrDuration > 0) {
    duration = typeOrDuration; // 旧签名 showToast(msg, ms) 兼容
  }
  if (!(typeof duration === 'number' && duration > 0)) {
    duration = type === 'error' ? 4500 : 3000;
  }

  var existing = document.getElementById('bioquest-toast');
  if (existing) existing.remove();

  var typeBg = type === 'error' ? 'rgba(160,58,44,0.96)' : type === 'success' ? 'rgba(38,92,58,0.96)' : 'rgba(26,58,42,0.95)';
  var typeBorder = type === 'error' ? 'rgba(200,90,70,0.5)' : type === 'success' ? 'rgba(90,180,120,0.5)' : 'rgba(58,140,92,0.3)';

  var toast = document.createElement('div');
  toast.id = 'bioquest-toast';
  // P1-12：错误用 assertive（立即播报），其余 polite
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  toast.style.cssText = [
    'position:fixed',
    'bottom:80px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:99999',
    'background:' + typeBg,
    'color:#fff',
    'padding:12px 24px',
    'border-radius:16px',
    'font-size:0.9rem',
    'font-weight:500',
    'box-shadow:var(--shadow-lg)',
    'border:1px solid ' + typeBorder,
    'animation:toastSlideUp 0.3s ease',
    'max-width:90vw',
    'text-align:center',
    'pointer-events:none'
  ].join(';');
  toast.textContent = message;
  document.body.appendChild(toast);
  ensureToastStyle();

  setTimeout(function() {
    toast.style.animation = 'toastSlideDown 0.3s ease forwards';
    setTimeout(function() {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, duration);
}

// 显式暴露，作为全站共享工具的规范挂载点（Q-01/Q-03 统一）。
// 浏览器走 window，Node 测试环境走 globalThis（历史浏览器无 globalThis 时自动跳过）。
var _toolRoot = (typeof window !== 'undefined') ? window
  : ((typeof globalThis !== 'undefined') ? globalThis : null);
if (_toolRoot) {
  _toolRoot.escapeHtml = escapeHtml;
  _toolRoot.errText = errText;
  _toolRoot.showToast = showToast;
  _toolRoot.ensureToastStyle = ensureToastStyle;
  if (_toolRoot.BioQuest) {
    _toolRoot.BioQuest.escapeHtml = escapeHtml;
    _toolRoot.BioQuest.errText = errText;
    _toolRoot.BioQuest.showToast = showToast;
  }
}

/**
 * 解析文本渲染：安全转义 + 「批注图解析」嵌入 + 换行保留。
 *
 * 约定：解析文本中以独立行书写
 *   @@ANNOTATED_IMAGE:assets/questions/<dir>/<file>-annotated.jpg
 * 渲染端会将其替换为带边框的批注图（<figure><img><figcaption>）。
 * 仅接受仓库内相对路径（assets/ 开头、图片扩展名），其余输入保持原样转义输出，防注入。
 *
 * @param {string} text - 题目解析原始文本
 * @returns {string}     转义且安全的 HTML
 */
function renderExplanationWithImages(text) {
  const raw = String(text == null ? '' : text);
  // 1) 先取出白名单路径并暂存（避免 escapeHtml 转义 '/' 破坏标记）
  const stashed = [];
  const pre = raw.replace(/@@ANNOTATED_IMAGE:([A-Za-z0-9_\-./]+)/g, function (m, p) {
    if (!/^assets\/[A-Za-z0-9_\-./]+\.(jpe?g|png|gif|webp)$/.test(p)) {
      return m; // 非白名单路径不展开
    }
    stashed.push(p);
    return '\u0000IMG' + (stashed.length - 1) + '\u0000';
  });
  // 2) 转义（其余文本全部按普通解析文本处理）
  let s = escapeHtml(pre);
  // 3) 回填图注解析图
  s = s.replace(/\u0000IMG(\d+)\u0000/g, function (m, i) {
    const p = stashed[Number(i)];
    if (!p) return m;
    return '<figure class="exp-figure">' +
      '<img class="exp-annotated" src="' + p + '" alt="带批注的期刊原图解析" loading="lazy" data-bq-zoom="1">' +
      '<figcaption>图注解析：图中彩色框与引线为本题解析批注，对应题干/选项中的关键结构与因果链</figcaption>' +
      '</figure>';
  });
  s = s.replace(/\n/g, '<br>');
  return s;
}
if (typeof window !== 'undefined') {
  window.renderExplanationWithImages = renderExplanationWithImages;
  TATABOX.renderExplanationWithImages = renderExplanationWithImages;
}

/**
 * 敏感凭据脱敏（JWT / 长 Base64 签名 / AWS 密钥 / 私钥头 / Supabase service_role JWT）
 * 只打码，不删除原文 —— 便于用户在控制台/聊天里确认"自己刚才贴了密钥"，
 * 同时防止不小心被 BioQuestMarkdown 的 autoLink 索引、也防止被 localStorage/同步 持久化。
 *
 * @param {string} text  - 任意文本（AI 输出或用户输入）
 * @returns {string}     - 打码后的文本（长度不变或略短）
 */
function redactSensitiveSecrets(text) {
  if (text == null) return '';
  var t = String(text);
  if (!t) return t;

  function b64Mask(m) {
    // 保留头 6 位 + 尾 4 位，中间全部 ****
    var s = m;
    if (s.length <= 14) return '[REDACTED]';
    return s.slice(0, 6) + '****' + s.slice(-4);
  }

  // 1) JWT: 三段 Base64 —— 最常见的 `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<payload>.<signature>`
  //    特别包含 supabase anon/service_role / firebase id_token / github app token 等
  t = t.replace(/eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, function (m) {
    var parts = m.split('.');
    // header 留少量指纹，payload/signature 全打码
    return '[JWT ' + (parts[0] || '').slice(0, 8) + '…****.****.****]';
  });

  // 2) AWS / Aliyun / Tencent 风格：AK=字母开头20字符 + SK（40 字 base64 字母数字/+）
  t = t.replace(/\b(AKIA[0-9A-Z]{16})\b/g, '[AKIA****]');
  t = t.replace(/\b(LTAI[0-9A-Za-z]{12,})\b/g, '[AliyunAK****]');
  t = t.replace(/\b([0-9A-Za-z/+]{40})\b(?![0-9A-Za-z/+])/g, function (m) {
    // 避免误伤 40 个连续字母的普通英文单词：要求"至少含 2 位数字"
    var digits = (m.match(/[0-9]/g) || []).length;
    var lowers = (m.match(/[a-z]/g) || []).length;
    var uppers = (m.match(/[A-Z]/g) || []).length;
    if (digits >= 2 && lowers >= 8 && uppers >= 8) return '[SK****' + m.slice(-4) + ']';
    return m;
  });

  // 3) 私钥头（PEM）
  t = t.replace(/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |)PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP |)PRIVATE KEY-----/g,
    '[PRIVATE KEY BLOCK REDACTED]');
  t = t.replace(/-----BEGIN (?:RSA |EC |)ENCRYPTED PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |)ENCRYPTED PRIVATE KEY-----/g,
    '[ENCRYPTED PRIVATE KEY BLOCK REDACTED]');

  // 4) `Bearer sk-xxx` / `sk_live_xxx` / `pk_live_xxx` / `ghp_xxx`（Stripe/GitHub token）
  t = t.replace(/\b(sk_live_|sk_test_|pk_live_|pk_test_|rk_live_)[A-Za-z0-9_]{10,}/g, function (m) { return m.split('_').slice(0, 2).join('_') + '_****'; });
  t = t.replace(/\b(ghp_|gho_|ghs_|github_pat_)[A-Za-z0-9_]{10,}/g, function (m) { return (m.split('_').slice(0, 2).join('_') || m.slice(0, 4)) + '_****'; });

  return t;
}

if (typeof window !== 'undefined') {
  window.redactSensitiveSecrets = redactSensitiveSecrets;
  TATABOX.redactSensitiveSecrets = redactSensitiveSecrets;
}

/**
 * 题库过滤：剔除"超长知识讲义型"题目
 * 特征（命中任一条即剔除，返回 null）：
 *   ① 单个选项/子题文本 > 600 字符（典型：把一整段知识讲义塞进 A/B/C/D 之一）
 *   ② (题干 + 所有选项文本 + 解析) > 4000 字符
 *   ③ 选项内容里包含超过 3 段"等式式罗列"（比如 `A=xxx=yyy=zzz→aaa→bbb→ccc`，这是讲义粘贴）
 * 若想保留题，返回一份"清洗过的"副本 —— 把单选项 >300 字的部分截断加 (…过长已省略)，降低 AI 输出幻觉。
 *
 * @param {Object} q  - {question, stem?, options?, subQuestions?, analysis?, explanation?, answer?}
 * @returns {Object|null}  保留 → 清洗后的对象；剔除 → null
 */
function filterLectureStyleQuestion(q) {
  if (!q || typeof q !== 'object') return null;

  // 字段别名归一
  var stem = String(q.question || q.stem || '');
  var analysis = String(q.analysis || q.explanation || q.answerExplanation || '');

  var options = [];
  if (Array.isArray(q.subQuestions)) {
    q.subQuestions.forEach(function (s) { options.push(String(s.text || s.label || '')); });
  } else if (Array.isArray(q.options)) {
    q.options.forEach(function (o, i) {
      if (typeof o === 'string') options.push(o);
      else if (o && typeof o.text === 'string') options.push(o.text);
      else if (o && typeof o.content === 'string') options.push(o.content);
      else options.push(String(o || ''));
    });
  } else if (q.A || q.B || q.C || q.D) {
    ['A','B','C','D','E','F'].forEach(function (k) { if (q[k]) options.push(String(q[k])); });
  }

  // 规则①：单选项 > 600 字 → 直接整题剔除（用户点名：肢端肥大症那道就是单个选项一两千字）
  var anyGiantOption = options.some(function (t) { return t.length > 600; });
  if (anyGiantOption) return null;

  var totalLen = stem.length + analysis.length +
    options.reduce(function (a, b) { return a + b.length; }, 0);

  // 规则②：全局 > 4000 字
  if (totalLen > 4000) return null;

  // 清洗：单选项 > 300 字的截短（"知识压缩"，别让单条选项还是半页讲义）
  var clean = {};
  for (var k in q) {
    if (Object.prototype.hasOwnProperty.call(q, k)) clean[k] = q[k];
  }

  function maybeTruncate(text, max) {
    if (text == null) return text;
    var s = String(text);
    if (s.length <= max) return s;
    // 优先在句号/分号处截断，避免把句子砍一半
    var cut = s.slice(0, max);
    var lastStop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('；'), cut.lastIndexOf(';'), cut.lastIndexOf('.'));
    if (lastStop > max * 0.6) cut = cut.slice(0, lastStop + 1);
    return cut + '…（过长已省略）';
  }

  if (Array.isArray(clean.subQuestions)) {
    clean.subQuestions = clean.subQuestions.map(function (s) {
      var x = Object.assign({}, s);
      if (x.text != null) x.text = maybeTruncate(x.text, 300);
      return x;
    });
  }
  if (Array.isArray(clean.options)) {
    clean.options = clean.options.map(function (o) {
      if (typeof o === 'string') return maybeTruncate(o, 300);
      if (o && typeof o === 'object') {
        var y = Object.assign({}, o);
        if (typeof y.text === 'string') y.text = maybeTruncate(y.text, 300);
        if (typeof y.content === 'string') y.content = maybeTruncate(y.content, 300);
        return y;
      }
      return o;
    });
  }
  ['A','B','C','D','E','F'].forEach(function (k) {
    if (clean[k] != null) clean[k] = maybeTruncate(String(clean[k]), 300);
  });
  if (clean.question) clean.question = maybeTruncate(String(clean.question), 1200);
  if (clean.stem)     clean.stem     = maybeTruncate(String(clean.stem), 1200);
  if (clean.analysis)    clean.analysis    = maybeTruncate(String(clean.analysis), 1200);
  if (clean.explanation) clean.explanation = maybeTruncate(String(clean.explanation), 1200);

  return clean;
}

/**
 * 批量过滤题目数组
 */
function filterQuestionList(list) {
  if (!Array.isArray(list)) return [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var q = filterLectureStyleQuestion(list[i]);
    if (q) out.push(q);
  }
  return out;
}

if (typeof window !== 'undefined') {
  window.filterLectureStyleQuestion = filterLectureStyleQuestion;
  window.filterQuestionList = filterQuestionList;
  TATABOX.filterLectureStyleQuestion = filterLectureStyleQuestion;
  TATABOX.filterQuestionList = filterQuestionList;
}

/**
 * ============================================================
 * 统一 Markdown → HTML 渲染器（BioQuestMarkdown / window.BioQuestMarkdown）
 * ============================================================
 * 目标：避免 tutor/discussion/practice 各模块重复实现残缺 markdown。
 * 覆盖（按执行顺序）：
 *   0. 代码块 ```lang ... ``` 和行内 `<svg>` 先"暂存"，避免后续转义/正则误伤。
 *   1. 标题 #~######
 *   2. 水平分隔线 --- / *** / ___
 *   3. 引用块 >
 *   4. 无序列表 - / * / + ；有序列表 1. 2. 3.（列表项支持嵌套缩进）
 *   5. 段落（空行分隔）
 *   6. 行内：**粗体** 、 *斜体* 、 `行内代码` 、 [标题](url) 、 <https://url>
 *   7. 裸 URL 自动转链接（http / https / ftp / ws / wss；兼容 net::ERR_ABORTED 后面紧跟 URL 的情况）
 *   8. 还原暂存的代码块/SVG，并对 SVG/代码块做 DOMPurify 消毒
 *
 * @param {string} text  - 原始 Markdown（AI 输出）
 * @param {Object} [opts]
 * @param {boolean} [opts.autoLink=true]      - 是否把裸 URL 自动转成 <a>
 * @param {boolean} [opts.openExternal=true]  - 外链是否 target="_blank" + rel
 * @param {boolean} [opts.sanitize=true]      - 是否用 DOMPurify 做最终消毒（强烈建议开启）
 * @param {boolean} [opts.preserveSvg=true]   - 是否放行 ```svg``` / 原生 <svg> 块
 * @returns {string} HTML 字符串（可直接 innerHTML）
 */
(function registerMarkdown() {
  var SVGP = /[\s\/"']on\w+\s*=\s*"[^"]*"/gi;
  var SVGP2 = /[\s\/"']on\w+\s*=\s*'[^']*'/gi;
  var SVGP3 = /[\s\/"']on\w+\s*=\s*[^\s>]+/gi;
  function _fallbackSanitizeSvg(svg) {
    if (!svg) return '';
    return svg
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<script[^>]*>/gi, '')
      .replace(SVGP, '').replace(SVGP2, '').replace(SVGP3, '')
      .replace(/<set\s[^>]*attributeName\s*=\s*["']?(?:href|xlink:href)["']?[^>]*>/gi, '')
      .replace(/<animate\s[^>]*attributeName\s*=\s*["']?(?:href|xlink:href)["']?[^>]*>/gi, '')
      .replace(/<(?:set|animate)\s[^>]*to\s*=\s*["']?\s*javascript:[^"']*["']?[^>]*>/gi, '')
      .replace(/<(?:set|animate)\s[^>]*to\s*=\s*["']?\s*data:(?!image\/)[^"']*["']?[^>]*>/gi, '')
      .replace(/<(?:set|animate)\s[^>]*to\s*=\s*["']?\s*data:image\/svg\+xml[^"']*["']?[^>]*>/gi, '')
      .replace(/\sstyle\s*=\s*"[^"]*"/gi, '')
      .replace(/\sstyle\s*=\s*'[^']*'/gi, '')
      .replace(/\sstyle\s*=\s*[^\s>]+/gi, '')
      .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(parseInt(n, 10)); })
      .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&colon;/gi, ':')
      .replace(/(href|xlink:href)\s*=\s*["']?\s*javascript:/gi, '$1="')
      .replace(/(href|xlink:href)\s*=\s*["']?\s*data:(?!image\/(?!svg\+xml))/gi, '$1="')
      .replace(/(href|xlink:href)\s*=\s*["']?\s*data:image\/svg\+xml/gi, '$1="')
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  }
  function _sanitizeSvgSafe(svg) {
    try {
      if (typeof window !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        return window.DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ['foreignObject', 'script', 'style'],
          FORBID_ATTR: ['style', 'onload', 'onclick', 'onbegin', 'onend', 'onrepeat']
        });
      }
    } catch (e) { /* 失败走降级 */ }
    return _fallbackSanitizeSvg(svg || '');
  }
  function _sanitizeFinalHtml(html) {
    try {
      if (typeof window !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        return window.DOMPurify.sanitize(html, {
          ADD_ATTR: ['target', 'rel'],
          FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button'],
          FORBID_ATTR: ['onload', 'onclick', 'onerror', 'onmouseover', 'onfocus']
        });
      }
    } catch (e) { /* 降级直接返回（前面已 escapeHtml + 仅允许白名单标签） */ }
    return html || '';
  }

  // 把 URL 做一次最小程度合法性判断：非 ASCII 字符已存在错误日志里，应该保留原样（允许中文查询参数，比如用户给的 supabase URL）
  var URL_RE = /\b((?:https?|ftp|wss?):\/\/[^\s<>"'`)\]]+[^\s<>"'`)\]\.,;。，；：])/gi;

  function renderBioQuestMarkdown(text, opts) {
    opts = opts || {};
    if (text == null) return '<p></p>';
    var raw = String(text);
    if (!raw) return '<p></p>';
    var openExt = opts.openExternal !== false;
    var autoLink = opts.autoLink !== false;
    var sanitize = opts.sanitize !== false;
    var preserveSvg = opts.preserveSvg !== false;

    // 放在所有处理之前做 —— 否则 autoLink 之后 <a> 里再替换会破坏 DOM。
    // 仅对代码/文本里"裸露"的凭据打码，已正确 stash 的链接/代码不受影响。
    try {
      if (typeof redactSensitiveSecrets === 'function') {
        raw = redactSensitiveSecrets(raw);
      }
    } catch (e) { /* ignore */ }

    var stash = [];
    // 占位符规则：BKSTASH + 数字 + END，两侧 \u0000 作边界。
    // 刻意避开 _ * ~ [ ]，防止被斜体/粗体/删除线/链接正则误伤
    var STASH_RE = /\u0000BKSTASH:(\d+)\|END\u0000/g;
    function stashItem(s) { stash.push(s); return '\u0000BKSTASH:' + (stash.length - 1) + '|END\u0000'; }
    function unstash(html) {
      if (html == null) return '';
      var h = String(html);
      // 最多循环 3 次，防还原内容里又包含 STASH 占位（引用块递归）
      var max = 3;
      while (STASH_RE.test(h) && max-- > 0) {
        h = h.replace(STASH_RE, function (_m, idx) {
          return stash[+idx] || '';
        });
      }
      return h;
    }

    // 0.1 代码块 ``` （允许 ```svg / ```xml 特殊处理）
    raw = raw.replace(/```([\w +\-]*)\n?([\s\S]*?)```/g, function (_m, lang, code) {
      var L = (lang || '').trim().toLowerCase();
      if (preserveSvg && (L === 'svg' || L === 'xml') && /<svg[\s>]/i.test(code)) {
        return stashItem('<!-- SVG -->' + _sanitizeSvgSafe(code.trim()));
      }
      return stashItem('<!-- CODE:' + L + '--><pre><code>' +
        escapeHtml(code.replace(/\n$/, '')) + '</code></pre>');
    });
    // 0.2 行内 <svg> ... </svg>
    if (preserveSvg) {
      raw = raw.replace(/(<svg[\s\S]*?<\/svg>)/gi, function (m) {
        return stashItem('<!-- SVG -->' + _sanitizeSvgSafe(m));
      });
    }

    // 先把 [[ANIM:xxx]] 清理（AI 客户端内部动画标记）
    raw = raw.replace(/\[\[ANIM:\w+\]\]/g, '');

    // 先统一换行
    raw = raw.replace(/\r\n?/g, '\n');
    // 把水平分隔线替换成占位（空行包围）
    raw = raw.replace(/^[ \t]*(?:[-*_])[ \t]*(?:[-*_])[ \t]*(?:[-*_])[ \t\-*_]*$/gm, '\n\n__BQ_HR__\n\n');

    // 连续以 | 开头的行，第二行为分隔行（|---|）时识别为表格。
    // 通过占位符 __BQ_TABLE_n 在行循环中作为块级元素输出（避免被 <p> 包裹）。
    var _tables = [];
    raw = raw.replace(/((?:^[ \t]*\|[^\n]*\n?)+)/gm, function (block) {
      var tblLines = block.replace(/\n$/, '').split('\n');
      if (tblLines.length < 2) return block;   // 至少 表头 + 分隔行
      var sep = tblLines[1].trim();
      if (sep.indexOf('|') === -1) return block;
      var sepClean = sep.replace(/[|\s:]/g, '');
      if (!/^-+$/.test(sepClean)) return block; // 第二行必须是 --- 分隔行
      function cells(line) {
        var l = line.trim();
        if (l.charAt(0) === '|') l = l.slice(1);
        if (l.charAt(l.length - 1) === '|') l = l.slice(0, -1);
        return l.split('|').map(function (c) { return c.trim(); });
      }
      var header = cells(tblLines[0]);
      var body = tblLines.slice(2).filter(function (l) { return l.trim().length > 0; }).map(cells);
      var html = '<div class="bq-table-wrap" style="overflow-x:auto;margin:14px 0;">' +
        '<table class="bq-table">' +
        '<thead><tr>' + header.map(function (c) { return '<th>' + inlineMd(c) + '</th>'; }).join('') + '</tr></thead>' +
        '<tbody>';
      body.forEach(function (row) {
        html += '<tr>' + row.map(function (c) { return '<td>' + inlineMd(c) + '</td>'; }).join('') + '</tr>';
      });
      html += '</tbody></table></div>';
      _tables.push(html);
      return '\n\n__BQ_TABLE__' + (_tables.length - 1) + '\n\n';
    });

    var lines = raw.split('\n');
    var out = [];
    var inList = null;      // {tag:'ul'|'ol', buffer:[]}
    var inQuote = false;    // 正在引用块里？
    var quoteLines = [];    // 引用块累积的行（递归调用 render 内层内容）

    function closeList() {
      if (inList) {
        out.push('<' + inList.tag + '>');
        out.push(inList.buffer.join(''));
        out.push('</' + inList.tag + '>');
        inList = null;
      }
    }
    function closeQuote() {
      if (inQuote) {
        var inner = quoteLines.join('\n');
        out.push('<blockquote>' + renderBioQuestMarkdown(inner, Object.assign({}, opts, { sanitize: false })) + '</blockquote>');
        inQuote = false;
        quoteLines = [];
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.replace(/^[ \t]*/, '');

      if (trimmed === '__BQ_HR__') {
        closeList(); closeQuote();
        out.push('<hr/>');
        continue;
      }

      // 表格占位符 → 直接输出块级表格 HTML
      var tblM = /^__BQ_TABLE__(\d+)$/.exec(trimmed);
      if (tblM) {
        closeList(); closeQuote();
        var _ti = +tblM[1];
        if (_tables[_ti]) out.push(_tables[_ti]);
        continue;
      }

      // 空行 → 结束所有当前容器
      if (trimmed.length === 0) {
        closeList();
        if (inQuote) closeQuote();
        continue;
      }

      // 标题：# ~ ######
      var h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (h) {
        closeList(); closeQuote();
        var lv = h[1].length;
        out.push('<h' + lv + '>' + inlineMd(h[2]) + '</h' + lv + '>');
        continue;
      }

      // 引用行 > xxx / > 空
      var q = /^>\s?(.*)$/.exec(trimmed);
      if (q) {
        closeList();
        inQuote = true;
        quoteLines.push(q[1]);
        continue;
      } else {
        if (inQuote) closeQuote();
      }

      // 无序列表 - * +
      var ul = /^([-*+])\s+(.*)$/.exec(trimmed);
      if (ul) {
        if (!inList || inList.tag !== 'ul') { closeList(); inList = { tag: 'ul', buffer: [] }; }
        inList.buffer.push('<li>' + inlineMd(ul[2]) + '</li>');
        continue;
      }
      // 有序列表 1.
      var ol = /^(\d+)\.\s+(.*)$/.exec(trimmed);
      if (ol) {
        if (!inList || inList.tag !== 'ol') { closeList(); inList = { tag: 'ol', buffer: [] }; }
        inList.buffer.push('<li>' + inlineMd(ol[2]) + '</li>');
        continue;
      }

      // 普通段落行：如果没容器就包 <p>（注意：连续非空行会合并到同一个段落？避免每一行都 <p>）
      closeList();
      // 看最后一个 out 元素是不是未关闭的 "P_START"
      var last = out[out.length - 1];
      if (last && last.__isPara === true) {
        last.value += '\n' + line;
      } else {
        var paraObj = { __isPara: true, value: line };
        out.push(paraObj);
      }
    }
    closeList(); closeQuote();

    // 收尾：把段落对象渲染成 <p>
    var blocks = [];
    for (var j = 0; j < out.length; j++) {
      var x = out[j];
      if (x && typeof x === 'object' && x.__isPara) {
        var inline = inlineMd(x.value.replace(/\n/g, ' '));
        if (inline.trim()) blocks.push('<p>' + inline + '</p>');
      } else {
        blocks.push(x);
      }
    }
    var html = blocks.join('\n');

    html = unstash(html);

    if (sanitize) html = _sanitizeFinalHtml(html);
    return html;

    function inlineMd(s) {
      if (!s) return '';
      var t = s;

      // 避免 escapeHtml 把 & 变成 &amp; 导致 URL_RE 结尾误判（; 在排除集合里）
      // 注意：刻意不在这里还原上层 STASH（占位符不含 _*~[] 所以完全不会被误伤）

      // 处理顺序：先处理有明确起止符的 markdown 链接，再兜底 autoLink 裸 URL
      // 这样 `[text](https://x)` 内部的 URL 会先被 stash，不会被 autoLink 重复命中

      // 1. 图片 ![alt](src "title?") —— 必须在 [text](url) 之前
      t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, function (_m, alt, src, title) {
        var a = title ? ' title="' + escapeHtml(title) + '"' : '';
        return stashItem('<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '" loading="lazy" decoding="async"' + a + '/>');
      });

      // 2. [text](url "title?")
      t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, function (_m, txt, url, title) {
        return stashItem(renderLink(url, txt, title));
      });

      // 3. <https://...> 尖括号链接
      t = t.replace(/<((?:https?|ftp|wss?):\/\/[^<>\s]+)>/gi, function (_m, url) {
        return stashItem(renderLink(url, url, null));
      });

      // 4. 行内代码 `...`（必须先于斜体/粗体，否则 code 中的 * 会误伤）
      t = t.replace(/`([^`]+)`/g, function (_m, c) {
        return stashItem('<code>' + escapeHtml(c) + '</code>');
      });

      // 5. 裸 URL 自动转链接（放在有明确起止符的链接之后，避免重复匹配）
      //    此时 markdown 链接已被 stash，autoLink 只会命中纯文本里真正裸露的 URL
      if (autoLink) {
        t = t.replace(URL_RE, function (u) {
          return stashItem(renderLink(u, u, null));
        });
      }

      // 现在才 escapeHtml：纯文本才转义，不会污染 URL / 链接 / 代码
      t = escapeHtml(t);

      // 粗体 **...** 或 __...__
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
      // 斜体 *...* 或 _..._ （已经处理了 ** 所以 * 单个是安全的）
      t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
      t = t.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
      // 删除线 ~~...~~
      t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');

      // 最后才统一还原 stash：避免 HTML 属性中 _blank 被斜体正则误伤
      return unstash(t);
    }

    function renderLink(url, txt, title) {
      if (!url) return escapeHtml(txt || url || '');
      var attrExt = '';
      if (openExt && /^(https?|ftp|wss?):/i.test(url)) {
        attrExt = ' target="_blank" rel="noopener noreferrer nofollow"';
      }
      var t = title ? ' title="' + escapeHtml(title) + '"' : '';
      return '<a href="' + escapeHtml(url) + '"' + t + attrExt + '>' + escapeHtml(txt || url) + '</a>';
    }
  }

  // 暴露到 TATABOX + window（tutor/discussion/practice 均可直接用）
  if (typeof window !== 'undefined') {
    window.BioQuestMarkdown = renderBioQuestMarkdown;
    TATABOX.markdown = renderBioQuestMarkdown;
  }
})();

/**
 * 公共脚本懒加载器（统一各模块重复的 createElement('script') 实现）
 * 特性：去重（同 src 并发只加载一次，共享 Promise）、超时控制、可选校验函数。
 * @param {string} src - 脚本 URL
 * @param {Object} [opts]
 * @param {Function} [opts.verify] - 加载完成后校验函数，返回 falsy 视为加载失败
 * @param {number} [opts.timeout=15000] - 超时毫秒数
 * @returns {Promise<void>} 加载成功 resolve，失败 reject（并清除缓存以允许重试）
 */
if (typeof window !== 'undefined' && typeof window.loadScriptOnce !== 'function') {
  window.loadScriptOnce = (function () {
    var _cache = {}; // src -> Promise
    return function loadScriptOnce(src, opts) {
      if (!src) return Promise.reject(new Error('loadScriptOnce: src 为空'));
      if (_cache[src]) return _cache[src];
      opts = opts || {};
      var timeout = opts.timeout || 15000;
      var p = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.async = true;
        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          s.onload = s.onerror = null;
          reject(new Error('脚本加载超时: ' + src));
        }, timeout);
        s.onload = function () {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (typeof opts.verify === 'function') {
            try {
              if (!opts.verify()) {
                reject(new Error('脚本校验失败: ' + src));
                return;
              }
            } catch (e) {
              reject(e);
              return;
            }
          }
          resolve();
        };
        s.onerror = function () {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(new Error('脚本加载失败: ' + src));
        };
        document.head.appendChild(s);
      });
      _cache[src] = p;
      p.catch(function () { delete _cache[src]; });
      return p;
    };
  })();
  // Q-03：同时注册到 TATABOX 命名空间作为规范路径
  TATABOX.loadScriptOnce = window.loadScriptOnce;
}

/**
 * 模块编号转中文名称
 * 将数字编号映射为对应的竞赛生物学科目名称
 * @param {number|string} num - 模块编号
 * @returns {string} 模块中文名称
 */
function moduleName(num) {
  const MODULE_MAP = {
    1: '植物学',
    2: '动物学',
    3: '生物化学',
    4: '细胞生物学',
    5: '分子生物学',
    6: '遗传学',
    7: '微生物学',
    8: '生态学',
    9: '进化生物学',
    10: '动物生理学',
    11: '植物生理学',
    12: '实验技术',
    13: '生物信息学',
    14: '通用'
  };

  const key = String(num);
  return MODULE_MAP[key] || `模块${num}`;
}

/**
 * 深拷贝对象
 * 使用结构化克隆算法复制复杂对象
 * @template T
 * @param {T} obj - 需要拷贝的对象
 * @returns {T} 深拷贝后的新对象
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  try {
    return structuredClone(obj);
  } catch (e) {
    return JSON.parse(JSON.stringify(obj));
  }
}

/**
 * 截断文本并添加省略号
 * @param {string} text - 原始文本
 * @param {number} maxLength - 最大长度
 * @param {string} [ellipsis='...'] - 省略符号
 * @returns {string} 截断后的文本
 */
function truncateText(text, maxLength, ellipsis = '...') {
  if (typeof text !== 'string') return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * 计算正确率百分比
 * @param {number} correct - 正确数
 * @param {number} total - 总数
 * @returns {number} 百分比整数 (0-100)
 */
function calcAccuracy(correct, total) {
  if (!total || total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

/**
 * 本地时区日期工具（规避 toISOString() UTC 造成的「今天错位一天」）
 * 历史统计按本地日期聚合/展示时，一律使用本函数生成 YYYY-MM-DD。
 * @param {Date|number|string} [d] - 日期对象/时间戳；缺省为当前时间
 * @returns {string} YYYY-MM-DD（本地时区）
 */
function localDateStr(d) {
  const dt = d === undefined || d === null ? new Date()
    : (d instanceof Date ? d : new Date(d));
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/**
 * 本地时区「今天」的 YYYY-MM-DD
 * @returns {string}
 */
function localTodayStr() {
  return localDateStr(new Date());
}

/**
 * 获取数组中随机一个元素
 * @template T
 * @param {T[]} array - 源数组
 * @returns {T|undefined} 随机元素
 */
function randomPick(array) {
  if (!Array.isArray(array) || array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * 从数组中随机选取 N 个不重复元素
 * @template T
 * @param {T[]} array - 源数组
 * @param {number} count - 选取数量
 * @returns {T[]} 选取的元素数组
 */
function randomSample(array, count) {
  if (!Array.isArray(array) || array.length === 0) return [];
  if (count >= array.length) return shuffle([...array]);

  const indices = new Set();
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * array.length));
  }

  return [...indices].map((i) => array[i]);
}

/**
 * 判定值是否为“图片型”图表内容（供 renderChart 识别）：
 * 支持 data URI、http(s) 绝对地址，以及本地相对路径图片文件
 * （png / jpg / jpeg / webp / gif / svg，允许带 ?query / #hash 后缀）。
 */
function isChartImageSrc(s) {
  if (typeof s !== 'string') return false;
  s = s.trim();
  if (!s) return false;
  if (s.indexOf('data:image') === 0) return true;
  if (/^https?:\/\//.test(s)) return true;
  return /\.(png|jpe?g|webp|gif|svg)([?#][^\s"']*)?$/i.test(s);
}

/**
 * 渲染题目图表（图片 / Markdown 表格 / 纯文本）
 * @param {string} chart - 图表内容
 * @returns {string} 图表 HTML
 */
function renderChart(chart) {
  if (chart === null || chart === undefined) return '';
  if (chart === '' || (typeof chart === 'string' && chart.trim() === '')) return '';

  // 兼容对象/数组格式
  if (typeof chart !== 'string') {
    try {
      if (chart && typeof chart.url === 'string' && chart.url) {
        chart = chart.url;
      } else if (Array.isArray(chart) && chart.length > 0) {
        if (typeof chart[0] === 'string') {
          chart = chart.join('\n');
        } else if (Array.isArray(chart[0])) {
          // 二维数组：[['列1','列2'], ['A','B']]
          var html2 = '<div class="question-chart-wrapper chart-table" style="margin:12px 0;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid var(--border-light);font-size:0.92rem;">';
          for (var rx = 0; rx < chart.length; rx++) {
            html2 += '<tr>';
            for (var cx = 0; cx < chart[rx].length; cx++) {
              var tag2 = rx === 0 ? 'th' : 'td';
              html2 += `<${tag2} style="padding:10px 14px;border:1px solid var(--border-light);background:${rx === 0 ? 'var(--surface-secondary)' : 'var(--surface-tertiary)'};text-align:center;">${escapeHtml(String(chart[rx][cx]))}</${tag2}>`;
            }
            html2 += '</tr>';
          }
          html2 += '</table></div>';
          return html2;
        } else {
          chart = JSON.stringify(chart);
        }
      } else {
        chart = JSON.stringify(chart);
      }
    } catch(e) {
      chart = String(chart);
    }
  }

  const s = String(chart).trim();
  if (!s) return '';

  // 真实图片：data URI / http(s) URL / 本地相对路径（png/jpg/webp/gif/svg）；
  // 改为「捕获阶段 error 委托」兜底（P1-8/CSP：内联 onerror 已被
  // script-src 移除 unsafe-inline 后拦截，故不能用属性式内联处理器）。
  // 统一由 _registerChartImgErrorFallback 监听 img#data-chart-fallback 的 error 事件。
  if (isChartImageSrc(s)) {
    const src = s.split(/\s+/)[0];
    return `<div class="question-chart-wrapper" style="margin:14px auto;text-align:center;">
      <img src="${escapeHtml(src)}" alt="题目图表" loading="lazy" decoding="async" data-chart-fallback="1" data-bq-zoom="1"
        style="max-width:100%;max-height:min(60vh,560px);width:auto;height:auto;object-fit:contain;box-sizing:border-box;border-radius:12px;border:1px solid var(--border-light);background:var(--surface-tertiary);padding:8px;box-shadow:var(--shadow-md);display:block;margin:0 auto;cursor:zoom-in;">
    </div>`;
  }

  // Markdown 表格（多行）：| 列1 | 列2 |
  if (s.startsWith('|') && s.includes('\n')) {
    var rows = s.split('\n').map(function(r){ return r.trim(); }).filter(function(r){ return r.length > 0; });
    var allTable = rows.every(function(r){ return r.startsWith('|') && r.endsWith('|'); });
    if (allTable) {
      var html = '<div class="question-chart-wrapper chart-table" style="margin:12px 0;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid var(--border-light);font-size:0.92rem;">';
      for (var i = 0; i < rows.length; i++) {
        if (/^\|[-:\|\s]+\|$/.test(rows[i])) continue;
        var cells = rows[i].split('|').map(function(c){ return c.trim(); }).filter(function(c){ return c.length > 0; });
        if (cells.length === 0) continue;
        var tag = i === 0 ? 'th' : 'td';
        html += '<tr>';
        for (var j = 0; j < cells.length; j++) {
          html += `<${tag} style="padding:10px 14px;border:1px solid var(--border-light);background:${i === 0 ? 'var(--surface-secondary)' : 'var(--surface-tertiary)'};text-align:center;">${escapeHtml(cells[j])}</${tag}>`;
        }
        html += '</tr>';
      }
      html += '</table></div>';
      return html;
    }
  }

  // 单个 Markdown 表头行：| 组别 | 对照组 | 实验组A |
  if (s.startsWith('|') && s.endsWith('|') && s.indexOf('|') !== s.lastIndexOf('|')) {
    var cells2 = s.split('|').map(function(c){ return c.trim(); }).filter(function(c){ return c.length > 0; });
    if (cells2.length >= 2) {
      return `<div class="question-chart-wrapper chart-table" style="margin:12px 0;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid var(--border-light);font-size:0.92rem;"><tr>${cells2.map(function(c){ return `<th style="padding:10px 14px;border:1px solid var(--border-light);background:var(--surface-secondary);text-align:center;">${escapeHtml(c)}</th>`; }).join('')}</tr></table></div>`;
    }
  }

  // 纯文本描述：使用等宽字体保留缩进/换行
  return `<div class="question-chart-wrapper chart-text" style="margin:12px 0;background:var(--surface-tertiary);padding:16px;border-radius:12px;border:1px dashed var(--border-light);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:0.9rem;line-height:1.6;white-space:pre-wrap;overflow-x:auto;">${escapeHtml(s)}</div>`;
}

// P1-8/CSP：图片加载失败兜底改为「捕获阶段 error 事件委托」。
// 内联 onerror 属性在 script-src 移除 unsafe-inline 后会被 CSP 拦截，
// 故由 renderChart 在 <img> 上打 data-chart-fallback="1" 标记，
// 统一在此处捕获错误并插入“加载失败”提示（逻辑与原内联处理器一致）。
var _chartImgFallbackBound = false;
function _ensureChartImgFallback() {
  if (_chartImgFallbackBound) return;
  _chartImgFallbackBound = true;
  if (typeof document === 'undefined' || !document.addEventListener) return;
  document.addEventListener('error', function (e) {
    var t = e && e.target;
    if (!t || t.tagName !== 'IMG') return;
    if (t.getAttribute('data-chart-fallback') !== '1') return;
    if (t.getAttribute('data-bq-zoom') === '1' && typeof window !== 'undefined' && window.BioQuestFigure) {
      return; // 统一图片管线（figure-viewer.js）接管；未加载该脚本时仍走本兜底
    }
    if (t.dataset && t.dataset.retried) return; // 已处理过，避免重复插入
    if (t.dataset) t.dataset.retried = '1';
    try { t.style.display = 'none'; } catch (err) {}
    var note = document.createElement('div');
    note.style.cssText = 'margin-top:8px;padding:10px 14px;border-radius:8px;border:1px dashed var(--border-light);color:var(--text-muted);font-size:0.82rem;background:var(--surface-tertiary);';
    note.textContent = '图表/图片加载失败，请检查网络或稍后重试。';
    if (t.parentNode) t.parentNode.appendChild(note);
  }, true);
}
_ensureChartImgFallback();

/**
 * 判断是否为移动设备
 * @returns {boolean} 是否为移动设备
 */
function isMobile() {
  return /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)
    || window.innerWidth < 768;
}

/**
 * 获取 URL 查询参数
 * @param {string} [url] - URL 字符串，默认为当前页面 URL
 * @returns {Object} 查询参数键值对
 */
function getQueryParams(url) {
  const search = url
    ? new URL(url).search
    : window.location.search;

  const params = {};
  const searchParams = new URLSearchParams(search);

  for (const [key, value] of searchParams) {
    params[key] = value;
  }

  return params;
}

/**
 * 安全清洗 URL 参数值（P1-5）。
 * 对来自 URL 的入参做白名单式校验与过滤：
 *   - 仅接受字符串
 *   - 剔除控制字符（含 \x00-\x1f、\x7f）与危险空白，防参数注入 / 控制字符污染渲染
 *   - 剔除 HTML 标签定界符（< > 反引号），纵深防御：即使下游新增调用点
 *     忘记 escapeHtml，也无法注入标记（引号保留给合法搜索词，由下游转义）
 *   - 限制最大长度，防超长参数滥用（刷接口 / 拖慢索引逻辑）
 * @param {*} value - 原始参数值
 * @param {number} [maxLen=100] - 允许的最大字符长度
 * @returns {string|null} 清洗后的安全字符串；非法/超长返回 null
 */
function sanitizeUrlParam(value, maxLen) {
  if (value == null || typeof value !== 'string') return null;
  // 剔除控制字符；保留正常空白、中文与可打印字符
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>`]/g, '');
  if (!cleaned) return null;
  const limit = (typeof maxLen === 'number' && maxLen > 0) ? maxLen : 100;
  if (cleaned.length > limit) return null;
  return cleaned;
}

// Q-03：注册到 TATABOX 命名空间（各调用点统一走 window.BioQuest.sanitizeUrlParam）
if (typeof window !== 'undefined') {
  TATABOX.sanitizeUrlParam = sanitizeUrlParam;
  TATABOX.isChartImageSrc = isChartImageSrc;
}

/**
 * 平滑滚动到指定元素
 * @param {string|HTMLElement} target - 目标元素或选择器
 * @param {Object} [options] - 滚动选项
 * @param {number} [options.offset=0] - 偏移量（像素）
 */
function scrollToElement(target, options = {}) {
  const { offset = 0 } = options;

  const element = typeof target === 'string'
    ? document.querySelector(target)
    : target;

  if (!element) return;

  const top = element.getBoundingClientRect().top + window.scrollY - offset;

  window.scrollTo({
    top,
    behavior: 'smooth'
  });
}

/**
 * 复制文本到剪贴板
 * @param {string} text - 需要复制的文本
 * @returns {Promise<boolean>} 是否复制成功
 */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch (e) {
    console.warn('[TATABOX Utils] 复制失败:', e.message);
    return false;
  }
}

/**
 * 相对时间格式化
 * @param {number|string|Date} date - 日期
 * @returns {string} 相对时间描述
 */
function timeAgo(date) {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(diff / 86400000);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;

  return `${Math.floor(days / 365)} 年前`;
}

/* ============================================================
 * Issue #105：事件监听器集中管理（EventHub）
 * 目标：addEventListener 与 removeEventListener 成对维护，避免内存泄漏。
 *  - 所有页面级监听统一走 EventHub.on / once；
 *  - 支持按 scope（如路由名/模块名）批量清理；
 *  - 未显式 off 的监听在页面卸载（pagehide）时统一解除；
 *  - 新模块应优先使用本工具，存量代码逐步迁移。
 * ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var _registry = [];   // { scope, target, type, handler, options }
  var _scopeCount = {}; // 便于统计

  function _normalizeTarget(target) {
    return target || window;
  }

  /**
   * 注册监听（推荐替代 addEventListener）。
   * @param {*} target - 事件源（默认 window）
   * @param {string} type - 事件类型
   * @param {Function} handler - 处理函数
   * @param {Object} [options] - { once, capture, passive, scope }
   * @returns {Function} 取消函数
   */
  function on(target, type, handler, options) {
    options = options || {};
    var el = _normalizeTarget(target);
    if (typeof el.addEventListener !== 'function' || typeof handler !== 'function') {
      return function () {};
    }
    var scope = options.scope || 'global';
    var once = options.once === true;
    var wrapped = handler;
    // once 由 EventHub 自行保证（首次触发即解除），不依赖目标实现是否支持 {once}
    if (once) {
      wrapped = function bqEventHubOnce() {
        remove(scope, el, type, wrapped);
        return handler.apply(this, arguments);
      };
    }
    var record = { scope: scope, target: el, type: type, handler: wrapped, options: options };
    el.addEventListener(type, wrapped, options);
    _registry.push(record);
    _scopeCount[scope] = (_scopeCount[scope] || 0) + 1;
    return function off() {
      remove(scope, el, type, wrapped);
    };
  }

  /**
   * 一次性监听（内部使用 { once: true }，自动解除）。
   */
  function once(target, type, handler, options) {
    options = options || {};
    options.once = true;
    return on(target, type, handler, options);
  }

  /**
   * 解除指定监听。
   */
  function remove(scope, target, type, handler) {
    var i = _registry.length;
    while (i--) {
      var rec = _registry[i];
      if ((scope === undefined || rec.scope === scope) &&
          (target === undefined || rec.target === target) &&
          (type === undefined || rec.type === type) &&
          (handler === undefined || rec.handler === handler)) {
        try { rec.target.removeEventListener(rec.type, rec.handler, rec.options); } catch (e) {}
        _registry.splice(i, 1);
        if (_scopeCount[rec.scope]) _scopeCount[rec.scope]--;
      }
    }
  }

  /**
   * 按 scope 批量清理（路由切换等场景：EventHub.cleanup('route:quiz')）。
   * @returns {number} 解除数量
   */
  function cleanup(scope) {
    if (scope === undefined) return 0;
    var before = _registry.length;
    remove(scope);
    return before - _registry.length;
  }

  /**
   * 解除监听（对外接口，兼容两种调用方式）：
   *   EventHub.off(scope)                        — 清空某 scope
   *   EventHub.off(target, type, handler)        — 元素模式（等价原始 removeEventListener 语义）
   *   EventHub.off(scope, target, type, handler) — 精确匹配
   */
  function off(a, b, c, d) {
    if (typeof a === 'string') {
      // scope 位于首参：scope 模式（remove 的 scope 在前）
      return remove(a, b, c, d);
    }
    // 元素模式：off(target, type, handler)
    return remove(undefined, a, b, c);
  }

  /**
   * 全部清理。
   */
  function clearAll() {
    _registry.slice().forEach(function (rec) {
      try { rec.target.removeEventListener(rec.type, rec.handler, rec.options); } catch (e) {}
    });
    _registry.length = 0;
    _scopeCount = {};
  }

  // 页面卸载时统一解除，避免跨页面残留监听
  window.addEventListener('pagehide', clearAll);

  window.EventHub = { on: on, once: once, off: off, remove: remove, cleanup: cleanup, clearAll: clearAll };
  if (window.BioQuest) window.BioQuest.EventHub = window.EventHub;
})();