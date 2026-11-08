/**
 * TATABOX — AI 生物课堂入口页（M-01 自 app.js 拆分）
 * ------------------------------------------------------------
 * 由 index.html 在 app.js 之后以 defer 加载；window.renderClassroomPage 保持原入口。
 * 运行期依赖 app.js / app-routes 的全局（navigateTo、openClassroomPlayer 等）。
 * ============================================================
 */
'use strict';

/**
 * AI 生物课堂入口页（v3.1）
 * 提供话题输入 + 推荐话题 + 一键生成课堂
 */
function renderClassroomPage(target) {
  // 推荐话题（覆盖联赛核心考点）
  var recommended = [
    { topic: '光合作用的光反应与暗反应', kgNodeId: 'photosynthesis' },
    { topic: '减数分裂与遗传规律', kgNodeId: 'meiosis' },
    { topic: 'DNA 复制的半保留机制', kgNodeId: 'dna' },
    { topic: '细胞呼吸的能量转化', kgNodeId: 'respiration' },
    { topic: '神经冲动的传导机制', kgNodeId: 'membrane' },
    { topic: '基因表达：转录与翻译', kgNodeId: 'transcription' }
  ];

  var cardsHtml = recommended.map(function (r, i) {
    return '<button class="cls-topic-card" data-topic="' + _escapeHtmlAttr(r.topic) + '" data-kg="' + _escapeHtmlAttr(r.kgNodeId) + '">'
      + '<span class="cls-topic-name">' + r.topic + '</span>'
      + '<span class="cls-topic-arrow">→</span>'
      + '</button>';
  }).join('');

  target.innerHTML = [
    '<div class="cls-page">',
    '  <div class="cls-page-header">',
    '    <h1 class="cls-page-title">AI 生物课堂</h1>',
    '    <p class="cls-page-subtitle">输入任意生物主题，AI 老师将为你生成 6 段式沉浸课堂：导入 → 讲解 → 模拟 → 讨论 → 测验 → 项目</p>',
    '  </div>',
    '  <div class="cls-input-row">',
    '    <input type="text" id="cls-topic-input" placeholder="例如：酶的竞争性抑制、C4 植物光合途径..." />',
    '    <button id="cls-start-btn">生成课堂</button>',
    '  </div>',
    '<div class="cls-section-label">或从推荐话题开始：</div>',
    '  <div class="cls-topic-grid">' + cardsHtml + '</div>',
    '  <div class="cls-ai-hint" id="cls-ai-hint"></div>',
    '  <div class="cls-mode-row" style="display:flex;align-items:center;gap:8px;margin-top:16px;padding:12px;background:#f8f9fa;border-radius:8px;font-size:13px;color:#666;flex-wrap:wrap;">',
    '    <span>课堂生成模式：</span>',
    '    <label><input type="radio" name="cls-mode" value="outline" checked /> 6 段式（v3.1 推荐）</label>',
    '    <label><input type="radio" name="cls-mode" value="v4" /> v4.0 4 段深化（[ACTION:] 标签流）</label>',
    '    <label><input type="radio" name="cls-mode" value="omaic" /> OpenMAIC 6 步进度</label>',
    '    <label><input type="radio" name="cls-mode" value="dsl" /> OpenMAIC DSL（完整 Slide）</label>',
    '    <span style="margin-left:auto;color:#999;">v4.0 模式：4 段课堂 + AI 老师输出含 [ACTION:] 标签驱动动画/图谱/测验</span>',
    '  </div>',
    '</div>'
  ].join('');

  // 绑定事件
  var input = target.querySelector('#cls-topic-input');
  var startBtn = target.querySelector('#cls-start-btn');
  var hint = target.querySelector('#cls-ai-hint');

  function startClassroom(topic, kgNodeId) {
    if (!topic) {
      hint.textContent = '请输入或选择一个话题';
      hint.style.color = '#d44';
      return;
    }
    if (!window.ClassroomPlayer) {
      hint.textContent = '课堂模块加载中，请稍后重试';
      hint.style.color = '#d44';
      return;
    }
    hint.textContent = '';
    // 读取模式
    var modeRadio = target.querySelector('input[name="cls-mode"]:checked');
    var mode = modeRadio ? modeRadio.value : 'outline';

    // 通用：选择正确的 GenProgress preset
    var presetMap = { outline: 'outline-6', omaic: 'omaic', dsl: 'dsl', v4: 'outline-4' };
    var preset = presetMap[mode] || 'outline-6';

    // 6 段式：直接调用 ClassroomPlayer 进行真实生成，不再显示假进度
    if (mode === 'outline') {
      if (!window.ClassroomPlayer) {
        hint.textContent = '课堂模块加载中，请稍后重试';
        hint.style.color = '#d44';
        return;
      }
      hint.textContent = '正在调用 AI 生成 6 段式课堂，请稍候...';
      hint.style.color = '#4a7c59';
      window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'outline' });
      return;
    }

    // v4.0 4 段深化模式：4 scene + [ACTION:] 标签流
    if (mode === 'v4') {
      if (!window.ClassroomPlayer || !window.Classroom || !window.Classroom.generateOutlineV4) {
        hint.textContent = 'v4.0 课堂模块加载中，请稍后重试';
        hint.style.color = '#d44';
        return;
      }
      hint.textContent = '正在调用 AI 生成 v4.0 4 段深化课堂（含 [ACTION:] 标签流）...';
      hint.style.color = '#4a7c59';
      window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'v4', mode: 'v4' });
      return;
    }

    if (mode === 'omaic') {
      // OpenMAIC 6 步进度模式：先显示生成进度，跑完进入 TATABOX 课堂
      if (!window.OpenMAICClassroomRunner) {
        hint.textContent = 'OpenMAIC Runner 未加载，降级为普通模式';
        hint.style.color = '#d44';
        window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'manual' });
        return;
      }
      hint.textContent = 'OpenMAIC 6 步生成中...';
      hint.style.color = '#4a7c59';
      window.OpenMAICClassroomRunner.startFromEntry({
        topic: topic,
        kgNodeId: kgNodeId || '',
        sourceType: 'manual',
        onClassroomReady: function () {
          window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'omaic' });
        }
      });
      return;
    }

    if (mode === 'dsl') {
      // OpenMAIC DSL：进度页 + 1 次 LLM 调用生成完整 Stage
      if (!window.OpenMAICGenProgress || !window.Classroom || !window.Classroom.generateStageDSL) {
        hint.textContent = 'DSL 组件未加载';
        hint.style.color = '#d44';
        return;
      }
      hint.textContent = 'OpenMAIC DSL 正在生成完整 Stage（生成中可最小化窗口）...';
      hint.style.color = '#4a7c59';
      // 缓存：先生成再播放
      var stageDataCache = null;
      var dslError = null;
      window.OpenMAICGenProgress.open({
        topic: topic,
        preset: 'dsl',
        hooks: {
          onStepStart: async () => { await sleep(300 + Math.random() * 200); },
          onStepEnd: async (idx) => {
            if (idx === 4) {
              // 第 5 步：实际调用 LLM 生成 Stage（带 90s 超时，与课堂一致）
              try {
                stageDataCache = await Promise.race([
                  window.Classroom.generateStageDSL(topic),
                  new Promise(function (_, reject) {
                    setTimeout(function () { reject(new Error('DSL 生成超时（90s）')); }, 90000);
                  })
                ]);
              } catch (e) {
                console.error('[DSL] generateStageDSL failed', e);
                dslError = e.message || String(e);
                stageDataCache = null;
                if (window.OpenMAICGenProgress.setStepStatus) {
                  window.OpenMAICGenProgress.setStepStatus(4, 'error', { preview: String(dslError).substring(0, 80) });
                }
              }
            }
          }
        },
        onComplete: function () {
          // DSL 失败 → 自动降级到 6 段式课堂
          if (!stageDataCache) {
            console.warn('[DSL] 降级到 6 段式课堂（DSL 生成失败）');
            showHint('DSL 课堂已自动降级到 6 段式（LLM 超时）', '#c4956a');
            setTimeout(function () {
              if (window.ClassroomPlayer && window.ClassroomPlayer.open) {
                window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'dsl-fallback' });
              }
            }, 50);
            return;
          }
          // DSL 降级（解析失败但有 fallback data）→ 仍可进入
          if (stageDataCache._isFallback) {
            showHint('DSL 解析已降级（LLM 输出异常），仍可进入课堂', '#c4956a');
          }
          if (window.ClassroomPlayer.openDSL) {
            window.ClassroomPlayer.openDSL(stageDataCache);
          } else if (window.Classroom.runDSLStage) {
            window.Classroom.runDSLStage(stageDataCache, { onSceneStart: function () {} });
          } else {
            // 终极降级：6 段式
            showHint('DSL 播放器未加载，已降级到 6 段式', '#c4956a');
            window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'dsl-fallback' });
          }
        }
      });
      return;
    }
    window.ClassroomPlayer.open({ topic: topic, kgNodeId: kgNodeId || '', sourceType: 'manual' });
  }

  function showHint(text, color) {
    if (!hint) return;
    hint.textContent = text;
    hint.style.color = color || '#4a7c59';
  }

  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  startBtn.addEventListener('click', function () {
    startClassroom(input.value.trim(), '');
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') startClassroom(input.value.trim(), '');
  });
  target.querySelectorAll('.cls-topic-card').forEach(function (card) {
    card.addEventListener('click', function () {
      startClassroom(card.getAttribute('data-topic'), card.getAttribute('data-kg'));
    });
  });
}

function _escapeHtmlAttr(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
window.renderClassroomPage = renderClassroomPage;

// M-01：注册到全站唯一命名空间 window.BioQuest（旧全局别名保留以兼容调用方）
(function () {
  var BQ = (typeof window !== 'undefined') ? (window.BioQuest = window.BioQuest || {}) : {};
  BQ.app = BQ.app || {};
  BQ.app.classroom = { renderClassroomPage: renderClassroomPage };
})();
