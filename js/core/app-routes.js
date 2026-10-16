/**
 * TATABOX — 路由配置表（P1-2 拆分：从 app.js 提取为独立文件）
 * 定义每个路由对应的页面标题和渲染函数。
 * 在 index.html 中必须先于 js/core/app.js 加载，app.js 内部通过全局 `Routes` 引用。
 */
const Routes = {
  '/': {
    title: '首页',
    module: 'home'
  },
  '/practice': {
    title: '练习',
    render: 'renderPracticePage',
    module: 'practice'
  },
  '/photo-quiz': {
    title: '拍照录题',
    render: 'renderPhotoQuizPage',
    module: 'photo-quiz'
  },
  '/exam': {
    title: '模拟考试',
    render: 'renderExamPage',
    module: 'exam'
  },
  '/analytics': {
    title: '学习分析',
    render: 'renderAnalyticsPage',
    module: 'analytics'
  },
  '/user': {
    title: '用户中心',
    render: 'renderUserPage',
    module: 'user',
    auth: true
  },
  '/privacy': {
    title: '隐私政策',
    module: 'privacy'
  },
  '/search': {
    title: '搜索',
    render: 'renderSearchPage',
    module: 'search'
  },
  '/admin': {
    title: '管理员后台',
    render: 'renderAdminPage',
    module: 'admin',
    auth: true
    // 注意：不再用 role: 'admin' 做路由门禁（会挡住持密钥的非 admin 账号）。
    // 管理页内部自己做身份验证：管理员密钥（服务端 RPC 校验）或管理员账号密码。
  },
  '/cards': {
    title: '知识卡片',
    render: 'renderCardsPage',
    module: 'cards'
  },
  '/community': {
    title: '社区',
    render: 'renderCommunityPage',
    module: 'community'
  },
  '/leaderboard': {
    title: '排行榜',
    render: 'renderLeaderboardPage',
    module: 'leaderboard'
  },
  '/points-leaderboard': {
    title: '信用排行榜',
    redirect: '/credit-leaderboard'
  },
  '/credit-leaderboard': {
    title: '信用排行榜',
    render: 'renderCreditLeaderboardPage',
    module: 'points-ui'
  },
  '/points-shop': {
    title: '信用中心',
    render: 'renderCreditCenterPage',
    module: 'points-ui'
  },
  '/credit': {
    title: '信用中心',
    render: 'renderCreditCenterPage',
    module: 'points-ui'
  },
  '/knowledge-graph': {
    title: '知识图谱',
    render: 'renderKnowledgeGraphPage',
    module: 'knowledge-graph'
  },
  '/diagnosis': {
    title: '学情诊断',
    render: 'renderSmartDiagnosisPage',
    module: 'smart-diagnosis',
    auth: true
  },
  '/pomodoro': {
    title: '专注模式',
    redirect: '/study'
  },
  '/habits': {
    title: '习惯养成',
    redirect: '/study'
  },
  '/review': {
    title: '错题与复盘',
    redirect: '/wrongbook'
  },
  '/bounties': {
    title: '问答悬赏',
    render: 'renderBountiesPage',
    module: 'bounty'
  },
  '/wrongbook': {
    title: '错题与复盘',
    render: 'renderWrongbookPage',
    module: 'wrongbook'
  },
  '/review-deep': {
    title: '错题与复盘',
    redirect: '/wrongbook'
  },
  '/study': {
    title: '学习管理',
    render: 'renderStudyPage',
    module: 'study'
  },
  '/bio-animation': {
    title: '生物过程动画',
    render: 'renderBioAnimationPage',
    module: 'bio-animation'
  },
  '/dashboard': {
    title: '仪表盘',
    render: 'renderDashboardPage',
    module: 'dashboard',
    auth: true
  },
  '/tutor': {
    title: 'AI 生物导师',
    render: 'renderTutorPage',
    module: 'tutor'
  },
  '/discussion': {
    title: '生物学家圆桌讨论',
    render: 'renderDiscussionPage',
    module: 'discussion'
  },
  '/bio-lab': {
    title: '虚拟生物实验室',
    render: 'renderBioLabPage',
    module: 'bio-lab'
  },
  '/phet-sims': {
    title: 'PhET 互动模拟实验',
    render: 'renderPhetSimsPage',
    module: 'phet-sims'
  },
  '/trends': {
    title: '学情趋势',
    render: 'renderTrendsPage',
    module: 'trends'
  },
  '/teacher': {
    title: '教师协同视图',
    render: 'renderTeacherPage',
    module: 'teacher'
  },
  // 注意：/classroom 路由已移除（模块不稳定已下线），保留显式 redirect 避免老书签白屏
  '/classroom': {
    title: '练习',
    redirect: '/practice'
  },
  '/learning-hub': {
    title: '学习管理中心',
    redirect: '/study',
    redirectFlag: 'lmc'
  },
  // —— 集成模块路由（对应 js/integrations/*.js，已在 index.html 中通过 defer 预加载） ——
  '/sketch': {
    title: '画板',
    render: 'renderSketchPadPage',
    module: 'sketch-pad'
  },
  '/smiles': {
    title: '分子结构 (SMILES)',
    render: 'renderSmilesPage',
    module: 'rdkit-viewer'
  },
  '/molecules': {
    title: '3D 分子查看',
    render: 'renderMoleculesPage',
    module: 'molecule-viewer'
  },
  '/genome': {
    title: '基因组浏览器',
    render: 'renderGenomeBrowserPage',
    module: 'genome-browser'
  },
  '/community-enhanced': {
    title: '社区（增强版）',
    render: 'renderCommunityEnhancedPage',
    module: 'community-enhanced'
  },
  '/daily-billion': {
    title: '每日亿题',
    render: 'renderDailyBillionPage',
    module: 'daily-billion'
  },
  '/data-lab': {
    title: '数据实验室',
    render: 'renderDataLabPage',
    module: 'score-calc'
  },
  '/bio-calc': {
    title: 'Bio 分计算器',
    render: 'renderBioCalcPage',
    module: 'bio-calc'
    // 独立页此前缺失（bio-calc.js 文件头宣称的 #/bio-calc 入口不存在），
    // 访问会被「未知路由」回退到首页 —— 这是"用户看不到 Bio 分计算器"的根因
  },
  '/reset-password': {
    title: '设置新密码',
    render: 'renderResetPasswordPage'
    // 邮件重置链接（Supabase Auth resetPasswordForEmail → redirectTo）的落地页。
    // 不加 auth 门禁：恢复会话是异步的，若此时按未登录拦截会把用户挡在"请先登录"页；
    // 提交时 Supabase 会自行校验恢复会话，无会话会返回明确错误。
  }
};