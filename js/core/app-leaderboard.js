/**
 * TATABOX — 排行榜（弹窗 + 独立页面）
 * ------------------------------------------------------------
 * 数据源：public_profiles 公开视图（migration_v18 建立，v24 补充学习统计列）。
 * profiles 表自 v18 起禁止匿名直读，排行榜不再直连 profiles。
 *
 * 体验约定：
 * - 加载中用骨架屏，而不是一句干巴巴的「加载中」；
 * - 失败时明确区分「没人上榜」与「没加载出来」，并提供重试；
 * - 自动刷新只在弹窗可见、页面可见时进行，且数据没变就不重绘，避免闪烁；
 * - 当前用户所在行高亮，游客给出温和的登录提示。
 */

/** 当前排行榜 tab */
var _currentLbTab = 'bio';

/** 排行榜自动刷新定时器（弹窗打开期间每 10s 静默刷新，保证实时性） */
var _lbAutoRefreshTimer = null;

/** 排行榜页面自动刷新定时器（页面可见时每 10s 静默刷新） */
var _lbPageAutoRefreshTimer = null;

/** 上次渲染签名：自动刷新时数据没变就不重绘，避免闪屏 */
var _lbRenderSignatures = {};

/** 公开视图的统计列能力探测（v24 迁移后启用「练习量 / 签到」） */
var _lbStatsAvailable = null;
var _lbStatsCheckedAt = 0;
var _lbStatsProbePromise = null;
var _lbStatsRetry = 0;

/** 弹窗关闭后把焦点还给打开它的按钮 */
var _lbPreviousFocus = null;

window.showLeaderboard = showLeaderboard;
window.switchLbTab = switchLbTab;
window.refreshLeaderboard = refreshLeaderboard;
window.refreshLeaderboardPage = refreshLeaderboardPage;

function _lbScoreLabel(tab) {
  if (tab === 'practice') return '练习题数';
  if (tab === 'checkin') return '连续天数';
  return 'Bio 分';
}

function _lbItemScore(item, tab) {
  if (tab === 'practice') return Number(item.total_answered || item.practice_count || 0);
  if (tab === 'checkin') return Number(item.current_streak || 0);
  return Number(item.bio_score || 0);
}

function _lbSkeletonHtml() {
  var rows = '';
  for (var i = 0; i < 6; i++) {
    rows += '<div class="lb-skeleton-row" aria-hidden="true">' +
      '<span class="lb-skeleton-bar lb-skeleton-bar--rank"></span>' +
      '<span class="lb-skeleton-bar lb-skeleton-bar--name"></span>' +
      '<span class="lb-skeleton-bar lb-skeleton-bar--score"></span>' +
    '</div>';
  }
  return '<div class="lb-skeleton" role="status" aria-live="polite">' +
    '<span class="sr-only">正在加载排行榜</span>' + rows + '</div>';
}

function _lbErrorHtml(items, retryFnName, fallbackFnName) {
  var msg = (items && items._error) || '排行榜暂时不可用';
  var fallback = items && items._fallbackTab ? items._fallbackTab : null;
  var upgrading = items && items._errorCode === 'schema';
  var fallbackBtn = fallback
    ? '<button type="button" class="lb-btn" data-on=\'["' + fallbackFnName + '","' + fallback + '"]\'>先看 Bio 分榜</button>'
    : '';
  return '<div class="lb-feedback" role="status">' +
    '<div class="lb-feedback-mark" aria-hidden="true">' + (upgrading ? '…' : '!') + '</div>' +
    '<div class="lb-feedback-title">' + (upgrading ? '这个榜单还在升级' : '排行榜没加载出来') + '</div>' +
    '<div class="lb-feedback-hint">' + escapeHtml(msg) + '</div>' +
    '<div class="lb-feedback-actions">' +
      '<button type="button" class="lb-btn lb-btn--primary" data-on=\'["' + retryFnName + '"]\'>再试一次</button>' +
      fallbackBtn +
    '</div>' +
  '</div>';
}

