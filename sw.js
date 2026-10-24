/**
 * ============================================================
 * TATABOX - Service Worker（离线缓存）
 * 基于 PWA 标准，完全免费，无需任何后端服务
 * ============================================================
 */

// 版本号策略：CSS/JS 缓存与页面解耦（剥离 ?v= 参数匹配）。
// P1-4 修复：CACHE_VERSION 由 scripts/bump-sw.js 基于 git 跟踪的 js/css/data
// 内容哈希自动生成——修改任何 JS/CSS/data 后运行 `npm run bump:sw` 即可，
// 不再依赖人肉维护版本号。版本号变化会触发 activate 阶段清理旧缓存并重新预热。
var CACHE_VERSION = 'bioquest-9da0aabae2c1'; // ← bump-sw.js 会自动改写此行
var CACHE_NAME = 'bioquest-cache-' + CACHE_VERSION;

/* ========================================================================
 * Issue #16：题库 runtime cache（与外壳缓存分离）
 *  - data/*（manifest / bank / index / bioid-map）与 jsDelivr CDN 响应
 *    存入独立 DATA_CACHE，网络优先 + 离线回退；
 *  - 「检查更新」发现 manifest.rev 变化时可整体清空 DATA_CACHE 并重取，
 *    不影响应用外壳（避免"旧壳新数据"错位：外壳版本由 CACHE_VERSION 控制）。
 * ====================================================================== */
var DATA_CACHE_NAME = 'bioquest-data';

/* ========================================================================
 * 首屏缓存策略（修复"新用户首次加载很久/卡住/需要刷新"）
 * ------------------------------------------------------------------------
 * 旧方案：install 阶段 cache.addAll(150+ 文件)，含 7.7MB 字体 + quiz JSON
 *        → SW install 超时/中断 → 无 controller → 有时要刷新
 * 新方案：
 *   INSTALL 阶段只缓存"最小可运行骨架"（~15 个文件），几秒钟内必成功
 *   ACTIVATE 后 claim 完成 → message type='warmup' 分批异步预热其它资源
 *   大数据/字体/重型 vendor 一律走 Cache First 但不预缓存（首次是
 *   Network First，后续访问自动进缓存，不阻塞首屏）
 * ====================================================================== */

// 安装阶段只预缓存"最小骨架"——保证 install 快速成功，无需刷新即可用
var SKELETON_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  // 极简版（lite）整套入口：令牌 + 组件样式 + 单文件应用
  './lite.html',
  './css/tokens.css',
  './css/lite.css',
  './js/lite/lite-app.js',
  // 首屏同步渲染 CSS（不可异步，否则 FOUC）
  './css/globals.css',
  './css/layout.css',
  './css/header.css',
  './css/home.css',
  './css/learning-hub.css',
  // 初始化关键 JS（其余 defer 都靠网络命中后自然进缓存）
  './js/core/app.js',
  './js/core/auth-ui.js',
  './js/core/app-search.js',
  './js/core/app-leaderboard.js',
  './js/core/utils.js',
  './js/core/loader.js',
  './js/core/question-utils.js',
  './js/core/question-model.js',
  // 必要的小型基础依赖（运行时配置 / 数据压缩）
  './js/core/config.js',
  './js/vendor/lz-string.min.js',
  // 必要的 meta/小数据
  './data/_version.json',
  './data/cards.json',
  // lite 引擎与落盘依赖（小文件，保证 lite 离线可用）
  './js/vendor/ts-fsrs.umd.min.js',
  './js/algo/fsrs-algorithm.js',
  './js/core/question-utils.js',
  './js/core/record-session.js',
  './js/core/supabase.js',
  './js/core/sb-data.js'
];

