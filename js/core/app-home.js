/**
 * TATABOX — 首页辅助与底部标签栏（M-01 自 app.js 拆分）
 * ------------------------------------------------------------
 * 由 index.html 在 app.js 之后以 defer 加载；doRouteRender / initApp 运行时调用。
 * 外部入口保持 window.reinitHomeComponents / window.updateBottomTabBar 等原名。
 * ============================================================
 */
'use strict';

function reinitHomeComponents() {
  const daysEl = document.getElementById('cd-days');
  const hoursEl = document.getElementById('cd-hours');
  const minsEl = document.getElementById('cd-mins');
  const secsEl = document.getElementById('cd-secs');

  // 倒计时复用 countdown.js 的唯一实现与唯一目标日期（init 幂等，内部自行清理旧定时器），
  // 避免在 app.js 再复制一份计算逻辑、也不在多处硬编码目标日期。
  if (daysEl || hoursEl || minsEl || secsEl) {
    if (window.BioQuestCountdown && typeof window.BioQuestCountdown.init === 'function') {
      window.BioQuestCountdown.init();
    }
  }

  // 首页「题库总量」动态化：与练习页「可用题目」保持同一口径
  // （模块精编题 manifest.total_questions + 逻辑推理题 logic_questions.json）。
  // 若只读 manifest.total_questions 会漏掉逻辑推理题，导致与练习页数字对不上。
  const statTotalQ = document.getElementById('statTotalQuestions');
  if (statTotalQ) {
    const countP = (typeof window.getPlayableQuestionCount === 'function')
      ? window.getPlayableQuestionCount()
      : (typeof window.getQuestionBankCount === 'function'
          ? window.getQuestionBankCount()
          : Promise.resolve(null));
    Promise.resolve(countP).then(function (n) {
      if (n && statTotalQ) statTotalQ.textContent = String(n);
    });
    statTotalQ.title = '可练题总数：模块精编题 + 逻辑推理题';
  }

  // 注：原此处调用 initHeroSketch()（首屏 35 个随机漂移粒子），已移除。
  // 首屏背景现为纯 CSS 静态层次，见 css/home.css 的 .hero-bg。

  // 初始化平滑滚动动画（全局，首屏可见元素立即触发动画）
  initScrollAnimations();

  // 标记首页渲染完成（Hero 画布 + 倒计时数字 + 滚动动画已启动）
  // 下一帧再确认高度>0，确保布局已写入，避免撤遮罩后"还没撑开页面 → 下拉卡一下"
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      var hero = document.getElementById('main-content') || document.querySelector('.hero');
      if (hero) {
        // 触发一次 reflow 读取，强制浏览器完成布局
        void hero.offsetHeight;
      }
      _AppState._homePaintedReady = true;
      // 若 finishRouting 已经执行过，则这里补发 app-ready 信号（解除遮罩等待）
      if (_AppState._homeRouteRendered && !_AppState._appReadyDispatched) {
        _AppState._appReadyDispatched = true;
        try { document.dispatchEvent(new CustomEvent('bioquest:app-ready')); } catch (e) {}
      }
    });
  });

  // 非关键模块延迟执行，避免阻塞首屏交互
  scheduleIdleWork(initNonCriticalHomeModules, { delay: 80 });
}

/**
 * 将任务调度到浏览器空闲时段执行
 * 优先使用 requestIdleCallback，不支持时使用 setTimeout(0) 兜底
 */
function scheduleIdleWork(fn, options) {
  options = options || {};
  var execute = function () {
    try {
      fn();
    } catch (e) {
      console.warn('[TATABOX] 空闲任务执行失败:', e);
    }
  };

  if (!options.immediate && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(execute, { timeout: options.timeout || 2000 });
  } else {
    setTimeout(execute, options.delay || 0);
  }
}
window.scheduleIdleWork = scheduleIdleWork;

/**
 * 初始化首页非关键模块
 * 每日一题、公告、生物学史时间轴、能力雷达、社区摘要等首屏下方内容
 * 在首屏渲染完成后再按需加载，不阻塞 DOMContentLoaded 后的交互
 */
