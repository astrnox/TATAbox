/**
 * ============================================================
 * TATABOX — 打印工具（js/core/print-utils.js）
 * ============================================================
 * 需求（打印功能统一规范）：
 *   1. 错题打印：可选单道/多道，题干、选项、你的答案、正确答案、解析完整；
 *   2. 练习/组卷打印：页面内直接打印当前题集（仅题目+选项，不含答案）；
 *   2.1 分模式：所有场景均支持 mode='questions'（仅题目）/ 'answers'
 *       （仅答案解析）/ 'all'（错题五要素），题目与答案解析可分开出纸；
 *   3. 所有打印文档每页底部固定标记「TATAbox.cc.cd」；
 *   4. A4 版式（@page size:A4），break-inside:avoid 自动防题目跨页截断，
 *      走浏览器原生打印预览，零第三方依赖；
 *   5. 独立文档窗口打印（window.open + document.write），被弹窗拦截时
 *      回退到隐藏 iframe 打印，保证功能可用。
 *
 * 注意：本文件位于 js/**，受 scripts/audit-design.js 棘轮约束——
 *   禁止新增内联 style=" 属性与 6 位十六进制色值（新代码一律用
 *   rgb()/3 位十六进制/CSS 关键字）。
 * ============================================================ */
(function (global) {
  'use strict';

  var FOOTER_MARK = 'TATAbox.cc.cd';

  /* ---------------- 基础工具 ---------------- */

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function nl2br(s) {
    return esc(s).replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
  }

  function absUrl(u) {
    if (!u) return '';
    var s = String(u);
    if (/^(https?:|data:|blob:|\/\/)/i.test(s)) return s;
    try {
      var base = (global.location && global.location.href) || 'http://localhost/';
      return new URL(s, base).href;
    } catch (e) {
      return s;
    }
  }

  /** 打印窗口是独立文档，相对路径图片会失效——统一把 src / srcset 转绝对 URL */
  function absSrcs(html) {
    var out = String(html || '').replace(/(\ssrc\s*=\s*)(["'])([^"']+)\2/gi, function (m, pre, q, url) {
      return pre + q + absUrl(url) + q;
    });
    // srcset：逗号分隔的 "url 1x/640w" 候选列表，逐个重写首段 URL
    return out.replace(/(\ssrcset\s*=\s*)(["'])([^"']+)\2/gi, function (m, pre, q, val) {
      var parts = String(val).split(',').map(function (part) {
        var bits = part.trim().split(/\s+/);
        if (!bits.length || !bits[0]) return part.trim();
        bits[0] = absUrl(bits[0]);
        return bits.join(' ');
      });
      return pre + q + parts.join(', ') + q;
    });
  }

  /** 选项序号：A–Z，超出 26 项后降级为 AA、AB、…（避免第 27 项变成 [ 等符号） */
  function optionLabel(idx) {
    var n = Number(idx) || 0;
    if (n < 0) n = 0;
    if (n < 26) return String.fromCharCode(65 + n);
    n -= 26;
    var hi = Math.floor(n / 26);
    var lo = n % 26;
    if (hi > 25) return '#' + (Number(idx) + 1);   // 极端溢出兜底
    return String.fromCharCode(65 + hi) + String.fromCharCode(65 + lo);
  }

  /** 选项值 → 纯文本（数组/对象两种 options 形状共用，避免 "[object Object]"） */
  function optionText(o) {
    if (o === undefined || o === null) return '';
    if (typeof o === 'object') {
      if (o.text != null) return String(o.text);
      if (o.content != null) return String(o.content);
      try { return JSON.stringify(o); } catch (e) { return String(o); }
    }
    return String(o);
  }

  /* ---------------- 题目结构归一化 ---------------- */

  /**
   * 把题目 options 归一为 [{label, text}]：
   *   - 数组：['选项文本', ...] → A/B/C/D
   *   - 对象：{A:'文本'} 或逻辑题 {key: text}（键按 practice.js 口径排序）
   *   - 子题：subQuestions（MTF 等）→ 逐条 label + text
   */
  function optionRows(q) {
    if (!q) return null;
    var opts = q.options;
    if (Array.isArray(opts) && opts.length > 0) {
      return opts.map(function (o, i) {
        return { label: optionLabel(i), text: optionText(o) };
      });
    }
    if (opts && typeof opts === 'object') {
      var keys = Object.keys(opts).sort();
      if (keys.length === 0) return null;
      return keys.map(function (k) {
        return { label: k, text: optionText(opts[k]) };
      });
    }
    if (Array.isArray(q.subQuestions) && q.subQuestions.length > 0) {
      return q.subQuestions.map(function (sq, i) {
        if (!sq) return { label: String(i + 1), text: '' };
        return { label: sq.label != null ? String(sq.label) : optionLabel(i), text: sq.text || '' };
      });
    }
    return null;
  }

  /** 正确答案 → 展示文本（数组下标/布尔/字符串全兼容） */
  function lettersOf(answer, rows) {
    if (answer === undefined || answer === null || answer === '') return '';
    if (Array.isArray(answer)) {
      return answer.map(function (a) {
        return typeof a === 'number' ? optionLabel(a) : String(a);
      }).join('、');
    }
    if (typeof answer === 'number') {
      var r = rows && rows[answer];
      return r ? r.label : optionLabel(answer);
    }
    if (typeof answer === 'boolean') return answer ? '正确' : '错误';
    return String(answer);
  }

  /**
   * 本地错题副本索引（qId → fullQuestion）。
   * 缓存按原始字符串校验失效：一次打印批量补全时只解析一次大数组，避免 O(n²)。
   */
  var _localFqCache = null;

  function _localQuestionIndex() {
    if (!global.localStorage) return null;
    var raw = null;
    try { raw = global.localStorage.getItem('bioquest_wrong_questions'); } catch (e) { return null; }
    if (!raw) return null;
    if (_localFqCache && _localFqCache.raw === raw) return _localFqCache.map;
    var map = {};
    try {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach(function (item) {
          if (item && item.fullQuestion) {
            map[String(item.qId || item.id || '')] = item.fullQuestion;
          }
        });
      }
    } catch (e) { return null; }
    _localFqCache = { raw: raw, map: map };
    return map;
  }

  /** 本地（localStorage）错题副本中的完整题目（含选项/解析），用于云端记录补全 */
  function _localFullQuestion(id) {
    if (!id) return null;
    var map = _localQuestionIndex();
    return map ? (map[String(id)] || null) : null;
  }

  /**
   * 归一化错题记录，兼容三种来源：
   *   1. review_cards（supabase sb-data.js）：question_text/user_answer/correct_answer/analysis
   *   2. wrong_questions（supabase.js）：question_text + extra_data{options,answer,explanation}
   *   3. 本地错题本（storage.js）：questionText + fullQuestion{question,options,answer,explanation}
   * 任一来源缺失的字段按 3→2→1 顺序回退补全，保证打印内容完整。
   */
  function normalizeWrongRecord(rec) {
    rec = rec || {};
    var extra = {};
    if (rec.extra_data) {
      if (typeof rec.extra_data === 'string') {
        try { extra = JSON.parse(rec.extra_data) || {}; } catch (e) { extra = {}; }
      } else if (typeof rec.extra_data === 'object') {
        extra = rec.extra_data;
      }
    }
    var fq = rec.fullQuestion || null;
    var recId = rec.question_id || rec.qId || rec.id;
    if (!fq && !rec.options && !(extra && extra.options)) fq = _localFullQuestion(recId);

    var options = rec.options || (extra && extra.options) || (fq && fq.options) || null;
    // DB/jsonb 正常返回数组/对象；兼容历史版本把 options 存成 JSON 字符串
    if (typeof options === 'string') {
      try { options = JSON.parse(options); } catch (e) { options = null; }
    }
    var subQuestions = (extra && extra.sub_questions) || (fq && fq.subQuestions) || null;
    var probe = { options: options, subQuestions: subQuestions };
    var rows = optionRows(probe);
    var answerRaw;
    if (rec.correct_answer) answerRaw = rec.correct_answer;
    else if (extra && extra.answer != null) answerRaw = extra.answer;
    else if (fq && fq.answer != null) answerRaw = fq.answer;
    else answerRaw = null;

    // 时间戳容错：损坏的 localStorage / 云端异常值会生成 Invalid Date，
    // 直接 toISOString() 抛 RangeError 会让整批打印失败——这里降级为空串。
    var dateText = rec.created_at || '';
    if (!dateText && rec.timestamp != null) {
      var tsDate = new Date(rec.timestamp);
      if (!isNaN(tsDate.getTime())) dateText = tsDate.toISOString();
    }

    return {
      question: rec.question_text || rec.questionText ||
        (fq && (fq.question || fq.questionText)) || '',
      rows: rows,
      userAnswer: rec.user_answer || (fq && fq.userAnswer) || '',
      correctAnswer: rec.correct_answer || lettersOf(answerRaw, rows) || '',
      analysis: rec.analysis || (extra && extra.explanation) || (fq && fq.explanation) || '',
      concept: rec.concept || (fq && fq.concept) || '',
      subject: rec.subject || (fq && fq.subject) || '',
      errorReason: rec.error_reason || '',
      chapter: rec.textbook_chapter || '',
      difficulty: rec.difficulty || '',
      date: dateText
    };
  }

  /* ---------------- 打印文档 CSS（A4 + 固定页脚 + 防截断） ---------------- */

  var PRINT_CSS = [
    '@page { size: A4; margin: 15mm 14mm 22mm 14mm; }',
    'html, body { margin: 0; padding: 0; }',
    'body {',
    '  font-family: "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", "Segoe UI", Arial, sans-serif;',
    '  font-size: 11pt; line-height: 1.6; color: #222; background: #fff;',
    '  -webkit-print-color-adjust: exact; print-color-adjust: exact;',
    '}',
    '.doc-head { border-bottom: 2px solid rgb(26,58,42); padding-bottom: 3mm; margin-bottom: 6mm; }',
    '.doc-title { font-size: 17pt; font-weight: 700; color: rgb(26,58,42); }',
    '.doc-meta { font-size: 9.5pt; color: #666; margin-top: 1.5mm; }',
    '.q { break-inside: avoid; page-break-inside: avoid; margin-bottom: 6mm; padding-bottom: 4mm; border-bottom: 1px dashed #ccc; }',
    '.q:last-child { border-bottom: none; }',
    '.q-head { font-size: 10pt; font-weight: 700; color: rgb(26,58,42); }',
    '.q-tags { font-weight: 400; color: #666; font-size: 9pt; }',
    '.q-text { margin: 1mm 0 2mm; }',
    '.q-fig { margin: 2mm 0; }',
    '.q-fig img { max-width: 65mm; max-height: 48mm; display: block; }',
    '.q-opts { margin: 1.5mm 0; }',
    '.q-opts div { margin: 1mm 0; }',
    '.q-opts b { color: rgb(26,58,42); }',
    '.q-box { break-inside: avoid; page-break-inside: avoid; background: rgb(243,247,243);',
    '  border-left: 3px solid rgb(90,125,92); padding: 2mm 3mm; margin: 2mm 0; font-size: 10pt; }',
    '.q-box.q-alt { background: rgb(253,245,235); border-left-color: rgb(196,149,106); }',
    '.q-box .wrong { color: rgb(180,60,50); }',
    '.q-box p { margin: 1mm 0; }',
    '.q-note { font-size: 9pt; color: #777; margin-top: 1mm; }',
    '.print-footer { position: fixed; left: 0; right: 0; bottom: 0;',
    '  text-align: center; font-size: 9pt; letter-spacing: 0.6px; color: #666;',
    '  border-top: 1px solid #ccc; padding-top: 1.5mm; background: #fff; }'
  ].join('\n');

  /* ---------------- 文档与窗口打印 ---------------- */

  function buildDoc(opts) {
    opts = opts || {};
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<title>' + esc(opts.title || 'TATABOX 打印') + '</title>' +
      '<style>' + PRINT_CSS + '</style></head><body>' +
      (opts.title
        ? '<div class="doc-head"><div class="doc-title">' + esc(opts.title) + '</div>' +
          (opts.metaText ? '<div class="doc-meta">' + esc(opts.metaText) + '</div>' : '') +
          '</div>'
        : '') +
      (opts.bodyHtml || '') +
      '<div class="print-footer">' + FOOTER_MARK + '</div>' +
      '</body></html>';
  }

  /**
   * 等待文档内图片解码完成再调起打印，避免打印预览里图片空白。
   * 以 load/error 事件为准，另设 5s 总上限兜底（超慢图不再无限等待）。
   */
  function _printWhenReady(docView) {
    var printed = false;
    function fire() {
      if (printed) return;
      printed = true;
      try { docView.focus(); docView.print(); } catch (e) { /* 用户可手动 Ctrl+P */ }
    }
    var imgs = [];
    try { imgs = docView.document.images || []; } catch (e) { imgs = []; }

    var pending = 0;
    var capTimer = setTimeout(fire, 5000);
    function oneDone() {
      pending--;
      if (pending <= 0) {
        clearTimeout(capTimer);
        setTimeout(fire, 50);
      }
    }
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].complete) continue;
      pending++;
      imgs[i].addEventListener('load', oneDone);
      imgs[i].addEventListener('error', oneDone);
    }
    if (pending === 0) {
      clearTimeout(capTimer);
      setTimeout(fire, 150);
    }
  }

  /**
   * 打开独立窗口渲染 html 并调起原生打印预览；
   * 弹窗被拦截时回退到隐藏 iframe（iframe.print() 同样走浏览器打印）。
   */
  function printDoc(html) {
    var w = null;
    try { w = global.open('', '_blank'); } catch (e) { w = null; }
    if (w) {
      try {
        w.document.open();
        w.document.write(html);
        w.document.close();
        _printWhenReady(w);
        return true;
      } catch (e) { w = null; }
    }

    try {
      var frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('tabindex', '-1');
      // 打印用离屏 iframe：不可见但必须可渲染（display:none 会导致部分浏览器不打印）。
      // 无法改用 class（该 iframe 不属于任何页面样式作用域）。
      // audit-design-allow: setAttribute('style') —— 离屏定位为运行期必需，已登记豁免。
      frame.setAttribute('style', 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;');
      document.body.appendChild(frame);
      var fdoc = frame.contentWindow.document;
      fdoc.open();
      fdoc.write(html);
      fdoc.close();
      _printWhenReady(frame.contentWindow);
      setTimeout(function () {
        try { frame.parentNode.removeChild(frame); } catch (e) { /* 已移除 */ }
      }, 60000);
      if (typeof global.showToast === 'function') {
        global.showToast('已打开打印窗口');
      }
      return true;
    } catch (e) {
      if (typeof global.showToast === 'function') {
        global.showToast('打印失败，请允许弹窗后重试，或用 Ctrl+P 打印');
      }
      return false;
    }
  }

  /* ---------------- 单题渲染 ---------------- */

  function _figureHtml(q) {
    if (!q) return '';
    if (global.BioQuestFigure && typeof global.BioQuestFigure.render === 'function') {
      try {
        var fig = global.BioQuestFigure.render(q, { alt: '题目配图' });
        return fig ? '<div class="q-fig">' + absSrcs(fig) + '</div>' : '';
      } catch (e) { /* 渲染失败不影响文字打印 */ }
    }
    return '';
  }

  /**
   * 单道题的打印 HTML。
   * @param {object} q 题目
   * @param {number} num 序号（0 表示不编号）
   * @param {object} opts { showAnswer:是否输出答案/解析区, detail:{...} 错题详情字段 }
   */
  function questionBlock(q, num, opts) {
    opts = opts || {};
    q = q || {};
    var rows = opts.rows || optionRows(q);
    var h = '<div class="q">';

    var headBits = [];
    if (num) headBits.push('第 ' + num + ' 题');
    var tags = [];
    if (q.subject) tags.push(q.subject);
    if (q.concept) tags.push(q.concept);
    if (q.type === 'multiple') tags.push('多选');
    if (q.type === 'logic') tags.push('逻辑推理');
    h += '<div class="q-head">' + esc(headBits.join(' ')) +
      (tags.length ? '<span class="q-tags">（' + esc(tags.join(' · ')) + '）</span>' : '') +
      '</div>';

    h += '<div class="q-text">' + nl2br(q.question || q.question_text || q.questionText || '') + '</div>';
    h += _figureHtml(q);

    if (rows && rows.length) {
      h += '<div class="q-opts">' + rows.map(function (r) {
        return '<div><b>' + esc(r.label) + '.</b> ' + nl2br(r.text) + '</div>';
      }).join('') + '</div>';
    }

    if (opts.showAnswer) {
      var d = opts.detail || {};
      if (d.userAnswer) {
        h += '<div class="q-box q-alt"><p><strong>你的答案：</strong>' +
          '<span class="wrong">' + nl2br(d.userAnswer) + '</span></p></div>';
      }
      var correct = d.correctAnswer || lettersOf(q.answer, rows);
      if (correct) {
        h += '<div class="q-box"><p><strong>正确答案：</strong>' + nl2br(correct) + '</p></div>';
      }
      var analysis = d.analysis || q.explanation || '';
      if (analysis) {
        h += '<div class="q-box"><p><strong>解析：</strong>' + nl2br(analysis) + '</p></div>';
      }
      var noteBits = [];
      if (d.errorReason) noteBits.push('错误原因：' + d.errorReason);
      if (d.chapter) noteBits.push('章节：' + d.chapter);
      if (noteBits.length) h += '<div class="q-note">' + esc(noteBits.join(' · ')) + '</div>';
    }

    h += '</div>';
    return h;
  }

  /** 子题（MTF/判断组）逐条正确答案 → "A.正确、B.错误" 形式文本 */
  function subAnswersText(q) {
    if (!q || !Array.isArray(q.subQuestions) || q.subQuestions.length === 0) return '';
    return q.subQuestions.map(function (sq, i) {
      if (!sq) return '';
      var label = sq.label != null ? String(sq.label) : optionLabel(i);
      var a = sq.answer;
      if (a === undefined) a = sq.is_true;
      if (typeof a === 'boolean') return label + '. ' + (a ? '正确' : '错误');
      if (a === undefined || a === null || a === '') return '';
      return label + '. ' + lettersOf(a, null);
    }).filter(Boolean).join('、');
  }

  /**
   * 从题目直接取答案视图（练习/组卷「仅答案解析」打印用）：
   * 正确答案优先 q.answer（下标/布尔/数组/字母全兼容），MTF 组题回退逐子题答案。
   */
  function _questionAnswerView(q) {
    q = q || {};
    var rows = optionRows(q);
    var correct = lettersOf(q.answer, rows);
    if (!correct) correct = subAnswersText(q);
    return { correctAnswer: correct, analysis: q.explanation || '' };
  }

  /**
   * 答案解析块（分模式打印）：第 N 题 + 正确答案 + 解析（+你的答案/错误原因），
   * 不含题干与选项——与「仅题目」打印配套使用。
   * @param {object} view { userAnswer, correctAnswer, analysis, errorReason, chapter }
   * @param {number} num 题号
   */
  function answerBlock(view, num) {
    view = view || {};
    var h = '<div class="q">';
    h += '<div class="q-head">第 ' + num + ' 题</div>';
    if (view.userAnswer) {
      h += '<div class="q-box q-alt"><p><strong>你的答案：</strong>' +
        '<span class="wrong">' + nl2br(view.userAnswer) + '</span></p></div>';
    }
    if (view.correctAnswer) {
      h += '<div class="q-box"><p><strong>正确答案：</strong>' + nl2br(view.correctAnswer) + '</p></div>';
    }
    if (view.analysis) {
      h += '<div class="q-box"><p><strong>解析：</strong>' + nl2br(view.analysis) + '</p></div>';
    }
    var noteBits = [];
    if (view.errorReason) noteBits.push('错误原因：' + view.errorReason);
    if (view.chapter) noteBits.push('章节：' + view.chapter);
    if (noteBits.length) h += '<div class="q-note">' + esc(noteBits.join(' · ')) + '</div>';
    h += '</div>';
    return h;
  }

  /* ---------------- 场景入口 ---------------- */

  /**
   * 打印题集（练习界面 / 组卷界面）。
   * @param {Array} questions 题目数组
   * @param {object} meta { title, metaText, mode } mode：
   *   'questions'（默认，仅题目+选项）| 'answers'（仅正确答案+解析）
   */
  function printQuestionSet(questions, meta) {
    meta = meta || {};
    var mode = meta.mode === 'answers' ? 'answers' : 'questions';
    var list = Array.isArray(questions) ? questions.filter(function (q) { return !!q; }) : [];
    if (list.length === 0) {
      if (typeof global.showToast === 'function') global.showToast('当前没有可打印的题目');
      return false;
    }
    var body = list.map(function (q, i) {
      return mode === 'answers'
        ? answerBlock(_questionAnswerView(q), i + 1)
        : questionBlock(q, i + 1, {});
    }).join('');
    var metaText = meta.metaText || ('共 ' + list.length + ' 题 · ' +
      (mode === 'answers' ? '仅含正确答案与解析' : '仅含题目与选项') + ' · 打印时间 ' + _stamp());
    return printDoc(buildDoc({
      title: meta.title || (mode === 'answers' ? '答案解析打印' : '题目打印'),
      metaText: metaText,
      bodyHtml: '<div class="doc-body">' + body + '</div>'
    }));
  }

  /**
   * 打印错题（可选单道/多道）。
   * @param {Array} records 错题记录数组（三种来源均可，内部自动归一化）
   * @param {object} meta { title, metaText, mode } mode：
   *   'all'（默认，题干+选项+你的答案+正确答案+解析五要素）|
   *   'questions'（仅题干+选项）| 'answers'（仅你的答案+正确答案+解析）
   */
  function printWrongRecords(records, meta) {
    meta = meta || {};
    var mode = (meta.mode === 'questions' || meta.mode === 'answers') ? meta.mode : 'all';
    var list = Array.isArray(records) ? records.filter(function (r) { return !!r; }) : [];
    if (list.length === 0) {
      if (typeof global.showToast === 'function') global.showToast('请先勾选要打印的错题');
      return false;
    }
    var failed = 0;
    var body = list.map(function (rec, i) {
      // 单条脏数据不得拖垮整批：降级为一条占位说明，其余记录照常出纸
      try {
        var n = normalizeWrongRecord(rec);
        if (mode === 'questions') {
          return questionBlock(
            { question: n.question, subject: n.subject, concept: n.concept },
            i + 1,
            { rows: n.rows }
          );
        }
        if (mode === 'answers') {
          return answerBlock(
            {
              userAnswer: n.userAnswer,
              correctAnswer: n.correctAnswer,
              analysis: n.analysis,
              errorReason: n.errorReason,
              chapter: n.chapter
            },
            i + 1
          );
        }
        return questionBlock(
          { question: n.question, subject: n.subject, concept: n.concept, explanation: n.analysis },
          i + 1,
          {
            rows: n.rows,
            showAnswer: true,
            detail: {
              userAnswer: n.userAnswer,
              correctAnswer: n.correctAnswer,
              analysis: n.analysis,
              errorReason: n.errorReason,
              chapter: n.chapter
            }
          }
        );
      } catch (e) {
        failed++;
        return '<div class="q"><div class="q-head">第 ' + (i + 1) + ' 题</div>' +
          '<div class="q-note">该条错题记录数据异常，无法完整打印。</div></div>';
      }
    }).join('');
    if (failed > 0) {
      if (typeof global.showToast === 'function') {
        global.showToast(failed + ' 条错题记录数据异常，已按占位方式打印');
      }
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[print-utils] ' + failed + ' 条错题记录渲染失败，已降级为占位块');
      }
    }
    var metaText = meta.metaText || ('共 ' + list.length + ' 道错题 · ' +
      (mode === 'questions' ? '仅含题目与选项'
        : mode === 'answers' ? '仅含正确答案与解析' : '题干、选项、答案、解析齐全') +
      ' · 打印时间 ' + _stamp());
    return printDoc(buildDoc({
      title: meta.title || '错题打印',
      metaText: metaText,
      bodyHtml: '<div class="doc-body">' + body + '</div>'
    }));
  }

  function _stamp() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  var api = {
    FOOTER_MARK: FOOTER_MARK,
    esc: esc,
    nl2br: nl2br,
    absUrl: absUrl,
    absSrcs: absSrcs,
    optionRows: optionRows,
    lettersOf: lettersOf,
    normalizeWrongRecord: normalizeWrongRecord,
    questionBlock: questionBlock,
    answerBlock: answerBlock,
    buildDoc: buildDoc,
    printDoc: printDoc,
    printQuestionSet: printQuestionSet,
    printWrongRecords: printWrongRecords
  };

  global.PrintUtils = api;
  // 测试钩子（tests/unit/print-utils.test.js）
  global.__printUtils = api;
})(typeof window !== 'undefined' ? window : this);