// 激活后空闲预热：首屏常用功能文件 + 常用 CSS（quiz/practice 这种高频路由）
var WARMUP_PHASE_1 = [
  './css/footer.css',
  './css/quiz.css',
  './css/practice.css',
  './css/countdown.css',
  './css/analytics.css',
  './css/cards.css',
  './css/habits.css',
  './css/study.css',
  './css/user.css',
  './css/resources.css',
  './css/ebook.css',
  './css/announcements.css',
  './css/debug-fix.css',
  './css/phet-sims.css',
  './css/daily-billion.css',
  // 首页交互小文件（很快）
  './js/pages/onboarding.js',
  './js/engagement/badge-motifs.js',
  './js/core/error-recovery.js',
  './js/core/shortcut-panel.js',
  './js/core/sync-tabs.js',
  './js/core/cell-loader.js',
  './js/engagement/countdown.js',
  './js/engagement/soundscape.js',
  './js/engagement/social-impact.js',
  './js/pages/learning-hub.js',
  './js/core/micro-details.js',
  // Issue #105 / #123 / #128：通用交互小模块
  './js/core/offline-queue.js',
  './js/core/offline-status.js',
  './js/engagement/eggs.js',
  // 全站统一题图：渲染入口 + 查看器样式（Viewer.js 本体按需懒加载）
  './js/core/figure-viewer.js',
  './css/figure-viewer.css',
  // 打印工具（错题/练习/组卷 A4 打印，体积极小，预热保证按钮即点即用）
  './js/core/print-utils.js'
];

// 预热阶段 2：重型功能（quiz/exam/practice 等运行时库 + 数据）
// 注意：Issue #115 后不再默认全量预热；本列表保留供页面按需发动
// WARM_UP 消息（如进入 quiz 路由时拖动预热对应资源）使用，避免 idle 阶段全量抢占带宽。
var WARMUP_PHASE_2 = [
  // 路由核心
  './js/pages/quiz.js',
  './js/pages/practice.js',
  './js/pages/exam.js',
  './js/pages/dashboard.js',
  './js/pages/cards.js',
  './js/pages/study.js',
  './js/pages/review.js',
  './js/pages/review-deep.js',
  './js/pages/wrongbook.js',
  './js/pages/daily-question.js',
  './js/pages/habits.js',
  './js/pages/knowledge-graph.js',
  './js/ai/ai-diagnostic-engine.js',
  './js/ai/smart-diagnosis.js',
  './js/core/storage.js',
  './js/core/record-session.js',
  './js/core/supabase-client.js',
  './js/core/sb-gamify.js',
  './js/core/sb-social.js',
  './js/core/sb-data.js',
  './js/core/sb-study.js',
  './js/core/supabase.js',
  './js/pages/resources.js',
  './js/pages/ebook.js',
  './js/pages/trends.js',
  './js/pages/discussion.js',
  './js/pages/user.js',
  './js/pages/community.js',
  './js/pages/bounty.js',
  './js/pages/bio-lab.js',
  './js/pages/bio-video.js',
  './js/pages/phet-sims.js',
  './js/pages/photo-quiz.js',
  './js/pages/biology-history.js',
  './js/pages/tutor.js',
  './js/pages/teacher.js',
  './js/pages/classroom.js',
  './js/pages/classroom-player.js',
  './js/algo/fsrs-algorithm.js',
  './js/algo/fsrs-optimizer.js',
  './js/algo/irt-engine.js',
  './js/core/event-bus.js',
  './js/core/a11y-utils.js',
  './js/pages/classmate.js',
  './js/engagement/mood-tracker.js',
  './js/engagement/whiteboard.js',
  './js/ai/multi-agent.js',
  './js/ai/ai-client.js',
  './js/engagement/tts.js',
  // 数据（按需也能加载，预热只是让首次 quiz 更快）
  './data/quiz.json',
  './data/quiz_m1.json',
  './data/quiz_m2.json',
  './data/quiz_m3.json',
  './data/quiz_m4.json',
  './data/resources.json',
  './data/knowledge-graph.json',
  './data/logic_questions.json',
  './data/community.json',
  './data/videos.json'
];