function initNonCriticalHomeModules() {
  // 每日一题：首屏下方，按需渲染
  if (typeof window.renderDailyQuestion === 'function') {
    scheduleIdleWork(function () { window.renderDailyQuestion(); }, { delay: 50 });
  } else if (typeof window.loadModule === 'function') {
    window.loadModule('daily-question');
  }

  // 首页公告
  scheduleIdleWork(function () { loadHomeAnnouncements(); }, { delay: 100 });

  // 生物学史时间轴：由另一个 agent 负责添加 DOM，检测到容器后按需加载
  var bioSection = document.getElementById('biologyHistorySection');
  if (bioSection) {
    if (typeof window.initBiologyTimeline === 'function') {
      scheduleIdleWork(function () { window.initBiologyTimeline(bioSection); }, { delay: 120 });
    } else if (typeof window.loadModule === 'function') {
      window.loadModule('biology-history').then(function () {
        if (typeof window.initBiologyTimeline === 'function') {
          window.initBiologyTimeline(bioSection);
        }
      }).catch(function (err) {
        console.warn('[TATABOX] 生物学史模块加载失败:', err);
      });
    }
  }

  // 能力雷达：仅在 DOM 存在时加载
  var radarEl = document.getElementById('radarChart') || document.querySelector('[data-radar-chart]');
  if (radarEl && typeof window.loadModule === 'function') {
    window.loadModule('analytic');
  }

  // 社区摘要：仅在 DOM 存在时加载
  var communityEl = document.querySelector('[data-section="community-summary"]');
  if (communityEl && typeof window.loadModule === 'function') {
    window.loadModule('community');
  }
}
window.initNonCriticalHomeModules = initNonCriticalHomeModules;

/**
 * 加载首页公告
 */
var _announcementList = [];
var _announcementIndex = 0;

async function loadHomeAnnouncements() {
  var banner = document.getElementById('announcementBanner');
  if (!banner) return;

  try {
    var announcements = [];
    if (typeof window.getAnnouncements === 'function') {
      announcements = await window.getAnnouncements({ onlyActive: true, limit: 10 });
    }
    if (!announcements || announcements.length === 0) {
      banner.style.display = 'none';
      return;
    }
    _announcementList = announcements;
    _announcementIndex = 0;
    banner.style.display = 'block';
    showAnnouncementAtIndex(0);

    var nav = document.getElementById('announcementNav');
    if (announcements.length > 1 && nav) {
      nav.style.display = 'flex';
      document.getElementById('announcementPrev').onclick = function() {
        _announcementIndex = (_announcementIndex - 1 + _announcementList.length) % _announcementList.length;
        showAnnouncementAtIndex(_announcementIndex);
      };
      document.getElementById('announcementNext').onclick = function() {
        _announcementIndex = (_announcementIndex + 1) % _announcementList.length;
        showAnnouncementAtIndex(_announcementIndex);
      };
    }
  } catch (e) {
    banner.style.display = 'none';
  }
}

function showAnnouncementAtIndex(index) {
  var textEl = document.getElementById('announcementText');
  var counterEl = document.getElementById('announcementCounter');
  if (!textEl || !_announcementList[index]) return;
  var ann = _announcementList[index];
  var prefix = ann.is_pinned ? '[置顶] ' : '';
  textEl.textContent = prefix + ann.title + (ann.content ? ' | ' + ann.content.substring(0, 100) : '');
  textEl.style.animation = 'none';
  textEl.offsetHeight; // reflow
  textEl.style.animation = '';
  if (counterEl) {
    counterEl.textContent = (index + 1) + '/' + _announcementList.length;
  }
}

/**
 * 更新底部标签栏高亮状态
 * 液态玻璃外观：选中 tab 顶部覆盖一层高亮胶囊，切换时平滑滑动
 */