function _lbUpdatedText(ts) {
  if (!ts) return '';
  try {
    var d = new Date(ts);
    var hh = ('0' + d.getHours()).slice(-2);
    var mm = ('0' + d.getMinutes()).slice(-2);
    return '已更新 ' + hh + ':' + mm;
  } catch (e) { return ''; }
}

function _lbSetStatus(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text || '';
}

/**
 * 探测公开视图是否已具备 total_answered / current_streak 列。
 * 不阻塞榜单加载，只用来提前告知「练习量 / 签到」是否已开放。
 */
function _lbProbeStats() {
  if (_lbStatsAvailable !== null && (Date.now() - _lbStatsCheckedAt) < 5 * 60 * 1000) {
    _lbApplyStatsNote();
    return Promise.resolve(_lbStatsAvailable);
  }
  if (_lbStatsProbePromise) return _lbStatsProbePromise;
  if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined') {
    // 首次进入时 Supabase 脚本可能还没就绪，短暂重试几次；服务本身没加载时
    // 排行榜会显示「服务未就绪」，这里无需无限轮询。
    if (_lbStatsRetry < 5) {
      _lbStatsRetry++;
      setTimeout(function () {
        if (_lbStatsAvailable === null) { _lbStatsCheckedAt = 0; _lbProbeStats(); }
      }, 1200);
    }
    return Promise.resolve(false);
  }
  _lbStatsRetry = 0;
  _lbStatsProbePromise = fetch(SUPABASE_URL + '/rest/v1/public_profiles?select=total_answered&limit=1', {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Accept': 'application/json'
    }
  }).then(function (res) {
    _lbStatsAvailable = !!res.ok;
    _lbStatsCheckedAt = Date.now();
    _lbStatsProbePromise = null;
    _lbApplyStatsNote();
    return _lbStatsAvailable;
  }).catch(function () {
    _lbStatsAvailable = false;
    _lbStatsCheckedAt = Date.now();
    _lbStatsProbePromise = null;
    _lbApplyStatsNote();
    return false;
  });
  return _lbStatsProbePromise;
}

function _lbApplyStatsNote() {
  var note = document.getElementById('lb-stats-note');
  if (note) note.hidden = !!_lbStatsAvailable;
}

function _lbStatsNoteHtml() {
  return '<p class="lb-stats-note" id="lb-stats-note" hidden>练习量 / 签到榜单即将开放，当前可先查看 Bio 分榜</p>';
}

function _lbSignature(items, tab) {
  var parts = [];
  for (var i = 0; i < items.length; i++) {
    parts.push((items[i].id || '') + ':' + (items[i].rank || '') + ':' + _lbItemScore(items[i], tab));
  }
  return parts.join('|') + '#' + (items._myRank || '') + '#' + (items._myValue || '');
}

/**
 * 渲染排行榜列表项（无 emoji）
 */
function renderLbItems(items, tabName) {
  var scoreLabel = _lbScoreLabel(tabName);
  var me = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
  var myId = me && me.id;

  var html = '<div class="lb-table-header">' +
    '<span class="lb-col-rank">#</span>' +
    '<span class="lb-col-name">用户</span>' +
    '<span class="lb-col-score">' + scoreLabel + '</span>';
  if (tabName === 'bio' || tabName === 'checkin') {
    html += '<span class="lb-col-grade">等级</span>';
  }
  html += '</div>';

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var rankClass = '';
    if (i === 0) rankClass = 'leaderboard-rank-1';
    else if (i === 1) rankClass = 'leaderboard-rank-2';
    else if (i === 2) rankClass = 'leaderboard-rank-3';
    var isMe = !!(myId && item.id === myId);

    var displayScore = String(_lbItemScore(item, tabName));

    html += '<div class="leaderboard-item' + (isMe ? ' is-me' : '') + '"' + (isMe ? ' aria-current="true"' : '') + '>' +
      '<span class="leaderboard-rank ' + rankClass + '">' + (item.rank || i + 1) + '</span>' +
      '<span class="leaderboard-name">' + escapeHtml(item.display_name || item.username || '匿名用户') +
        (isMe ? '<span class="leaderboard-me-tag">我</span>' : '') + '</span>' +
      '<span class="leaderboard-score">' + displayScore + '</span>';
    if (tabName === 'bio' || tabName === 'checkin') {
      html += '<span class="leaderboard-grade">' + (item.grade || '-') + '</span>';
    }
    html += '</div>';
  }

  return html;
}

