/**
 * ============================================================
 * TATABOX — 生物动画视频栏目（由 bio-animation Canvas 栏目移植）
 * 数据源：data/videos.json（唯一真源）
 * 双防线：本模块渲染前过滤（兜底，P0-2 第 2 道）
 *        + scripts/verify-video-license.js（CI 硬门禁，第 1 道，不可绕过）
 * 授权准入：五要素 license/source/attribution/poster/steps 缺一不渲染（§1.4）
 * ============================================================
 */
(function () {
  'use strict';

  var _state = { list: [], currentId: null };

  /* 模块内本地转义：utils.js 未导出 window.esc / window.escapeHtml（P0-4），
     参照 practice.js 现行写法自建，不依赖不存在的全局 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _formatSize(bytes) {
    if (typeof bytes !== 'number' || !isFinite(bytes) || bytes <= 0) return '';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function _formatDuration(sec) {
    if (typeof sec !== 'number' || !isFinite(sec) || sec < 0) return '';
    var m = Math.floor(sec / 60);
    var s = Math.round(sec % 60);
    if (s === 60) { m += 1; s = 0; }
    return m + ':' + (s < 10 ? '0' + s : String(s));
  }

  /** 兜底防线：五要素中 file/poster/license/source 缺任一则不进列表 */
  function _eligible(v) {
    return !!(v && v.file && v.poster && v.license && v.source);
  }

  /** 拉取并过滤清单；任何异常都回落为空数组（栏目进入空态而非崩溃） */
  async function _loadVideos() {
    if (_state.list.length) return _state.list;
    try {
      var r = await fetch('data/videos.json');
      if (!r || !r.ok) throw new Error('videos.json 请求失败');
      var j = await r.json();
      var arr = (j && Array.isArray(j.videos)) ? j.videos : [];
      _state.list = arr.filter(_eligible);
    } catch (e) {
      _state.list = [];
    }
    return _state.list;
  }

  /* ── 列表视图 ── */

  function _cardHTML(v) {
    var dur = _formatDuration(v.durationSec);
    var size = _formatSize(v.sizeBytes);
    var topics = Array.isArray(v.topics) ? v.topics : [];
    return '<article class="bv-card" role="button" tabindex="0" data-video-id="' + esc(v.id) + '"' +
      ' aria-label="播放视频：' + esc(v.title) + '">' +
      '<div class="bv-thumb">' +
        '<img src="' + esc(v.poster) + '" alt="' + esc(v.title) + ' 封面" loading="lazy" decoding="async">' +
        (dur ? '<span class="bv-badge bv-badge--dur">' + esc(dur) + '</span>' : '') +
        '<span class="bv-playmark" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="bv-card-body">' +
        '<h3 class="bv-title">' + esc(v.title) + '</h3>' +
        (topics.length
          ? '<p class="bv-topics">' + topics.map(function (t) { return esc(t); }).join(' · ') + '</p>'
          : '') +
        '<p class="bv-meta">' +
          (size ? '<span>约 ' + esc(size) + '</span>' : '') +
          (v.license ? '<span class="bv-chip">' + esc(v.license) + '</span>' : '') +
        '</p>' +
      '</div>' +
    '</article>';
  }

  function _listHTML(list) {
    if (!list.length) {
      return '<div class="bv-empty">视频整理中，敬请期待</div>';
    }
    return '<div class="bv-grid">' + list.map(_cardHTML).join('') + '</div>';
  }

  function _pageShellHTML(inner) {
    return '<div class="bv-page">' +
      '<header class="bv-header">' +
        '<h1 class="bv-h1">生物动画视频</h1>' +
        '<p class="bv-sub">精选版权干净的生物机制视频，全部标注授权与来源。</p>' +
      '</header>' + inner +
    '</div>';
  }

  /* ── 播放视图 ── */

  function _playerHTML(v) {
    var dur = _formatDuration(v.durationSec);
    var size = _formatSize(v.sizeBytes);
    var steps = Array.isArray(v.steps) ? v.steps : [];
    var captions = (typeof v.captions === 'string' && v.captions) ? v.captions : '';

    return '<div class="bv-player-page">' +
      '<button type="button" class="bv-back" data-bv-action="back">← 返回视频列表</button>' +
      '<h2 class="bv-heading">' + esc(v.title) + '</h2>' +
      (v.description ? '<p class="bv-desc">' + esc(v.description) + '</p>' : '') +
      // P2-1：播放前展示体积与网络建议（单码率首版，多码率/HLS 为后续演进）
      '<p class="bv-datahint" role="note">' +
        (size ? '本视频约 ' + esc(size) + '。' : '') +
        '移动网络播放将消耗流量，建议在 Wi-Fi 环境下观看。' +
      '</p>' +
      '<div class="bv-video-wrap">' +
        '<video class="bv-video" controls playsinline preload="metadata"' +
          ' poster="' + esc(v.poster) + '"' +
          (v.title ? ' aria-label="' + esc(v.title) + '"' : '') +
          ' src="' + esc(v.file) + '">' +
          (captions ? '<track kind="subtitles" src="' + esc(captions) + '" srclang="zh" label="中文字幕" default>' : '') +
          '您的浏览器不支持内嵌视频，请<a href="' + esc(v.file) + '" download>下载观看</a>。' +
        '</video>' +
        '<p class="bv-error" hidden></p>' +
      '</div>' +
      // 署名行：CC 条目必须实际展示 attribution（附录 B 第 5 条）
      '<p class="bv-attribution">' +
        (v.license ? '<span class="bv-chip">授权：' + esc(v.license) + '</span>' : '') +
        (v.attribution ? '<span class="bv-attr-text">' + esc(v.attribution) + '</span>' : '') +
        (v.source
          ? '<a class="bv-source" href="' + esc(v.source) + '" target="_blank" rel="noopener noreferrer">查看授权与来源页</a>'
          : '') +
      '</p>' +
      (steps.length
        ? '<section class="bv-steps">' +
            '<h3 class="bv-steps-title">内容步骤（文字版）</h3>' +
            '<ol class="bv-steps-list">' +
              steps.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
            '</ol>' +
          '</section>'
        : '') +
      (dur ? '<p class="bv-duration">时长 ' + esc(dur) + '</p>' : '') +
    '</div>';
  }

  /* ── 事件绑定 ── */

  function _wire(target) {
    if (!target || typeof target.querySelector !== 'function') return;

    var grid = target.querySelector('.bv-grid');
    if (grid) {
      var open = function (el) {
        var id = el && el.getAttribute && el.getAttribute('data-video-id');
        if (!id) return;
        _showPlayer(target, id);
      };
      grid.addEventListener('click', function (e) {
        var card = e.target.closest ? e.target.closest('.bv-card') : null;
        if (card) open(card);
      });
      grid.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var card = e.target.closest ? e.target.closest('.bv-card') : null;
        if (card) { e.preventDefault(); open(card); }
      });
    }

    var back = target.querySelector('.bv-back');
    if (back) {
      back.addEventListener('click', function () { _showList(target); });
    }

    // F8：视频实体缺失时给出可见错误态文本（而非静默/抛异常）
    var video = target.querySelector('.bv-video');
    var errEl = target.querySelector('.bv-error');
    if (video && errEl) {
      video.addEventListener('error', function () {
        errEl.hidden = false;
        errEl.textContent = '视频加载失败：无法读取视频文件，请稍后重试或检查网络连接。';
      });
    }
  }

  function _showPlayer(target, id) {
    var v = null;
    for (var i = 0; i < _state.list.length; i++) {
      if (_state.list[i].id === id) { v = _state.list[i]; break; }
    }
    if (!v) { _showList(target); return; }
    _state.currentId = id;
    target.innerHTML = _pageShellHTML(_playerHTML(v));
    _wire(target);
    var video = target.querySelector('.bv-video');
    if (video && typeof video.focus === 'function') video.focus();
  }

  function _showList(target) {
    _state.currentId = null;
    target.innerHTML = _pageShellHTML(_listHTML(_state.list));
    _wire(target);
  }

  /* ── 路由入口 ── */

  async function initBioVideo(target) {
    if (!target) target = document.getElementById('page-content') || document.body;
    var list = await _loadVideos();
    if (_state.currentId) {
      var id = _state.currentId;
      _state.currentId = null; // _showPlayer 内部会重新赋值
      _showPlayer(target, id);
      return;
    }
    _showList(target);
    return list;
  }

  function renderBioVideoPage(target) {
    initBioVideo(target);
  }

  if (typeof window !== 'undefined') {
    window.initBioVideo = initBioVideo;
    window.renderBioVideoPage = renderBioVideoPage;
    // 测试钩子：供 tests/unit/bio-video.test.js 直接验证过滤与渲染逻辑
    window.__bioVideo = {
      loadVideos: _loadVideos,
      eligible: _eligible,
      listHTML: _listHTML,
      playerHTML: _playerHTML,
      formatSize: _formatSize,
      formatDuration: _formatDuration,
      esc: esc,
      _state: _state
    };
  }
})();
