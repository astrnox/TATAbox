/**
 * ============================================================
 * TATABOX — 信用中心 & 信用排行榜
 * 信用点（CR）是社区对用户信任程度的量化，不是经验值、也不是货币。
 * 通过符合社区期望的行为赢得信任，消费信任以做出对社区影响更大的行为。
 * 依赖：user.js（getPoints/getPointsDetail/getPointsLevel）
 *       supabase-client.js（getPointsLeaderboard）
 * ============================================================
 */
(function (root) {
  'use strict';

  var escapeHtml = root.escapeHtml; // 规范实现见 js/core/utils.js（Q-01 统一）

  function _getBalance() {
    return (typeof root.getPoints === 'function') ? root.getPoints() : 100;
  }

  function _getLevel(pts) {
    var p = (typeof pts === 'number' && isFinite(pts)) ? pts : _getBalance();
    return (typeof root.getPointsLevel === 'function') ? root.getPointsLevel(p) : { label: '基本信任', title: '基本信任', color: '#5a7d5c' };
  }

  // 信用指数的权威值在云端 profiles.points —— 信用排行榜读的就是这个字段。
  // 本地 getPoints() 是「带衰减的离线模型」，两者口径不同，直接用本地值会让
  // 同一用户在信用中心和排行榜出现两个数字。登录态优先用云端值，未登录才回退本地。
  function _getCloudPoints() {
    return new Promise(function (resolve) {
      var fallback = _getBalance();
      try {
        var sb = (typeof root.getSupabase === 'function') ? root.getSupabase() : null;
        var me = (typeof root.getCurrentUser === 'function') ? root.getCurrentUser() : null;
        if (!sb || !me || !me.id || me.isGuest) { resolve(fallback); return; }
        sb.from('profiles').select('points').eq('id', me.id).maybeSingle().then(function (res) {
          var d = res && res.data;
          resolve((d && typeof d.points === 'number') ? Math.round(d.points * 10) / 10 : fallback);
        }).catch(function () { resolve(fallback); });
      } catch (e) {
        resolve(fallback);
      }
    });
  }

  function _renderHistory(history) {
    if (!history || history.length === 0) {
      // Issue #125：统一「温暖空状态」组件（加载失败时回退原有提示）
      if (root.BioQuest && typeof root.BioQuest.emptyStateHTML === 'function') {
        return root.BioQuest.emptyStateHTML({
          title: '暂无信用变动记录',
          hint: '答对题目、每日签到、发布帖子等行为会在这里留下记录'
        });
      }
      return '<div style="text-align:center;padding:24px;color:var(--text-muted);">暂无信用变动记录</div>';
    }
    var REASONS = {
      ANSWER_CORRECT: '答对题目', ANSWER_WRONG: '答题鼓励', DAILY_LOGIN: '每日签到',
      POST: '发布帖子', COMMENT: '发表评论', SPAM: '违规扣减', BAD_SPEECH: '不当言论扣减',
      FALSE_REPORT_SINGLE: '异常举报扣减', FALSE_REPORT_REPEAT: '多次异常举报扣减',
      BOUNTY: '发布悬赏消耗', BOUNTY_ACCEPTED: '悬赏回答被采纳'
    };
    var fmtTime = function (ts) {
      try {
        var d = new Date(ts);
        var m = ('0' + (d.getMonth() + 1)).slice(-2);
        var day = ('0' + d.getDate()).slice(-2);
        return d.getFullYear() + '-' + m + '-' + day;
      } catch (e) { return ''; }
    };
    var html = '<div style="display:flex;flex-direction:column;gap:8px;">';
    history.forEach(function (h) {
      var label = REASONS[h.reason] || h.reason || '信任变动';
      var amt = typeof h.amount === 'number' ? h.amount : 0;
      var color = amt >= 0 ? 'var(--color-success,#3a8c5c)' : 'var(--color-error,#c0553a)';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface-secondary,#faf7f2);border:1px solid var(--border-light,#ece8e1);border-radius:12px;gap:10px;flex-wrap:wrap;">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<span style="font-size:0.78rem;color:var(--text-muted);font-family:var(--font-mono,monospace);min-width:80px;">' + fmtTime(h.ts) + '</span>' +
          '<span style="font-size:0.85rem;color:var(--text-primary);">' + escapeHtml(label) + '</span>' +
        '</div>' +
        '<span style="font-size:0.9rem;font-weight:700;color:' + color + ';">' + (amt > 0 ? '+' : '') + amt + '</span>' +
      '</div>';
    });
    html += '</div>';
    return html;
  }

  // 信用中心：展示信用指数、信任等级、信用变动明细（无任何商品兑换）
  function initCreditCenter(target) {
    if (!target) return;
    // 先取云端权威值再渲染，保证与排行榜同一口径
    _getCloudPoints().then(function (balance) {
      renderCreditCenter(target, balance);
    });
  }

  function renderCreditCenter(target, balance) {
    var level = _getLevel(balance);
    var detail = (typeof root.getPointsDetail === 'function') ? root.getPointsDetail() : { history: [] };

    target.innerHTML = '<div style="max-width:860px;margin:0 auto;padding:24px 20px 80px;">' +
      '<h1 style="margin:0 0 4px;font-family:var(--font-serif,serif);color:var(--color-deep);">信用中心</h1>' +
      '<p style="margin:0 0 20px;color:var(--text-muted);font-size:0.9rem;">信用点（CR）由社区其他成员的投票产生：发布优质内容、给出有帮助的回答会获得信用点；信用点越高，你的发言对其他人的影响越大。</p>' +

      '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;">' +
        '<div style="flex:1;min-width:220px;background:var(--color-sage,#5a7d5c);color:#fff;border-radius:16px;padding:24px;box-shadow:var(--shadow-md);">' +
          '<div style="font-size:0.85rem;opacity:0.85;">当前信用指数</div>' +
          '<div style="font-size:2.4rem;font-weight:700;margin:4px 0;">' + balance + '</div>' +
          '<div style="font-size:0.9rem;opacity:0.95;">' + level.title + '</div>' +
        '</div>' +
        '<div style="flex:1;min-width:220px;background:var(--surface-primary,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:16px;padding:24px;box-shadow:var(--shadow-sm);">' +
          '<div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:8px;">信任等级进度</div>' +
          (level.nextAt
            ? '<div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:8px;">提升至 <strong>' + level.nextAt + '</strong> 信用指数</div>' +
              '<div style="height:8px;background:var(--border-light,#ece8e1);border-radius:16px;overflow:hidden;">' +
                '<div style="width:' + Math.round(level.progress * 100) + '%;height:100%;background:' + level.color + ';border-radius:16px;"></div>' +
              '</div>'
            : '<div style="font-size:0.9rem;color:var(--color-success,#3a8c5c);">已达最高信任等级</div>') +
        '</div>' +
      '</div>' +

      '<div style="background:var(--surface-primary,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:16px;padding:20px;box-shadow:var(--shadow-sm);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
          '<div style="font-size:1rem;font-weight:600;color:var(--color-deep,#1a3a2a);">信用变动明细</div>' +
          '<a href="#/credit-leaderboard" style="font-size:0.85rem;color:var(--color-sage,#5a7d5c);text-decoration:none;">信用排行榜 →</a>' +
        '</div>' +
        _renderHistory(detail.history) +
      '</div>' +
    '</div>';
  }

  // 信用排行榜：按信用指数降序
  function initCreditLeaderboard(target) {
    if (!target) return;
    target.innerHTML = '<div class="bq-panel-narrow">加载信用排行...</div>';

    var fn = (typeof root.getPointsLeaderboard === 'function') ? root.getPointsLeaderboard : null;
    if (!fn) {
      target.innerHTML = '<div class="bq-panel-narrow">信用排行榜服务未加载</div>';
      return;
    }

    fn(100).then(async function (list) {
      var me = (typeof root.getCurrentUser === 'function') ? root.getCurrentUser() : null;
      var myId = me ? me.id : null;
      // 与榜单同一数据源：云端 profiles.points
      var myPoints = await _getCloudPoints();

      var rows = (list || []).map(function (item, i) {
        var rankClass = String(i + 1);
        var rankColor = i === 0 ? 'var(--color-amber,#c4956a)' : (i < 3 ? 'var(--color-sage,#5a7d5c)' : 'var(--color-deep,#1a3a2a)');
        var isMe = myId && item.id === myId;
        var lv = item.level || { title: '基本信任', color: '#5a7d5c' };
        return '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:' + (isMe ? 'rgba(196,149,106,0.12)' : 'var(--surface-primary,#fff)') + ';border:1px solid ' + (isMe ? 'var(--color-amber,#c4956a)' : 'var(--border-light,#ece8e1)') + ';border-radius:12px;margin-bottom:8px;">' +
          '<span style="width:40px;font-size:1.2rem;font-weight:700;color:' + rankColor + ';text-align:center;">' + rankClass + '</span>' +
          '<span style="flex:1;font-size:0.95rem;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(item.display_name || item.username || '匿名用户') + '</span>' +
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
        var myLv = (typeof root.getPointsLevel === 'function') ? root.getPointsLevel(myPoints) : { title: '基本信任', color: '#5a7d5c' };
        rows += '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(196,149,106,0.12);border:1px solid var(--color-amber,#c4956a);border-radius:12px;margin-top:12px;">' +
          '<span style="width:40px;font-size:1.2rem;font-weight:700;color:var(--color-deep,#1a3a2a);text-align:center;">···</span>' +
          '<span style="flex:1;font-size:0.95rem;font-weight:600;color:var(--text-primary);">' + escapeHtml((me && (me.display_name || me.username)) || '我') + '</span>' +
          '<span style="font-size:0.8rem;color:' + myLv.color + ';white-space:nowrap;">' + (myLv.icon ? myLv.icon + ' ' : '') + myLv.title + '</span>' +
          '<span style="font-size:1rem;font-weight:700;color:var(--color-amber,#c4956a);min-width:70px;text-align:right;">' + myPoints + '</span>' +
        '</div>';
      }

      target.innerHTML = '<div style="max-width:760px;margin:0 auto;padding:24px 20px 80px;">' +
        '<h1 style="margin:0 0 4px;font-family:var(--font-serif,serif);color:var(--color-deep);">信用排行榜</h1>' +
        '<p style="margin:0 0 20px;color:var(--text-muted);font-size:0.9rem;">按社区信任指数排名 · 可靠行为会持续累积信任</p>' +
        '<div style="display:flex;gap:10px;margin-bottom:16px;">' +
          '<a href="#/credit" style="padding:8px 18px;background:var(--surface-primary,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:16px;font-size:0.85rem;color:var(--color-sage,#5a7d5c);text-decoration:none;">信用中心 →</a>' +
        '</div>' +
        rows +
      '</div>';
    }).catch(function () {
      target.innerHTML = '<div class="bq-panel-narrow">排行榜加载失败，请稍后重试</div>';
    });
  }

  root.initCreditCenter = initCreditCenter;
  root.initCreditLeaderboard = initCreditLeaderboard;
  // 兼容旧名（内部逻辑已改为信用中心，不再有商品兑换）
  root.initPointsShop = initCreditCenter;
  root.initPointsLeaderboard = initCreditLeaderboard;
})(typeof window !== 'undefined' ? window : null);