/**
 * 渲染"我的位置"信息条
 */
function renderMyRank(rank, value, tabName) {
  var label = _lbScoreLabel(tabName);
  return '<div class="lb-my-rank">' +
    '<span>我的位置</span>' +
    '<strong>#' + rank + '</strong>' +
    (typeof value === 'number' && value > 0 ? '<span class="lb-my-rank-value">' + value + ' ' + label + '</span>' : '') +
  '</div>';
}

function _lbGuestHint() {
  return '<div class="lb-guest-hint">' +
    '<span>登录后可以查看自己的排名</span>' +
    '<button type="button" class="lb-btn lb-btn--small" data-on=\'["_cspShowAuth"]\'>登录</button>' +
  '</div>';
}

/**
 * 排行榜统一加载入口。
 * @param {string} tab - bio | practice | checkin
 * @param {Object} [opts] - { silent, force, scope:'modal'|'page' }
 */
async function _lbLoad(tab, opts) {
  opts = opts || {};
  var isPage = opts.scope === 'page';
  var listEl = document.getElementById(isPage ? 'lb-page-list' : 'lb-list');
  if (!listEl) return;
  var statusId = isPage ? 'lb-page-updated' : 'lb-updated';
  var retryName = isPage ? 'refreshLeaderboardPage' : 'refreshLeaderboard';
  var fallbackName = isPage ? 'switchLbPageTab' : 'switchLbTab';
  var sigKey = (isPage ? 'page:' : 'modal:') + tab;

  // 页面可能在 Supabase 脚本就绪前就完成首次渲染；等服务可用后补一次能力探测
  if (_lbStatsAvailable === null && typeof window.getLeaderboard === 'function') {
    _lbProbeStats();
  }

  if (!opts.silent) {
    listEl.innerHTML = _lbSkeletonHtml();
    listEl.setAttribute('aria-busy', 'true');
    _lbSetStatus(statusId, '正在更新…');
  }

  // 排行榜是公开数据，游客也可查看（仅未登录时不显示"我的排名"）
  try {
    var items = [];
    if (typeof window.getLeaderboard === 'function') {
      if (!opts.silent || opts.force) {
        if (typeof window.invalidateLeaderboardCache === 'function') {
          window.invalidateLeaderboardCache();
        }
      }
      items = await window.getLeaderboard(tab, 20);
    } else {
      return _lbLoadServiceMissing(listEl, statusId, retryName, fallbackName);
    }

    if (!items || items._error) {
      listEl.setAttribute('aria-busy', 'false');
      // 静默刷新失败时保留已有内容，避免把用户正在看的榜单替换成错误页
      if (opts.silent) {
        _lbSetStatus(statusId, '更新失败，稍后自动重试');
        return;
      }
      listEl.innerHTML = _lbErrorHtml(items, retryName, fallbackName);
      _lbSetStatus(statusId, (items && items._errorCode === 'schema') ? '榜单升级中' : '加载失败');
      return;
    }

    if (items.length === 0) {
      listEl.setAttribute('aria-busy', 'false');
      var emptyOpts = {
        title: '暂无排行数据',
        hint: '完成练习后即可上榜',
        action: {
          label: '去练习',
          onClick: function () { window.location.hash = '#/practice'; }
        }
      };
      if (window.BioQuest && typeof window.BioQuest.renderEmptyState === 'function') {
        window.BioQuest.renderEmptyState(listEl, emptyOpts);
      } else {
        listEl.innerHTML = '<div class="bq-empty-note">暂无排行数据<br><span style="font-size:0.78rem;color:#8a8a8a;">完成练习后即可上榜</span></div>';
      }
      _lbSetStatus(statusId, '暂无数据');
      return;
    }

    // 自动刷新且数据没变：只更新时间，不重绘列表
    var sig = _lbSignature(items, tab);
    if (opts.silent && _lbRenderSignatures[sigKey] === sig) {
      _lbSetStatus(statusId, _lbUpdatedText(items._updatedAt));
      return;
    }

    var loggedIn = (typeof window.isLoggedIn === 'function' && window.isLoggedIn());
    var html = renderLbItems(items, tab);
    if (items._myRank) {
      html += renderMyRank(items._myRank, items._myValue, tab);
    } else if (!loggedIn) {
      html += _lbGuestHint();
    } else if (!(items._myValue > 0)) {
      html += '<div class="lb-guest-hint"><span>完成一次练习，就能出现在榜单上</span>' +
        '<button type="button" class="lb-btn lb-btn--small" data-on=\'["navigateTo","/practice"]\'>去练习</button></div>';
    }
    listEl.innerHTML = html;
    listEl.setAttribute('aria-busy', 'false');
    _lbRenderSignatures[sigKey] = sig;
    _lbSetStatus(statusId, _lbUpdatedText(items._updatedAt || Date.now()));
  } catch (err) {
    listEl.setAttribute('aria-busy', 'false');
    if (opts.silent) {
      _lbSetStatus(statusId, '更新失败，稍后自动重试');
      return;
    }
    listEl.innerHTML = _lbErrorHtml({ _error: '排行榜暂时不可用，请稍后再试' }, retryName, fallbackName);
    _lbSetStatus(statusId, '加载失败');
    console.warn('[leaderboard] 渲染失败:', err && (err.message || err));
  }
}