// 这些"很重"的文件不做 install 预缓存，避免首次注册 SW 时 install 超时
// 它们靠首次访问时的网络自然进入 Cache First 缓存
var NEVER_PRECACHE = [
  './fonts/lxgw-wenkai.woff2',        // 7.7MB 字体
  './js/vendor/three.min.js',         // ~1MB Three.js
  './js/vendor/3Dmol-min.js',         // ~1MB 3Dmol
  './js/vendor/cytoscape.min.js',     // ~700KB
  './js/vendor/mermaid.min.js',       // ~2MB
  './js/vendor/pdf.min.js',
  './js/vendor/pdf.worker.min.js',
  './js/vendor/RDKit_minimal.js',
  './js/vendor/RDKit_minimal.wasm',
  './js/vendor/excalidraw.production.min.js',
  './js/vendor/react.production.min.js',
  './js/vendor/react-dom.production.min.js',
  './js/vendor/igv.min.js',
  './js/vendor/mammoth.browser.min.js',
  // 视频实体（单条最大 15MB）：绝不 install 预缓存，避免首次注册 SW 超时；
  // 首次播放时经 Cache First 自然进入缓存（见 data/videos.json 五要素清单）
  './videos/mitosis-cell-division.mp4',
  './videos/cd8-t-cell-mhc1.mp4',
  './videos/phagocytosis-leucocytes.mp4'
];

/**
 * 分批预热缓存，每批之间让出主线程：
 *  避免 SW 安装后一次性并发 150+ 请求 → 主页面资源下载被反压，
 *  也避免部分 HTTP/1.1 服务器把并发数打满而报错 499/503。
 *
 * Issue #115 修复：不再全量预取（原 WARMUP_PHASE_2 约 50+ 个 JS/数据文件），
 * 只预热"首屏/高频路由"常用文件（WARMUP_PHASE_1）。重型文件按使用量
 * 渐进式进入缓存——fetch 策略 3（CSS/JS 网络更新）与策略 2（data 网络优先）
 * 在用户实际访问对应页面时自然落缓存，避免 idle 阶段抢占带宽。
 * 需要主动预热时，页面可发消息 { type:'WARM_UP', urls:[...] } 按需拉取。
 */
function warmupCache() {
  caches.open(CACHE_NAME).then(function (cache) {
    var batches = [WARMUP_PHASE_1];
    var batchIdx = 0;
    function nextBatch() {
      if (batchIdx >= batches.length) return;
      var batch = batches[batchIdx++];
      // 每批最多 6 路并发，其余排队
      var i = 0;
      function runNext() {
        if (i >= batch.length) {
          // 下一批延迟到空闲后（500ms 让出主线程）
          setTimeout(nextBatch, 500);
          return;
        }
        var url = batch[i++];
        cache.add(url).catch(function () {
          // 预热失败直接忽略：不影响页面使用，下次访问会走网络
        }).then(function () {
          // 给主页面的 fetch 让出通道
          setTimeout(runNext, 16);
        });
      }
      var concurrency = Math.min(6, batch.length);
      for (var k = 0; k < concurrency; k++) runNext();
    }
    nextBatch();
  });
}

// ==================== 安装阶段：只预缓存最小骨架（秒级完成） ====================
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // 逐文件缓存，保证即便某一项 404/失败 也不影响整体 install 成功
      return Promise.all(SKELETON_ASSETS.map(function (url) {
        return cache.add(url).catch(function (e) {
          console.warn('[SW] 骨架资源跳过(非致命):', url, e && e.message);
        });
      }));
    }).then(function () {
      // 立刻跳过 waiting，保证刷新/新标签页立刻用新 SW（不再"要刷新才正常"）
      try { return self.skipWaiting(); } catch (e) { return Promise.resolve(); }
    })
  );
});

// ==================== 激活阶段：claim + 分批预热 ====================
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) {
          // Issue #16：DATA_CACHE 是题库 runtime cache，独立于外壳版本，
          // 外壳更新不应清空它（题库新旧由 manifest rev 校验管理，检查更新时可单独清）
          return k.indexOf('bioquest-cache-') === 0 && k !== CACHE_NAME;
        }).map(function (k) {
          return caches.delete(k).catch(function () {});
        })
      );
    }).then(function () {
      // 立即接管所有 clients，避免"首次加载后需要刷新才有 SW"
      if (self.clients && self.clients.claim) {
        try { return self.clients.claim(); } catch (e) { return Promise.resolve(); }
      }
      return Promise.resolve();
    }).then(function () {
      // claim 之后立刻启动异步预热（不阻塞 activate 事件完成）
      setTimeout(warmupCache, 1000);
    })
  );
});

// ==================== 请求拦截：Cache First + Network Fallback ====================

