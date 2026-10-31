/**
 * TATABOX — 个人资料 / 账号 / 设置面板（M-01 自 user.js 拆分）
 * ============================================================
 */
'use strict';

function renderProfilePanel(container) {
  var username = '';
  var displayName = '';
  var group = 'guest';
  var email = '';
  var emailVerified = false;

  if (typeof getCurrentUser === 'function') {
    try {
      var user = getCurrentUser();
      if (user && typeof user === 'object') {
        username = user.username || user.email || '';
        displayName = user.displayName || user.display_name || username;
        email = user.email || '';
        group = user.group || user.role || 'guest';
        emailVerified = !!(user.emailVerified || user.email_verified);
      }
    } catch (e) {
      console.warn('[TATABOX] 获取用户信息失败:', e);
    }
  }

  var groupLabels = {
    admin: '管理员',
    premium: '高级会员',
    verified: '认证会员',
    member: '普通会员',
    guest: '访客'
  };
  var groupColors = {
    admin: '#c0553a',
    premium: '#c4956a',
    verified: '#3a8c5c',
    member: '#5a7d5c',
    guest: '#8a8a8a'
  };

  var groupLabel = groupLabels[group] || group;
  var groupColor = groupColors[group] || '#8a8a8a';

  // 信用指数（优先使用本地信用，稍后异步刷新云端）
  var points = (typeof window.getPoints === 'function') ? window.getPoints() : _POINTS_DEFAULTS.BASE;
  var levelInfo = (typeof window.getPointsLevel === 'function')
    ? window.getPointsLevel(points)
    : { label: '基本信任', title: '基本信任', color: '#5a7d5c' };
  var ptsPercent = levelInfo.nextAt ? Math.round(levelInfo.progress * 100) : 100;

  var upgradeHint = '';
  if (group === 'member') {
    upgradeHint = '<div style="font-size:0.82rem;color:var(--text-muted,#8a8a8a);margin-top:12px;padding:10px 14px;background:var(--surface-secondary,#faf7f2);border-radius:8px;border:1px solid var(--border-light,#ece8e1);">验证邮箱升级为认证会员</div>';
  } else if (group === 'verified') {
    upgradeHint = '<div style="font-size:0.82rem;color:var(--text-muted,#8a8a8a);margin-top:12px;padding:10px 14px;background:var(--surface-secondary,#faf7f2);border-radius:8px;border:1px solid var(--border-light,#ece8e1);">认证会员可访问学习分析等功能</div>';
  }

  var emailBadge = emailVerified
    ? '<span style="color:var(--color-success,#3a8c5c);font-size:0.82rem;">邮箱已验证</span>'
    : '<span style="color:var(--color-amber,#c4956a);font-size:0.82rem;cursor:pointer;" id="userVerifyEmailBtn">请验证邮箱</span>';

  container.innerHTML = `
    <div class="user-card" style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
      <div style="flex:1;min-width:200px;">
        <div style="font-family:var(--font-serif,'Noto Serif SC',serif);font-size:1.3rem;font-weight:700;color:var(--color-deep,#1a3a2a);margin-bottom:4px;">${escapeHtml(displayName || '用户')}</div>
        ${username && username !== displayName ? '<div style="font-size:0.82rem;color:var(--text-muted,#8a8a8a);margin-bottom:8px;">@' + escapeHtml(username) + '</div>' : ''}
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="display:inline-block;padding:3px 12px;border-radius:16px;font-size:0.78rem;font-weight:600;color:#fff;background:${groupColor};">${escapeHtml(groupLabel)}</span>
          ${emailBadge}
        </div>
        ${upgradeHint}
      </div>
      <div style="min-width:180px;flex:1;max-width:320px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary,#1a1a1a);">信用指数</span>
          <span style="font-size:0.85rem;font-weight:700;color:${levelInfo.color};" id="user-points-score">${points}</span>
        </div>
        <div style="height:8px;background:var(--border-light,#ece8e1);border-radius:16px;overflow:hidden;margin-bottom:6px;">
          <div id="user-points-bar" style="width:${ptsPercent}%;height:100%;background:${levelInfo.color};border-radius:16px;transition:width 0.4s ease;"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:0.78rem;color:var(--text-muted,#8a8a8a);" id="user-points-level">${levelInfo.title}</span>
          <span style="font-size:0.75rem;color:var(--text-muted,#8a8a8a);">信用</span>
        </div>
      </div>
    </div>
  `;

  // 异步刷新最新信用指数（云端为准）
  if (typeof window.getUserPoints === 'function') {
    window.getUserPoints().then(function(info) {
      if (!info || typeof info.points !== 'number') return;
      var scoreEl = document.getElementById('user-points-score');
      var barEl = document.getElementById('user-points-bar');
      var levelEl = document.getElementById('user-points-level');
      var lv = (typeof window.getPointsLevel === 'function') ? window.getPointsLevel(info.points) : null;
      if (scoreEl) scoreEl.textContent = info.points;
      if (barEl && lv) {
        barEl.style.width = (lv.nextAt ? Math.round(lv.progress * 100) : 100) + '%';
        barEl.style.background = lv.color;
      }
      if (levelEl && lv) levelEl.textContent = lv.title;
    }).catch(function() {});
  }

  var verifyBtn = document.getElementById('userVerifyEmailBtn');
  if (verifyBtn) {
    verifyBtn.addEventListener('click', function() {
      if (typeof window.resendConfirmationEmail === 'function') {
        window.resendConfirmationEmail(email);
        showToast('验证邮件已发送，请查收');
      } else {
        showToast('验证邮件功能暂不可用');
      }
    });
  }
}