function _lbLoadServiceMissing(listEl, statusId, retryName, fallbackName) {
  listEl.setAttribute('aria-busy', 'false');
  listEl.innerHTML = _lbErrorHtml({
    _error: '排行榜服务还没准备好，请刷新页面再试',
    _fallbackTab: 'bio'
  }, retryName, fallbackName);
  _lbSetStatus(statusId, '服务未就绪');
}

/**
 * 加载排行榜弹窗数据
 */
async function loadLbData(tabName, opts) {
  return _lbLoad(tabName, Object.assign({ scope: 'modal' }, opts || {}));
}

/**
 * 关闭排行榜弹窗
 */
function closeLeaderboard() {
  var modal = document.getElementById('leaderboard-modal');
  if (modal) modal.classList.remove('visible');
  document.body.style.overflow = '';
  // 关闭时停止定时刷新，避免无谓的循环拉取
  if (_lbAutoRefreshTimer) { clearInterval(_lbAutoRefreshTimer); _lbAutoRefreshTimer = null; }
  // 键盘用户：把焦点还给打开排行榜的按钮
  if (_lbPreviousFocus && document.contains(_lbPreviousFocus)) {
    try { _lbPreviousFocus.focus({ preventScroll: true }); } catch (e) {}
    _lbPreviousFocus = null;
  }
}

function refreshLeaderboard() {
  return loadLbData(_currentLbTab, { force: true });
}