function updateBottomTabBar(route) {
  var bar = document.getElementById('bottomTabBar');
  if (!bar) return;
  var tabs = bar.querySelectorAll('.bottom-tab');
  if (!tabs || tabs.length === 0) return;

  // 路由到标签的映射
  var tabMap = {
    '/': 'home',
    '/practice': 'practice',
    '/exam': 'exam',
    '/dashboard': 'dashboard',
    '/user': 'user'
  };

  var activeName = tabMap[route] || '';
  var activeTab = null;
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].getAttribute('data-tab') === activeName) {
      activeTab = tabs[i];
      break;
    }
  }
  _setActiveBottomTab(activeTab);
}

/** 内部标记：胶囊是否已完成首次定位（首帧不做滑入动画） */
var _bottomGlowReady = false;
/** 内部标记：resize 监听已绑定 */
var _bottomGlowResizeBound = false;

/**
 * 将底部标签栏高亮胶囊移动到指定 tab（无匹配 tab 时仅移除高亮）
 * 供路由渲染与点击即时反馈共用：点击瞬间即更新，不等路由重新渲染
 */
function _setActiveBottomTab(activeTab) {
  var bar = document.getElementById('bottomTabBar');
  if (!bar) return;
  var tabs = bar.querySelectorAll('.bottom-tab');
  if (!tabs) return;

  for (var i = 0; i < tabs.length; i++) {
    if (activeTab && tabs[i] === activeTab) {
      tabs[i].classList.add('active');
    } else {
      tabs[i].classList.remove('active');
    }
  }

  if (!activeTab) {
    // 当前路由不在底部标签内（如 /leaderboard）：隐藏高亮胶囊
    bar.classList.remove('has-active');
    return;
  }
  _positionBottomTabGlow(activeTab);
}

/**
 * 定位液态玻璃高亮胶囊：跟随激活 tab 的位置与宽度
 * 首帧（bar 尚无可视胶囊）不做过渡动画，避免从左上角"飞"进来的跳动
 */
function _positionBottomTabGlow(activeTab) {
  var bar = document.getElementById('bottomTabBar');
  if (!bar || !activeTab) return;

  var glow = bar.querySelector('.bottom-tab-glow');
  if (!glow) {
    // 稳妥兜底：SW 缓存的旧 index.html 可能没有胶囊节点，动态补建
    glow = document.createElement('div');
    glow.className = 'bottom-tab-glow';
    glow.setAttribute('aria-hidden', 'true');
    bar.insertBefore(glow, bar.firstChild);
  }

  var x = activeTab.offsetLeft;
  var w = activeTab.offsetWidth;

  // 布局尚未就绪（首帧样式/字体未落定）：短暂重试，保证高亮胶囊最终可见
  if (!w && !glow._retryT) {
    glow._retryT = setTimeout(function () {
      glow._retryT = null;
      var cur = bar.querySelector('.bottom-tab.active');
      if (cur) _positionBottomTabGlow(cur);
    }, 250);
    return;
  }
  if (!w) return;

  if (!_bottomGlowReady) {
    // 首帧：禁止过渡，直接落位
    glow.style.transition = 'none';
    glow.style.left = x + 'px';
    glow.style.width = w + 'px';
    void glow.offsetWidth; // 强制 reflow 使定位生效后再启用过渡
    glow.style.transition = '';
    bar.classList.add('has-active');
    _bottomGlowReady = true;
  } else {
    glow.style.left = x + 'px';
    glow.style.width = w + 'px';
    if (!bar.classList.contains('has-active')) bar.classList.add('has-active');
  }

  if (!_bottomGlowResizeBound) {
    _bottomGlowResizeBound = true;
    var _resizeT;
    window.addEventListener('resize', function () {
      if (_resizeT) return;
      _resizeT = setTimeout(function () {
        _resizeT = null;
        var cur = bar.querySelector('.bottom-tab.active');
        if (cur) _positionBottomTabGlow(cur);
      }, 120);
    });
  }
}

/**
 * 初始化主页滚动动画
 * 使用 Intersection Observer 实现 section 入场动画
 */