/* P1-4 逃生通道：缓存损坏时全清 + 硬刷新。
 * 若 Cache Storage 数据损坏导致 caches.match 抛错（表现为资源加载异常、
 * 反复 404/JSON 解析失败等灵异问题），清空全部缓存并强制刷新页面，
 * 避免"坏缓存"被反复命中。 */
function handleCacheCorruption() {
  console.warn('[SW] 检测到缓存损坏，清空全部缓存并硬刷新');
  return caches.keys().then(function (keys) {
    return Promise.all(
      keys.map(function (k) { return caches.delete(k).catch(function () {}); })
    );
  }).then(function () {
    try { self.skipWaiting(); } catch (e) {}
    if (self.clients && self.clients.matchAll) {
      return self.clients.matchAll({ type: 'window' }).then(function (clients) {
        clients.forEach(function (c) {
          if (c && c.navigate) { try { c.navigate(c.url); } catch (e) {} }
        });
      });
    }
    return Promise.resolve();
  });
}

// 缓存匹配的"安全包装"：match 抛错视为缓存损坏，走全清逃生通道
function safeCacheMatch(request) {
  return caches.match(request).catch(function () {
    return handleCacheCorruption();
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  // 忽略非 http(s) 请求
  var url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 策略 1: 页面导航 - 网络优先，回退到离线页面（Issue #16：断网刷新仍可用）
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, clone);
          });
          return response;
        })
        .catch(function () {
          return safeCacheMatch(request).then(function (cached) {
            if (cached) return cached;
            return caches.match('./index.html').then(function (shell) {
              return shell || new Response('<h1>离线</h1><p>暂无缓存，请联网后重试</p>', {
                status: 503,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
              });
            });
          });
        })
    );
    return;
  }

  // 策略 2（Issue #16）：题库/数据 JSON - 网络优先 + 独立 DATA_CACHE 回退
  // data/* 走 runtime cache（每次校验 manifest 的新鲜度由页面层 SHA 校验保证），
  // jsDelivr CDN URL 因含 commit 锚点天然不可变 → 缓存优先即可。
  if (url.pathname.endsWith('.json') || url.hostname === 'cdn.jsdelivr.net') {
    var isCdn = url.hostname === 'cdn.jsdelivr.net';
    // 缓存键归一化（与策略 3 CSS/JS 一致）：同源 JSON 剥离 ?v= 缓存破坏参数。
    // loader「检查更新」以 data/manifest.json?v=<时间戳> 拉新鲜 manifest，
    // 若按原始 URL 落缓存，每次检查都会在 DATA_CACHE 积累一条只差时间戳的条目。
    // 归一化后所有 ?v= 变体共享同一条目，离线回退也能命中预缓存的无参数版本。
    var dataUrl = new URL(request.url);
    dataUrl.search = '';
    var cacheKey = isCdn ? request : new Request(dataUrl.toString(), { mode: request.mode, credentials: request.credentials });
    event.respondWith(
      safeCacheMatch(cacheKey).then(function (cached) {
        // CDN 版本化 URL：缓存优先（长缓存）；同源 data JSON：网络优先
        if (isCdn && cached) return cached;
        return fetch(request).then(function (response) {
          if (response && response.ok) {
            var clone = response.clone();
            caches.open(isCdn ? DATA_CACHE_NAME : (url.pathname.indexOf('/data/') !== -1 ? DATA_CACHE_NAME : CACHE_NAME)).then(function (cache) {
              cache.put(cacheKey, clone);
            });
          }
          return response;
        }).catch(function () {
          return cached || new Response('{"error":"offline"}', {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // 策略 3: CSS/JS - stale-while-revalidate（缓存优先返回 + 后台刷新缓存）
  // 注意：index.html 中 CSS/JS 带 ?v= 缓存破坏参数，而 CORE_ASSETS 预缓存的是无参数版本。
  // 匹配与更新缓存时均使用无查询参数的 URL，确保预缓存命中并避免同一文件多个缓存条目。
  if (url.pathname.match(/\.(css|js)$/i)) {
    var assetUrl = new URL(request.url);
    assetUrl.search = '';
    var assetRequest = new Request(assetUrl.toString(), { mode: request.mode, credentials: request.credentials });
    event.respondWith(
      safeCacheMatch(assetRequest).then(function (cached) {
        // 后台网络刷新：成功后覆盖缓存（下一次访问即新版本）；失败时回退缓存副本。
        var networkFetch = fetch(request).then(function (response) {
          if (response && response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(assetRequest, clone);
            });
          }
          return response;
        }).catch(function () {
          return cached;
        });
        if (cached) {
          // 修复（略 P1-4 的纯 Cache First）：立即返回旧副本，同时触发 networkFetch
          // 后台更新缓存。原实现"命中缓存就完全不联网"，部署后新 HTML（网络优先）
          // 会配上旧 JS/CSS（缓存命中），boot/app-ready 链路新老混用，表现为
          // "加载动画卡 20%、遮罩消失后内容仍未加载"。SWR 让资源一次访问内收敛；
          // 断网时仍能命中缓存副本保持离线可用。
          networkFetch;
          return Promise.resolve(cached);
        }
        return networkFetch;
      })
    );
    return;
  }

  // 策略 4: 图片 - 缓存优先，永不更新
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i)) {
    event.respondWith(
      safeCacheMatch(request).then(function (cached) {
        return cached || fetch(request).then(function (response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, clone);
          });
          return response;
        }).catch(function () {
          return new Response('', { status: 404, statusText: 'Not Found' });
        });
      })
    );
    return;
  }

  // 策略 5: 其他资源 - 缓存优先
  event.respondWith(
    safeCacheMatch(request).then(function (cached) {
      return cached || fetch(request).then(function (response) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, clone);
        });
        return response;
      }).catch(function () {
        return cached;
      });
    })
  );
});