function renderLeaderboardPage(target) {
  target.innerHTML = '<div class="lb-page-container">' +
    '<div class="lb-page-header">' +
      '<h2 class="lb-page-title">排行榜</h2>' +
      '<p class="lb-page-sub">每 10 秒自动更新 · 只展示公开的学习数据</p>' +
      '<div class="lb-tabs" id="lb-page-tabs">' +
        '<button class="lb-tab active" id="lb-page-tab-bio" data-on=\'["switchLbPageTab","bio"]\'>Bio 分</button>' +
        '<button class="lb-tab" id="lb-page-tab-practice" data-on=\'["switchLbPageTab","practice"]\'>练习量</button>' +
        '<button class="lb-tab" id="lb-page-tab-checkin" data-on=\'["switchLbPageTab","checkin"]\'>签到</button>' +
      '</div>' +
      '<div class="lb-meta">' +
        '<span class="lb-updated" id="lb-page-updated" aria-live="polite"></span>' +
        '<button type="button" class="lb-refresh" data-on=\'["refreshLeaderboardPage"]\'>刷新</button>' +
      '</div>' +
      _lbStatsNoteHtml() +
    '</div>' +
    '<div class="lb-page-body" id="lb-page-list">' +
      _lbSkeletonHtml() +
    '</div>' +
  '</div>';

  _currentLbTab = 'bio';
  _currentLbPageTab = 'bio';
  loadLbPageData('bio');
  _lbProbeStats();
  _startLbPageAutoRefresh();
}

function _startLbPageAutoRefresh() {
  if (_lbPageAutoRefreshTimer) clearInterval(_lbPageAutoRefreshTimer);
  _lbPageAutoRefreshTimer = setInterval(function () {
    if (document.hidden) return;
    if (!document.getElementById('lb-page-list')) {
      // 已离开排行榜页面：停止无意义的轮询
      clearInterval(_lbPageAutoRefreshTimer);
      _lbPageAutoRefreshTimer = null;
      return;
    }
    var modal = document.getElementById('leaderboard-modal');
    if (modal && modal.classList.contains('visible')) return;
    loadLbPageData(_currentLbPageTab, { silent: true });
  }, 10000);
}

var _currentLbPageTab = 'bio';

async function switchLbPageTab(tabName) {
  if (!tabName) return;
  _currentLbPageTab = tabName;

  var tabs = ['bio', 'practice', 'checkin'];
  for (var i = 0; i < tabs.length; i++) {
    var btn = document.getElementById('lb-page-tab-' + tabs[i]);
    if (btn) {
      btn.classList.toggle('active', tabs[i] === tabName);
      btn.setAttribute('aria-selected', tabs[i] === tabName ? 'true' : 'false');
    }
  }

  await loadLbPageData(tabName, { force: true });
}

async function loadLbPageData(tabName, opts) {
  return _lbLoad(tabName, Object.assign({ scope: 'page' }, opts || {}));
}

function refreshLeaderboardPage() {
  return loadLbPageData(_currentLbPageTab, { force: true });
}

/**
 * 显示排行榜弹窗（三 tab 版本：Bio 分 / 练习量 / 签到）
 */
