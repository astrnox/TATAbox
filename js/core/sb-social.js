

async function getCommunityPosts(page, tag, sortBy) {
  var sb = getSupabase();
  if (!sb) return { posts: [], total: 0 };
  try {
    // 排序规则：
    //   推荐流：置顶优先 + 时间倒序（稳定：置顶帖常驻顶部，避免频繁跳位）
    //   热榜：纯按点赞倒序（热度驱动，低赞置顶帖不占据榜首，语义贴合「热榜」）
    var query = sb.from('community_posts')
      .select('id, author_id, content, tags, like_count, comment_count, is_pinned, is_deleted, created_at, updated_at', { count: 'exact' })
      .eq('is_deleted', false)
      .order(sortBy === 'hot' ? 'like_count' : 'is_pinned', { ascending: false });

    query = query.order('created_at', { ascending: false })
      .range((page - 1) * 7, page * 7 - 1);

    if (tag && tag !== '') {
      query = query.contains('tags', [tag]);
    }

    var mainRes = await query;
    if (mainRes.error) return { posts: [], total: 0 };
    var data = mainRes.data || [];
    var total = mainRes.count || data.length;

    // 过滤掉 null author_id（孤儿帖），避免后续 .in('id', null) 查询失败
    var authorIds = data.map(function(p) { return p.author_id; }).filter(function(id) { return id != null; });
    var postIds = data.map(function(p) { return p.id; });

    // 并行执行：作者信息 + 当前用户点赞 + 所有点赞计数
    var tasks = [];
    if (authorIds.length > 0) {
      tasks.push(sb.from('public_profiles')
        .select('id, username, display_name')
        .in('id', authorIds));
    }
    if (_currentUser && postIds.length > 0) {
      tasks.push(sb.from('community_post_likes')
        .select('post_id')
        .eq('user_id', _currentUser.id)
        .in('post_id', postIds));
    }
    if (postIds.length > 0) {
      tasks.push(sb.from('community_post_likes')
        .select('post_id')
        .in('post_id', postIds));
    }

    var results = tasks.length > 0 ? await Promise.all(tasks) : [];
    var profiles = results[0] && results[0].data ? results[0].data : [];
    var myLikes = (_currentUser && results[1] && results[1].data) ? results[1].data : [];
    var allLikes = (results.length > 0) ? (results[results.length - 1] && results[results.length - 1].data ? results[results.length - 1].data : []) : [];

    var authorMap = {};
    profiles.forEach(function(profile) { authorMap[profile.id] = profile; });

    var likedMap = {};
    myLikes.forEach(function(like) { likedMap[like.post_id] = true; });

    var likesCountMap = {};
    allLikes.forEach(function(like) {
      likesCountMap[like.post_id] = (likesCountMap[like.post_id] || 0) + 1;
    });

    var posts = data.map(function(p) {
      var author = authorMap[p.author_id] || { username: '匿名', display_name: '匿名用户' };
      return {
        id: p.id,
        author: {
          username: author.username || '匿名',
          display_name: author.display_name || '匿名用户'
        },
        content: p.content,
        tags: p.tags || [],
        likes: likesCountMap[p.id] || p.like_count || 0,
        comment_count: p.comment_count || 0,
        liked_by_me: likedMap[p.id] || false,
        created_at: p.created_at
      };
    });

    return { posts: posts, total: total };
  } catch (e) {
    return { posts: [], total: 0 };
  }
}


