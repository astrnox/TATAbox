/**
 * ============================================================
 * TATABOX — 社区回帖通知
 * ----------------------------------------------------------------
 * 检测"有人回复了你的社区帖子"，实现：
 *   1. 收到回帖时屏幕右上角弹出通知卡片
 *   2. 在「我的 → 通知」中集中展示，并带未读角标
 * 数据存 localStorage（离线可用），识别"已处理"的回帖避免重复弹窗。
 * ============================================================
 */
(function () {
  'use strict';

  var NOTIF_KEY = 'bioquest_notifications';      // [{id, postId, postPreview, commenter, comment, time, read}]
  var HANDLED_KEY = 'bioquest_notified_comments'; // { commentId: true } 已处理过的回帖
  var POLL_MS = 60000;                            // 轮询间隔（登录后）

  function getNotifs() {
    try { return JSON.parse(localStorage.getItem(NOTIF_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveNotifs(list) {
    try { localStorage.setItem(NOTIF_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function getHandled() {
    try { return JSON.parse(localStorage.getItem(HANDLED_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveHandled(obj) {
    try { localStorage.setItem(HANDLED_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function _el(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  // 右上角通知卡片
  function showReplyPopup(notif) {
    if (!document.body) return;
    var toast = _el('div', 'bq-notify-popup');
    toast.innerHTML =
      '<div class="bq-notify-body">' +
        '<div class="bq-notify-title">' + escapeHtml(notif.commenter || '同学') + ' 回复了你</div>' +
        '<div class="bq-notify-post">' + escapeHtml(notif.postPreview || '你的帖子') + '</div>' +
        '<div class="bq-notify-comment">' + escapeHtml(notif.comment || '') + '</div>' +
      '</div>' +
      '<button class="bq-notify-close" aria-label="关闭">×</button>';
    document.body.appendChild(toast);

    var close = function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    };
    toast.querySelector('.bq-notify-close').addEventListener('click', close);
    setTimeout(close, 6000);

    // 点击通知跳转到社区
    toast.addEventListener('click', function (e) {
      if (e.target.closest('.bq-notify-close')) return;
      close();
      if (typeof window.navigateTo === 'function') {
        window.navigateTo('/community');
      } else if (window.location) {
        window.location.hash = '#/community';
      }
    });
  }

  // 查询评论者昵称
  function resolveCommenters(comments) {
    if (!comments || comments.length === 0) return Promise.resolve();
    var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
    if (!sb) return Promise.resolve();
    var ids = comments.map(function (c) { return c.author_id; }).filter(Boolean);
    if (ids.length === 0) return Promise.resolve();
    return sb.from('public_profiles').select('id, username, display_name').in('id', ids).then(function (res) {
      var map = {};
      (res.data || []).forEach(function (p) { map[p.id] = p; });
      comments.forEach(function (c) {
        var p = map[c.author_id];
        c.commenter = (p && (p.display_name || p.username)) || '同学';
      });
      return true;
    }).catch(function () { return true; });
  }

  // 核心：检测新回帖并触发通知
  function check() {
    if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) return Promise.resolve();
    var sb = (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
    if (!sb) return Promise.resolve();
    var user = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
    if (!user || !user.id) return Promise.resolve();

    return sb.from('community_posts')
      .select('id, content')
      .eq('author_id', user.id)
      .eq('is_deleted', false)
      .then(function (postRes) {
        var posts = postRes.data || [];
        var handled = getHandled();
        var notifs = getNotifs();
        var changed = false;
        var newOnes = [];

        var tasks = posts.map(function (post) {
          return sb.from('community_comments')
            .select('id, author_id, content, created_at')
            .eq('post_id', post.id)
            .eq('is_deleted', false)
            .neq('author_id', user.id)
            .then(function (cRes) {
              var comments = cRes.data || [];
              comments.forEach(function (c) {
                if (handled[c.id]) return;
                handled[c.id] = true;
                changed = true;
                var notif = {
                  id: c.id,
                  postId: post.id,
                  postPreview: (post.content || '').replace(/\s+/g, ' ').slice(0, 40),
                  commenterId: c.author_id,
                  commenter: '同学',
                  comment: (c.content || '').slice(0, 80),
                  time: c.created_at || new Date().toISOString(),
                  read: false
                };
                notifs.push(notif);
                newOnes.push(notif);
              });
            });
        });

        return Promise.all(tasks).then(function () {
          if (changed) {
            saveNotifs(notifs);
            saveHandled(handled);
          }
          return resolveCommenters(newOnes).then(function () {
            // 更新已存通知里的评论者昵称
            if (newOnes.length) {
              var all = getNotifs();
              newOnes.forEach(function (n) {
                for (var i = 0; i < all.length; i++) {
                  if (all[i].id === n.id) { all[i].commenter = n.commenter; break; }
                }
              });
              saveNotifs(all);
              newOnes.forEach(showReplyPopup);
            }
          });
        });
      })
      .catch(function () { /* 静默失败，不影响页面 */ });
  }

  function getList() { return getNotifs(); }
  function unreadCount() {
    return getNotifs().filter(function (n) { return !n.read; }).length;
  }
  function markAllRead() {
    var list = getNotifs();
    list.forEach(function (n) { n.read = true; });
    saveNotifs(list);
    return list;
  }
  function markRead(id) {
    var list = getNotifs();
    list.forEach(function (n) { if (String(n.id) === String(id)) n.read = true; });
    saveNotifs(list);
  }
  function clear() {
    saveNotifs([]);
  }

  // 自动轮询
  function start() {
    if (typeof window.isLoggedIn === 'function' && window.isLoggedIn()) check();
    setInterval(function () {
      if (typeof window.isLoggedIn === 'function' && window.isLoggedIn()) check();
    }, POLL_MS);
  }

  window.BioQuestNotifications = {
    check: check,
    getList: getList,
    unreadCount: unreadCount,
    markAllRead: markAllRead,
    markRead: markRead,
    clear: clear
  };

  if (document.readyState === 'complete') {
    setTimeout(start, 1200);
  } else {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 1200); });
  }
})();