/**
 * ============================================================
 * TATABOX v3.1 — 课堂播放器 UI + 动作订阅（T1-2 / T1-4/5/6/7）
 * 提供全屏沉浸式课堂播放界面
 *
 * 功能：
 * - 6 scene 进度条 + 场景容器（动画/白板/实验/测验切换）
 * - AI 老师对话区（讲稿流式渲染 + 多智能体讨论）
 * - 控制栏（暂停/上一 scene/下一 scene/提问/笔记/TTS 开关）
 * - 接入 EventBus 订阅动作（动画高亮/图谱点亮/实验演示/测验推送）
 * - 结束页（学习数据统计 + 推荐下节课）
 * ============================================================
 */

(function () {
  'use strict';

  if (window.ClassroomPlayer) return;

  var EventBus = window.BioQuestEventBus;
  var Classroom = window.Classroom;
  var TTS = window.BioQuestTTS;
  var IrtEngine = window.IrtEngine;

  var instance = null;       // 当前课堂实例
  var outline = null;        // 当前大纲
  var elements = {};
  var notes = [];


  /**
   * @param {Object} input - { topic, kgNodeId, sourceType, mode? }
   *   mode: 'v3' (默认 6-scene) | 'v4' (4-scene 深化 + [ACTION:] 标签流)
   */
  function open(input) {
    var mode = (input && input.mode) || 'v3';
    input = input || {};
    input.mode = mode;
    _renderShell();
    _bindControls();  // 先绑定控件（关闭/快捷键），确保即使生成失败用户也能退出
    _showLoading('正在为你生成「' + input.topic + '」的 AI 课堂' + (mode === 'v4' ? ' (v4 深化模式)' : '') + '...');

    // 90s 总超时，避免 LLM 卡死导致一直转圈
    var timeoutHandle = setTimeout(function () {
      _hideLoading();
      _showError('课堂生成超时（90s）。可能原因：\n1. AI 响应太慢（请稍后重试）\n2. API Key 失效（请在「我的 → 设置」检查）\n3. 网络问题（请检查代理）');
    }, 90000);

    var generatePromise = (mode === 'v4')
      ? Classroom.generateOutlineV4(input)
      : Classroom.generateOutline(input);

    generatePromise.then(function (ol) {
      clearTimeout(timeoutHandle);
      outline = ol;
      _hideLoading();
      _renderHeader(ol);
      _renderScenes(ol);
      _subscribeActions();
      if (mode === 'v4') {
        _startClassroomV4(ol);
      } else {
        _startClassroom(ol);
      }
    }).catch(function (err) {
      clearTimeout(timeoutHandle);
      _hideLoading();
      console.warn('[Classroom] 课堂生成失败:', err && err.message);
      // S-007：对用户仅显示通用错误提示，不暴露底层错误信息
      _showError('课堂生成失败，请检查 AI 配置或稍后重试。');
    });
  }

  function close() {
    if (instance) { instance.abort(); instance = null; }
    if (TTS) TTS.stop();
    var shell = document.getElementById('classroom-shell');
    if (shell) shell.remove();
    document.body.classList.remove('classroom-active');
  }


  function _renderShell() {
    close();  // 关闭已存在的课堂
    var shell = document.createElement('div');
    shell.id = 'classroom-shell';
    shell.className = 'classroom-shell';
    shell.innerHTML = [
      '<div class="classroom-header">',
      '  <div class="classroom-title">AI 生物课堂</div>',
      '  <div class="classroom-actions">',
      '    <button id="cls-tts-toggle" class="cls-btn" title="语音讲解">语音</button>',
      '    <button id="cls-close" class="cls-btn" title="退出课堂">×</button>',
      '  </div>',
      '</div>',
      '<div class="classroom-body">',
      '  <div class="classroom-stage" id="cls-stage">',
      '    <div class="cls-loading" id="cls-loading">正在准备课堂...</div>',
      '  </div>',
      '  <div class="classroom-sidebar" id="cls-sidebar">',
      '    <div class="cls-scene-tabs" id="cls-scene-tabs"></div>',
      '    <div class="cls-dialog" id="cls-dialog" role="log" aria-live="polite"></div>',
      '    <div class="cls-input-row">',
      '      <input type="text" id="cls-question-input" placeholder="向老师提问..." />',
      '      <button id="cls-ask-btn">提问</button>',
      '    </div>',
      '  </div>',
      '</div>',
      '<div class="classroom-footer">',
      '  <button id="cls-prev" class="cls-nav-btn">← 上一段</button>',
      '  <div class="cls-progress" id="cls-progress"></div>',
      '  <button id="cls-next" class="cls-nav-btn">下一段 →</button>',
      '</div>'
    ].join('');
    document.body.appendChild(shell);
    document.body.classList.add('classroom-active');

    elements = {
      shell: shell,
      title: shell.querySelector('.classroom-title'),
      stage: document.getElementById('cls-stage'),
      dialog: document.getElementById('cls-dialog'),
      sceneTabs: document.getElementById('cls-scene-tabs'),
      progress: document.getElementById('cls-progress'),
      questionInput: document.getElementById('cls-question-input'),
      ttsToggle: document.getElementById('cls-tts-toggle'),
      loading: document.getElementById('cls-loading')
    };
  }

  function _renderHeader(ol) {
    elements.title.textContent = ol.title;
  }

  function _renderScenes(ol) {
    var tabs = ol.scenes.map(function (s, i) {
      return '<button class="cls-tab" data-idx="' + i + '" title="' + s.title + '">'
        + '<span class="cls-tab-num">' + (i + 1) + '</span>'
        + '<span class="cls-tab-name">' + s.title + '</span>'
        + '</button>';
    }).join('');
    elements.sceneTabs.innerHTML = tabs;
  }


  function _startClassroom(ol) {
    instance = Classroom.create(ol, {
      onSceneStart: function (scene, idx) {
        _updateProgress(idx, ol.scenes.length);
        _markTabActive(idx);
        _renderStageForScene(scene);
        _addDialogMessage('system', '进入第 ' + (idx + 1) + ' 段：' + scene.title);
      },
      onScriptChunk: function (chunk) {
        // 流式追加到当前消息（如启用流式）
      },
      onScriptDone: function (parsed) {
        // parsed: { script, whiteboard, animation, kgNodes }
        if (parsed.script) _addDialogMessage('teacher', parsed.script);
        // 在白板上执行绘图指令
        if (parsed.whiteboard && parsed.whiteboard.length && window.Whiteboard) {
          // 先清空白板再绘制新内容
          window.Whiteboard.clear();
          window.Whiteboard.executeCommands(parsed.whiteboard);
        }
        // lecture 场景：切换动画
        if (parsed.animation && window.BioAnimationController) {
          window.BioAnimationController.setProcessByName(parsed.animation);
        }
      },
      onDiscussionMessage: function (role, text) {
        var roleKey = ({
          '主讲老师': 'teacher',
          '助教': 'assistant',
          '学霸同学': 'student_top',
          '困惑同学': 'student_confused',
          '应用同学': 'student_app'
        })[role] || 'system';
        _addDialogMessage(roleKey, text);
      },
      onSceneEnd: function (scene, result) {
        if (scene.type === 'quiz' && result) {
          _addDialogMessage('system', '测验完成：' + (result.correct || 0) + '/' + (result.total || 0) + ' 正确');
        } else if (scene.type === 'discuss') {
          _addDialogMessage('system', '讨论环节结束');
        }
      },
      onClassroomEnd: function (data) {
        _renderEndPage(data);
      }
    });
    instance.start();
  }


  function _startClassroomV4(ol) {
    // 构造 actionCtx：为 EventBus.executeSegments 提供 ACTION 处理器
    var actionCtx = _buildV4ActionContext();

    instance = Classroom.createV4(ol, {
      onSceneStart: function (scene, idx) {
        _updateProgress(idx, ol.scenes.length);
        _markTabActive(idx);
        _renderStageForScene(scene);
        _addDialogMessage('system', '进入第 ' + (idx + 1) + ' 段：' + scene.title);
      },
      onScriptChunk: function (text) {
        // v4 文本段会通过 renderText 流式追加到对话框
        _appendTeacherStreamText(text);
      },
      onScriptDone: function (parsed) {
        // parsed: { script, rawScript, actions, segments }
        // 把完整讲稿作为一条 teacher 消息追加（如果 onScriptChunk 已经追加过，则只补一条系统提示）
        if (parsed.actions && parsed.actions.length) {
          _addDialogMessage('system', '▶ 已触发 ' + parsed.actions.length + ' 个动作指令');
        }
      },
      onDiscussionMessage: function (role, text) {
        var roleKey = ({
          '主讲老师': 'teacher',
          '助教': 'assistant',
          '学霸同学': 'student_top',
          '困惑同学': 'student_confused',
          '应用同学': 'student_app'
        })[role] || 'system';
        _addDialogMessage(roleKey, text);
      },
      onSceneEnd: function (scene, result) {
        if (scene.type === 'quiz' && result) {
          _addDialogMessage('system', '测验完成：' + (result.correct || 0) + '/' + (result.total || 0) + ' 正确');
        } else if (scene.type === 'discussion' || scene.type === 'discuss') {
          _addDialogMessage('system', '讨论环节结束');
        }
      },
      onClassroomEnd: function (data) {
        _renderEndPage(data);
      }
    }, actionCtx);
    instance.start();
  }

  /**
   * v4.0 ACTION 处理上下文：每个 handler 返回 Promise
   * 这些 handler 是 EventBus.executeSegments 调用的 ctx[type](param)
   */
  function _buildV4ActionContext() {
    return {
      // 高亮 DOM 元素
      highlight: function (selector) {
        return new Promise(function (resolve) {
          var el = null;
          try {
            // selector 可能是 CSS 选择器，也可能是 DOM 描述（如 "kg-node-photosynthesis"）
            if (/^[#.\[]/.test(selector)) {
              el = document.querySelector(selector);
            } else {
              // 当作 id 试一下
              el = document.getElementById(selector) || document.getElementById('kg-node-' + selector);
            }
          } catch (e) { el = null; }
          if (el) {
            el.classList.add('bq-classroom-highlight');
            try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
            setTimeout(function () {
              el.classList.remove('bq-classroom-highlight');
              resolve();
            }, 2500);
          } else {
            _addDialogMessage('system', '高亮：' + selector);
            setTimeout(resolve, 800);
          }
        });
      },
      // 点亮知识图谱节点
      lightup: function (nodeId) {
        return new Promise(function (resolve) {
          if (window.KnowledgeGraphController) {
            var ok = window.KnowledgeGraphController.highlightNodeById(nodeId)
              || window.KnowledgeGraphController.highlightNodeByLabel(nodeId);
            if (ok) _addDialogMessage('system', '知识图谱节点已点亮：' + nodeId);
          } else {
            _addDialogMessage('system', '点亮节点：' + nodeId);
          }
          setTimeout(resolve, 1500);
        });
      },
      // 白板绘图
      draw: function (instruction) {
        return new Promise(function (resolve) {
          if (!window.Whiteboard) { resolve(); return; }
          // 尝试 JSON 解析
          var cmds = null;
          try { cmds = JSON.parse(instruction); } catch (e) {}
          if (Array.isArray(cmds)) {
            window.Whiteboard.executeCommands(cmds);
          } else if (cmds && typeof cmds === 'object') {
            window.Whiteboard.executeCommands([cmds]);
          } else {
            // 纯文本指令：作为标题文字画在白板
            window.Whiteboard.executeCommands([
              { op: 'text_block', text: String(instruction), x: 60, y: 80, w: 680, size: 18 }
            ]);
          }
          setTimeout(resolve, 800);
        });
      },
      // 语音朗读
      tts: function (text) {
        return new Promise(function (resolve) {
          if (TTS && TTS.isSupported && TTS.isSupported() && TTS.isEnabled && TTS.isEnabled()) {
            try {
              TTS.speak(String(text), '主讲老师');
              // 粗略估算朗读时长（中文 4 字/秒）
              var dur = Math.min(8000, (String(text).length / 4) * 1000);
              setTimeout(resolve, dur);
            } catch (e) { resolve(); }
          } else {
            // TTS 不可用：在对话框显示音频图标 + 文本
            _addDialogMessage('system', text);
            setTimeout(resolve, 500);
          }
        });
      },
      // 播放生物动画
      play: function (animationId) {
        return new Promise(function (resolve) {
          if (window.BioAnimationController && typeof window.BioAnimationController.setProcessByName === 'function') {
            try {
              window.BioAnimationController.setProcessByName(animationId);
              _addDialogMessage('system', '播放动画：' + animationId);
            } catch (e) {
              _addDialogMessage('system', '动画播放失败：' + animationId);
            }
          } else {
            _addDialogMessage('system', '动画：' + animationId + '（动画模块未加载）');
          }
          setTimeout(resolve, 1000);
        });
      },
      // 暂停动画
      pause: function () {
        return new Promise(function (resolve) {
          if (window.BioAnimationController && typeof window.BioAnimationController.pause === 'function') {
            try { window.BioAnimationController.pause(); } catch (e) {}
          }
          if (TTS && TTS.pause) { try { TTS.pause(); } catch (e) {} }
          resolve();
        });
      },
      // 跳转动画帧
      seek: function (frameStr) {
        return new Promise(function (resolve) {
          var frame = parseInt(frameStr, 10);
          if (window.BioAnimationController && typeof window.BioAnimationController.gotoStep === 'function' && !isNaN(frame)) {
            try { window.BioAnimationController.gotoStep(frame); } catch (e) {}
            _addDialogMessage('system', '▶ 动画跳转到第 ' + (frame + 1) + ' 步');
          }
          setTimeout(resolve, 600);
        });
      },
      // 触发小测
      quiz: function (spec) {
        return new Promise(function (resolve) {
          // spec 格式：'concept=有丝分裂&count=3'
          var params = {};
          String(spec).split('&').forEach(function (kv) {
            var pair = kv.split('=');
            if (pair.length === 2) params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
          });
          var concept = params.concept || (outline && outline.topic) || '';
          var count = parseInt(params.count || '3', 10);
          _addDialogMessage('system', '推送 ' + count + ' 道关于「' + concept + '」的测验题');
          // 走和 quiz scene 一样的拉题 + 渲染流程
          var stage = elements.stage;
          if (stage) {
            stage.innerHTML = '<div class="cls-quiz-wrap" style="padding:24px;overflow:auto;height:100%;"><p style="color:#666;">正在加载「' + _escapeHtml(concept) + '」相关题目...</p></div>';
            _loadQuestionsByTag(concept, count).then(function (set) {
              if (!set || !set.length) {
                stage.querySelector('.cls-quiz-wrap').innerHTML = '<p style="color:#d44;">未找到相关题目，跳过测验。</p>';
                setTimeout(resolve, 1500);
                return;
              }
              _renderQuizQuestions(set);
              // 等待测验完成的简化方案：5 秒后 resolve（实际由用户答题驱动）
              setTimeout(resolve, 30000);
            }).catch(function () {
              setTimeout(resolve, 1500);
            });
          } else {
            setTimeout(resolve, 1000);
          }
        });
      },
      // 触发多智能体讨论
      discuss: function (topic) {
        return new Promise(function (resolve) {
          _addDialogMessage('system', '启动讨论：' + topic);
          if (window.MultiAgentDiscussion && typeof window.MultiAgentDiscussion.runDiscussion === 'function') {
            window.MultiAgentDiscussion.runDiscussion({
              topic: (outline && outline.topic) || '',
              question: String(topic),
              roles: ['困惑同学', '学霸同学', '应用同学'],
              onMessage: function (role, text) {
                var roleKey = ({
                  '主讲老师': 'teacher',
                  '助教': 'assistant',
                  '学霸同学': 'student_top',
                  '困惑同学': 'student_confused',
                  '应用同学': 'student_app'
                })[role] || 'system';
                _addDialogMessage(roleKey, text);
              },
              onComplete: function () { resolve(); }
            });
          } else {
            setTimeout(resolve, 1500);
          }
        });
      },
      // 等待
      wait: function (msStr) {
        return new Promise(function (resolve) {
          var ms = parseInt(msStr, 10) || 1000;
          setTimeout(resolve, Math.min(ms, 10000));
        });
      },
      // 路由跳转
      navigate: function (route) {
        return new Promise(function (resolve) {
          _addDialogMessage('system', '跳转到：' + route);
          // 不在课堂中直接跳转（会破坏课堂 UI），仅提示用户
          setTimeout(resolve, 500);
        });
      }
    };
  }

  /**
   * 流式追加老师讲稿文本到对话框（v4.0 用）
   * 把多段 text 拼接成一条 teacher 消息
   */
  var _v4TeacherStreamEl = null;
  var _v4TeacherStreamText = '';
  function _appendTeacherStreamText(text) {
    if (!text) return;
    // 如果上一条消息不是 teacher streaming，新建一条
    if (!_v4TeacherStreamEl || !_v4TeacherStreamEl.parentNode) {
      var msg = document.createElement('div');
      msg.className = 'cls-msg cls-msg-teacher';
      msg.style.cssText = 'margin:8px 0;padding:10px 12px;background:#fff;border:1px solid #eee;border-radius:8px;font-size:14px;line-height:1.6;';
      msg.innerHTML = '<div style="font-weight:600;font-size:12px;color:#4a7c59;margin-bottom:4px;">主讲老师</div><div class="cls-streaming"></div>';
      elements.dialog.appendChild(msg);
      _v4TeacherStreamEl = msg.querySelector('.cls-streaming');
      _v4TeacherStreamText = '';
    }
    _v4TeacherStreamText += text;
    _v4TeacherStreamEl.textContent = _v4TeacherStreamText;
    elements.dialog.scrollTop = elements.dialog.scrollHeight;
    // 重置 streaming 句柄的存活时间：3 秒内没有新文本就锁定该条消息
    if (_v4TeacherStreamLockTimer) clearTimeout(_v4TeacherStreamLockTimer);
    _v4TeacherStreamLockTimer = setTimeout(function () {
      _v4TeacherStreamEl = null;
      _v4TeacherStreamText = '';
    }, 3000);
  }
  var _v4TeacherStreamLockTimer = null;


  function _renderStageForScene(scene) {
    var stage = elements.stage;
    stage.replaceChildren();

    if (scene.type === 'intro' || scene.type === 'lecture' || scene.type === 'simulate'
        || scene.type === 'discuss' || scene.type === 'discussion' || scene.type === 'animation') {
      // 这些场景都用白板（discuss/discussion 也用白板记录讨论要点；animation 用白板占位，实际动画由 ACTION:play 触发）
      var wbContainer = document.createElement('div');
      wbContainer.style.cssText = 'width:100%;height:100%;';
      stage.appendChild(wbContainer);
      if (window.Whiteboard) window.Whiteboard.init(wbContainer);
      // 初始占位提示
      if (window.Whiteboard) {
        window.Whiteboard.executeCommands([
          { op: 'title', text: scene.title, y: 30, size: 26 },
          { op: 'text_block', text: 'AI 老师正在准备内容...', x: 60, y: 90, w: 680, size: 15, color: '#999' }
        ]);
      }
      // animation 场景：额外准备动画容器（供 ACTION:play 注入）
      if (scene.type === 'animation' && scene.content && scene.content.animationId) {
        var animHint = document.createElement('div');
        animHint.style.cssText = 'position:absolute;top:12px;right:12px;background:rgba(26,58,42,0.85);color:#fff;padding:6px 12px;border-radius:8px;font-size:12px;z-index:5;';
        animHint.textContent = '动画：' + scene.content.animationId;
        stage.style.position = 'relative';
        stage.appendChild(animHint);
      }
    } else if (scene.type === 'quiz') {
      _renderQuizStage(scene);
    } else if (scene.type === 'pbl') {
      stage.innerHTML = '<div style="padding:32px;color:#333;overflow:auto;height:100%;">'
        + '<h3 class="bq-mb-16">课后项目</h3>'
        + '<p style="margin:16px 0;font-size:15px;line-height:1.7;">' + _escapeHtml(scene.content.project || '') + '</p>'
        + '<h4 class="bq-mt-24">项目脚手架：</h4>'
        + '<ol style="line-height:2;padding-left:24px;">' + (scene.content.scaffold || []).map(function (s) { return '<li>' + _escapeHtml(s) + '</li>'; }).join('') + '</ol>'
        + '<button class="cls-btn" style="margin-top:20px;" data-on=\'["_cspGotoHash","#/bio-lab"]\'>前往实验室开始探究</button>'
        + '</div>';
    }
  }

  function _renderQuizStage(scene) {
    var stage = elements.stage;
    stage.innerHTML = '<div class="cls-quiz-wrap" style="padding:24px;overflow:auto;height:100%;"><p style="color:#666;">正在从题库按主题加载题目...</p></div>';
    var topic = (outline && outline.topic) || '';
    var count = (scene.content && scene.content.count) || 3;

    _loadQuestionsByTag(topic, count).then(function (set) {
      if (!set || !set.length) {
        stage.querySelector('.cls-quiz-wrap').innerHTML = '<p style="color:#d44;">未找到「' + _escapeHtml(topic) + '」相关题目，跳过测验。</p>';
        if (instance) instance.completeScene({ correct: 0, total: 0 });
        return;
      }
      _renderQuizQuestions(set);
    }).catch(function (err) {
      console.warn('[Classroom] 题库加载失败:', err && err.message);
      // S-007：对用户仅显示通用错误提示，不暴露底层错误信息
      stage.querySelector('.cls-quiz-wrap').innerHTML = '<p style="color:#d44;">题库加载失败，请稍后重试。</p>';
      if (instance) instance.completeScene({ correct: 0, total: 0 });
    });
  }

  /**
   * 从 Supabase 按主题 tag 拉题（失败时回退到本地 pool.json）
   */
  function _loadQuestionsByTag(topic, count) {
    var sb = window.getSupabase && window.getSupabase();
    if (sb) {
      // 优先按 tags 包含主题查询（PostgREST cs 操作符）
      // tags 是 JSONB 数组，cs 表示包含
      // 注意：Supabase JS SDK 用 .contains('tags', [topic])
      return sb.from('questions').select('*').contains('tags', [topic]).limit(count * 2)
        .then(function (res) {
          if (res.error) throw new Error(res.error.message);
          if (res.data && res.data.length) {
            return _normalizeQuestions(res.data).slice(0, count);
          }
          // 没找到精确 tag，按 concept 模糊匹配
          return sb.from('questions').select('*').ilike('concept', '%' + topic + '%').limit(count * 2)
            .then(function (res2) {
              if (res2.error) throw new Error(res2.error.message);
              return _normalizeQuestions(res2.data || []).slice(0, count);
            });
        })
        .catch(function (err) {
          console.warn('[Classroom] Supabase 拉题失败，回退本地:', err.message);
          return _loadLocalPool(topic, count);
        });
    }
    return _loadLocalPool(topic, count);
  }

  function _loadLocalPool(topic, count) {
    return fetch('pool.json').then(function (r) { return r.json(); }).catch(function () { return []; }).then(function (arr) {
      // 按 tags 或 concept 过滤
      var filtered = arr.filter(function (q) {
        if (q.tags && q.tags.indexOf(topic) >= 0) return true;
        if (q.concept && q.concept.indexOf(topic) >= 0) return true;
        if (topic && q.stem && q.stem.indexOf(topic) >= 0) return true;
        return false;
      });
      if (!filtered.length) filtered = arr;  // 没匹配就用全部
      return _normalizeQuestions(filtered).slice(0, count);
    });
  }

  /**
   * 归一化题目字段（兼容 Supabase 和 pool.json 格式）
   */
  function _normalizeQuestions(arr) {
    return (arr || []).map(function (q) {
      return {
        id: q.id || ('q_' + Math.random().toString(36).slice(2)),
        stem: q.stem || q.question || '',
        options: q.options || {},
        answer: q.answer || '',
        analysis: q.analysis || q.explanation || '',
        concept: q.concept || '',
        tags: q.tags || [],
        difficulty: q.difficulty || 'medium',
        subQuestions: q.sub_questions || q.subQuestions
      };
    }).filter(function (q) { return q.stem && q.options; });
  }

  var _escapeHtml = window.escapeHtml;

  function _renderQuizQuestions(set) {
    if (!set || !set.length) {
      if (instance) instance.completeScene({ correct: 0, total: 0 });
      return;
    }
    var stage = elements.stage;
    var correct = 0;
    var answered = 0;
    var total = set.length;
    var wrap = stage.querySelector('.cls-quiz-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<h3 style="margin-bottom:16px;color:#1a3a2a;">随堂测验（共 ' + total + ' 题）</h3>'
      + '<p style="color:#666;font-size:13px;margin-bottom:16px;">基于「' + _escapeHtml((outline && outline.topic) || '') + '」主题，从题库抽取</p>';

    set.forEach(function (q, qi) {
      var card = document.createElement('div');
      card.className = 'cls-quiz-card';
      card.style.cssText = 'background:#fff;border:1px solid #e8e8e8;border-radius:8px;padding:18px;margin-bottom:14px;';

      // 归一化 options 为 [{key:'A', text:'...'}] 数组
      var optList = [];
      if (Array.isArray(q.options)) {
        q.options.forEach(function (opt, i) {
          optList.push({ key: String.fromCharCode(65 + i), text: opt });
        });
      } else if (q.options && typeof q.options === 'object') {
        Object.keys(q.options).sort().forEach(function (k) {
          optList.push({ key: k, text: q.options[k] });
        });
      }

      var optionsHtml = optList.map(function (opt) {
        return '<label class="cls-quiz-opt" data-key="' + opt.key + '" style="display:block;padding:10px 12px;cursor:pointer;border-radius:8px;margin:4px 0;border:1px solid #eee;transition:background 0.15s;">'
          + '<input type="radio" name="q' + qi + '" value="' + opt.key + '" style="margin-right:10px;">'
          + '<b>' + opt.key + '.</b> ' + _escapeHtml(opt.text) + '</label>';
      }).join('');

      card.innerHTML = '<div style="font-weight:600;margin-bottom:10px;color:#1a3a2a;font-size:15px;line-height:1.6;">Q' + (qi + 1) + '. ' + _escapeHtml(q.stem) + '</div>'
        + optionsHtml
        + '<div class="cls-quiz-analysis" style="display:none;margin-top:12px;padding:12px;background:#f8f9fa;border-radius:8px;font-size:13px;color:#555;line-height:1.6;"></div>';
      wrap.appendChild(card);

      var inputs = card.querySelectorAll('input[type=radio]');
      var labels = card.querySelectorAll('.cls-quiz-opt');
      inputs.forEach(function (inp) {
        inp.addEventListener('change', function () {
          if (card.dataset.answered) return;
          card.dataset.answered = '1';
          answered++;
          var userAns = this.value;
          var rightAns = String(q.answer || '').trim().toUpperCase();
          var isCorrect = userAns === rightAns;
          if (isCorrect) correct++;

          // 高亮
          labels.forEach(function (lb) {
            var k = lb.getAttribute('data-key');
            lb.style.cursor = 'default';
            if (k === rightAns) {
              lb.style.background = '#d4edda';
              lb.style.borderColor = '#7dbe7f';
            } else if (k === userAns && !isCorrect) {
              lb.style.background = '#f8d7da';
              lb.style.borderColor = '#d67878';
            }
          });
          inputs.forEach(function (i) { i.disabled = true; });

          // 显示解析
          var analysisEl = card.querySelector('.cls-quiz-analysis');
          if (analysisEl) {
            analysisEl.style.display = 'block';
            analysisEl.innerHTML = '<b style="color:#4a7c59;">' + (isCorrect ? '✓ 正确' : '✗ 错误') + '。</b> 正确答案：' + rightAns + '<br>'
              + (q.analysis ? _escapeHtml(q.analysis) : '');
          }

          // 记录 IRT
          if (window.IrtEngine) IrtEngine.recordAnswer(q.id || ('q' + qi), isCorrect, q);

          if (answered === total) {
            // 显示完成提示
            var doneEl = document.createElement('div');
            doneEl.style.cssText = 'margin-top:16px;padding:14px;background:#edf5f0;border-radius:8px;text-align:center;font-weight:600;color:#1a3a2a;';
            doneEl.innerHTML = '测验完成：' + correct + '/' + total + ' 正确';
            wrap.appendChild(doneEl);
            setTimeout(function () {
              if (instance) instance.completeScene({ correct: correct, total: total });
            }, 2500);
          }
        });
      });
    });
  }


  function _addDialogMessage(role, text) {
    var roleMap = {
      teacher: { name: '主讲老师', cls: 'cls-msg-teacher' },
      assistant: { name: '助教', cls: 'cls-msg-assistant' },
      student_top: { name: '学霸同学', cls: 'cls-msg-student-top' },
      student_confused: { name: '困惑同学', cls: 'cls-msg-student-confused' },
      student_app: { name: '应用同学', cls: 'cls-msg-student-app' },
      system: { name: '系统', cls: 'cls-msg-system' },
      user: { name: '我', cls: 'cls-msg-user' }
    };
    var cfg = roleMap[role] || roleMap.system;
    var msg = document.createElement('div');
    msg.className = 'cls-msg ' + cfg.cls;
    msg.style.cssText = 'margin:8px 0;padding:10px 12px;border-radius:8px;font-size:14px;line-height:1.6;';
    if (role === 'system') {
      msg.style.background = '#f0f7f0';
      msg.style.color = '#666';
      msg.style.fontSize = '12px';
      msg.style.textAlign = 'center';
      msg.textContent = text;
    } else {
      msg.style.background = role === 'user' ? '#e8f5e9' : '#fff';
      msg.style.border = '1px solid #eee';
      msg.innerHTML = '<div style="font-weight:600;font-size:12px;color:#4a7c59;margin-bottom:4px;">' + cfg.name + '</div>'
        + '<div>' + _escapeHtml(text) + '</div>';
    }
    elements.dialog.appendChild(msg);
    elements.dialog.scrollTop = elements.dialog.scrollHeight;
  }

  _escapeHtml = window.escapeHtml;


  function _bindControls() {
    document.getElementById('cls-close').onclick = close;
    document.getElementById('cls-prev').onclick = function () {
      if (instance) {
        // 简化：跳到上一场景的开头（重置索引）
        instance.currentSceneIndex = Math.max(-1, instance.currentSceneIndex - 2);
        instance.skip();
      }
    };
    document.getElementById('cls-next').onclick = function () {
      if (instance) instance.skip();
    };
    document.getElementById('cls-ask-btn').onclick = _onAskQuestion;
    document.getElementById('cls-question-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') _onAskQuestion();
    });
    elements.ttsToggle.onclick = function () {
      if (!TTS || !TTS.isSupported()) {
        _addDialogMessage('system', '当前浏览器不支持语音合成');
        return;
      }
      if (TTS.isEnabled()) {
        TTS.disable();
        elements.ttsToggle.textContent = '静音';
      } else {
        TTS.enable();
        elements.ttsToggle.textContent = '语音';
        _addDialogMessage('system', '已开启语音讲解');
      }
    };

    // 全局快捷键
    document.addEventListener('keydown', _onKeydown);
  }

  function _onKeydown(e) {
    if (!document.body.classList.contains('classroom-active')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') { if (instance) instance.skip(); }
    else if (e.key === 'ArrowLeft') {
      if (instance) {
        instance.currentSceneIndex = Math.max(-1, instance.currentSceneIndex - 2);
        instance.skip();
      }
    } else if (e.key === ' ') {
      e.preventDefault();
      if (TTS && TTS.isEnabled()) TTS.pause();
    }
  }

  function _onAskQuestion() {
    var inp = document.getElementById('cls-question-input');
    var q = inp.value.trim();
    if (!q || !window.AiClient || !AiClient.canUse()) {
      _addDialogMessage('system', '请输入问题并确保已配置 AI');
      return;
    }
    inp.value = '';
    _addDialogMessage('user', q);
    // 调用 AI 回答（quick_qa 阶段）
    var prompt = [
      { role: 'system', content: '你是一名生物老师，正在讲课。学生提问，请用 100 字内简明回答。' },
      { role: 'user', content: q }
    ];
    var msgEl = document.createElement('div');
    msgEl.className = 'cls-msg cls-msg-teacher';
    msgEl.style.cssText = 'margin:8px 0;padding:10px 12px;background:#fff;border:1px solid #eee;border-radius:8px;font-size:14px;';
    msgEl.innerHTML = '<div style="font-weight:600;font-size:12px;color:#4a7c59;margin-bottom:4px;">主讲老师</div><div class="cls-streaming"></div>';
    elements.dialog.appendChild(msgEl);
    var streamTarget = msgEl.querySelector('.cls-streaming');
    var acc = '';
    AiClient.callByStage('quick_qa', prompt, {
      onChunk: function (chunk) {
        acc += chunk;
        streamTarget.textContent = acc;
        elements.dialog.scrollTop = elements.dialog.scrollHeight;
      },
      onDone: function () {
        if (TTS && TTS.isEnabled()) TTS.speak(acc, '主讲老师');
      },
      onError: function (err) {
        console.warn('[Classroom] AI 回答失败:', err && err.message);
        // S-007：对用户仅显示通用错误提示，不暴露底层错误信息
        streamTarget.textContent = '回答失败，请稍后重试。';
      }
    });
  }


  function _subscribeActions() {
    // T1-4: 高亮动画步骤
    EventBus.on(EventBus.ACTION.HIGHLIGHT_ANIMATION_STEP, function (module, step) {
      if (window.BioAnimationController) {
        if (module) window.BioAnimationController.setProcessByName(module);
        if (typeof step === 'number') window.BioAnimationController.gotoStep(step);
        _addDialogMessage('system', '▶ 动画跳转到第 ' + (step + 1) + ' 步');
      }
    });

    // T1-5: 点亮知识图谱节点
    EventBus.on(EventBus.ACTION.HIGHLIGHT_KG_NODE, function (nodeId) {
      if (window.KnowledgeGraphController) {
        var ok = window.KnowledgeGraphController.highlightNodeById(nodeId)
          || window.KnowledgeGraphController.highlightNodeByLabel(nodeId);
        if (ok) _addDialogMessage('system', '知识图谱节点已点亮');
      }
    });
    EventBus.on(EventBus.ACTION.HIGHLIGHT_KG_SUBGRAPH, function (nodeIds) {
      if (window.KnowledgeGraphController) {
        window.KnowledgeGraphController.highlightNodeById(nodeIds);
      }
    });

    // T1-6: 实验演示（简化为提示）
    EventBus.on(EventBus.ACTION.LAB_RUN_STEP, function (expId, stepIdx) {
      _addDialogMessage('system', '实验演示：' + expId + ' 第 ' + (stepIdx + 1) + ' 步');
    });

    // T1-7: 推送测验题（已由 orchestrator 触发 quiz scene，这里仅提示）
    EventBus.on(EventBus.ACTION.QUIZ_PUSH, function () {
      // 测验 scene 自动渲染，无需额外操作
    });
  }


  function _updateProgress(idx, total) {
    var pct = ((idx + 1) / total * 100).toFixed(0);
    elements.progress.innerHTML = '<div class="cls-progress-bar" style="width:' + pct + '%;"></div><span class="cls-progress-text">' + (idx + 1) + ' / ' + total + '</span>';
  }

  function _markTabActive(idx) {
    var tabs = elements.sceneTabs.querySelectorAll('.cls-tab');
    tabs.forEach(function (t, i) {
      if (i === idx) t.classList.add('active');
      else if (i < idx) t.classList.add('done');
    });
  }


  function _renderEndPage(data) {
    var stage = elements.stage;
    var irtState = IrtEngine ? IrtEngine.loadState() : { theta: 0, totalAnswered: 0 };
    var ability = IrtEngine ? IrtEngine.describeAbility(irtState.theta) : { level: '-', percentile: 0 };
    var predict = IrtEngine ? IrtEngine.predictScore() : { score: 0, low: 0, high: 0, confidence: 0 };

    // 统计测验结果
    var quizCorrect = 0, quizTotal = 0;
    (data.sceneStates || []).forEach(function (s) {
      if (s.type === 'quiz' && s.result) {
        quizCorrect += s.result.correct || 0;
        quizTotal += s.result.total || 0;
      }
    });

    stage.innerHTML = [
      '<div style="padding:32px;text-align:center;overflow:auto;height:100%;">',
      '  <h2 style="margin:12px 0;">课堂完成！</h2>',
      '  <p style="color:#666;">' + (outline ? outline.title : '') + '</p>',
      '  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;max-width:480px;margin:24px auto;">',
      '    <div class="cls-stat-card"><div class="cls-stat-num">' + quizCorrect + '/' + quizTotal + '</div><div class="cls-stat-label">测验正确</div></div>',
      '    <div class="cls-stat-card"><div class="cls-stat-num">' + ability.level + '</div><div class="cls-stat-label">能力等级（前 ' + ability.percentile + '%）</div></div>',
      '    <div class="cls-stat-card"><div class="cls-stat-num">' + predict.score + '</div><div class="cls-stat-label">预测联赛分（置信 ' + predict.confidence + '%）</div></div>',
      '    <div class="cls-stat-card"><div class="cls-stat-num">' + irtState.totalAnswered + '</div><div class="cls-stat-label">累计答题</div></div>',
      '  </div>',
      '  <div style="background:#f0f7f0;padding:16px;border-radius:8px;max-width:480px;margin:0 auto;">',
      '    <p style="color:#4a7c59;font-weight:600;">' + ability.desc + '</p>',
      '  </div>',
      '  <div class="bq-mt-24">',
      '    <button class="cls-btn" data-on=\'["ClassroomPlayer.close"]\'>完成</button>',
      '  </div>',
      '</div>'
    ].join('');
    elements.dialog.innerHTML = '<div class="cls-msg cls-msg-system" style="text-align:center;color:#666;">课堂已结束，查看你的学习数据</div>';
  }


  function _showLoading(text) {
    if (elements.loading) {
      elements.loading.style.display = 'block';
      elements.loading.textContent = text || '加载中...';
    }
  }
  function _hideLoading() {
    if (elements.loading) elements.loading.style.display = 'none';
  }
  function _showError(msg) {
    if (elements.stage) {
      elements.stage.innerHTML = '<div style="padding:32px;text-align:center;color:#d44;">' + _escapeHtml(msg) + '</div>';
    }
  }

  window.ClassroomPlayer = {
    open: open,
    close: close
  };

})();
