/**
 * ============================================================
 * TATABOX v3.1 — AI 白板（T3-4/T3-5/T3-6/T3-7）
 * 纯 Canvas 实现，零依赖。AI 老师通过 EventBus 发指令绘图
 *
 * 设计原则：
 * - 单文件零依赖（与项目架构一致）
 * - 支持学生手动标注（鼠标/触摸）
 * - 支持学生擦除、清空、保存截图
 * - 内置生物图形库（DNA 双螺旋、磷脂双分子层、系谱图符号等）
 * - 接入 EventBus 接收 AI 老师绘图指令
 * ============================================================
 */

(function () {
  'use strict';

  if (window.Whiteboard) return;

  var EventBus = window.BioQuestEventBus;

  var canvas = null;
  var ctx = null;
  var container = null;
  var drawing = false;
  var lastX = 0, lastY = 0;
  var currentColor = '#4a7c59';
  var currentWidth = 3;
  var undoStack = [];   // 快照栈（ImageData）
  var REDO_LIMIT = 30;
  var _resizeHandler = null;


  function init(parentEl) {
    // 允许重复初始化：每次切换 scene 都重新建 canvas
    destroy();
    container = parentEl;
    container.replaceChildren();

    var wrapper = document.createElement('div');
    wrapper.className = 'bq-whiteboard-wrapper';
    wrapper.style.cssText = 'position:relative;width:100%;height:100%;background:#fefcf7;border-radius:12px;overflow:hidden;';

    canvas = document.createElement('canvas');
    canvas.className = 'bq-whiteboard-canvas';
    canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair;touch-action:none;';
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);

    ctx = canvas.getContext('2d');
    _resizeCanvas();
    _resizeHandler = _resizeCanvas;
    window.addEventListener('resize', _resizeHandler);

    _bindPointerEvents();
    _bindEventBus();
    _renderToolbar(wrapper);
  }

  function destroy() {
    if (_resizeHandler) {
      window.removeEventListener('resize', _resizeHandler);
      _resizeHandler = null;
    }
    if (canvas && canvas.parentNode) canvas.parentNode.remove();
    canvas = null;
    ctx = null;
    undoStack = [];
  }

  function _resizeCanvas() {
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var oldImage = null;
    if (canvas.width > 0 && canvas.height > 0) {
      try { oldImage = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (e) {}
    }
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fefcf7';
    ctx.fillRect(0, 0, rect.width, rect.height);
    if (oldImage) {
      try { ctx.putImageData(oldImage, 0, 0); } catch (e) {}
    }
  }


  function _bindPointerEvents() {
    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      var y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return { x: x, y: y };
    }
    function start(e) {
      e.preventDefault();
      drawing = true;
      var p = getPos(e);
      lastX = p.x; lastY = p.y;
      _pushUndo();
    }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      var p = getPos(e);
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x; lastY = p.y;
    }
    function end() { drawing = false; }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
  }

  function _pushUndo() {
    try {
      var snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      undoStack.push(snap);
      if (undoStack.length > REDO_LIMIT) undoStack.shift();
    } catch (e) {}
  }

  function undo() {
    if (!undoStack.length) return;
    var snap = undoStack.pop();
    ctx.putImageData(snap, 0, 0);
  }

  function clear() {
    _pushUndo();
    var rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#fefcf7';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  function saveSnapshot() {
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  }


  function _renderToolbar(wrapper) {
    var toolbar = document.createElement('div');
    toolbar.className = 'bq-whiteboard-toolbar';
    toolbar.style.cssText = 'position:absolute;top:8px;right:8px;display:flex;gap:6px;background:rgba(255,255,255,0.9);padding:6px;border-radius:8px;box-shadow:var(--shadow-md);';

    var colors = ['#4a7c59', '#c4956a', '#1a3a2a', '#d44', '#37a', '#999'];
    colors.forEach(function (c) {
      var btn = document.createElement('button');
      btn.style.cssText = 'width:18px;height:18px;border-radius:50%;border:1px solid #ddd;cursor:pointer;background:' + c + ';padding:0;';
      btn.title = c;
      btn.onclick = function () { currentColor = c; };
      toolbar.appendChild(btn);
    });

    var undoBtn = document.createElement('button');
    undoBtn.textContent = '↶';
    undoBtn.style.cssText = _btnStyle();
    undoBtn.title = '撤销';
    undoBtn.onclick = undo;
    toolbar.appendChild(undoBtn);

    var clearBtn = document.createElement('button');
    clearBtn.textContent = '清空';
    clearBtn.style.cssText = _btnStyle();
    clearBtn.onclick = clear;
    toolbar.appendChild(clearBtn);

    var saveBtn = document.createElement('button');
    saveBtn.textContent = '保存';
    saveBtn.style.cssText = _btnStyle();
    saveBtn.onclick = function () {
      var url = saveSnapshot();
      if (url) {
        var a = document.createElement('a');
        a.href = url;
        a.download = 'bioquest-whiteboard-' + Date.now() + '.png';
        a.click();
      }
    };
    toolbar.appendChild(saveBtn);

    wrapper.appendChild(toolbar);
  }

  function _btnStyle() {
    return 'border:1px solid #ddd;background:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:13px;color:#333;';
  }


  /**
   * 执行一组绘图指令（来自 LLM）
   * @param {Array} commands - [{op, ...params}]
   */
  function executeCommands(commands) {
    if (!commands || !commands.length || !ctx) return;
    _pushUndo();
    commands.forEach(function (cmd) {
      var fn = BIO_SHAPES[cmd.op];
      if (fn) {
        try { fn(ctx, cmd); }
        catch (e) { console.warn('[Whiteboard] 绘图指令失败:', cmd.op, e.message); }
      } else {
        console.warn('[Whiteboard] 未知绘图指令:', cmd.op);
      }
    });
  }


  var BIO_SHAPES = {
    /**
     * 绘制 DNA 双螺旋
     * {op:'draw_dna_helix', x, y, length, turns}
     */
    draw_dna_helix: function (ctx, cmd) {
      var x = cmd.x || 100, y = cmd.y || 50, len = cmd.length || 200, turns = cmd.turns || 3;
      var amp = 25, steps = 60;
      ctx.strokeStyle = cmd.color || '#4a7c59';
      ctx.lineWidth = 2;
      // 两条螺旋
      ctx.beginPath();
      for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        var px = x + t * len;
        var py = y + Math.sin(t * Math.PI * 2 * turns) * amp;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.beginPath();
      for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        var px = x + t * len;
        var py = y + Math.sin(t * Math.PI * 2 * turns + Math.PI) * amp;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      // 碱基对横线
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#c4956a';
      for (var i = 0; i <= steps; i += 4) {
        var t = i / steps;
        var px = x + t * len;
        var py1 = y + Math.sin(t * Math.PI * 2 * turns) * amp;
        var py2 = y + Math.sin(t * Math.PI * 2 * turns + Math.PI) * amp;
        ctx.beginPath();
        ctx.moveTo(px, py1);
        ctx.lineTo(px, py2);
        ctx.stroke();
      }
    },

    /**
     * 绘制磷脂双分子层（细胞膜）
     * {op:'draw_membrane', x, y, width}
     */
    draw_membrane: function (ctx, cmd) {
      var x = cmd.x || 50, y = cmd.y || 100, w = cmd.width || 300;
      var headR = 8, spacing = 20, rows = 2, rowGap = 28;
      ctx.fillStyle = cmd.headColor || '#4a7c59';
      ctx.strokeStyle = cmd.tailColor || '#c4956a';
      ctx.lineWidth = 1.5;
      for (var r = 0; r < rows; r++) {
        var ry = y + r * rowGap;
        var tailDir = r === 0 ? 1 : -1;
        for (var i = 0; i * spacing < w; i++) {
          var cx = x + i * spacing;
          // 头部圆
          ctx.beginPath();
          ctx.arc(cx, ry, headR, 0, Math.PI * 2);
          ctx.fill();
          // 尾部两条波浪线
          ctx.beginPath();
          ctx.moveTo(cx - 3, ry + tailDir * headR);
          ctx.quadraticCurveTo(cx - 3, ry + tailDir * (headR + 12), cx, ry + tailDir * (headR + 18));
          ctx.moveTo(cx + 3, ry + tailDir * headR);
          ctx.quadraticCurveTo(cx + 3, ry + tailDir * (headR + 12), cx, ry + tailDir * (headR + 18));
          ctx.stroke();
        }
      }
    },

    /**
     * 绘制细胞（圆形+细胞核）
     * {op:'draw_cell', cx, cy, r, label}
     */
    draw_cell: function (ctx, cmd) {
      var cx = cmd.cx || 200, cy = cmd.cy || 150, r = cmd.r || 80;
      ctx.strokeStyle = cmd.color || '#4a7c59';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      // 细胞核
      ctx.fillStyle = 'rgba(196,149,106,0.3)';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      if (cmd.label) {
        ctx.fillStyle = '#1a3a2a';
        ctx.font = '14px sans-serif';
        ctx.fillText(cmd.label, cx - 20, cy + r + 20);
      }
    },

    /**
     * 绘制系谱图符号
     * {op:'draw_pedigree_symbol', x, y, gender, affected}
     *   gender: 'm' | 'f', affected: boolean
     */
    draw_pedigree_symbol: function (ctx, cmd) {
      var x = cmd.x, y = cmd.y, size = 16;
      ctx.strokeStyle = '#1a3a2a';
      ctx.lineWidth = 2;
      if (cmd.gender === 'm') {
        ctx.strokeRect(x - size / 2, y - size / 2, size, size);
        if (cmd.affected) { ctx.fillStyle = '#1a3a2a'; ctx.fillRect(x - size / 2, y - size / 2, size, size); }
      } else {
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.stroke();
        if (cmd.affected) { ctx.fillStyle = '#1a3a2a'; ctx.fill(); }
      }
    },

    /**
     * 绘制箭头（流程图）
     * {op:'draw_arrow', x1, y1, x2, y2, label}
     */
    draw_arrow: function (ctx, cmd) {
      ctx.strokeStyle = cmd.color || '#1a3a2a';
      ctx.fillStyle = cmd.color || '#1a3a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cmd.x1, cmd.y1);
      ctx.lineTo(cmd.x2, cmd.y2);
      ctx.stroke();
      // 箭头头
      var angle = Math.atan2(cmd.y2 - cmd.y1, cmd.x2 - cmd.x1);
      var headLen = 10;
      ctx.beginPath();
      ctx.moveTo(cmd.x2, cmd.y2);
      ctx.lineTo(cmd.x2 - headLen * Math.cos(angle - Math.PI / 6), cmd.y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(cmd.x2 - headLen * Math.cos(angle + Math.PI / 6), cmd.y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      if (cmd.label) {
        ctx.fillStyle = '#1a3a2a';
        ctx.font = '13px sans-serif';
        var mx = (cmd.x1 + cmd.x2) / 2, my = (cmd.y1 + cmd.y2) / 2;
        ctx.fillText(cmd.label, mx, my - 6);
      }
    },

    /**
     * 绘制文字标签
     * {op:'label', text, x, y, size, color}
     */
    label: function (ctx, cmd) {
      ctx.fillStyle = cmd.color || '#1a3a2a';
      ctx.font = (cmd.size || 14) + 'px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(cmd.text, cmd.x, cmd.y);
    },

    /**
     * 绘制标题（居中大字）
     * {op:'title', text, x?, y, size?, color?}
     */
    title: function (ctx, cmd) {
      var rect = canvas.getBoundingClientRect();
      var x = cmd.x != null ? cmd.x : rect.width / 2;
      var size = cmd.size || 28;
      ctx.fillStyle = cmd.color || '#1a3a2a';
      ctx.font = 'bold ' + size + 'px "LXGW WenKai", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(cmd.text, x, cmd.y || 20);
      ctx.textAlign = 'left';  // 恢复默认
      // 标题下划线
      var tw = ctx.measureText(cmd.text).width;
      ctx.strokeStyle = cmd.color || '#4a7c59';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - tw / 2, (cmd.y || 20) + size + 4);
      ctx.lineTo(x + tw / 2, (cmd.y || 20) + size + 4);
      ctx.stroke();
    },

    /**
     * 绘制文本块（自动换行）
     * {op:'text_block', text, x, y, w, size?, color?, lineH?}
     */
    text_block: function (ctx, cmd) {
      ctx.fillStyle = cmd.color || '#1a3a2a';
      ctx.font = (cmd.size || 15) + 'px "LXGW WenKai", sans-serif';
      ctx.textBaseline = 'top';
      var lineH = cmd.lineH || (cmd.size || 15) + 6;
      var words = String(cmd.text).split('');
      var line = '';
      var y = cmd.y;
      for (var i = 0; i < words.length; i++) {
        var test = line + words[i];
        if (ctx.measureText(test).width > cmd.w && line) {
          ctx.fillText(line, cmd.x, y);
          line = words[i];
          y += lineH;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, cmd.x, y);
    },

    /**
     * 绘制无序列表
     * {op:'bullet_list', items:['点1','点2'], x, y, w, size?, color?}
     */
    bullet_list: function (ctx, cmd) {
      ctx.fillStyle = cmd.color || '#1a3a2a';
      ctx.font = (cmd.size || 15) + 'px "LXGW WenKai", sans-serif';
      ctx.textBaseline = 'top';
      var lineH = (cmd.size || 15) + 8;
      var y = cmd.y;
      (cmd.items || []).forEach(function (item) {
        // 项目符号
        ctx.fillStyle = '#4a7c59';
        ctx.beginPath();
        ctx.arc(cmd.x + 4, y + (cmd.size || 15) / 2, 3, 0, Math.PI * 2);
        ctx.fill();
        // 文字（自动换行）
        ctx.fillStyle = cmd.color || '#1a3a2a';
        var words = String(item).split('');
        var line = '';
        var firstLine = true;
        for (var i = 0; i < words.length; i++) {
          var test = line + words[i];
          if (ctx.measureText(test).width > (cmd.w - 20) && line) {
            ctx.fillText(line, cmd.x + 16, y);
            line = words[i];
            y += lineH;
            firstLine = false;
          } else {
            line = test;
          }
        }
        if (line) { ctx.fillText(line, cmd.x + 16, y); }
        y += lineH + 4;
      });
    },

    /**
     * 绘制矩形框（带可选文字）
     * {op:'box', x, y, w, h, text?, color?, fill?, size?}
     */
    box: function (ctx, cmd) {
      if (cmd.fill) {
        ctx.fillStyle = cmd.fill;
        ctx.fillRect(cmd.x, cmd.y, cmd.w, cmd.h);
      }
      ctx.strokeStyle = cmd.color || '#4a7c59';
      ctx.lineWidth = 2;
      ctx.strokeRect(cmd.x, cmd.y, cmd.w, cmd.h);
      if (cmd.text) {
        ctx.fillStyle = cmd.color || '#1a3a2a';
        ctx.font = (cmd.size || 14) + 'px "LXGW WenKai", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cmd.text, cmd.x + cmd.w / 2, cmd.y + cmd.h / 2);
        ctx.textAlign = 'left';
      }
    },

    /**
     * 绘制圆圈（带可选文字）
     * {op:'circle', cx, cy, r, text?, color?, fill?, size?}
     */
    circle: function (ctx, cmd) {
      if (cmd.fill) {
        ctx.fillStyle = cmd.fill;
        ctx.beginPath();
        ctx.arc(cmd.cx, cmd.cy, cmd.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = cmd.color || '#4a7c59';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cmd.cx, cmd.cy, cmd.r, 0, Math.PI * 2);
      ctx.stroke();
      if (cmd.text) {
        ctx.fillStyle = cmd.color || '#1a3a2a';
        ctx.font = (cmd.size || 13) + 'px "LXGW WenKai", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cmd.text, cmd.cx, cmd.cy);
        ctx.textAlign = 'left';
      }
    },

    /**
     * 绘制反应方程式（简化：居中文字）
     * {op:'equation', text, x?, y, size?, color?}
     */
    equation: function (ctx, cmd) {
      var rect = canvas.getBoundingClientRect();
      var x = cmd.x != null ? cmd.x : rect.width / 2;
      ctx.fillStyle = cmd.color || '#3a6347';
      ctx.font = 'italic ' + (cmd.size || 16) + 'px "LXGW WenKai", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(cmd.text, x, cmd.y);
      ctx.textAlign = 'left';
    },

    /**
     * 高亮区域（虚线框）
     * {op:'highlight', x, y, w, h, color}
     */
    highlight: function (ctx, cmd) {
      ctx.strokeStyle = cmd.color || '#c4956a';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(cmd.x, cmd.y, cmd.w, cmd.h);
      ctx.setLineDash([]);
    },

    /**
     * 思维导图（放射式）
     * {op:'mindmap', cx, cy, root:'中心词', branches:[{text, angle?, color?},...]}
     * 自动布局：根节点居中，分支放射状均匀分布
     */
    mindmap: function (ctx, cmd) {
      var cx = cmd.cx || 400, cy = cmd.cy || 250;
      var root = cmd.root || '主题';
      var branches = cmd.branches || [];
      var n = branches.length;
      if (!n) return;

      // 根节点（实心圆 + 居中文字）
      var rootW = ctx.measureText(root).width + 32;
      var rootH = 36;
      ctx.fillStyle = '#4a7c59';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(cx - rootW / 2, cy - rootH / 2, rootW, rootH, 8) : ctx.rect(cx - rootW / 2, cy - rootH / 2, rootW, rootH);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px "LXGW WenKai", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(root, cx, cy);

      // 分支：均匀分布角度
      var startAngle = -Math.PI / 2;  // 从正上方开始
      var branchLen = 140;
      branches.forEach(function (b, i) {
        var angle = startAngle + (i / n) * Math.PI * 2;
        var ex = cx + Math.cos(angle) * branchLen;
        var ey = cy + Math.sin(angle) * branchLen;
        var color = b.color || '#c4956a';

        // 连线（贝塞尔曲线）
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        var cp1x = cx + Math.cos(angle) * branchLen * 0.4;
        var cp1y = cy + Math.sin(angle) * branchLen * 0.4;
        var cp2x = cx + Math.cos(angle) * branchLen * 0.7;
        var cp2y = cy + Math.sin(angle) * branchLen * 0.7;
        ctx.moveTo(cx, cy);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, ex, ey);
        ctx.stroke();

        // 分支节点（圆角矩形）
        ctx.font = '13px "LXGW WenKai", sans-serif';
        var text = b.text || '';
        var bw = ctx.measureText(text).width + 24;
        var bh = 28;
        var nx = ex - bw / 2;
        var ny = ey - bh / 2;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(nx, ny, bw, bh, 14);
        else ctx.rect(nx, ny, bw, bh);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1a3a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, ex, ey);
      });
      ctx.textAlign = 'left';
    },

    /**
     * 流程图（水平排列 + 箭头）
     * {op:'flowchart', steps:['步骤1','步骤2','步骤3'], y, color}
     */
    flowchart: function (ctx, cmd) {
      var steps = cmd.steps || [];
      var y = cmd.y || 200;
      var color = cmd.color || '#4a7c59';
      if (!steps.length) return;
      var canvasW = canvas.getBoundingClientRect().width;
      var boxW = 130, boxH = 50, gap = 50;
      var totalW = steps.length * boxW + (steps.length - 1) * gap;
      var startX = (canvasW - totalW) / 2;

      ctx.font = '13px "LXGW WenKai", sans-serif';
      steps.forEach(function (text, i) {
        var x = startX + i * (boxW + gap);
        // 矩形
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, boxW, boxH, 8);
        else ctx.rect(x, y, boxW, boxH);
        ctx.fill();
        ctx.stroke();
        // 文字
        ctx.fillStyle = '#1a3a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + boxW / 2, y + boxH / 2);

        // 箭头（除最后一步）
        if (i < steps.length - 1) {
          var ax = x + boxW;
          var ay = y + boxH / 2;
          var ax2 = ax + gap;
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax2 - 8, ay);
          ctx.stroke();
          // 箭头头
          ctx.beginPath();
          ctx.moveTo(ax2, ay);
          ctx.lineTo(ax2 - 10, ay - 5);
          ctx.lineTo(ax2 - 10, ay + 5);
          ctx.closePath();
          ctx.fill();
        }
      });
      ctx.textAlign = 'left';
    },

    /**
     * 卡片组（网格布局）
     * {op:'card_group', cards:[{title, text}], x, y, cols, w, h, gap, color}
     */
    card_group: function (ctx, cmd) {
      var cards = cmd.cards || [];
      var cols = cmd.cols || 2;
      var cardW = cmd.w || 250, cardH = cmd.h || 100, gap = cmd.gap || 16;
      var x0 = cmd.x || 50, y0 = cmd.y || 100;
      var color = cmd.color || '#4a7c59';

      cards.forEach(function (card, i) {
        var col = i % cols, row = Math.floor(i / cols);
        var x = x0 + col * (cardW + gap);
        var y = y0 + row * (cardH + gap);

        // 卡片底色
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, cardW, cardH, 10);
        else ctx.rect(x, y, cardW, cardH);
        ctx.fill();
        ctx.stroke();

        // 标题
        ctx.fillStyle = color;
        ctx.font = 'bold 14px "LXGW WenKai", sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(card.title || '', x + 12, y + 10);

        // 内容
        ctx.fillStyle = '#1a3a2a';
        ctx.font = '12px "LXGW WenKai", sans-serif';
        // 简单按宽度换行
        var text = card.text || '';
        var maxW = cardW - 24;
        var line = '', ly = y + 36;
        for (var ci = 0; ci < text.length; ci++) {
          var test = line + text[ci];
          if (ctx.measureText(test).width > maxW && line) {
            ctx.fillText(line, x + 12, ly);
            line = text[ci];
            ly += 16;
          } else {
            line = test;
          }
        }
        if (line) ctx.fillText(line, x + 12, ly);
      });
    },

    /**
     * 树形图（节点连线）
     * {op:'tree', root:{text, children:[]}, x, y, hGap, vGap}
     */
    tree: function (ctx, cmd) {
      var root = cmd.root;
      if (!root) return;
      var x0 = cmd.x || 400, y0 = cmd.y || 60;
      var vGap = cmd.vGap || 70, hGap = cmd.hGap || 130;
      var color = cmd.color || '#4a7c59';

      function drawNode(node, x, y, depth) {
        // 计算子树宽度
        var subW = function (n) {
          if (!n.children || !n.children.length) return hGap;
          return n.children.reduce(function (s, c) { return s + subW(c); }, 0);
        };
        var width = subW(node);

        // 绘制自己
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        var text = node.text || '';
        ctx.font = '13px "LXGW WenKai", sans-serif';
        var bw = ctx.measureText(text).width + 24;
        var bh = 28;
        var bx = x - bw / 2, by = y - bh / 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 14);
        else ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1a3a2a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);

        // 递归画子节点
        if (node.children && node.children.length) {
          var childY = y + vGap;
          var curX = x - width / 2;
          node.children.forEach(function (c) {
            var cw = subW(c);
            var childX = curX + cw / 2;
            // 连线
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, y + bh / 2);
            ctx.lineTo(childX, childY - 14);
            ctx.stroke();
            drawNode(c, childX, childY, depth + 1);
            curX += cw;
          });
        }
      }
      drawNode(root, x0, y0, 0);
      ctx.textAlign = 'left';
    }
  };


  function _bindEventBus() {
    EventBus.on(EventBus.ACTION.WHITEBOARD_DRAW, function (commands) {
      executeCommands(commands);
    });
    EventBus.on(EventBus.ACTION.WHITEBOARD_CLEAR, function () {
      clear();
    });
  }

  window.Whiteboard = {
    init: init,
    destroy: destroy,
    clear: clear,
    undo: undo,
    saveSnapshot: saveSnapshot,
    executeCommands: executeCommands,
    BIO_SHAPES: BIO_SHAPES
  };

})();
