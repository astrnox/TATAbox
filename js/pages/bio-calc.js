/**
 * ============================================================
 * TATABOX — Bio 分计算器（#/bio-calc）
 * ------------------------------------------------------------
 * 用户友好的自定义计算器：输入六维属性（B/I/O/G/C/D，0-100）
 * 实时推演 Bio Score 总分、评级与单维贡献，公式全程透明。
 *
 * 特性：
 *   1) 环形分数表盘：分数 / 评级 / 协同修正实时变色；
 *   2) 六维双向联动输入：滑块拖动 数字框精确输入，每条轨道
 *      自带维度说明与权重标签，颜色随维度区分；
 *   3) 得分贡献拆解：分段堆叠条 + 逐维「×权重」明细，一眼看懂
 *      分数从哪来；
 *   4) 快捷模板 / 随机 / 重置 / 载入真实数据（从本地统计换算）；
 *   5) 公式透明卡：复用 score-engine 的 BIO_SCORE_EXPLAIN 元数据。
 *
 * 依赖：js/core/score-engine.js（computeBioScoreFromRaw / computeBioDimensions
 *       / BIO_SCORE_EXPLAIN / BIO_WEIGHTS），由 app.js 模块依赖表注入。
 * ============================================================
 */
(function () {
  'use strict';

  function $id(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function clampNum(v, lo, hi) {
    v = parseFloat(v);
    if (!isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, v));
  }

  var DIM_META = {
    B: { name: '基础正确率', color: '#4a7c59' },
    I: { name: '洞察力', color: '#3b82c4' },
    O: { name: '活跃度', color: '#e0a13c' },
    G: { name: '成长性', color: '#7c5cbf' },
    C: { name: '一致性', color: '#2aa085' },
    D: { name: '难度突破力', color: '#d0603a' }
  };
  var GRADE_COLORS = {
    'S+': '#2e8b5d', 'S': '#3a8c5c', 'A+': '#4a7c59', 'A': '#5a7d5c',
    'B+': '#c49a4a', 'B': '#d0a13c', 'C+': '#d47030', 'C': '#d47030',
    'D+': '#c0553a', 'D': '#c0553a'
  };
  var PRESETS = {
    top:      { name: '学霸模板', v: { B: 86, I: 88, O: 90, G: 85, C: 92, D: 84 } },
    balanced: { name: '均衡成长', v: { B: 70, I: 70, O: 74, G: 76, C: 72, D: 70 } },
    special:  { name: '偏科攻坚', v: { B: 95, I: 90, O: 32, G: 55, C: 58, D: 92 } },
    novice:   { name: '新手入门', v: { B: 45, I: 40, O: 52, G: 48, C: 45, D: 40 } }
  };
  var KEYS = ['B', 'I', 'O', 'G', 'C', 'D'];

  function injectStyles() {
    var id = 'bio-calc-style';
    if (document.getElementById(id)) return;
    var css = '' +
      '.bc-wrap{max-width:1020px;margin:0 auto;padding:24px 16px 56px;font-family:var(--font-sans,inherit);}' +
      '.bc-hero{padding:24px 26px 20px;border-radius:16px;background:rgba(74,124,89,.10);border:1px solid rgba(74,124,89,.25);margin-bottom:18px;}' +
      '.bc-hero h1{margin:0 0 8px;font-size:1.4rem;color:var(--color-ink,#2c3e30);}' +
      '.bc-hero p{margin:0 0 10px;font-size:.92rem;color:var(--text-muted,#667);line-height:1.7;}' +
      '.bc-hero a{font-size:.82rem;color:#4a7c59;text-decoration:none;font-weight:600;}' +
      '.bc-hero a:hover{text-decoration:underline;}' +

      '.bc-layout{display:grid;grid-template-columns:300px 1fr;gap:16px;align-items:start;}' +
      '@media(max-width:860px){.bc-layout{grid-template-columns:1fr;}}' +

      '.bc-card{background:var(--color-card,#fff);border:1px solid var(--color-border,rgba(196,149,106,.18));border-radius:16px;padding:18px;box-shadow:var(--shadow-md);}' +

      /* ---- 表盘卡 ---- */
      '.bc-gauge-card{position:sticky;top:14px;}' +
      '@media(max-width:860px){.bc-gauge-card{position:static;}}' +
      '.bc-gauge{position:relative;width:170px;height:170px;margin:6px auto 4px;}' +
      '.bc-gauge svg{width:100%;height:100%;}' +
      '.bc-ring-bg{fill:none;stroke:#ece9e2;stroke-width:13;}' +
      '.bc-ring-fg{fill:none;stroke:#4a7c59;stroke-width:13;stroke-linecap:round;transition:stroke-dashoffset .25s ease,stroke .25s ease;}' +
      '.bc-gauge-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}' +
      '.bc-gauge-num{font-size:2.5rem;font-weight:800;line-height:1;font-family:var(--font-mono,monospace);color:#3a6b4a;}' +
      '.bc-gauge-label{font-size:.78rem;color:#99a;margin-top:2px;}' +
      '.bc-gauge-grade{margin-top:12px;text-align:center;}' +
      '.bc-grade-badge{display:inline-block;padding:4px 14px;border-radius:16px;color:#fff;font-size:.95rem;font-weight:800;letter-spacing:.5px;}' +
      '.bc-grade-text{font-size:.8rem;color:#667;margin-top:6px;text-align:center;}' +
      '.bc-synergy{margin-top:10px;text-align:center;font-size:.78rem;color:#c49a4a;min-height:16px;font-weight:600;}' +

      /* ---- 快捷操作 ---- */
      '.bc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}' +
      '.bc-btn{display:inline-flex;align-items:center;gap:5px;padding:8px 13px;border:none;border-radius:8px;background:#f0ece4;color:#556;font-size:.8rem;cursor:pointer;font-family:inherit;transition:filter .15s,background .15s;}' +
      '.bc-btn:hover{filter:brightness(.97);}' +
      '.bc-btn--primary{background:#4a7c59;color:#fff;}' +
      '.bc-btn--primary:hover{filter:brightness(1.08);}' +
      '.bc-presets-label{font-size:.72rem;color:#99a;margin:16px 0 6px;font-weight:700;letter-spacing:1px;}' +
      '.bc-presets{display:flex;flex-wrap:wrap;gap:8px;}' +
      '.bc-chip{padding:6px 12px;border-radius:16px;border:1px solid rgba(74,124,89,.4);background:transparent;color:#4a7c59;font-size:.78rem;cursor:pointer;font-family:inherit;transition:all .15s;}' +
      '.bc-chip:hover{background:rgba(74,124,89,.10);}' +
      '.bc-chip--active{background:#4a7c59;color:#fff;border-color:#4a7c59;}' +

      /* ---- 六维输入 ---- */
      '.bc-inputs{display:flex;flex-direction:column;gap:12px;}' +
      '.bc-dim{border:1px solid var(--color-border,rgba(196,149,106,.16));border-radius:12px;padding:12px 14px 10px;background:var(--surface-secondary,#faf9f5);}' +
      '.bc-dim-head{display:flex;align-items:center;gap:10px;margin-bottom:8px;}' +
      '.bc-dim-key{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:.9rem;flex:none;}' +
      '.bc-dim-name{font-weight:700;font-size:.9rem;color:var(--color-ink,#2c3e30);flex:1;}' +
      '.bc-dim-w{font-size:.72rem;color:#99a;background:#f0ece4;border-radius:8px;padding:2px 7px;flex:none;}' +
      'input[type=number].bc-num{width:58px;padding:6px 7px;border:1px solid #ccc;border-radius:8px;font-size:.9rem;text-align:center;background:#fff;color:inherit;}' +
      'input[type=range].bc-range{width:100%;-webkit-appearance:none;appearance:none;height:8px;border-radius:4px;outline:none;background:#ece9e2;transition:background .1s;}' +
      'input[type=range].bc-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:3px solid var(--c,#4a7c59);cursor:pointer;box-shadow:var(--shadow-sm);}' +
      'input[type=range].bc-range::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid var(--c,#4a7c59);cursor:pointer;}' +
      '.bc-dim-help{font-size:.74rem;color:#99a;margin-top:6px;line-height:1.55;}' +

      /* ---- 贡献拆解 ---- */
      '.bc-contrib{margin-top:16px;}' +
      '.bc-contrib h2{font-size:1.02rem;margin:0 0 10px;color:var(--color-ink,#2c3e30);}' +
      '.bc-seg{display:flex;height:14px;border-radius:8px;overflow:hidden;background:#ece9e2;gap:2px;}' +
      '.bc-seg b{display:block;height:100%;min-width:2px;transition:width .2s ease;opacity:.95;}' +
      '.bc-contrib-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:12px;}' +
      '.bc-contrib-item{display:flex;align-items:center;gap:8px;font-size:.78rem;color:#556;}' +
      '.bc-contrib-item i{width:10px;height:10px;border-radius:2px;flex:none;}' +
      '.bc-contrib-item b{margin-left:auto;font-family:var(--font-mono,monospace);color:#3a6b4a;}' +

      /* ---- 公式透明 ---- */
      '.bc-explain{margin-top:18px;}' +
      '.bc-explain .bc-row{display:flex;gap:10px;padding:8px 0;font-size:.82rem;color:#556;line-height:1.65;align-items:flex-start;border-bottom:1px dashed rgba(120,140,130,.25);}' +
      '.bc-explain .bc-row:last-child{border-bottom:none;}' +
      '.bc-explain .bc-row b{flex:none;min-width:110px;color:var(--color-ink,#2c3e30);}' +
      '.bc-grades{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}' +
      '.bc-gchip{font-size:.76rem;padding:4px 10px;border-radius:16px;color:#fff;}' +

      /* ---- 黑暗模式 ---- */
      'html.dark .bc-card,html.dark .bc-wrap .bc-dim{background:#202622;border-color:rgba(196,149,106,.16);}' +
      'html.dark .bc-hero{background:rgba(74,124,89,.18);border-color:rgba(74,124,89,.35);}' +
      'html.dark .bc-hero h1,html.dark .bc-contrib h2,html.dark .bc-dim-name,html.dark .bc-explain .bc-row b{color:#d4ddd6;}' +
      'html.dark .bc-hero p,html.dark .bc-grade-text,html.dark .bc-contrib-item{color:#b7c2ba;}' +
      'html.dark .bc-dim{background:#1d231f;}' +
      'html.dark .bc-dim-w{background:#333c36;color:#aab6ad;}' +
      'html.dark input[type=number].bc-num{background:#161b18;border-color:#3a453e;color:#d4ddd6;}' +
      'html.dark .bc-ring-bg,html.dark .bc-seg{stroke:#333c36;background:#333c36;}' +
      'html.dark .bc-btn{background:#333c36;color:#c6d0c8;}' +
      'html.dark .bc-chip{color:#8fc3a0;border-color:rgba(143,195,160,.4);}' +
      'html.dark .bc-chip:hover{background:rgba(143,195,160,.12);}' +
      'html.dark .bc-chip--active{background:#4a7c59;color:#fff;border-color:#4a7c59;}' +
      'html.dark .bc-gauge-num{color:#8fc3a0;}' +
      'html.dark .bc-dim-help,html.dark .bc-presets-label{color:#8a968d;}';
    var st = document.createElement('style');
    st.id = id;
    st.textContent = css;
    document.head.appendChild(st);
  }

  function readComp() {
    var comp = {};
    KEYS.forEach(function (k) {
      var el = $id('bc-' + k + '-n');
      comp[k] = el ? clampNum(el.value, 0, 100) : 0;
    });
    return comp;
  }

  function setComp(comp, activePreset) {
    KEYS.forEach(function (k) {
      var r = $id('bc-' + k + '-r');
      var n = $id('bc-' + k + '-n');
      var v = Math.round(clampNum(comp[k], 0, 100));
      if (r) { r.value = v; paintRange(r, v, DIM_META[k].color); }
      if (n) { n.value = v; }
    });
    // 模板高亮
    document.querySelectorAll('.bc-chip[data-preset]').forEach(function (c) {
      c.classList.toggle('bc-chip--active', c.getAttribute('data-preset') === activePreset);
    });
    recompute();
  }

  function paintRange(el, v, color) {
    /* P0 去渐变：滑杆填充改为单色（原两段渐变填充） */
    el.style.background = color;
  }

  function setEnable(enabled) {
    var el = $id('bc-unavailable');
    if (el) el.style.display = enabled ? 'none' : 'block';
  }

  function buildGauge(score, grade) {
    var c = 2 * Math.PI * 64; // r=64 → ≈402
    var off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
    var gColor = GRADE_COLORS[grade] || '#4a7c59';
    var ring = $id('bc-ring-fg');
    if (ring) {
      ring.style.stroke = gColor;
      ring.style.strokeDasharray = c;
      ring.style.strokeDashoffset = off;
    }
    var num = $id('bc-gauge-num');
    if (num) {
      num.textContent = score;
      num.style.color = gColor;
    }
  }

  function renderGauge(score, grade, letter, synergy) {
    var gc = $id('bc-gauge');
    if (gc && !gc.getAttribute('data-built')) {
      gc.setAttribute('data-built', '1');
      gc.innerHTML =
        '<svg viewBox="0 0 160 160" aria-hidden="true">' +
        '<circle class="bc-ring-bg" cx="80" cy="80" r="64"/>' +
        '<circle class="bc-ring-fg" id="bc-ring-fg" cx="80" cy="80" r="64" transform="rotate(-90 80 80)"/>' +
        '</svg>' +
        '<div class="bc-gauge-center">' +
        '<div class="bc-gauge-num" id="bc-gauge-num">0</div>' +
        '<div class="bc-gauge-label">/ 100</div>' +
        '</div>';
      document.getElementById('bc-gauge-live').textContent = '';
    }
    buildGauge(score, grade);
    var badge = $id('bc-grade-badge');
    if (badge) {
      badge.textContent = grade + ' · ' + letter;
      badge.style.background = GRADE_COLORS[grade] || '#4a7c59';
    }
    var syn = $id('bc-synergy');
    if (syn) syn.textContent = synergy;
  }

  function renderDims() {
    var box = $id('bc-dims');
    if (!box) return;
    var w = (window.BIO_WEIGHTS) || { B: .25, I: .25, O: .10, G: .15, C: .15, D: .10 };
    box.innerHTML = KEYS.map(function (k) {
      var m = DIM_META[k];
      var pct = Math.round((w[k] || 0) * 100) + '%';
      return '<div class="bc-dim">' +
        '<div class="bc-dim-head">' +
        '<span class="bc-dim-key" style="background:' + m.color + '">' + k + '</span>' +
        '<span class="bc-dim-name">' + m.name + '</span>' +
        '<span class="bc-dim-w">权重 ' + pct + '</span>' +
        '<input type="number" id="bc-' + k + '-n" class="bc-num" min="0" max="100" value="50" aria-label="' + esc(m.name) + '数值">' +
        '</div>' +
        '<input type="range" id="bc-' + k + '-r" class="bc-range" min="0" max="100" value="50" style="--c:' + m.color + '" aria-label="' + esc(m.name) + '滑块">' +
        '<div class="bc-dim-help">' + dimHelp(k) + '</div>' +
        '</div>';
    }).join('');
  }

  function dimHelp(k) {
    var d = { B: '正确率经正态 CDF 映射：55%→50，80%→84', I: '难度加权的题级全对率（无明细按 正确率² 估算，标注低置信度）', O: 'log2(场次+1)×18 + 近 7 天连续奖励', G: 'Holt 平滑趋势：进步加分、退步减分，中性 50', C: '变异系数衰减 100·e^(−3CV²)，越稳越高', D: '模块正确率 × 难度系数加权均值' }[k];
    return d || '';
  }

  function synergyOf(comp) {
    var B = comp.B, I = comp.I;
    if (B >= 70 && I >= 70) return '+5 B/I 双强协同';
    if (B < 40 && I < 40) return '−5 B/I 双弱协同';
    return '';
  }

  function renderContrib(out, comp) {
    var w = window.BIO_WEIGHTS || { B: .25, I: .25, O: .10, G: .15, C: .15, D: .10 };
    var raw = out.raw;
    var seg = $id('bc-seg');
    var list = $id('bc-contrib-list');
    if (!seg || !list) return;
    var items = KEYS.map(function (k) {
      var v = comp[k] || 0;
      var contrib = v * (w[k] || 0);
      return { key: k, color: DIM_META[k].color, contrib: contrib, v: v, wp: w[k] || 0 };
    });
    var total = items.reduce(function (s, it) { return s + it.contrib; }, 0);
    var norm = Math.max(0.001, total);
    seg.innerHTML = items.map(function (it) {
      return '<b style="background:' + it.color + ';width:' + (it.contrib / Math.max(raw, 0.001) * 100) + '%"></b>';
    }).join('');
    list.innerHTML = items.map(function (it) {
      return '<div class="bc-contrib-item"><i style="background:' + it.color + '"></i>' +
        '<span>' + it.key + ' ' + Math.round(it.v) + ' × ' + Math.round(it.wp * 100) + '%</span>' +
        '<b>' + Math.round(it.contrib * 100) / 100 + ' 分</b></div>';
    }).join('');
    // 空结果兜底：raw=0 时所有段宽 0，堆叠为空轨
    if (raw <= 0) {
      seg.innerHTML = '<b style="width:0"></b>';
    }
    var sumLabel = $id('bc-seg-sum');
    if (sumLabel) {
      var syn = out.score - raw;
      sumLabel.textContent = '加权小计 ' + Math.round(total) + (syn !== 0 ? ' ± 协同修正 ' + syn : '') + ' → 最终 ' + out.score + ' 分';
    }
  }

  function recompute(activePreset) {
    if (typeof window.computeBioScoreFromRaw !== 'function') {
      var g = $id('bc-gauge-num');
      if (g) g.classList.add('bc-gauge-num');
      setEnable(false);
      return;
    }
    setEnable(true);
    var comp = readComp();
    var out = window.computeBioScoreFromRaw(comp);
    var synergy = synergyOf(comp);
    renderGauge(out.score, out.grade, out.letter, synergy);
    renderContrib(out, comp);
  }

  function loadRealData() {
    try {
      var stats = null, records = [];
      try { stats = JSON.parse(localStorage.getItem('bioquest_stats') || 'null'); } catch (e) {}
      try { records = JSON.parse(localStorage.getItem('bioquest_records') || '[]'); } catch (e) {}
      if (!stats || typeof window.computeBioDimensions !== 'function') {
        alert('暂未读取到你的统计数据。先去「练习」刷几题，再来看看你的真实 Bio 分吧。');
        return;
      }
      var dims = window.computeBioDimensions(stats, Array.isArray(records) ? records : []);
      if (!dims || typeof dims.B !== 'number') { alert('统计数据不足以换算六维，先去练习几题吧。'); return; }
      setComp(dims, '');
    } catch (e) {
      alert('读取统计失败：' + (e && e.message));
    }
  }

  function buildBioCalcWidget(host, opts) {
    opts = opts || {};
    injectStyles();
    if (!host || host.getAttribute('data-bc-built')) return;
    host.setAttribute('data-bc-built', '1');

    host.innerHTML =
      '<div class="bc-layout">' +

      '<div class="bc-card bc-gauge-card" aria-live="polite">' +
      '<div class="bc-gauge" id="bc-gauge"><svg viewBox="0 0 160 160" aria-hidden="true">' +
      '<circle class="bc-ring-bg" cx="80" cy="80" r="64"/>' +
      '<circle class="bc-ring-fg" id="bc-ring-fg" cx="80" cy="80" r="64" transform="rotate(-90 80 80)"/>' +
      '</svg><div class="bc-gauge-center">' +
      '<div class="bc-gauge-num" id="bc-gauge-num">0</div>' +
      '<div class="bc-gauge-label">/ 100</div></div></div>' +
      '<div class="bc-gauge-grade"><span class="bc-grade-badge" id="bc-grade-badge">—</span></div>' +
      '<div class="bc-grade-text" id="bc-gauge-live"></div>' +
      '<div class="bc-synergy" id="bc-synergy"></div>' +
      '<div class="bc-actions">' +
      '<button type="button" class="bc-btn bc-btn--primary" data-act="random">随机</button>' +
      '<button type="button" class="bc-btn" data-act="reset">↺ 重置 50</button>' +
      '<button type="button" class="bc-btn" data-act="real">载入真实数据</button>' +
      '</div>' +
      '<div class="bc-presets-label">快捷模板</div>' +
      '<div class="bc-presets">' +
      Object.keys(PRESETS).map(function (p) {
        return '<button type="button" class="bc-chip" data-preset="' + p + '">' + PRESETS[p].name + '</button>';
      }).join('') +
      '</div>' +
      '</div>' +

      '<div class="bc-card">' +
      '<div id="bc-unavailable" style="display:none;color:#c0553a;font-size:.85rem;margin-bottom:10px">评分引擎未就绪，请刷新页面重试。</div>' +
      '<div id="bc-dims"></div>' +
      '</div>' +

      '</div><!-- /bc-layout -->' +

      '<div class="bc-card bc-contrib">' +
      '<h2>得分贡献拆解 <span id="bc-seg-sum" style="font-size:.78rem;color:#99a;font-weight:400;margin-left:8px"></span></h2>' +
      '<div class="bc-seg" id="bc-seg"></div>' +
      '<div class="bc-contrib-list" id="bc-contrib-list"></div>' +
      '</div>' +

      '<div class="bc-card bc-explain">' +
      '<h2 style="font-size:1.02rem;margin:0 0 8px;color:var(--color-ink,#2c3e30)">计算规则公开</h2>' +
      '<div class="bc-row"><b>公式</b><span id="bc-formula"></span></div>' +
      '<div class="bc-row"><b>评级对照</b><span id="bc-grades"></span></div>' +
      '<div id="bc-gradenote"></div>' +
      '<div id="bc-dims-explain"></div>' +
      '</div>';

    // 填充公式与说明元数据
    var exp = window.BIO_SCORE_EXPLAIN;
    if (exp) {
      var f = $id('bc-formula');
      if (f) f.textContent = exp.formula;
      var gl = $id('bc-grades');
      if (gl) {
        gl.innerHTML = exp.grades.map(function (g) {
          return '<span class="bc-gchip" style="background:' + (GRADE_COLORS[g.grade] || '#4a7c59') + '">' + g.grade + ' ≥' + g.min + ' · ' + esc(g.desc) + '</span>';
        }).join('');
      }
      var gn = $id('bc-gradenote');
      if (gn && exp.gradeNote) {
        gn.innerHTML = '<div class="bc-row"><b>为什么这么定</b><span style="color:#99a">' + esc(exp.gradeNote) + '</span></div>';
      }
      var de = $id('bc-dims-explain');
      if (de) {
        de.innerHTML = exp.dims.map(function (d) {
          var color = (DIM_META[d.key] || {}).color || '#4a7c59';
          return '<div class="bc-row"><b style="color:' + color + '">' + esc(d.name) + '（权重 ' + esc(d.weight) + '）</b>' +
            '<span>' + esc(d.desc) + '</span></div>';
        }).join('');
      }
    } else {
      var f2 = $id('bc-formula');
      if (f2) f2.textContent = 'Bio Score = B×25% + I×25% + O×10% + G×15% + C×15% + D×10%（B/I 协同 ±5）';
    }

    renderDims();
    setComp(
      opts.preset && PRESETS[opts.preset] ? PRESETS[opts.preset].v : { B: 70, I: 70, O: 74, G: 76, C: 72, D: 70 },
      opts.preset && PRESETS[opts.preset] ? opts.preset : 'balanced'
    );

    // 事件委托
    host.addEventListener('input', function (e) {
      var el = e.target;
      if (!el || !el.id) return;
      if (el.id.indexOf('bc-') === 0) {
        var k = el.id.charAt(3);
        var isRange = el.className.indexOf('bc-range') >= 0;
        var other = $id(isRange ? 'bc-' + k + '-n' : 'bc-' + k + '-r');
        if (isRange) {
          el.style.background = (DIM_META[k] ? DIM_META[k].color : '#4a7c59');
          if (other) other.value = clampNum(el.value, 0, 100);
        } else if (other) {
          other.value = clampNum(el.value, 0, 100);
          paintRange(other, clampNum(el.value, 0, 100), DIM_META[k] ? DIM_META[k].color : '#4a7c59');
        }
        recompute();
      }
    });
    host.addEventListener('click', function (e) {
      var act = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (act) {
        var a = act.getAttribute('data-act');
        if (a === 'random') {
          var rand = {};
          KEYS.forEach(function (k) { rand[k] = Math.floor(Math.random() * 101); });
          setComp(rand, '');
        } else if (a === 'reset') {
          var zero = {};
          KEYS.forEach(function (k) { zero[k] = 50; });
          setComp(zero, '');
        } else if (a === 'real') {
          loadRealData();
        }
        return;
      }
      var chip = e.target && e.target.closest ? e.target.closest('[data-preset]') : null;
      if (chip) {
        var p = chip.getAttribute('data-preset');
        setComp(PRESETS[p].v, p);
      }
    });
  }

  /** 全页模式（含页头说明） */
  function renderBioCalcPage(target) {
    target = target || document.getElementById('page-content') || document.body;
    injectStyles();
    target.innerHTML =
      '<div class="bc-wrap">' +
      '<div class="bc-hero">' +
      '<h1>Bio 分计算器</h1>' +
      '<p>拖动六维滑块（或直接输入数字），总分、评级、单维贡献全部<b>实时联动</b>。公式 100% 公开、结果可复现，绝无黑箱。</p>' +
      '<a href="#/data-lab">→ 数据实验室：查看 CR 信用、正确率等全部指标的计算方式</a>' +
      '</div>' +
      '<div id="bc-host"></div>' +
      '</div>';
    buildBioCalcWidget($id('bc-host'));
  }

  /** 内嵌模式：供「我的-设置」等宿主页面调用，主题随宿主 */
  function renderBioCalcWidget(container) {
    if (container) buildBioCalcWidget(container);
  }

  function initBioCalc(target) {
    if (!target) {
      if (typeof AppState !== 'undefined' && AppState.rootElement) target = AppState.rootElement;
      else target = document.getElementById('page-content');
    }
    renderBioCalcPage(target);
  }

  window.renderBioCalcPage = initBioCalc;
  window.initBioCalc = initBioCalc;
  window.renderBioCalcWidget = renderBioCalcWidget;
})();