// ==================== 消息处理：手动触发更新 / 版本查询 / 题库缓存清理（Issue #16） ====================
function purgeDataCaches() {
  return caches.keys().then(function (keys) {
    return Promise.all(
      keys.filter(function (k) { return k === DATA_CACHE_NAME || k.indexOf('bioquest-data-') === 0; })
        .map(function (k) { return caches.delete(k).catch(function () {}); })
    );
  });
}

self.addEventListener('message', function (event) {
  var data = event.data;
  // 兼容旧协议：纯字符串 SKIP_WAITING
  if (data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (!data || typeof data !== 'object') return;

  // #137 应答助手：优先经请求携带的 MessageChannel port 点对点回包
  // （客户端 _sendSwMessage 通过 port1 监听应答；走 event.source.postMessage
  //  广播时客户端永远收不到，只能等 3s 超时兜底）；无 port 再回退广播兼容旧协议。
  function _reply(msg) {
    if (event.ports && event.ports[0]) {
      try { event.ports[0].postMessage(msg); return; } catch (e) {}
    }
    if (event.source) {
      try { event.source.postMessage(msg); } catch (e) {}
    }
  }

  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'GET_VERSION':
      // 「检查更新」：返回外壳版本，供 UI 比对展示
      _reply({ type: 'VERSION', version: CACHE_VERSION });
      break;
    case 'PURGE_DATA_CACHE':
      // 「检查更新」发现题库新版本：清空题库 runtime cache，页面重取后自然落新缓存
      event.waitUntil(purgeDataCaches().then(function () {
        _reply({ type: 'DATA_CACHE_PURGED' });
      }));
      break;
    case 'WARM_UP':
      // Issue #115：按需渐进式预热。页面在进入某个路由时发送：
      //   { type:'WARM_UP', urls:[相对路径...] } 或 { type:'WARM_UP', phase:2 }
      // SW 分批把资源写入外壳缓存（失败忽略）；不阻塞页面主流程。
      event.waitUntil((function () {
        var urls = (data.urls && data.urls.length) ? data.urls : (data.phase === 2 ? WARMUP_PHASE_2 : []);
        if (!urls.length) { _reply({ type: 'WARMED', count: 0 }); return Promise.resolve(); }
        return caches.open(CACHE_NAME).then(function (cache) {
          return Promise.all(urls.map(function (url) {
            return cache.add(url).catch(function () { /* 按需预热失败忽略 */ });
          }));
        }).then(function () {
          _reply({ type: 'WARMED', count: urls.length });
        });
      })());
      break;
    default:
      break;
  }
});