async function createCommunityPost(content, tags) {
  var sb = getSupabase();
  if (!sb || !_currentUser) return { ok: false, error: '未登录' };
  try {
    // 1. 不文明内容检测（零成本拦截）
    var check = isUncivilContent(content);
    if (check.uncivil) {
      await adjustUserPoints(POINTS_PENALTIES.uncivil_post.amount, POINTS_PENALTIES.uncivil_post.reason, { source: 'community' });
      // 自动生成申诉记录，方便用户误触时申请复核
      var appeal = await createCRAppeal({
        content: content,
        detected_word: check.word,
        amount: POINTS_PENALTIES.uncivil_post.amount,
        reason: POINTS_PENALTIES.uncivil_post.reason,
        source: 'community_post'
      });
      return {
        ok: false,
        error: '检测到不文明用语（' + check.word + '），已扣除 ' + Math.abs(POINTS_PENALTIES.uncivil_post.amount) + ' 信用',
        appeal_id: appeal && appeal.id ? appeal.id : null
      };
    }

    // 2. 检查发帖权限并消费信用
    var crInfo = await getUserPoints();
    var actionCheck = canPerformAction(crInfo.points, 'post');
    if (!actionCheck.ok) {
      return { ok: false, error: actionCheck.error };
    }
    await adjustUserPoints(-POINTS_ACTION_COSTS.post.cost, POINTS_ACTION_COSTS.post.reason, { source: 'post_cost' });

    var { error } = await sb.from('community_posts')
      .insert({
        author_id: _currentUser.id,
        content: content,
        tags: tags || []
      });
    return { ok: !error, error: error ? error.message : null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


async function togglePostLike(postId) {
  var sb = getSupabase();
  if (!sb || !_currentUser) return null;
  try {
    // 检查是否已点赞
    var { data: existing } = await sb.from('community_post_likes')
      .select('*')
      .eq('post_id', postId)
      .eq('user_id', _currentUser.id)
      .maybeSingle();

    if (existing) {
      // 取消点赞
      var { error: delError } = await sb.from('community_post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', _currentUser.id);
      if (delError) return null;
    } else {
      // 点赞
      var { error: insError } = await sb.from('community_post_likes')
        .insert({ post_id: postId, user_id: _currentUser.id });
      if (insError) return null;
    }

    // 重新计算点赞数（从 community_post_likes 表直接 count，避免 RLS 阻止更新 like_count）
    var { count } = await sb.from('community_post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);

    // 尝试更新 like_count（可能因 RLS 失败，但不影响功能）
    try {
      await sb.from('community_posts')
        .update({ like_count: count || 0 })
        .eq('id', postId);
    } catch (e) {
      // RLS 可能阻止非作者更新，忽略此错误
    }

    return { liked: !existing, likes: count || 0 };
  } catch (e) {
    return null;
  }
}


async function getPostComments(postId) {
  var sb = getSupabase();
  if (!sb) return { comments: [] };
  try {
    var { data, error } = await sb.from('community_comments')
      .select('id, author_id, content, is_deleted, created_at')
      .eq('post_id', postId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });
    
    if (error) return { comments: [] };

    // 获取作者信息
    var authorIds = data ? data.map(function(c) { return c.author_id; }) : [];
    var authorMap = {};
    if (authorIds.length > 0) {
      var { data: profiles } = await sb.from('public_profiles')
        .select('id, username, display_name')
        .in('id', authorIds);

      if (profiles) {
        profiles.forEach(function(profile) {
          authorMap[profile.id] = profile;
        });
      }
    }

    var comments = (data || []).map(function(c) {
      var author = authorMap[c.author_id] || { username: '匿名', display_name: '匿名用户' };
      return {
        id: c.id,
        author: {
          username: author.username || '匿名',
          display_name: author.display_name || '匿名用户'
        },
        content: c.content,
        created_at: c.created_at
      };
    });

    return { comments: comments };
  } catch (e) {
    return { comments: [] };
  }
}


/**
 * 批量获取多个帖子的评论（性能优化：替代“每帖 2 次请求”的 N+1 模式）。
 * 社区列表页一次性展示 7 帖时，原实现会发起 14 次请求，导致加载明显变慢；
 * 本函数用 1 次评论查询 + 1 次作者查询即可完成整页评论预载。
 * @param {string[]} postIds
 * @param {number} [limit] 全查询总上限（防御异常大帖），默认 300
 * @returns {Promise<{commentsByPost: Object<string, Array>}>}
 */
async function getCommentsForPosts(postIds, limit) {
  var sb = getSupabase();
  if (!sb || !Array.isArray(postIds) || postIds.length === 0) return { commentsByPost: {} };
  try {
    var cap = Math.min((typeof limit === 'number' && limit > 0) ? limit : 300, 500);
    var { data, error } = await sb.from('community_comments')
      .select('id, post_id, author_id, content, is_deleted, created_at')
      .in('post_id', postIds)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(cap);

    if (error) return { commentsByPost: {} };

    var authorIds = (data || []).map(function (c) { return c.author_id; }).filter(function (id) { return id != null; });
    var authorMap = {};
    if (authorIds.length > 0) {
      var { data: profiles } = await sb.from('public_profiles')
        .select('id, username, display_name')
        .in('id', authorIds);
      if (profiles) {
        profiles.forEach(function (profile) { authorMap[profile.id] = profile; });
      }
    }

    var commentsByPost = {};
    (data || []).forEach(function (c) {
      var author = authorMap[c.author_id] || { username: '匿名', display_name: '匿名用户' };
      if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = [];
      commentsByPost[c.post_id].push({
        id: c.id,
        author: {
          username: author.username || '匿名',
          display_name: author.display_name || '匿名用户'
        },
        content: c.content,
        created_at: c.created_at
      });
    });
    return { commentsByPost: commentsByPost };
  } catch (e) {
    return { commentsByPost: {} };
  }
}


async function addPostComment(postId, content) {
  var sb = getSupabase();
  if (!sb || !_currentUser) return { ok: false, error: '未登录' };
  try {
    // 1. 不文明内容检测（零成本拦截）
    var check = isUncivilContent(content);
    if (check.uncivil) {
      await adjustUserPoints(POINTS_PENALTIES.uncivil_comment.amount, POINTS_PENALTIES.uncivil_comment.reason, { source: 'community' });
      // 自动生成申诉记录
      var appeal = await createCRAppeal({
        content: content,
        detected_word: check.word,
        amount: POINTS_PENALTIES.uncivil_comment.amount,
        reason: POINTS_PENALTIES.uncivil_comment.reason,
        source: 'community_comment'
      });
      return {
        ok: false,
        error: '检测到不文明用语（' + check.word + '），已扣除 ' + Math.abs(POINTS_PENALTIES.uncivil_comment.amount) + ' 信用',
        appeal_id: appeal && appeal.id ? appeal.id : null
      };
    }

    // 2. 检查评论权限并消费信用
    var crInfo = await getUserPoints();
    var actionCheck = canPerformAction(crInfo.points, 'comment');
    if (!actionCheck.ok) {
      return { ok: false, error: actionCheck.error };
    }
    await adjustUserPoints(-POINTS_ACTION_COSTS.comment.cost, POINTS_ACTION_COSTS.comment.reason, { source: 'comment_cost' });

    var { error } = await sb.from('community_comments')
      .insert({
        post_id: postId,
        author_id: _currentUser.id,
        content: content
      });

    if (!error) {
      // 获取当前评论数
      var { data: postBefore } = await sb.from('community_posts')
        .select('comment_count')
        .eq('id', postId)
        .maybeSingle();
      var currentComments = postBefore ? postBefore.comment_count || 0 : 0;

      // 更新评论数
      await sb.from('community_posts')
        .update({ comment_count: currentComments + 1 })
        .eq('id', postId);
    }

    return { ok: !error, error: error ? error.message : null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

window.reportCommunityPost = reportCommunityPost;


// 暴露社区功能
window.getCommunityPosts = getCommunityPosts;

window.createCommunityPost = createCommunityPost;

window.togglePostLike = togglePostLike;

window.getPostComments = getPostComments;

window.getCommentsForPosts = getCommentsForPosts;

window.addPostComment = addPostComment;


/**
 * 举报帖子
 * 在 community_reports 表中插入一条记录
 * 表结构：id, post_id, reporter_id, reason, created_at
 * 需要先在 Supabase 执行 sql/migration_v5_reports.sql 创建表
 */
async function reportCommunityPost(postId, reason) {
  var sb = getSupabase();
  if (!sb || !_currentUser) return { ok: false, error: '请先登录' };
  try {
    var { error } = await sb.from('community_reports')
      .insert({
        post_id: postId,
        reporter_id: _currentUser.id,
        reason: reason || ''
      });
    if (error) {
      // 表不存在的错误（PGRST205 / 42P01）
      if (error.code === 'PGRST205' || (error.message && error.message.indexOf('relation') >= 0)) {
        return { ok: false, error: '举报功能未初始化，请管理员先执行 sql/migration_v5_reports.sql' };
      }
      // 重复举报（唯一约束冲突）
      if (error.code === '23505') {
        return { ok: false, error: '你已经举报过这篇帖子了' };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// 暴露到全局（本文件自有符号的导出，勿再集中到 supabase-client.js）
window.getCommunityPosts = getCommunityPosts;
window.createCommunityPost = createCommunityPost;
window.togglePostLike = togglePostLike;
window.getPostComments = getPostComments;
window.getCommentsForPosts = getCommentsForPosts;
window.addPostComment = addPostComment;
window.reportCommunityPost = reportCommunityPost;