function initScrollAnimations() {
  // 清理旧的 observer
  if (_AppState._scrollObserver) {
    _AppState._scrollObserver.disconnect();
  }

  // 为主页各区块添加 reveal 类
  var sections = document.querySelectorAll('[data-section]');
  for (var i = 0; i < sections.length; i++) {
    sections[i].classList.add('section-reveal');
  }

  // 为模块卡片添加子级 reveal
  var moduleBlocks = document.querySelectorAll('.module-block');
  for (var i = 0; i < moduleBlocks.length; i++) {
    moduleBlocks[i].classList.add('section-reveal-child');
    moduleBlocks[i].style.transitionDelay = (i * 0.08) + 's';
  }

  // 为统计项添加子级 reveal
  var statItems = document.querySelectorAll('.stat-item');
  for (var i = 0; i < statItems.length; i++) {
    statItems[i].classList.add('section-reveal-child');
    statItems[i].style.transitionDelay = (i * 0.1) + 's';
  }

  // 为流程步骤添加子级 reveal
  var processSteps = document.querySelectorAll('.process-step');
  for (var i = 0; i < processSteps.length; i++) {
    processSteps[i].classList.add('section-reveal-child');
    processSteps[i].style.transitionDelay = (i * 0.12) + 's';
  }

  _AppState._scrollObserver = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (entry.isIntersecting) {
        if (entry.target.classList.contains('section-reveal-child')) {
          entry.target.classList.add('section-reveal-child--visible');
        } else {
          entry.target.classList.add('section-reveal--visible');
        }
        // 区块可见后不再观察，但子元素继续观察以便 stagger
        if (!entry.target.classList.contains('section-reveal-child')) {
          _AppState._scrollObserver.unobserve(entry.target);
        }
      }
    }
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  // 观察所有目标元素
  var allReveals = document.querySelectorAll('.section-reveal, .section-reveal-child');
  for (var i = 0; i < allReveals.length; i++) {
    _AppState._scrollObserver.observe(allReveals[i]);
  }

  // 创建或更新滚动指示器
  setupScrollIndicator();
}

/**
 * 设置滚动指示器按钮
 */
function setupScrollIndicator() {
  var existing = document.getElementById('scrollIndicator');
  if (existing) return;

  var btn = document.createElement('button');
  btn.id = 'scrollIndicator';
  btn.className = 'scroll-down-indicator';
  btn.setAttribute('aria-label', '向下滚动');
  btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
  btn.addEventListener('click', function () {
    window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
  });
  document.body.appendChild(btn);

  // 监听滚动以显示/隐藏指示器
  var scrollTicking = false;
  window.addEventListener('scroll', function () {
    if (!scrollTicking) {
      requestAnimationFrame(function () {
        var scrollY = window.scrollY || window.pageYOffset;
        var docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (scrollY > 200 && scrollY < docHeight - 100) {
          btn.classList.add('scroll-down-indicator--visible');
        } else {
          btn.classList.remove('scroll-down-indicator--visible');
        }
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  }, { passive: true });
}

/**
 * 路由处理 — 根据当前路由渲染页面
 * @param {string} route - 路由路径
 */
var _routingInProgress = false;
var _pendingRoute = null;

/**
 * P0-1 路由访问检查：返回 { allowed } 或失败原因。
 * - auth:true  → 需已登录（含游客会话）
 * - role:'admin' → 需已登录且 user_group === 'admin'
 */

// M-01：显式挂载对外入口
window.reinitHomeComponents = reinitHomeComponents;
window.initNonCriticalHomeModules = initNonCriticalHomeModules;
window.updateBottomTabBar = updateBottomTabBar;

// 注册到全站唯一命名空间（window.BioQuest；旧全局别名保留）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.app = BQ.app || {};
  BQ.app.home = { reinitHomeComponents: reinitHomeComponents, initNonCriticalHomeModules: initNonCriticalHomeModules, updateBottomTabBar: updateBottomTabBar };
})();