function renderAccountActions(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="user-card-title">账户操作</div>
    <div class="user-card-subtitle">管理你的账户状态</div>
    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:16px;">
      <button id="userForceLogoutBtn" style="
        display:inline-flex;align-items:center;gap:8px;
        padding:12px 28px;border:1.5px solid var(--color-amber,#c4956a);border-radius:16px;
        background:transparent;color:var(--color-amber,#c4956a);
        font-size:0.9rem;font-weight:600;cursor:pointer;
        transition:all 0.2s ease;
      " data-on-mouseover='["_cspSetBg","rgba(196,149,106,0.08)"]' data-on-mouseout='["_cspSetBg","transparent"]'>
        永久退出登录
      </button>
      <button id="userDeleteAccountBtn" style="
        display:inline-flex;align-items:center;gap:8px;
        padding:12px 28px;border:1.5px solid var(--color-error,#c0553a);border-radius:16px;
        background:transparent;color:var(--color-error,#c0553a);
        font-size:0.9rem;font-weight:600;cursor:pointer;
        transition:all 0.2s ease;
      " data-on-mouseover='["_cspSetBg","rgba(192,85,58,0.08)"]' data-on-mouseout='["_cspSetBg","transparent"]'>
        注销账号
      </button>
    </div>
  `;

  document.getElementById('userForceLogoutBtn').addEventListener('click', function() {
    if (confirm('确定要永久退出登录吗？\n\n此操作将清除所有本地登录数据，下次使用需重新登录。')) {
      forceLogout();
    }
  });

  document.getElementById('userDeleteAccountBtn').addEventListener('click', function() {
    if (confirm('确定要注销账号吗？\n\n此操作不可恢复！将永久删除你的账户、学习记录、收藏和错题数据。\n\n建议先导出数据备份。')) {
      if (confirm('再次确认：注销后所有数据将永久丢失！')) {
        deleteAccount();
      }
    }
  });
}

function renderSettingsPanel(container) {
  const currentTheme = (typeof loadSetting === 'function') ? loadSetting('theme', 'light') : 'light';
  // 题库数据源：'cloud' 云端同步（默认）/ 'local' 本地题库（不发 Supabase 请求）
  const qSource = (typeof loadSetting === 'function') ? loadSetting('question_source', 'cloud') : 'cloud';
  var avatarUrl = (typeof getAvatarUrl === 'function') ? getAvatarUrl() : null;
  var avatarHtml = avatarUrl ? '<img src="' + avatarUrl + '" alt="头像">' : '';

  // 已保存的 API Key 配置
  var apiKeyConfig = _loadApiKeyConfig();
  var dailyUsage = _getApiKeyDailyUsage();

  container.innerHTML = `
    <div class="user-card">
      <div class="user-card-title">设置面板</div>
      <div class="user-card-subtitle">自定义你的学习体验</div>

      <div class="user-setting-row">
        <div>
          <div class="user-setting-label">主题切换</div>
          <div class="user-setting-desc">选择浅色、深色或跟随系统</div>
        </div>
        <select class="user-theme-select" id="userThemeSelect">
          <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>浅色模式</option>
          <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>深色模式</option>
          <option value="system" ${currentTheme === 'system' ? 'selected' : ''}>跟随系统</option>
        </select>
      </div>

      <div class="user-setting-row">
        <div>
          <div class="user-setting-label">字体大小</div>
          <div class="user-setting-desc">调整界面字体大小</div>
        </div>
        <select class="user-theme-select" id="userFontSize">
          <option value="small">小</option>
          <option value="medium" selected>中</option>
          <option value="large">大</option>
        </select>
      </div>

      <div class="user-setting-row">
        <div>
          <div class="user-setting-label">题库数据源</div>
          <div class="user-setting-desc">「本地题库」直接从站点内 data/ 读取题目，不发远程请求</div>
        </div>
        <select class="user-theme-select" id="userQuestionSource">
          <option value="cloud" ${qSource === 'cloud' ? 'selected' : ''}>云端同步</option>
          <option value="local" ${qSource === 'local' ? 'selected' : ''}>本地题库</option>
        </select>
      </div>
    </div>

    <!-- 头像上传（已迁移到设置） -->
    <div class="user-card">
      <div class="user-card-title">个人头像</div>
      <div class="user-card-subtitle">上传后会同步到云端（如已登录）</div>
      <div style="display:flex;align-items:center;gap:16px;margin-top:12px;">
        <label class="user-profile-avatar user-profile-avatar--lg" for="userAvatarInput" title="点击上传头像" style="width:72px;height:72px;cursor:pointer;flex-shrink:0;">
          ${avatarHtml}
          <span class="user-profile-avatar-cam" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </span>
          <input type="file" accept="image/jpeg,image/png,image/webp" id="userAvatarInput" style="display:none;">
        </label>
        <div style="flex:1;font-size:0.84rem;color:var(--text-secondary,#4a4a4a);line-height:1.6;">
          支持 JPEG / PNG / WebP，单张不超过 5MB。<br>
          点击左侧头像即可选择图片。
        </div>
      </div>
    </div>

    <!-- 自定义 AI API Key -->
    <div class="user-card">
      <div class="user-card-title">AI 模型 API Key（个人使用）</div>
      <div class="user-card-subtitle">自带 Key 可解锁 AI 导师、讨论、错题讲解等高级功能，仅你本人使用</div>

      <div class="user-setting-row" style="flex-direction:column;align-items:stretch;gap:10px;">
        <div>
          <div class="user-setting-label">服务商</div>
          <select class="user-theme-select" id="aiProviderSelect" style="width:100%;margin-top:6px;">
            <option value="deepseek" ${apiKeyConfig.provider === 'deepseek' ? 'selected' : ''}>DeepSeek（推荐 · 价格低）</option>
            <option value="zhipu" ${apiKeyConfig.provider === 'zhipu' ? 'selected' : ''}>智谱 GLM（免费额度大）</option>
            <option value="qwen" ${apiKeyConfig.provider === 'qwen' ? 'selected' : ''}>阿里通义千问</option>
            <option value="moonshot" ${apiKeyConfig.provider === 'moonshot' ? 'selected' : ''}>月之暗面 Kimi</option>
            <option value="nvidia" ${apiKeyConfig.provider === 'nvidia' ? 'selected' : ''}>NVIDIA NIM（1000 次免费）</option>
            <option value="siliconflow" ${apiKeyConfig.provider === 'siliconflow' ? 'selected' : ''}>硅基流动（多模型免费）</option>
          </select>
        </div>

        <div>
          <div class="user-setting-label">API Key</div>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <input type="password" id="aiApiKeyInput" placeholder="sk-..." value="${apiKeyConfig.apiKey ? (apiKeyConfig.apiKey.length > 4 ? '****' + apiKeyConfig.apiKey.slice(-4) : '****') : ''}" style="flex:1;padding:10px 12px;border:1px solid var(--border-light,#e3e0d8);border-radius:8px;font-size:0.88rem;font-family:var(--font-mono,monospace);background:var(--surface-primary,#fff);color:var(--text-primary,#1a1a1a);outline:none;" data-has-key="${apiKeyConfig.apiKey ? '1' : '0'}">
            <button id="aiKeyToggleBtn" class="btn btn-sm btn-secondary" style="padding:0 14px;">显示</button>
          </div>
        </div>

        <div>
          <div class="user-setting-label">模型名称（可选）</div>
          <input type="text" id="aiModelInput" placeholder="留空使用服务商默认推荐模型" value="${escapeHtml(apiKeyConfig.model || '')}" style="width:100%;margin-top:6px;padding:10px 12px;border:1px solid var(--border-light,#e3e0d8);border-radius:8px;font-size:0.84rem;background:var(--surface-primary,#fff);color:var(--text-primary,#1a1a1a);outline:none;">
        </div>

        <div>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--text-secondary,#4a4a4a);cursor:pointer;">
            <input type="checkbox" id="aiKeyRememberCb" ${apiKeyConfig.remember ? 'checked' : ''} style="accent-color:var(--color-sage,#5a7d5c);width:16px;height:16px;">
            <span>会话内记住 Key（刷新不丢失，关闭标签页自动清除）</span>
          </label>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
          <button class="btn btn-sm btn-primary" id="aiKeySaveBtn">保存</button>
          <button class="btn btn-sm btn-secondary" id="aiKeyTestBtn">测试连接</button>
          <button class="btn btn-sm btn-danger" id="aiKeyClearBtn">清除</button>
        </div>

        <div id="aiKeyTestResult" style="font-size:0.78rem;color:var(--text-muted,#8a8a8a);min-height:18px;"></div>

        <!-- 今日用量 -->
        <div style="padding:10px 12px;background:rgba(90,125,92,0.06);border-radius:8px;font-size:0.8rem;color:var(--text-secondary,#4a4a4a);">
          <strong>今日用量：</strong> ${dailyUsage.count} / ${_AI_DAILY_LIMIT} 次
          <div style="margin-top:6px;height:6px;background:rgba(0,0,0,0.08);border-radius:2px;overflow:hidden;">
            <div style="width:${Math.min(100, dailyUsage.count / _AI_DAILY_LIMIT * 100)}%;height:100%;background:${dailyUsage.count >= _AI_DAILY_LIMIT ? '#e53e3e' : 'var(--color-sage,#5a7d5c)'};transition:width .3s;"></div>
          </div>
          ${dailyUsage.count >= _AI_DAILY_LIMIT ? '<div style="color:var(--color-error,#c0553a);margin-top:6px;font-size:0.76rem;">今日额度已用完，明日 0:00 重置</div>' : ''}
        </div>

        <!-- 申请指引 -->
        <details style="margin-top:8px;border:1px solid var(--border-light,#ece8e1);border-radius:8px;padding:0;">
          <summary style="padding:10px 14px;cursor:pointer;font-size:0.84rem;font-weight:600;color:var(--color-sage,#3a6b4a);">如何免费申请 API Key？</summary>
          <div style="padding:0 14px 14px;font-size:0.8rem;line-height:1.75;color:var(--text-secondary,#4a4a4a);">
            <p class="bq-m-0 bq-mt-8 bq-mb-4"><strong>1. DeepSeek（推荐 · 性价比最高）</strong></p>
            <p class="bq-m-0 bq-mb-8">访问 <a href="https://platform.deepseek.com" target="_blank" class="bq-hint--amber">platform.deepseek.com</a> → 注册 → 顶部「API Keys」创建。新用户送 500 万 tokens 免费额度，1 元可买 100 万 tokens。模型填 <code class="bq-kbd">deepseek-chat</code></p>

            <p class="bq-m-0 bq-mt-8 bq-mb-4"><strong>2. 智谱 GLM（免费额度大）</strong></p>
            <p class="bq-m-0 bq-mb-8">访问 <a href="https://open.bigmodel.cn" target="_blank" class="bq-hint--amber">open.bigmodel.cn</a> → 注册 → 「API Keys」创建。新用户送 2000 万 tokens 免费额度。模型填 <code class="bq-kbd">glm-4-flash</code>（免费）或 <code class="bq-kbd">glm-4-plus</code></p>

            <p class="bq-m-0 bq-mt-8 bq-mb-4"><strong>3. 阿里通义千问</strong></p>
            <p class="bq-m-0 bq-mb-8">访问 <a href="https://dashscope.console.aliyun.com" target="_blank" class="bq-hint--amber">dashscope.console.aliyun.com</a> → 注册 → 「API-KEY 管理」。新用户送 100 万 tokens 免费额度。模型填 <code class="bq-kbd">qwen-turbo</code></p>

            <p class="bq-m-0 bq-mt-8 bq-mb-4"><strong>4. 月之暗面 Kimi</strong></p>
            <p class="bq-m-0 bq-mb-8">访问 <a href="https://platform.moonshot.cn" target="_blank" class="bq-hint--amber">platform.moonshot.cn</a> → 注册 → 「API Key 管理」。新用户送 15 元体验金。模型填 <code class="bq-kbd">moonshot-v1-8k</code></p>

            <p class="bq-m-0 bq-mt-8 bq-mb-4"><strong>5. NVIDIA NIM（1000 次免费）</strong></p>
            <p class="bq-m-0 bq-mb-8">访问 <a href="https://build.nvidia.com" target="_blank" class="bq-hint--amber">build.nvidia.com</a> → 注册 → 任选模型 → 右侧「Get API Key」。每个账号 1000 次免费调用，可调用 Llama 3.3 70B 等开源大模型。模型填 <code class="bq-kbd">meta/llama-3.3-70b-instruct</code></p>

            <p class="bq-m-0 bq-mt-8 bq-mb-4"><strong>6. 硅基流动 SiliconFlow（多模型免费）</strong></p>
            <p class="bq-m-0 bq-mb-8">访问 <a href="https://cloud.siliconflow.cn" target="_blank" class="bq-hint--amber">cloud.siliconflow.cn</a> → 注册 → 「API 密钥」。新用户送 14 元额度，Qwen2.5-7B 等小模型永久免费。模型填 <code class="bq-kbd">Qwen/Qwen2.5-7B-Instruct</code></p>

            <p style="margin:10px 0 4px;padding-top:8px;border-top:1px dashed var(--border-light,#ece8e1);"><strong>隐私说明</strong></p>
            <p style="margin:0;">API Key 仅保存在当前页面的内存中；若勾选「会话内记住」，会额外存入本标签页的 sessionStorage（关闭标签页即自动清除）。Key 不会上传服务器，也不会持久化到你浏览器的 localStorage 或磁盘，关闭浏览器后长期不留存。</p>

            <p style="margin:10px 0 4px;"><strong>用量限制</strong></p>
            <p style="margin:0;">为避免滥用，每个用户每日限 ${_AI_DAILY_LIMIT} 次 AI 调用，0:00 自动重置。自定义 Key 用户同样受此限制。</p>
          </div>
        </details>
      </div>
    </div>

    <!-- Bio 分计算器（六维 → Bio Score，随设置面板联动，主题复用站点变量） -->
    <div class="user-card">
      <div class="user-card-title">Bio 分计算器</div>
      <div class="user-card-subtitle">输入六维属性（0-100）实时推演 Bio Score 总分与评级，公式与评级规则 100% 公开</div>
      <div id="userBioCalcEmbed" class="bq-mt-12"></div>
    </div>
  `;

  // 主题切换
  document.getElementById('userThemeSelect').addEventListener('change', (e) => {
    const val = e.target.value;
    if (typeof saveSetting === 'function') {
      saveSetting('theme', val);
    }

    if (val === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (typeof toggleTheme === 'function') {
        toggleTheme(prefersDark ? 'dark' : 'light');
      }
    } else {
      if (typeof toggleTheme === 'function') {
        toggleTheme(val);
      }
    }

    showToast('主题已切换');
  });

  // 题库数据源切换（云端同步 / 本地题库）
  document.getElementById('userQuestionSource').addEventListener('change', (e) => {
    const val = e.target.value;
    if (typeof saveSetting === 'function') {
      saveSetting('question_source', val);
    }
    showToast(val === 'local' ? '已切换为本地题库，考试/练习将读取 data/ 题目' : '已切换为云端同步');
  });

  // 头像上传（设置页内）
  if (typeof setupAvatarUpload === 'function') {
    // 延迟一帧让 DOM 完全渲染
    setTimeout(setupAvatarUpload, 0);
  }

  // API Key 相关交互
  _bindApiKeySettings();

  // Bio 分计算器：懒加载共享模块（bio-calc + score-engine），幂等挂载
  var bioEmbed = document.getElementById('userBioCalcEmbed');
  function _mountBioCalc() {
    if (!bioEmbed) return;
    if (typeof window.renderBioCalcWidget === 'function') {
      window.renderBioCalcWidget(bioEmbed);
    } else if (typeof window.loadModule === 'function') {
      window.loadModule('bio-calc').then(function () {
        if (typeof window.renderBioCalcWidget === 'function') {
          window.renderBioCalcWidget(bioEmbed);
        }
      }).catch(function () {
        if (bioEmbed) {
          bioEmbed.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted,#8a8a8a);">计算器加载失败，请刷新页面重试。</p>';
        }
      });
    }
  }
  _mountBioCalc();
}

/* ============== AI API Key 管理 ============== */

window.renderProfilePanel = renderProfilePanel;
window.renderAccountActions = renderAccountActions;
window.renderSettingsPanel = renderSettingsPanel;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.user = BQ.user || {};
  BQ.user.profile = { renderProfilePanel: renderProfilePanel, renderAccountActions: renderAccountActions, renderSettingsPanel: renderSettingsPanel };
})();
