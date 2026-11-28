/**
 * ============================================================
 * TATABOX — 信用中心 & 信用排行榜
 * 信用点（CR）是社区对用户信任程度的量化，不是经验值、也不是货币。
 * 通过符合社区期望的行为赢得信任，违规会扣减，信任增量也会随时间自然淡出。
 *
 * 数据口径（重要）：
 * - 登录用户：云端 profiles.points 是唯一权威值（服务端按 cr_logs 流水推导）；
 *   「我的」徽标、信用中心、信用排行榜全部读同一个来源，不再各算各的。
 * - 游客 / 离线：回退到本地 getPoints()，并明确标注「离线估值」，
 *   网络恢复后自动以云端为准。
 * ============================================================
 */
(function (root) {
  'use strict';

  var escapeHtml = root.escapeHtml; // 规范实现见 js/core/utils.js（Q-01 统一）

  var SNAPSHOT_TTL = 15000;
  var _creditSnapshot = null;
  var _creditSnapshotTs = 0;
  var _creditSnapshotPromise = null;

  // 与 credit-metrics.js / sb-gamify.js 保持一致的等级表；
  // 直接进入 /credit 时用户模块可能尚未加载，这里必须有本地兜底。
  var _CR_LEVELS = [
    { min: 0, label: '不受信任', title: '不受信任', color: '#c0553a' },
    { min: 20, label: '极低信任', title: '极低信任', color: '#d47030' },
    { min: 40, label: '有限信任', title: '有限信任', color: '#c49b30' },
    { min: 60, label: '基本信任', title: '基本信任', color: '#5a7d5c' },
    { min: 100, label: '高度信任', title: '高度信任', color: '#3a8c5c' },
    { min: 130, label: '极高信任', title: '极高信任', color: '#ffd700' }
  ];

  function _localLevel(scoreValue) {
    var total = (typeof scoreValue === 'number' && isFinite(scoreValue)) ? Math.max(0, scoreValue) : 0;
    var current = _CR_LEVELS[0];
    var next = null;
    for (var i = 0; i < _CR_LEVELS.length; i++) {
      if (total >= _CR_LEVELS[i].min) { current = _CR_LEVELS[i]; next = _CR_LEVELS[i + 1] || null; }
    }
    var span = Math.max(1, (next ? next.min : current.min) - current.min);
    var progress = next ? Math.min(1, Math.max(0, (total - current.min) / span)) : 1;
    return {
      label: current.label,
      title: current.title,
      color: current.color,
      min: current.min,
      nextAt: next ? next.min : null,
      progress: Math.round(progress * 1000) / 1000
    };
  }

  function _getBalance() {
    return (typeof root.getPoints === 'function') ? root.getPoints() : 60;
  }

  function _getLevel(pts) {
    var p = (typeof pts === 'number' && isFinite(pts)) ? pts : _getBalance();
    return (typeof root.getPointsLevel === 'function') ? root.getPointsLevel(p) : _localLevel(p);
  }

  function _round1(n) {
    return Math.round(n * 10) / 10;
  }

  function _makeSnapshot(points, source, error, reason) {
    var p = (typeof points === 'number' && isFinite(points)) ? _round1(Math.max(0, points)) : _round1(_getBalance());
    return {
      points: p,
      source: source || 'local',
      reason: reason || '',
      error: error || '',
      level: _getLevel(p),
      fetchedAt: Date.now()
    };
  }

  function _localSnapshot(reason, error) {
    return _makeSnapshot(_getBalance(), 'local', error, reason);
  }

  /**
   * 读取「我的信用」快照：云端优先，本地兜底，15s 内复用。
   * 「我的」页徽标与信用中心必须都调用这一个函数，保证两处数字一致。
   */
  function getMyCreditSnapshot(force) {
    if (!force && _creditSnapshot && (Date.now() - _creditSnapshotTs) < SNAPSHOT_TTL) {
      return Promise.resolve(_creditSnapshot);
    }
    if (_creditSnapshotPromise) return _creditSnapshotPromise;

    _creditSnapshotPromise = (async function () {
      var sb = (typeof root.getSupabase === 'function') ? root.getSupabase() : null;
      var me = (typeof root.getCurrentUser === 'function') ? root.getCurrentUser() : null;
      if (!sb || !me || !me.id || me.isGuest) {
        return _localSnapshot('guest');
      }
      try {
        var res = await sb.from('profiles').select('points').eq('id', me.id).maybeSingle();
        if (res && res.error) throw res.error;
        var d = res && res.data;
        var pts = d && d.points;
        if (typeof pts === 'string') pts = Number(pts);
        if (typeof pts === 'number' && isFinite(pts)) {
          return _makeSnapshot(pts, 'cloud');
        }
        // 云端没有 points 字段时，保留本地估算但不冒充云端
        return _localSnapshot('empty', '云端暂未返回信用数据');
      } catch (e) {
        return _localSnapshot('offline', e && e.message ? e.message : '云端连接失败');
      }
    })().then(function (snap) {
      _creditSnapshot = snap;
      _creditSnapshotTs = Date.now();
      _creditSnapshotPromise = null;
      return snap;
    }, function () {
      _creditSnapshotPromise = null;
      return _localSnapshot('offline');
    });

    return _creditSnapshotPromise;
  }

  /**
   * 信用明细：登录用户优先读云端 cr_logs（与 profiles.points 同一套流水），
   * 游客或读取失败时回退本地历史记录。
   */
  async function getMyCreditHistory() {
    var localHistory = function () {
      try {
        var d = (typeof root.getPointsDetail === 'function') ? root.getPointsDetail() : { history: [] };
        return d.history || [];
      } catch (e) { return []; }
    };
    var sb = (typeof root.getSupabase === 'function') ? root.getSupabase() : null;
    var me = (typeof root.getCurrentUser === 'function') ? root.getCurrentUser() : null;
    if (!sb || !me || !me.id || me.isGuest) {
      return { items: localHistory(), source: 'local', reason: 'guest' };
    }
    try {
      var res = await sb.from('cr_logs')
        .select('amount,reason,source,created_at')
        .eq('user_id', me.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (res && res.error) throw res.error;
      var items = (res && res.data ? res.data : []).map(function (row) {
        var amt = (typeof row.amount === 'number') ? row.amount : Number(row.amount);
        var ts = new Date(row.created_at).getTime();
        return {
          ts: isFinite(ts) ? ts : Date.now(),
          amount: isFinite(amt) ? amt : 0,
          reason: row.reason || row.source || '信用变动',
          note: row.source || ''
        };
      });
      return { items: items, source: 'cloud' };
    } catch (e) {
      return { items: localHistory(), source: 'local', reason: 'offline', error: e && e.message };
    }
  }

  function _renderHistory(history, source) {
    if (!history || history.length === 0) {
      // Issue #125：统一「温暖空状态」组件（加载失败时回退原有提示）
      if (root.BioQuest && typeof root.BioQuest.emptyStateHTML === 'function') {
        return root.BioQuest.emptyStateHTML({
          title: '暂无信用变动记录',
          hint: source === 'cloud'
            ? '答对题目、每日签到、发布帖子等行为会在这里留下记录'
            : '登录后可以查看云端的完整信用流水'
        });
      }
      return '<div style="text-align:center;padding:24px;color:var(--text-muted);">暂无信用变动记录</div>';
    }
    var REASONS = {
      ANSWER_CORRECT: '答对题目', ANSWER_WRONG: '答题鼓励', DAILY_LOGIN: '每日签到',
      POST: '发布帖子', COMMENT: '发表评论', SPAM: '违规扣减', BAD_SPEECH: '不当言论扣减',
      FALSE_REPORT_SINGLE: '异常举报扣减', FALSE_REPORT_REPEAT: '多次异常举报扣减',
      BOUNTY: '发布悬赏消耗', BOUNTY_ACCEPTED: '悬赏回答被采纳',
      practice_milestone: '刷题里程碑', online_time: '在线学习', daily_checkin: '每日打卡'
    };
    var fmtTime = function (ts) {
      try {
        var d = new Date(ts);
        var m = ('0' + (d.getMonth() + 1)).slice(-2);
        var day = ('0' + d.getDate()).slice(-2);
        var hh = ('0' + d.getHours()).slice(-2);
        var mm = ('0' + d.getMinutes()).slice(-2);
        return d.getFullYear() + '-' + m + '-' + day + ' ' + hh + ':' + mm;
      } catch (e) { return ''; }
    };
    var html = '<div style="display:flex;flex-direction:column;gap:8px;">';
    history.forEach(function (h) {
      var label = REASONS[h.reason] || h.reason || '信任变动';
      var amt = typeof h.amount === 'number' ? h.amount : (Number(h.amount) || 0);
      var color = amt >= 0 ? 'var(--color-success,#3a8c5c)' : 'var(--color-error,#c0553a)';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface-secondary,#faf7f2);border:1px solid var(--border-light,#ece8e1);border-radius:12px;gap:10px;flex-wrap:wrap;">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<span style="font-size:0.76rem;color:var(--text-muted);font-family:var(--font-mono,monospace);min-width:118px;">' + fmtTime(h.ts) + '</span>' +
          '<span style="font-size:0.85rem;color:var(--text-primary);">' + escapeHtml(label) + '</span>' +
        '</div>' +
        '<span style="font-size:0.9rem;font-weight:700;color:' + color + ';">' + (amt > 0 ? '+' : '') + _round1(amt) + '</span>' +
      '</div>';
    });
    html += '</div>';
    return html;
  }

  function _nextLevel(scoreValue) {
    var levels = (root.CR_V2 && root.CR_V2.LEVELS) || root.POINTS_LEVELS || _CR_LEVELS;
    for (var i = 0; i < levels.length; i++) {
      if (levels[i].min > scoreValue) return levels[i];
    }
    return null;
  }

  function _loadingHtml(text) {
    return '<div style="max-width:860px;margin:0 auto;padding:24px 20px 80px;">' +
      '<div style="height:24px;width:120px;border-radius:8px;background:rgba(120,140,128,0.14);margin-bottom:20px;"></div>' +
      '<div style="height:120px;border-radius:16px;background:rgba(120,140,128,0.1);margin-bottom:16px;"></div>' +
      '<div style="height:180px;border-radius:16px;background:rgba(120,140,128,0.08);"></div>' +
      '<p style="text-align:center;margin-top:16px;color:var(--text-muted);font-size:0.82rem;">' + escapeHtml(text || '正在同步信用数据…') + '</p>' +
    '</div>';
  }

  // 信用中心：展示信用指数、信任等级、信用变动明细（无任何商品兑换）
  function initCreditCenter(target) {
    if (!target) return;
    target.innerHTML = _loadingHtml('正在同步信用数据…');
    // 先取云端权威值再渲染，保证与排行榜、我的页同一口径
    Promise.all([getMyCreditSnapshot(true), getMyCreditHistory()]).then(function (out) {
      renderCreditCenter(target, out[0], out[1]);
    }).catch(function () {
      renderCreditCenter(target, _localSnapshot('offline'), { items: [], source: 'local' });
    });
  }

  function renderCreditCenter(target, snapshot, historyResult) {
    snapshot = snapshot || _localSnapshot('offline');
    historyResult = historyResult || { items: [], source: 'local' };
    var balance = snapshot.points;
    var level = snapshot.level || _getLevel(balance);
    var isCloud = snapshot.source === 'cloud';
    var next = _nextLevel(balance);
    var gap = next ? _round1(Math.max(0, next.min - balance)) : null;
    var sourceText = isCloud ? '云端已同步' : '离线估值';
    var sourceClass = isCloud ? 'credit-source--cloud' : 'credit-source--local';
    var sourceHint = isCloud
      ? '与「我的」页显示同一口径'
      : (snapshot.reason === 'guest'
        ? '登录后信用指数会与云端同步'
        : '暂时连不上云端，先显示本机估算；恢复后自动同步');

    var progressHtml = next
      ? '<div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:8px;">再获得 <strong>' + gap + '</strong> 信用指数，升至「' + escapeHtml(next.title) + '」</div>' +
        '<div class="credit-progress"><div style="width:' + Math.round(level.progress * 100) + '%;background:' + level.color + ';"></div></div>'
      : '<div style="font-size:0.9rem;color:var(--color-success,#3a8c5c);">已达最高信任等级</div>';

    var syncAction = (!isCloud && snapshot.reason !== 'guest')
      ? '<button type="button" class="credit-retry" data-on=\'["refreshCreditCenter"]\'>重新同步</button>'
      : '';

    target.innerHTML = '<div style="max-width:860px;margin:0 auto;padding:24px 20px 80px;">' +
      '<div class="credit-topbar">' +
        '<a href="#/user" class="credit-back">← 返回我的</a>' +
        '<span class="credit-source ' + sourceClass + '"><i aria-hidden="true"></i>' + sourceText + '</span>' +
      '</div>' +
      '<h1 style="margin:0 0 4px;font-family:var(--font-serif,serif);color:var(--color-deep);">信用中心</h1>' +
      '<p style="margin:0 0 16px;color:var(--text-muted);font-size:0.9rem;line-height:1.7;">信用指数（CR）衡量社区对你的信任：认真答题、每日签到、发布有帮助的内容会增加信任；违规会扣减，信任也会随时间自然淡出。</p>' +
      '<p class="credit-sync-note" role="status">' + escapeHtml(sourceHint) + syncAction + '</p>' +

      '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;">' +
        '<div style="flex:1;min-width:220px;background:var(--color-sage,#5a7d5c);color:#fff;border-radius:16px;padding:24px;box-shadow:var(--shadow-md);">' +
          '<div style="font-size:0.85rem;opacity:0.85;">当前信用指数</div>' +
          '<div style="font-size:2.4rem;font-weight:700;margin:4px 0;font-variant-numeric:tabular-nums;">' + balance + '</div>' +
          '<div style="font-size:0.9rem;opacity:0.95;">' + level.title + '</div>' +
        '</div>' +
        '<div style="flex:1;min-width:220px;background:var(--surface-primary,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:16px;padding:24px;box-shadow:var(--shadow-sm);">' +
          '<div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:8px;">信任等级进度</div>' +
          progressHtml +
        '</div>' +
      '</div>' +

      '<div style="background:var(--surface-primary,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:16px;padding:20px;box-shadow:var(--shadow-sm);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
          '<div style="font-size:1rem;font-weight:600;color:var(--color-deep,#1a3a2a);">信用变动明细' +
            '<span style="font-size:0.72rem;font-weight:400;color:var(--text-muted);margin-left:8px;">' + (historyResult.source === 'cloud' ? '云端流水' : '本地记录') + '</span>' +
          '</div>' +
          '<a href="#/credit-leaderboard" style="font-size:0.85rem;color:var(--color-sage,#5a7d5c);text-decoration:none;">信用排行榜 →</a>' +
        '</div>' +
        _renderHistory(historyResult.items, historyResult.source) +
      '</div>' +

      '<details class="credit-explain">' +
        '<summary>信用指数是怎么算的？</summary>' +
        '<p>基础信任 60 常驻，不会因为一段时间不活跃而消失；答题、签到、发布有帮助的内容会增加信任，违规会扣减。行为加分半衰期约 23 天，违规扣分半衰期约 7 天，所以一次失误不会长期压着信用。上限 200。</p>' +
        '<p>信用不是货币：评论、发帖等操作只设信用门槛，不会永久扣除信用。</p>' +
      '</details>' +
    '</div>';
  }

  function refreshCreditCenter() {
    var target = document.getElementById('page-content');
    if (target) initCreditCenter(target);
  }

  // getPointsLeaderboard 定义在 js/core/sb-gamify.js，而后者只在 Supabase SDK
  // 可用时由 app-auth 的加载链注入。SDK 缺失、链路中超时或个别脚本被限流时，
  // 榜单页会只剩「服务未加载」。这里补一次懒加载，失败再降级提示。
  function _ensurePointsService() {
    if (typeof root.getPointsLeaderboard === 'function') return Promise.resolve(true);
    if (root.__pointsServicePromise) return root.__pointsServicePromise;

    var loader = (typeof root.loadScriptOnce === 'function') ? root.loadScriptOnce : null;
    if (!loader) return Promise.resolve(false);

    var base = (typeof root.__jsBase === 'string') ? root.__jsBase : '';
    root.__pointsServicePromise = new Promise(function (resolve) {
      loader(base + 'js/core/sb-gamify.js?v=20261128a', {
        verify: function () { return typeof root.getPointsLeaderboard === 'function'; }
      }).then(function () {
        resolve(typeof root.getPointsLeaderboard === 'function');
      }).catch(function () {
        root.__pointsServicePromise = null;
        resolve(false);
      });
    });
    return root.__pointsServicePromise;
  }

  // 信用排行榜：按信用指数降序
  function initCreditLeaderboard(target) {
    if (!target) return;
    target.innerHTML = '<div class="bq-panel-narrow">加载信用排行…</div>';

    var fn = (typeof root.getPointsLeaderboard === 'function') ? root.getPointsLeaderboard : null;
    if (!fn) {
      _ensurePointsService().then(function (ok) {
        if (!ok) {
          target.innerHTML = '<div class="bq-panel-narrow">信用排行榜暂时无法连接，请检查网络后刷新重试</div>';
          return;
        }
        initCreditLeaderboard(target);
      });
      return;
    }

    fn(100).then(async function (list) {
      if (list && list._error) {
        target.innerHTML = '<div class="credit-error">' +
          '<div class="credit-error-title">信用排行榜没加载出来</div>' +
          '<div class="credit-error-hint">' + escapeHtml(list._error) + '</div>' +
          '<button type="button" class="credit-retry" data-on=\'["refreshCreditLeaderboard"]\'>再试一次</button>' +
        '</div>';
        return;
      }

      var me = (typeof root.getCurrentUser === 'function') ? root.getCurrentUser() : null;
      var myId = me ? me.id : null;
      // 与榜单同一数据源：云端 profiles.points（离线时明确为本地估值）
      var snapshot = await getMyCreditSnapshot();
      var myPoints = snapshot.points;

      var rows = (list || []).map(function (item, i) {
        var rankClass = String(i + 1);
        var rankColor = i === 0 ? 'var(--color-amber,#c4956a)' : (i < 3 ? 'var(--color-sage,#5a7d5c)' : 'var(--color-deep,#1a3a2a)');
        var isMe = myId && item.id === myId;
        var lv = item.level || { title: '基本信任', color: '#5a7d5c' };
        return '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:' + (isMe ? 'rgba(196,149,106,0.12)' : 'var(--surface-primary,#fff)') + ';border:1px solid ' + (isMe ? 'var(--color-amber,#c4956a)' : 'var(--border-light,#ece8e1)') + ';border-radius:12px;margin-bottom:8px;">' +
          '<span style="width:40px;font-size:1.2rem;font-weight:700;color:' + rankColor + ';text-align:center;">' + rankClass + '</span>' +
          '<span style="flex:1;font-size:0.95rem;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(item.display_name || item.username || '匿名用户') + (isMe ? '（我）' : '') + '</span>' +
          '<span style="font-size:0.8rem;color:' + lv.color + ';white-space:nowrap;">' + lv.title + '</span>' +
          '<span style="font-size:1rem;font-weight:700;color:var(--color-amber,#c4956a);min-width:70px;text-align:right;">' + item.points + '</span>' +
        '</div>';
      }).join('');

      var userInList = (list || []).some(function (item) { return myId && item.id === myId; });

      // Issue #125：榜单为空时展示统一空状态
      if (!rows) {
        if (root.BioQuest && typeof root.BioQuest.emptyStateHTML === 'function') {
          rows = root.BioQuest.emptyStateHTML({
            title: '暂无信用排行',
            hint: '答对题目、每日签到等行为会积累信用点，来成为社区最受信任的用户',
            action: {
              label: '去练习',
              onClick: function () { window.location.hash = '#/practice'; }
            }
          });
        } else {
          rows = '<div style="text-align:center;padding:40px 0;color:var(--text-muted);">暂无信用排行，完成练习即可上榜</div>';
        }
      }

      if (myId && !userInList) {
        var myLv = _getLevel(myPoints);
        rows += '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(196,149,106,0.12);border:1px solid var(--color-amber,#c4956a);border-radius:12px;margin-top:12px;">' +
          '<span style="width:40px;font-size:1.2rem;font-weight:700;color:var(--color-deep,#1a3a2a);text-align:center;">···</span>' +
          '<span style="flex:1;font-size:0.95rem;font-weight:600;color:var(--text-primary);">' + escapeHtml((me && (me.display_name || me.username)) || '我') + '（我）</span>' +
          '<span style="font-size:0.8rem;color:' + myLv.color + ';white-space:nowrap;">' + myLv.title + '</span>' +
          '<span style="font-size:1rem;font-weight:700;color:var(--color-amber,#c4956a);min-width:70px;text-align:right;">' + myPoints + '</span>' +
        '</div>';
      }

      var sourceNote = snapshot.source === 'cloud'
        ? '数据与信用中心、我的页一致'
        : '当前为离线估值，联网后自动同步';

      target.innerHTML = '<div style="max-width:760px;margin:0 auto;padding:24px 20px 80px;">' +
        '<a href="#/user" class="credit-back">← 返回我的</a>' +
        '<h1 style="margin:8px 0 4px;font-family:var(--font-serif,serif);color:var(--color-deep);">信用排行榜</h1>' +
        '<p style="margin:0 0 20px;color:var(--text-muted);font-size:0.9rem;">按社区信任指数排名 · ' + escapeHtml(sourceNote) + '</p>' +
        '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">' +
          '<a href="#/credit" style="padding:8px 18px;background:var(--surface-primary,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:16px;font-size:0.85rem;color:var(--color-sage,#5a7d5c);text-decoration:none;">信用中心 →</a>' +
        '</div>' +
        rows +
      '</div>';
    }).catch(function () {
      target.innerHTML = '<div class="credit-error">' +
        '<div class="credit-error-title">信用排行榜没加载出来</div>' +
        '<div class="credit-error-hint">请稍后再试</div>' +
        '<button type="button" class="credit-retry" data-on=\'["refreshCreditLeaderboard"]\'>再试一次</button>' +
      '</div>';
    });
  }

  function refreshCreditLeaderboard() {
    var target = document.getElementById('page-content');
    if (target) initCreditLeaderboard(target);
  }

  // 网络恢复后丢弃离线估值缓存，下一次读取自动回到云端
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('online', function () {
      _creditSnapshot = null;
      _creditSnapshotTs = 0;
      var hash = root.location && root.location.hash ? root.location.hash : '';
      if (hash.indexOf('#/credit-leaderboard') === 0) refreshCreditLeaderboard();
      else if (hash.indexOf('#/credit') === 0) refreshCreditCenter();
    });
  }

  // 从其它标签页/应用切回来时重新拉一次，避免长时间停留看到过期信用
  if (root.document && typeof root.document.addEventListener === 'function') {
    root.document.addEventListener('visibilitychange', function () {
      if (root.document.hidden) return;
      var hash = root.location && root.location.hash ? root.location.hash : '';
      if (hash.indexOf('#/credit') !== 0) return;
      _creditSnapshot = null;
      _creditSnapshotTs = 0;
      if (hash.indexOf('#/credit-leaderboard') === 0) refreshCreditLeaderboard();
      else refreshCreditCenter();
    });
  }

  root.getMyCreditSnapshot = getMyCreditSnapshot;
  root.getMyCreditHistory = getMyCreditHistory;
  root.initCreditCenter = initCreditCenter;
  root.initCreditLeaderboard = initCreditLeaderboard;
  root.refreshCreditCenter = refreshCreditCenter;
  root.refreshCreditLeaderboard = refreshCreditLeaderboard;
  // 兼容旧名（内部逻辑已改为信用中心，不再有商品兑换）
  root.initPointsShop = initCreditCenter;
  root.initPointsLeaderboard = initCreditLeaderboard;
})(typeof window !== 'undefined' ? window : null);