async function showLeaderboard() {
  // 关闭移动端菜单
  if (typeof closeMobileMenu === 'function') closeMobileMenu();

  var existing = document.getElementById('leaderboard-modal');
  if (existing) {
    if (!existing.classList.contains('visible')) {
      _lbPreviousFocus = document.activeElement;
    }
    existing.classList.add('visible');
    document.body.style.overflow = 'hidden';
    _currentLbTab = _currentLbTab || 'bio';
    _lbProbeStats();
    await loadLbData(_currentLbTab, { force: true });
    _startLbAutoRefresh();
    return;
  }

  _lbPreviousFocus = document.activeElement;

  var overlay = document.createElement('div');
  overlay.id = 'leaderboard-modal';
  overlay.className = 'leaderboard-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'lb-modal-title');
  overlay.innerHTML = `
    <div class="leaderboard-box">
      <button class="lb-close" data-on='["closeLeaderboard"]' aria-label="关闭排行榜">&times;</button>
      <div class="lb-header">
        <div class="lb-title" id="lb-modal-title">排行榜</div>
        <div class="lb-tabs" role="tablist" aria-label="排行榜类型">
          <button class="lb-tab active" id="lb-tab-bio" role="tab" aria-selected="true" data-on='["switchLbTab","bio"]'>Bio 分</button>
          <button class="lb-tab" id="lb-tab-practice" role="tab" aria-selected="false" data-on='["switchLbTab","practice"]'>练习量</button>
          <button class="lb-tab" id="lb-tab-checkin" role="tab" aria-selected="false" data-on='["switchLbTab","checkin"]'>签到</button>
        </div>
        <div class="lb-meta">
          <span class="lb-updated" id="lb-updated" aria-live="polite"></span>
          <button type="button" class="lb-refresh" data-on='["refreshLeaderboard"]'>刷新</button>
        </div>
        ${_lbStatsNoteHtml()}
      </div>
      <div class="lb-body" id="lb-list" role="tabpanel">
        ${_lbSkeletonHtml()}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeLeaderboard();
  });

  setTimeout(function() { overlay.classList.add('visible'); }, 10);
  document.body.style.overflow = 'hidden';

  _currentLbTab = 'bio';
  await loadLbData('bio');
  _lbProbeStats();
  _startLbAutoRefresh();

  var closeBtn = overlay.querySelector('.lb-close');
  if (closeBtn) closeBtn.focus({ preventScroll: true });
}

function _startLbAutoRefresh() {
  if (_lbAutoRefreshTimer) clearInterval(_lbAutoRefreshTimer);
  _lbAutoRefreshTimer = setInterval(function () {
    if (document.hidden) return;
    var modal = document.getElementById('leaderboard-modal');
    if (!modal || !modal.classList.contains('visible')) return;
    loadLbData(_currentLbTab, { silent: true });
  }, 10000);
}

/**
 * 切换排行榜 tab
 * 同 tab 点击也强制刷新（此前直接 return，用户无法手动刷新，榜单表现"死"）
 */
async function switchLbTab(tabName) {
  if (!tabName) return;
  _currentLbTab = tabName;

  var tabs = ['bio', 'practice', 'checkin'];
  for (var i = 0; i < tabs.length; i++) {
    var btn = document.getElementById('lb-tab-' + tabs[i]);
    if (btn) {
      btn.classList.toggle('active', tabs[i] === tabName);
      btn.setAttribute('aria-selected', tabs[i] === tabName ? 'true' : 'false');
    }
  }

  var body = document.getElementById('lb-list');
  if (body) body.scrollTop = 0;

  await loadLbData(tabName, { force: true });
}

// 弹窗键盘支持：Esc 关闭；Tab 在弹窗内循环，避免焦点跑到背后的页面
document.addEventListener('keydown', function (e) {
  var modal = document.getElementById('leaderboard-modal');
  if (!modal || !modal.classList.contains('visible')) return;
  if (e.key === 'Escape') { closeLeaderboard(); return; }
  if (e.key !== 'Tab') return;

  var focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  var list = [];
  for (var i = 0; i < focusables.length; i++) {
    var el = focusables[i];
    if (!el.disabled && el.offsetParent !== null) list.push(el);
  }
  if (!list.length) return;
  var first = list[0];
  var last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

// 回到页面时静默刷新，避免长时间停留看到过期榜单
document.addEventListener('visibilitychange', function () {
  if (document.hidden) return;
  var modal = document.getElementById('leaderboard-modal');
  if (modal && modal.classList.contains('visible')) {
    loadLbData(_currentLbTab, { silent: true });
    return;
  }
  if (document.getElementById('lb-page-list')) {
    loadLbPageData(_currentLbPageTab, { silent: true });
  }
});

// 网络恢复时主动补一次刷新，让「加载失败」的榜单自动恢复
window.addEventListener('online', function () {
  var modal = document.getElementById('leaderboard-modal');
  if (modal && modal.classList.contains('visible')) {
    loadLbData(_currentLbTab, { force: true });
  } else if (document.getElementById('lb-page-list')) {
    loadLbPageData(_currentLbPageTab, { force: true });
  }
});

window.closeLeaderboard = closeLeaderboard;
window.renderLeaderboardPage = renderLeaderboardPage;
window.switchLbPageTab = switchLbPageTab;
window.loadLbData = loadLbData;
window.loadLbPageData = loadLbPageData;
