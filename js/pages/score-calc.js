/**
 * ============================================================
 * TATABOX — 数据实验室（#/data-lab）
 * ------------------------------------------------------------
 * 目标：把 Bio Score / 信用指数 CR 等核心数据的计算方式完全透明地公开，
 * 并提供「自变量 → 因变量」的实时推演：
 *   1) Bio Score 计算器：输入六维属性（B/I/O/G/C/D，0-100）→ 实时总分+评级；
 *      「填入我的真实数据」自动读取本地统计并换算成六维后代入。
 *   2) CR 信用计算器：输入行为参数（距离天数/各行为次数/违规/消费）→ 实时信用+等级。
 *   3) 正确率速算 + 计分规则说明（CBO 标准）。
 *   4) 公式透明卡：完整展示两个模型的公式、权重、常量与评级表。
 *
 * 依赖：js/core/score-engine.js（computeBioScoreFromRaw / computeBioDimensions /
 *       BIO_SCORE_EXPLAIN）、js/core/credit-metrics.js（computeCreditScore / CR_EXPLAIN）
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

  function injectStyles() {
    var id = 'score-calc-style';
    if (document.getElementById(id)) return;
    var css = '' +
      '.sc-wrap{max-width:980px;margin:0 auto;padding:24px 16px 48px;font-family:var(--font-sans,inherit);}' +
      '.sc-hero{padding:22px 22px 18px;border-radius:16px;background:rgba(74,124,89,.10);border:1px solid rgba(74,124,89,.25);margin-bottom:20px;}' +
      '.sc-hero h1{margin:0 0 8px;font-size:1.35rem;color:var(--color-ink,#2c3e30);}' +
      '.sc-hero p{margin:0;font-size:.92rem;color:var(--text-muted,#667);line-height:1.7;}' +
      '.sc-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}' +
      '@media(max-width:820px){.sc-grid{grid-template-columns:1fr;}}' +
      '.sc-card{background:var(--color-card,#fff);border:1px solid var(--color-border,rgba(196,149,106,.18));border-radius:16px;padding:18px;box-shadow:var(--shadow-md);}' +
      '.sc-card h2{margin:0 0 4px;font-size:1.05rem;color:var(--color-ink,#2c3e30);}' +
      '.sc-card .sc-sub{font-size:.8rem;color:var(--text-muted,#889);margin:0 0 14px;line-height:1.6;}' +
      '.sc-row{display:flex;align-items:center;gap:10px;margin:10px 0;flex-wrap:wrap;}' +
      '.sc-label{width:118px;font-size:.85rem;color:#556;flex:none;}' +
      '.sc-label small{display:block;color:#99a;font-size:.7rem;}' +
      'input[type=range].sc-range{flex:1;min-width:120px;accent-color:#4a7c59;}' +
      'input[type=number].sc-num{width:64px;padding:6px 8px;border:1px solid #ccc;border-radius:8px;font-size:.9rem;}' +
      '.sc-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border:none;border-radius:8px;background:#4a7c59;color:#fff;font-size:.86rem;cursor:pointer;font-family:inherit;transition:filter .15s;}' +
      '.sc-btn:hover{filter:brightness(1.08);}' +
      '.sc-btn--ghost{background:#fff;border:1px solid #4a7c59;color:#4a7c59;}' +
      '.sc-result{margin-top:14px;padding:14px 16px;border-radius:12px;background:rgba(74,124,89,.07);border:1px solid rgba(74,124,89,.28);}' +
      '.sc-result-big{font-size:1.9rem;font-weight:800;color:#3a6b4a;line-height:1.1;}' +
      '.sc-result .sc-grade{font-size:1.05rem;color:#5a7d5c;font-weight:700;margin-top:2px;}' +
      '.sc-bars{margin-top:10px;display:flex;flex-direction:column;gap:6px;}' +
      '.sc-bar{display:flex;align-items:center;gap:8px;font-size:.78rem;color:#667;}' +
      '.sc-bar i{flex:1;height:8px;border-radius:4px;background:#ece9e2;overflow:hidden;display:block;}' +
      '.sc-bar i b{display:block;height:100%;background:#7fae8a;border-radius:4px;}' +
      '.sc-detail{font-size:.8rem;color:#667;margin-top:8px;line-height:1.7;}' +
      '.sc-legend{font-size:.78rem;color:#99a;border-top:1px dashed rgba(120,140,130,.3);margin-top:14px;padding-top:10px;line-height:1.7;}' +
      '.sc-tip{font-size:.78rem;color:#8a9;margin-top:8px;}' +
      'html.dark .sc-card,html.dark .sc-wrap{background:#1e2420;border-color:rgba(196,149,106,.16);}' +
      'html.dark .sc-card{background:#202622;}' +
      'html.dark .sc-card h2,html.dark .sc-hero h1{color:#d4ddd6;}' +
      'html.dark .sc-label,html.dark .sc-bar,html.dark .sc-detail{color:#b7c2ba;}' +
      'html.dark .sc-hero{background:rgba(74,124,89,.18);border-color:rgba(74,124,89,.35);}' +
      'html.dark input[type=number].sc-num{background:#161b18;border-color:#3a453e;color:#d4ddd6;}' +
      'html.dark .sc-result{background:rgba(74,124,89,.14);border-color:rgba(74,124,89,.4);}' +
      'html.dark .sc-bar i{background:#333c36;}';
    var st = document.createElement('style');
    st.id = id;
    st.textContent = css;
    document.head.appendChild(st);
  }

  function readBioInputs() {
    var keys = ['B', 'I', 'O', 'G', 'C', 'D'];
    var comp = {};
    keys.forEach(function (k) {
      var el = $id('sc-bio-' + k);
      var v = el ? clampNum(el.value, 0, 100) : 0;
      comp[k] = v;
    });
    return comp;
  }

  function renderBioResult(comp) {
    var out = window.computeBioScoreFromRaw(comp);
    var keys = ['B', 'I', 'O', 'G', 'C', 'D'];
    var bars = keys.map(function (k) {
      var v = window.computeBioScoreFromRaw ? (comp[k] || 0) : 0;
      return '<div class="sc-bar"><span>' + k + '</span><i><b style="width:' + Math.min(100, v) + '%"></b></i><span>' + Math.round(v) + '</span></div>';
    }).join('');
    var el = $id('sc-bio-result');
    if (!el) return;
    el.innerHTML =
      '<div class="sc-result">' +
      '<div class="sc-result-big">' + out.score + ' <span style="font-size:.9rem;color:#8a9">/ 100</span></div>' +
      '<div class="sc-grade">评级 ' + out.grade + ' · ' + esc(out.letter) + '</div>' +
      '<div class="sc-bars">' + bars + '</div>' +
      '<div class="sc-detail">加权合成：' +
      'B×25% + I×25% + O×10% + G×15% + C×15% + D×10%' +
      (comp.B >= 70 && comp.I >= 70 ? '（B/I 双强协同 +5）' : (comp.B < 40 && comp.I < 40 ? '（B/I 双弱协同 −5）' : '')) +
      '</div>' +
      '</div>';
  }

  function fillRealBio() {
    try {
      var stats = null;
      var records = [];
      try { stats = JSON.parse(localStorage.getItem('tatabox_stats') || 'null'); } catch (e) {}
      try { records = JSON.parse(localStorage.getItem('tatabox_records') || '[]'); } catch (e) {}
      if (!stats || typeof window.computeBioDimensions !== 'function') {
        alert('暂未读取到你的统计数据（bioquest_stats）。先去练习几题再来吧。');
        return;
      }
      var dims = window.computeBioDimensions(stats, Array.isArray(records) ? records : []);
      ['B', 'I', 'O', 'G', 'C', 'D'].forEach(function (k) {
        var el = $id('sc-bio-' + k);
        if (el) el.value = Math.round(dims[k]);
      });
      renderBioResult(dims);
    } catch (e) {
      alert('读取统计失败：' + (e && e.message));
    }
  }

  function readCrInputs() {
    return {
      days: clampNum($id('sc-cr-days') && $id('sc-cr-days').value, 0, 3650),
      login: clampNum($id('sc-cr-login') && $id('sc-cr-login').value, 0, 1000),
      practice: clampNum($id('sc-cr-practice') && $id('sc-cr-practice').value, 0, 1000),
      feedback: clampNum($id('sc-cr-feedback') && $id('sc-cr-feedback').value, 0, 500),
      post: clampNum($id('sc-cr-post') && $id('sc-cr-post').value, 0, 500),
      comment: clampNum($id('sc-cr-comment') && $id('sc-cr-comment').value, 0, 500),
      uncivil: clampNum($id('sc-cr-uncivil') && $id('sc-cr-uncivil').value, 0, 200),
      spam: clampNum($id('sc-cr-spam') && $id('sc-cr-spam').value, 0, 200),
      invalid: clampNum($id('sc-cr-invalid') && $id('sc-cr-invalid').value, 0, 200),
      spendC: clampNum($id('sc-cr-spendc') && $id('sc-cr-spendc').value, 0, 1000),
      spendP: clampNum($id('sc-cr-spendp') && $id('sc-cr-spendp').value, 0, 1000),
      spendR: clampNum($id('sc-cr-spendr') && $id('sc-cr-spendr').value, 0, 1000)
    };
  }

  function buildCrLedger(inp) {
    var now = Date.now();
    var day = 86400000;
    var ts = now - inp.days * day;
    var actions = [];
    var G = window.CR_V2.GAINS, P = window.CR_V2.PENALTIES, C = window.CR_V2.COSTS;
    for (var i = 0; i < inp.login; i++) actions.push({ delta: G.DAILY_LOGIN, ts: ts });
    // 答题全对奖励按日封顶（PRACTICE_DAILY_CAP）折算为一次性增量
    var practiceDays = Math.ceil(inp.practice / G.PRACTICE_DAILY_CAP);
    for (var j = 0; j < practiceDays; j++) actions.push({ delta: G.PRACTICE_DAILY_CAP, ts: ts - j * day });
    for (var k = 0; k < inp.feedback; k++) actions.push({ delta: G.FEEDBACK, ts: ts });
    for (var m = 0; m < inp.post; m++) actions.push({ delta: G.POST, ts: ts });
    for (var n = 0; n < inp.comment; n++) actions.push({ delta: G.COMMENT, ts: ts });

    var penalties = [];
    for (var a = 0; a < inp.uncivil; a++) penalties.push({ amount: P.UNCIVIL_POST, ts: ts });
    for (var b = 0; b < inp.spam; b++) penalties.push({ amount: P.SPAM, ts: ts });
    for (var c = 0; c < inp.invalid; c++) penalties.push({ amount: P.INVALID_REPORT, ts: ts });

    return {
      actions: actions,
      penalties: penalties,
      spends: inp.spendC * C.COMMENT + inp.spendP * C.POST + inp.spendR * C.REPORT
    };
  }

  function renderCrResult() {
    var inp = readCrInputs();
    var r = window.computeCreditScore(buildCrLedger(inp));
    var el = $id('sc-cr-result');
    if (!el) return;
    var level = r.level;
    el.innerHTML =
      '<div class="sc-result">' +
      '<div class="sc-result-big">' + r.score + ' <span style="font-size:.9rem;color:#8a9">/ 200</span></div>' +
      '<div class="sc-grade">' + esc(level.label) + (level.nextAt != null ? '（距下一级还需 ' + Math.max(0, Math.ceil(level.nextAt - r.score)) + ' 分）' : '（已满级）') + '</div>' +
      '<div class="sc-detail">' +
      '基础 ' + r.parts.base + ' + 行为收益 ' + r.parts.gains +
      ' − 违规 ' + r.parts.penalties + ' − 消费 ' + r.parts.spends +
      '</div>' +
      '<div class="sc-tip">注：模型采用近因权重 w=e^(−0.03×天数)，' + inp.days + ' 天前发生的行为当前只保留约 ' +
      Math.round(Math.exp(-0.03 * inp.days) * 100) + '% 的价值。' +
      '</div>' +
      '</div>';
  }

  function renderAccResult() {
    var c = clampNum($id('sc-acc-c') && $id('sc-acc-c').value, 0, 1e9);
    var t = clampNum($id('sc-acc-t') && $id('sc-acc-t').value, 1, 1e9);
    var pct = Math.round(c / t * 1000) / 10;
    var el = $id('sc-acc-result');
    if (!el) return;
    var tone = pct >= 80 ? '#3a8c5c' : pct >= 60 ? '#c49a4a' : '#c0553a';
    el.innerHTML = '<div class="sc-result"><div class="sc-result-big" style="color:' + tone + '">' + pct + '%</div>' +
      '<div class="sc-detail">答对 ' + c + ' / 共 ' + t + ' 题</div></div>';
  }

  function renderExplain() {
    var bio = window.BIO_SCORE_EXPLAIN;
    var cr = window.CR_EXPLAIN;
    var bioHtml = '';
    if (bio) {
      bioHtml = '<div class="sc-card" style="grid-column:1/-1">' +
        '<h2>' + esc(bio.title) + ' — 计算规则公开</h2>' +
        '<p class="sc-sub">' + esc(bio.formula) + '</p>' +
        bio.dims.map(function (d) {
          return '<div class="sc-row"><span class="sc-label">' + d.name + ' <small>权重 ' + d.weight + '</small></span>' +
            '<span style="flex:1;font-size:.82rem;color:#667;line-height:1.6">' + esc(d.desc) + '</span></div>';
        }).join('') +
        '<div class="sc-legend">评级：' + bio.grades.map(function (g) { return g.grade + '(' + g.min + '+ ' + g.desc + ')'; }).join(' · ') + '</div>' +
        '</div>';
    }
    var crHtml = '';
    if (cr) {
      var gTbl = Object.keys(cr.gains).filter(function (k) { return k.indexOf('CAP') < 0; })
        .map(function (k) { return k + ' ' + cr.gains[k]; }).join('、');
      var pTbl = Object.keys(cr.penalties).map(function (k) { return k + ' −' + cr.penalties[k]; }).join('、');
      var cTbl = Object.keys(cr.costs).map(function (k) { return k + ' −' + cr.costs[k]; }).join('、');
      crHtml = '<div class="sc-card" style="grid-column:1/-1">' +
        '<h2>' + esc(cr.title) + ' — 计算规则公开</h2>' +
        '<p class="sc-sub">' + esc(cr.formula) + '</p>' +
        '<div class="sc-detail">• ' + esc(cr.nearCause) + '</div>' +
        '<div class="sc-detail">• ' + esc(cr.baseNote) + '</div>' +
        '<div class="sc-row"><span class="sc-label">行为加分</span><span style="flex:1;font-size:.8rem;color:#667">' + esc(gTbl) + '</span></div>' +
        '<div class="sc-row"><span class="sc-label">违规扣分</span><span style="flex:1;font-size:.8rem;color:#667">' + esc(pTbl) + '</span></div>' +
        '<div class="sc-row"><span class="sc-label">行为消费</span><span style="flex:1;font-size:.8rem;color:#667">' + esc(cTbl) + '</span></div>' +
        '<div class="sc-legend">等级：' + cr.levels.map(function (l) { return l.label + '(' + l.min + '+ 分)'; }).join(' · ') + '</div>' +
        '</div>';
    }
    return bioHtml + crHtml;
  }

  function renderScoreCalcPage(target) {
    injectStyles();
    target = target || document.getElementById('page-content') || document.body;

    var html = '' +
      '<div class="sc-wrap">' +
      '<div class="sc-hero"><h1>数据实验室</h1>' +
      '<p>这里 100% 公开 TATABOX 各项数据指标的计算方式。你可以像做实验一样：<b>任意输入自变量</b>（六维属性、行为次数、天数…），<b>实时观察因变量</b>（Bio Score、信用指数 CR、正确率）如何变化，所有公式与阈值一览无余。</p></div>' +

      '<div class="sc-grid">' +

      '<!-- Bio Score 计算器 -->' +
      '<div class="sc-card">' +
      '<h2>Bio Score 推演（因变量：总分）</h2>' +
      '<p class="sc-sub">输入六维属性（0-100），即可算出加权总分与评级。左侧滑块可拖动，右侧数字框可精确输入。</p>' +
      '<button type="button" class="sc-btn sc-btn--ghost" data-action="sc-fill-bio">填入我的真实数据</button>' +
      '<div id="sc-bio-inputs">' +
      ['B', 'I', 'O', 'G', 'C', 'D'].map(function (k) {
        var name = { B: '基础正确率 B', I: '洞察力 I', O: '活跃度 O', G: '成长性 G', C: '一致性 C', D: '难度突破 D' }[k];
        return '<div class="sc-row"><span class="sc-label">' + name + '</span>' +
          '<input type="range" id="sc-bio-' + k + '" class="sc-range" min="0" max="100" value="50" data-link="sc-bio-' + k + '-n">' +
          '<input type="number" id="sc-bio-' + k + '-n" class="sc-num" min="0" max="100" value="50" data-link="sc-bio-' + k + '"></div>';
      }).join('') +
      '</div>' +
      '<div id="sc-bio-result"></div>' +
      '</div>' +

      '<!-- CR 计算器 -->' +
      '<div class="sc-card">' +
      '<h2>CR 信用推演（因变量：信用指数）</h2>' +
      '<p class="sc-sub">输入你的行为参数（可视为过去 N 天内的总量），实时得到 v2 科学模型的信用分与信任等级。</p>' +
      '<div class="sc-row"><span class="sc-label">行为距今天数</span><input type="number" id="sc-cr-days" class="sc-num" min="0" max="3650" value="3"></div>' +
      '<div class="sc-row"><span class="sc-label">每日登录次数</span><input type="number" id="sc-cr-login" class="sc-num" min="0" value="5"></div>' +
      '<div class="sc-row"><span class="sc-label">全对答题(题)</span><input type="number" id="sc-cr-practice" class="sc-num" min="0" value="40"></div>' +
      '<div class="sc-row"><span class="sc-label">有效反馈/举报</span><input type="number" id="sc-cr-feedback" class="sc-num" min="0" value="1"></div>' +
      '<div class="sc-row"><span class="sc-label">发帖数</span><input type="number" id="sc-cr-post" class="sc-num" min="0" value="0"></div>' +
      '<div class="sc-row"><span class="sc-label">评论数</span><input type="number" id="sc-cr-comment" class="sc-num" min="0" value="2"></div>' +
      '<div class="sc-row"><span class="sc-label">不文明帖数</span><input type="number" id="sc-cr-uncivil" class="sc-num" min="0" value="0"></div>' +
      '<div class="sc-row"><span class="sc-label">刷屏数</span><input type="number" id="sc-cr-spam" class="sc-num" min="0" value="0"></div>' +
      '<div class="sc-row"><span class="sc-label">无效举报数</span><input type="number" id="sc-cr-invalid" class="sc-num" min="0" value="0"></div>' +
      '<div class="sc-row"><span class="sc-label">消费(评论/发帖/举报)</span><input type="number" id="sc-cr-spendc" class="sc-num" min="0" value="0" title="评论 1 / 发帖 2 / 举报 2" style="width:64px">' +
      '<input type="number" id="sc-cr-spendp" class="sc-num" min="0" value="0"><input type="number" id="sc-cr-spendr" class="sc-num" min="0" value="0"></div>' +
      '<div id="sc-cr-result"></div>' +
      '<div class="sc-legend">消费分别代表 评论×1 / 发帖×2 / 举报×2（永久扣除，不随时间返还）。</div>' +
      '</div>' +

      '<!-- 正确率速算 -->' +
      '<div class="sc-card">' +
      '<h2>正确率速算</h2>' +
      '<p class="sc-sub">经典功能：正确数 ÷ 总数 = 正确率。也用于理解 stats.accuracy 的展示口径（题目级）。</p>' +
      '<div class="sc-row"><span class="sc-label">答对题数</span><input type="number" id="sc-acc-c" class="sc-num" min="0" value="8"></div>' +
      '<div class="sc-row"><span class="sc-label">总题数</span><input type="number" id="sc-acc-t" class="sc-num" min="1" value="10"></div>' +
      '<div id="sc-acc-result"></div>' +
      '<div class="sc-legend">CBO 多选题计分参考：4 子题 4/4=2.0、3/4=1.0、2/4=0.2、其余 0（每题满分 2）。</div>' +
      '</div>' +

      '<div class="sc-card">' +
      '<h2>为什么这么算？</h2>' +
      '<p class="sc-sub">评分设计原则（可追溯、可辩护）：</p>' +
      '<div class="sc-detail">• <b>不能制造“幸存者偏差”</b>：正确率用正态 CDF 映射，避免简单线性在两端过分敏感（80% 与 99% 的差距不应巨大）。</div>' +
      '<div class="sc-detail">• <b>成长看“方向”而非绝对值</b>：成长性以时间升序的平滑趋势衡量，进步加分、退步减分、持平 50 分。</div>' +
      '<div class="sc-detail">• <b>信任不归零</b>：信用模型废除旧版“无条件指数衰减到 0”；基础信任常驻，只有违规与消费才会扣减（且违规近因淡出，给改过自新机会）。</div>' +
      '<div class="sc-detail">• <b>激励机制自洽</b>：行为收益（+1.5~+4）与衰减速率（半衰 23 天）匹配，让“坚持学习+贡献社区”可持续维持高信任。</div>' +
      '</div>' +

      '</div><!-- /sc-grid -->' +

      renderExplain() +
      '</div><!-- /sc-wrap -->';

    target.innerHTML = html;

    // 默认渲染一次
    renderBioResult(readBioInputs());
    renderCrResult();
    renderAccResult();

    // 事件委托：滑块/数字双向联动 + 实时重算
    target.addEventListener('input', function (e) {
      var el = e.target;
      if (!el || !el.id) return;
      if (el.id.indexOf('sc-bio-') === 0) {
        var linked = el.getAttribute('data-link');
        var other = linked ? $id(linked) : null;
        if (other && other !== el) {
          other.value = clampNum(el.value, 0, 100);
        }
        renderBioResult(readBioInputs());
      } else if (el.id.indexOf('sc-cr-') === 0) {
        renderCrResult();
      } else if (el.id.indexOf('sc-acc-') === 0) {
        renderAccResult();
      }
    });
    target.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-action="sc-fill-bio"]') : null;
      if (btn) fillRealBio();
    });
  }

  function initScoreCalc(target) {
    if (!target) {
      if (typeof AppState !== 'undefined' && AppState.rootElement) {
        target = AppState.rootElement;
      } else {
        target = document.getElementById('page-content');
      }
    }
    renderScoreCalcPage(target);
  }

  window.renderDataLabPage = initScoreCalc;
  window.initScoreCalc = initScoreCalc;
})();