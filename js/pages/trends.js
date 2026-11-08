/**
 * ============================================================
 * TATABOX — 学情趋势 & 冲刺周报模块
 * 数据可视化：纯 SVG 绘制趋势图，Canvas 导出周报卡片
 * 读取 localStorage(bioquest_history) 学习历史
 * ============================================================
 */
(function () {
  'use strict';

  var RADAR_AXES = ['分子', '细胞', '遗传', '进化', '生态'];

  // 维度关键词：把 history 中的 module/concept 归类到 5 个维度
  var DIM_KEYWORDS = {
    '分子': ['分子', 'molecule', 'biochem', '生化', '蛋白质', '核酸', '代谢', 'metabol', 'protein'],
    '细胞': ['细胞', 'cell', '膜', '分裂', 'mitos', 'organelle', '细胞器', '光合', '呼吸'],
    '遗传': ['遗传', 'genetic', 'mendel', '孟德尔', '基因', 'dna', 'rna', '染色体', 'gene'],
    '进化': ['进化', 'evolut', '选择', '物种', '系统发育', '达尔文'],
    '生态': ['生态', 'ecolog', '种群', '群落', '生态系统', '动物', '植物', '微生物', 'animal', 'plant']
  };

  /* ---------- 样式注入（只一次） ---------- */
  var _stylesInjected = false;
  function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    var css = '' +
      '.trends-page{max-width:1100px;margin:0 auto;padding:32px 20px 60px;}' +
      '.trends-header{margin-bottom:24px;}' +
      '.trends-header h2{font-size:1.6rem;color:var(--color-deep,#1a3a2a);margin:0 0 4px;font-family:var(--font-serif,serif);}' +
      '.trends-header p{color:var(--text-muted,#8a8a8a);font-size:0.9rem;margin:0;}' +
      '.trends-tabs{display:flex;gap:8px;border-bottom:1px solid var(--border-light,#ece8e1);margin-bottom:24px;}' +
      '.trends-tab{padding:12px 22px;border:none;background:none;font-size:0.95rem;color:var(--text-muted,#8a8a8a);cursor:pointer;position:relative;transition:color .2s;font-family:inherit;}' +
      '.trends-tab:hover{color:var(--color-sage,#3a8c5c);}' +
      '.trends-tab.active{color:var(--color-deep,#1a3a2a);font-weight:600;}' +
      '.trends-tab.active::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--color-sage,#3a8c5c);}' +
      '.trends-range{display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap;}' +
      '.trends-range-btn{padding:6px 16px;border:1px solid var(--border-light,#ece8e1);border-radius:16px;background:#fff;color:var(--text-muted,#8a8a8a);font-size:0.82rem;cursor:pointer;transition:all .2s;font-family:inherit;}' +
      '.trends-range-btn.active{background:var(--color-sage,#3a8c5c);color:#fff;border-color:var(--color-sage,#3a8c5c);}' +
      '.trends-grid{display:grid;grid-template-columns:1fr;gap:18px;}' +
      '@media(min-width:760px){.trends-grid{grid-template-columns:1fr 1fr;}}' +
      '.trends-card{background:var(--card-bg,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:12px;padding:18px;}' +
      '.trends-card-title{font-size:0.95rem;font-weight:600;color:var(--color-deep,#1a3a2a);margin:0 0 4px;}' +
      '.trends-card-desc{font-size:0.78rem;color:var(--text-muted,#8a8a8a);margin:0 0 14px;}' +
      '.trends-svg{width:100%;height:auto;display:block;}' +
      '.trends-empty{text-align:center;padding:60px 20px;color:var(--text-muted,#8a8a8a);}' +
      '.trends-empty-icon{margin:0 auto 14px;opacity:0.45;}' +
      // 周报
      '.wr-card{background:var(--card-bg,#fff);border:1px solid var(--border-light,#ece8e1);border-radius:12px;padding:20px;margin-bottom:16px;}' +
      '.wr-card h3{font-size:1rem;color:var(--color-deep,#1a3a2a);margin:0 0 12px;}' +
      '.wr-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}' +
      '@media(min-width:620px){.wr-stats{grid-template-columns:repeat(4,1fr);}}' +
      '.wr-stat{background:rgba(58,140,92,0.08);border:1px solid rgba(58,140,92,0.12);border-radius:8px;padding:12px;text-align:center;}' +
      '.wr-stat-val{font-size:1.5rem;font-weight:700;color:var(--color-sage,#3a8c5c);line-height:1.2;}' +
      '.wr-stat-label{font-size:0.75rem;color:var(--text-muted,#8a8a8a);margin-top:4px;}' +
      '.wr-list{list-style:none;padding:0;margin:0;}' +
      '.wr-list li{padding:8px 0;border-bottom:1px dashed var(--border-light,#ece8e1);font-size:0.88rem;color:var(--text-secondary,#555);line-height:1.5;}' +
      '.wr-list li:last-child{border-bottom:none;}' +
      '.wr-tag{display:inline-block;padding:2px 8px;border-radius:8px;font-size:0.72rem;margin-right:6px;background:rgba(58,140,92,0.12);color:var(--color-sage,#3a8c5c);}' +
      '.wr-tag.warn{background:rgba(196,149,106,0.15);color:var(--color-amber,#c4956a);}' +
      '.wr-export{display:inline-flex;align-items:center;gap:8px;padding:10px 24px;border:none;border-radius:16px;background:#3a8c5c;color:#fff;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:inherit;box-shadow:var(--shadow-md);}' +
      '.trends-tab-panel{display:none;}' +
      '.trends-tab-panel.active{display:block;}';
    var s = document.createElement('style');
    s.id = 'trends-module-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ==================== 数据读取与归一化 ==================== */

  // 读取学习历史，归一化为 { date, module, concept, correct, total, score, duration }
  function readHistory() {
    var out = [];
    var sources = ['tatabox_history', 'tatabox_records'];
    for (var s = 0; s < sources.length; s++) {
      var raw = null;
      try { raw = localStorage.getItem(sources[s]); } catch (e) { raw = null; }
      if (!raw) continue;
      var arr = null;
      try { arr = JSON.parse(raw); } catch (e) { arr = null; }
      if (!Array.isArray(arr)) continue;
      for (var i = 0; i < arr.length; i++) {
        var norm = normalizeEntry(arr[i]);
        if (norm) out.push(norm);
      }
      if (out.length > 0) break; // 优先用 bioquest_history
    }
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  function normalizeEntry(item) {
    if (!item) return null;
    // 本地时区日期（避免 UTC 在正时区错位一天）
    var date = item.date || (item.timestamp ? localDateStr(item.timestamp) : null);
    if (!date) return null;
    if (date.length > 10) date = date.slice(0, 10);

    var module = item.module || item.module_num || item.moduleNum || '';
    var concept = item.concept || item.subject || '';
    var correct = 0, total = 0, score = 0, duration = 0;

    if (typeof item.correct === 'number' && typeof item.total === 'number') {
      correct = item.correct; total = item.total;
    } else if (typeof item.totalQuestions === 'number' || typeof item.correctCount === 'number') {
      total = item.totalQuestions || 0;
      correct = item.correctCount || 0;
      // 防御旧考试记录：correctCount 曾为子题级，可能 > 题目数
      if (total > 0 && correct > total) correct = total;
    } else if (Array.isArray(item.answers) && item.answers.length > 0) {
      total = item.answers.length;
      for (var k = 0; k < item.answers.length; k++) {
        if (item.answers[k] && item.answers[k].isCorrect) correct++;
      }
      module = module || (item.answers[0] && item.answers[0].module) || '';
      concept = concept || (item.answers[0] && item.answers[0].concept) || '';
    } else if (typeof item.isCorrect === 'boolean') {
      total = 1; correct = item.isCorrect ? 1 : 0;
    }

    if (typeof item.score === 'number') score = item.score;
    if (typeof item.duration === 'number') duration = item.duration;

    if (total === 0 && score === 0 && duration === 0) return null;
    return {
      date: date, module: String(module || ''), concept: String(concept || ''),
      correct: correct, total: total, score: score, duration: duration
    };
  }

  // 归类到 5 维度之一
  function classifyDimension(entry) {
    var text = (entry.module + ' ' + entry.concept).toLowerCase();
    var order = ['遗传', '进化', '生态', '分子', '细胞'];
    for (var i = 0; i < order.length; i++) {
      var kws = DIM_KEYWORDS[order[i]];
      for (var j = 0; j < kws.length; j++) {
        if (text.indexOf(kws[j].toLowerCase()) >= 0) return order[i];
      }
    }
    var m = entry.module.toLowerCase();
    if (m === 'module_1' || m === 'module1' || m === '1') return '细胞';
    if (m === 'module_2' || m === 'module2' || m === '2') return '生态';
    if (m === 'module_3' || m === 'module3' || m === '3') return '生态';
    if (m === 'module_4' || m === 'module4' || m === '4') return '遗传';
    return '分子';
  }

  function filterRecent(history, days) {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    var cutStr = localDateStr(cutoff);
    return history.filter(function (h) { return h.date >= cutStr; });
  }

  // 按天聚合
  function groupByDay(history) {
    var map = {};
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      if (!map[h.date]) map[h.date] = { date: h.date, total: 0, correct: 0, scoreSum: 0, scoreCount: 0, duration: 0 };
      map[h.date].total += h.total;
      map[h.date].correct += h.correct;
      map[h.date].duration += h.duration;
      if (h.score > 0) { map[h.date].scoreSum += h.score; map[h.date].scoreCount++; }
    }
    return map;
  }

  function buildDaySeries(days) {
    var now = new Date();
    var arr = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(now);
      d.setDate(d.getDate() - i);
      arr.push(localDateStr(d));
    }
    return arr;
  }

  // 5 维度得分（0-100，基于正确率）
  function buildDimensionScores(history) {
    var dim = { '分子': { t: 0, c: 0 }, '细胞': { t: 0, c: 0 }, '遗传': { t: 0, c: 0 }, '进化': { t: 0, c: 0 }, '生态': { t: 0, c: 0 } };
    for (var i = 0; i < history.length; i++) {
      var d = classifyDimension(history[i]);
      dim[d].t += history[i].total;
      dim[d].c += history[i].correct;
    }
    var scores = [];
    for (var k = 0; k < RADAR_AXES.length; k++) {
      var v = dim[RADAR_AXES[k]];
      scores.push(v.t > 0 ? Math.round((v.c / v.t) * 100) : 0);
    }
    return scores;
  }

  /* ==================== SVG 绘图 ==================== */

  function svgEl(name, attrs, children) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', name);
    if (attrs) {
      for (var k in attrs) {
        if (attrs.hasOwnProperty(k)) el.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (children[i]) el.appendChild(children[i]);
      }
    }
    return el;
  }

  function svgText(text, attrs) {
    var t = svgEl('text', attrs);
    t.textContent = text;
    return t;
  }

  // 柱状图：每日答题数
  function renderBarChart(days, dayMap) {
    var W = 520, H = 200, padL = 36, padB = 24, padT = 12, padR = 12;
    var series = buildDaySeries(days);
    var max = 1;
    var values = series.map(function (d) {
      var v = dayMap[d] ? dayMap[d].total : 0;
      if (v > max) max = v;
      return v;
    });
    var top = Math.max(5, Math.ceil(max / 5) * 5);
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var barW = plotW / series.length;
    var svg = svgEl('svg', { class: 'trends-svg', viewBox: '0 0 ' + W + ' ' + H });

    for (var g = 0; g <= 4; g++) {
      var y = padT + plotH * (g / 4);
      var val = Math.round(top * (1 - g / 4));
      svg.appendChild(svgEl('line', { x1: padL, y1: y.toFixed(1), x2: W - padR, y2: y.toFixed(1), stroke: '#ece8e1', 'stroke-width': 1 }));
      svg.appendChild(svgText(String(val), { x: padL - 6, y: (y + 3).toFixed(1), 'text-anchor': 'end', 'font-size': 9, fill: '#8a8a8a' }));
    }

    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      var h = top > 0 ? (v / top) * plotH : 0;
      var x = padL + i * barW;
      var y2 = padT + plotH - h;
      var bw = Math.max(1, barW - 1.2);
      if (v > 0) {
        svg.appendChild(svgEl('rect', { x: x.toFixed(1), y: y2.toFixed(1), width: bw.toFixed(1), height: Math.max(0.5, h).toFixed(1), fill: '#3a8c5c', rx: 1.5 }));
      } else {
        svg.appendChild(svgEl('rect', { x: x.toFixed(1), y: (padT + plotH - 1).toFixed(1), width: bw.toFixed(1), height: 1, fill: '#f0eee9' }));
      }
    }

    var labelIdx = [0, Math.floor(series.length / 2), series.length - 1];
    for (var li = 0; li < labelIdx.length; li++) {
      var idx = labelIdx[li];
      var lx = padL + idx * barW + barW / 2;
      svg.appendChild(svgText(series[idx].slice(5), { x: lx.toFixed(1), y: H - 6, 'text-anchor': 'middle', 'font-size': 9, fill: '#8a8a8a' }));
    }
    return svg;
  }

  // 折线图：正确率变化
  function renderLineChart(days, dayMap) {
    var W = 520, H = 200, padL = 36, padB = 24, padT = 12, padR = 12;
    var series = buildDaySeries(days);
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var svg = svgEl('svg', { class: 'trends-svg', viewBox: '0 0 ' + W + ' ' + H });

    for (var g = 0; g <= 4; g++) {
      var y = padT + plotH * (g / 4);
      var val = Math.round(100 * (1 - g / 4));
      svg.appendChild(svgEl('line', { x1: padL, y1: y.toFixed(1), x2: W - padR, y2: y.toFixed(1), stroke: '#ece8e1', 'stroke-width': 1 }));
      svg.appendChild(svgText(val + '%', { x: padL - 6, y: (y + 3).toFixed(1), 'text-anchor': 'end', 'font-size': 9, fill: '#8a8a8a' }));
    }

    var pts = [];
    var stepX = plotW / Math.max(1, series.length - 1);
    for (var i = 0; i < series.length; i++) {
      var d = series[i];
      var v = (dayMap[d] && dayMap[d].total > 0) ? (dayMap[d].correct / dayMap[d].total) * 100 : null;
      var x = padL + i * stepX;
      if (v !== null) {
        pts.push({ x: x, y: padT + plotH * (1 - v / 100), v: v });
      }
    }

    if (pts.length >= 2) {
      var dPath = '';
      for (var p = 0; p < pts.length; p++) {
        dPath += (p === 0 ? 'M' : 'L') + pts[p].x.toFixed(1) + ' ' + pts[p].y.toFixed(1) + ' ';
      }
      svg.appendChild(svgEl('path', { d: dPath, fill: 'none', stroke: '#2d6a47', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      var areaD = dPath + 'L' + pts[pts.length - 1].x.toFixed(1) + ' ' + (padT + plotH) + ' L' + pts[0].x.toFixed(1) + ' ' + (padT + plotH) + ' Z';
      svg.appendChild(svgEl('path', { d: areaD, fill: 'rgba(58,140,92,0.12)', stroke: 'none' }));
    }
    for (var q = 0; q < pts.length; q++) {
      svg.appendChild(svgEl('circle', { cx: pts[q].x.toFixed(1), cy: pts[q].y.toFixed(1), r: 2.5, fill: '#fff', stroke: '#2d6a47', 'stroke-width': 1.5 }));
    }

    var labelIdx = [0, Math.floor(series.length / 2), series.length - 1];
    for (var li = 0; li < labelIdx.length; li++) {
      var idx = labelIdx[li];
      var lx = padL + idx * stepX;
      svg.appendChild(svgText(series[idx].slice(5), { x: lx.toFixed(1), y: H - 6, 'text-anchor': 'middle', 'font-size': 9, fill: '#8a8a8a' }));
    }
    return svg;
  }

  // 雷达图：5 维度
  function renderRadar(scores) {
    var size = 260, cx = size / 2, cy = size / 2, R = 88;
    var n = RADAR_AXES.length;
    var svg = svgEl('svg', { class: 'trends-svg', viewBox: '0 0 ' + size + ' ' + size, style: 'max-width:300px;margin:0 auto;' });

    function pt(angle, r) {
      return { x: cx + r * Math.cos(angle - Math.PI / 2), y: cy + r * Math.sin(angle - Math.PI / 2) };
    }

    for (var layer = 1; layer <= 4; layer++) {
      var r = R * layer / 4;
      var polyPts = [];
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2;
        polyPts.push(pt(a, r).x.toFixed(1) + ',' + pt(a, r).y.toFixed(1));
      }
      svg.appendChild(svgEl('polygon', { points: polyPts.join(' '), fill: 'none', stroke: '#ece8e1', 'stroke-width': 1 }));
    }

    for (var j = 0; j < n; j++) {
      var a2 = (j / n) * Math.PI * 2;
      var outer = pt(a2, R);
      svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2: outer.x.toFixed(1), y2: outer.y.toFixed(1), stroke: '#ece8e1', 'stroke-width': 1 }));
      var label = pt(a2, R + 18);
      svg.appendChild(svgText(RADAR_AXES[j], { x: label.x.toFixed(1), y: (label.y + 3).toFixed(1), 'text-anchor': 'middle', 'font-size': 12, fill: '#1a3a2a', 'font-weight': 600 }));
      svg.appendChild(svgText(String(scores[j]), { x: label.x.toFixed(1), y: (label.y + 16).toFixed(1), 'text-anchor': 'middle', 'font-size': 9, fill: '#8a8a8a' }));
    }

    var dataPts = [];
    for (var k = 0; k < n; k++) {
      var a3 = (k / n) * Math.PI * 2;
      var rv = R * (scores[k] / 100);
      dataPts.push(pt(a3, rv).x.toFixed(1) + ',' + pt(a3, rv).y.toFixed(1));
    }
    svg.appendChild(svgEl('polygon', { points: dataPts.join(' '), fill: 'rgba(58,140,92,0.25)', stroke: '#3a8c5c', 'stroke-width': 2 }));
    for (var m = 0; m < n; m++) {
      var a4 = (m / n) * Math.PI * 2;
      var dp = pt(a4, R * (scores[m] / 100));
      svg.appendChild(svgEl('circle', { cx: dp.x.toFixed(1), cy: dp.y.toFixed(1), r: 3, fill: '#2d6a47' }));
    }
    return svg;
  }

  // 热力图：7 行（周一到周日）x N 列（周）
  function renderHeatmap(history) {
    var cell = 12, gap = 3, step = cell + gap;
    var weeks = 18;
    var W = weeks * step + 36, H = 7 * step + 24;
    var svg = svgEl('svg', { class: 'trends-svg', viewBox: '0 0 ' + W + ' ' + H });

    var dayMap = groupByDay(history);
    var now = new Date();
    var curMonday = new Date(now);
    curMonday.setHours(0, 0, 0, 0);
    curMonday.setDate(curMonday.getDate() - ((curMonday.getDay() + 6) % 7));

    var max = 1;
    var cells = [];
    for (var wi = 0; wi < weeks; wi++) {
      for (var r = 0; r < 7; r++) {
        var dateObj = new Date(curMonday);
        dateObj.setDate(dateObj.getDate() - (weeks - 1 - wi) * 7 + r);
        var dStr = localDateStr(dateObj);
        var isFuture = dateObj > now;
        var cnt = (!isFuture && dayMap[dStr]) ? dayMap[dStr].total : 0;
        if (cnt > max) max = cnt;
        cells.push({ col: wi, row: r, count: cnt, date: dStr });
      }
    }

    function colorFor(count) {
      if (count === 0) return '#e8f5e8';
      var ratio = Math.min(1, count / max);
      var c1 = [0xe8, 0xf5, 0xe8], c2 = [0x1a, 0x3a, 0x2a];
      var rr = Math.round(c1[0] + (c2[0] - c1[0]) * ratio);
      var gg = Math.round(c1[1] + (c2[1] - c1[1]) * ratio);
      var bb = Math.round(c1[2] + (c2[2] - c1[2]) * ratio);
      return 'rgb(' + rr + ',' + gg + ',' + bb + ')';
    }

    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var x = 28 + c.col * step;
      var y2 = 6 + c.row * step;
      var rect = svgEl('rect', { x: x, y: y2, width: cell, height: cell, rx: 2, fill: colorFor(c.count) });
      rect.setAttribute('data-date', c.date);
      rect.setAttribute('data-count', String(c.count));
      if (c.count > 0) {
        var title = svgEl('title');
        title.textContent = c.date + ' · ' + c.count + ' 题';
        rect.appendChild(title);
      }
      svg.appendChild(rect);
    }

    var weekDays = ['一', '二', '三', '四', '五', '六', '日'];
    for (var rr = 0; rr < 7; rr++) {
      if (rr % 2 === 0) {
        svg.appendChild(svgText(weekDays[rr], { x: 22, y: (14 + rr * step), 'text-anchor': 'end', 'font-size': 9, fill: '#8a8a8a' }));
      }
    }
    return svg;
  }

  /* ==================== 周报数据计算 ==================== */

  function buildWeeklyReport(history) {
    var now = new Date();
    var weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    var weekStr = localDateStr(weekAgo);
    var twoWeek = new Date(weekAgo); twoWeek.setDate(twoWeek.getDate() - 7);
    var twoWeekStr = localDateStr(twoWeek);

    var thisWeek = history.filter(function (h) { return h.date >= weekStr; });
    var lastWeek = history.filter(function (h) { return h.date >= twoWeekStr && h.date < weekStr; });

    function sum(arr, key) { var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i][key]; return s; }
    var tTotal = sum(thisWeek, 'total'), tCorrect = sum(thisWeek, 'correct');
    var lTotal = sum(lastWeek, 'total'), lCorrect = sum(lastWeek, 'correct');
    var accuracy = tTotal > 0 ? Math.round((tCorrect / tTotal) * 1000) / 10 : 0;
    var lastAcc = lTotal > 0 ? Math.round((lCorrect / lTotal) * 1000) / 10 : 0;

    var dayMap = groupByDay(thisWeek);
    var studyDays = Object.keys(dayMap).filter(function (d) { return dayMap[d].total > 0; }).length;

    var stats = {};
    try { stats = JSON.parse(localStorage.getItem('tatabox_stats') || '{}'); } catch (e) {}
    var bioScore = stats.bio_score || 0;
    // 本周 Bio 分趋势：近两周正确率之差（百分点，保留 1 位小数）
    // 替代旧的「答对数 × 题量截断」估算——原式与 Bio Score 公式无关且量纲失真
    var bioDelta = (tTotal > 0 || lTotal > 0)
      ? Math.round((accuracy - lastAcc) * 10) / 10
      : 0;

    var dimThis = { '分子': { t: 0, c: 0 }, '细胞': { t: 0, c: 0 }, '遗传': { t: 0, c: 0 }, '进化': { t: 0, c: 0 }, '生态': { t: 0, c: 0 } };
    var dimLast = { '分子': { t: 0, c: 0 }, '细胞': { t: 0, c: 0 }, '遗传': { t: 0, c: 0 }, '进化': { t: 0, c: 0 }, '生态': { t: 0, c: 0 } };
    for (var i = 0; i < thisWeek.length; i++) { var d1 = classifyDimension(thisWeek[i]); dimThis[d1].t += thisWeek[i].total; dimThis[d1].c += thisWeek[i].correct; }
    for (var j = 0; j < lastWeek.length; j++) { var d2 = classifyDimension(lastWeek[j]); dimLast[d2].t += lastWeek[j].total; dimLast[d2].c += lastWeek[j].correct; }

    var bestModule = null, bestDelta = -Infinity;
    RADAR_AXES.forEach(function (ax) {
      var cur = dimThis[ax].t > 0 ? dimThis[ax].c / dimThis[ax].t : 0;
      var prev = dimLast[ax].t > 0 ? dimLast[ax].c / dimLast[ax].t : 0;
      var delta = (cur - prev) * 100;
      if (dimThis[ax].t >= 3 && delta > bestDelta) { bestDelta = delta; bestModule = ax; }
    });

    var streak = stats.current_streak || computeStreak(history);
    var weakPoints = computeWeakPoints(thisWeek);

    return {
      total: tTotal, correct: tCorrect, accuracy: accuracy, lastAccuracy: lastAcc,
      studyDays: studyDays, bioScore: bioScore, bioDelta: bioDelta,
      bestModule: bestModule, bestDelta: bestDelta,
      streak: streak, weakPoints: weakPoints,
      weekStart: weekStr
    };
  }

  function computeStreak(history) {
    if (!history.length) return 0;
    var dayMap = groupByDay(history);
    var cur = new Date();
    // 本地时区「今天」（避免 UTC 在正时区把今天读成昨天导致连胜少计）
    var today = localTodayStr();
    if (!dayMap[today]) cur.setDate(cur.getDate() - 1);
    var streak = 0;
    while (true) {
      var ds = localDateStr(cur);
      if (dayMap[ds] && dayMap[ds].total > 0) { streak++; cur.setDate(cur.getDate() - 1); }
      else break;
    }
    return streak;
  }

  // 错误率最高的知识点（本地统计）
  function computeWeakPoints(history) {
    var map = {};
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      var key = h.concept || classifyDimension(h);
      if (!key) continue;
      if (!map[key]) map[key] = { total: 0, correct: 0 };
      map[key].total += h.total;
      map[key].correct += h.correct;
    }
    var arr = [];
    for (var k in map) {
      if (map.hasOwnProperty(k) && map[k].total >= 2) {
        var errRate = 1 - (map[k].correct / map[k].total);
        arr.push({ name: k, errorRate: Math.round(errRate * 100), total: map[k].total });
      }
    }
    arr.sort(function (a, b) { return b.errorRate - a.errorRate || b.total - a.total; });
    return arr.slice(0, 3);
  }

  /* ==================== 渲染：学情趋势 ==================== */

  function renderTrendsTab(container, history, range) {
    var recent = filterRecent(history, range);
    var dayMap = groupByDay(recent);
    var dimScores = buildDimensionScores(recent);

    var rangeBar = '<div class="trends-range" id="trendsRangeBar">' +
      [7, 30, 90].map(function (d) {
        return '<button class="trends-range-btn' + (d === range ? ' active' : '') + '" data-range="' + d + '">' + d + ' 天</button>';
      }).join('') + '</div>';

    container.innerHTML = rangeBar +
      '<div class="trends-grid">' +
        '<div class="trends-card"><div class="trends-card-title">每日答题数</div><div class="trends-card-desc">最近 ' + range + ' 天的练习量分布</div><div id="tc-bar"></div></div>' +
        '<div class="trends-card"><div class="trends-card-title">正确率变化</div><div class="trends-card-desc">仅统计有答题的日期</div><div id="tc-line"></div></div>' +
        '<div class="trends-card"><div class="trends-card-title">各模块得分雷达</div><div class="trends-card-desc">5 大维度掌握度（基于正确率）</div><div id="tc-radar"></div></div>' +
        '<div class="trends-card"><div class="trends-card-title">学习时长热力图</div><div class="trends-card-desc">颜色越深表示当日答题越多</div><div id="tc-heat"></div></div>' +
      '</div>';

    document.getElementById('tc-bar').appendChild(renderBarChart(range, dayMap));
    document.getElementById('tc-line').appendChild(renderLineChart(range, dayMap));
    document.getElementById('tc-radar').appendChild(renderRadar(dimScores));
    document.getElementById('tc-heat').appendChild(renderHeatmap(history));

    var bar = document.getElementById('trendsRangeBar');
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.trends-range-btn');
      if (!btn) return;
      var r = parseInt(btn.getAttribute('data-range'), 10);
      renderTrendsTab(container, history, r);
    });
  }

  /* ==================== 渲染：冲刺周报 ==================== */

  function renderWeeklyTab(container, history) {
    var rpt = buildWeeklyReport(history);
    container.innerHTML = '<div id="wr-loading" style="text-align:center;padding:40px;color:var(--text-muted,#8a8a8a);">生成周报中...</div>';

    fetchForecast(rpt).then(function (enhanced) {
      renderWeeklyContent(container, enhanced);
    }).catch(function () {
      renderWeeklyContent(container, rpt);
    });
  }

  // 调用 /forecast 端点补充建议（失败则用本地统计）
  function fetchForecast(rpt) {
    return new Promise(function (resolve) {
      var resolved = false;
      function done(v) { if (!resolved) { resolved = true; resolve(v); } }
      var weakModules = rpt.weakPoints.map(function (w) { return w.name; });
      try {
        fetch('/forecast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stats: { weak_modules: weakModules, accuracy: rpt.accuracy } })
        }).then(function (r) { return r.json(); }).then(function (data) {
          if (data && data.ok && Array.isArray(data.forecasts) && data.forecasts.length > 0) {
            rpt.forecastTips = data.forecasts.slice(0, 3).map(function (f) {
              return (f.concept || '考点') + (f.practice_tip ? '：' + f.practice_tip : '');
            });
          }
          done(rpt);
        }).catch(function () { done(rpt); });
      } catch (e) { done(rpt); }
      setTimeout(function () { done(rpt); }, 2500);
    });
  }

  function generateSuggestions(rpt) {
    var tips = [];
    if (rpt.bestModule) {
      tips.push('本周「' + rpt.bestModule + '」模块进步明显（+' + (rpt.bestDelta >= 0 ? rpt.bestDelta.toFixed(1) : '0') + '%），下周可适当增加难度题巩固。');
    }
    if (rpt.weakPoints.length > 0) {
      var w = rpt.weakPoints[0];
      tips.push('「' + w.name + '」错误率达 ' + w.errorRate + '%，建议结合错题本针对性复习，每日 5 题强化。');
    } else {
      tips.push('本周各知识点掌握均衡，建议下周尝试混合模块的综合卷，提升实战连贯性。');
    }
    if (rpt.studyDays < 5) {
      tips.push('本周仅学习 ' + rpt.studyDays + ' 天，建议设定每日 20 题的固定目标，培养持续学习习惯。');
    } else if (rpt.accuracy < 70) {
      tips.push('正确率 ' + rpt.accuracy + '% 偏低，建议放慢节奏，优先吃透基础概念再提速。');
    } else {
      tips.push('学习节奏稳定（' + rpt.studyDays + ' 天），下周可挑战高难度题目冲击更高 Bio 分。');
    }
    if (rpt.forecastTips && rpt.forecastTips.length > 0) {
      tips = rpt.forecastTips.concat(tips).slice(0, 3);
    }
    return tips.slice(0, 3);
  }

  function renderWeeklyContent(container, rpt) {
    var deltaStr = (rpt.bioDelta >= 0 ? '+' : '') + rpt.bioDelta;
    var accDelta = rpt.accuracy - rpt.lastAccuracy;
    var accDeltaStr = (accDelta >= 0 ? '+' : '') + accDelta.toFixed(1) + '%';

    var weakHtml = rpt.weakPoints.length > 0
      ? rpt.weakPoints.map(function (w) {
          return '<li><span class="wr-tag warn">错 ' + w.errorRate + '%</span>' + escHtml(w.name) + ' <span style="color:var(--text-muted,#8a8a8a);font-size:0.8rem;">（共 ' + w.total + ' 题）</span></li>';
        }).join('')
      : '<li>本周无明显薄弱知识点</li>';

    var suggestions = generateSuggestions(rpt);
    var sugHtml = suggestions.map(function (s, i) {
      return '<li><span class="wr-tag">' + (i + 1) + '</span>' + escHtml(s) + '</li>';
    }).join('');

    var highlightHtml = '';
    if (rpt.bestModule) {
      highlightHtml += '<li><span class="wr-tag">进步</span>「' + rpt.bestModule + '」模块正确率提升 ' + (rpt.bestDelta >= 0 ? rpt.bestDelta.toFixed(1) : '0') + '%</li>';
    }
    highlightHtml += '<li><span class="wr-tag">打卡</span>连续学习 ' + rpt.streak + ' 天，本周学习 ' + rpt.studyDays + ' 天</li>';

    container.innerHTML =
      '<div class="wr-card">' +
        '<h3>本周学习总结</h3>' +
        '<div class="wr-stats">' +
          '<div class="wr-stat"><div class="wr-stat-val">' + rpt.total + '</div><div class="wr-stat-label">总答题数</div></div>' +
          '<div class="wr-stat"><div class="wr-stat-val">' + rpt.accuracy + '%</div><div class="wr-stat-label">正确率 <span style="font-size:0.7rem;color:' + (accDelta >= 0 ? '#3a8c5c' : '#c4956a') + ';">' + accDeltaStr + '</span></div></div>' +
          '<div class="wr-stat"><div class="wr-stat-val">' + rpt.studyDays + '</div><div class="wr-stat-label">学习天数</div></div>' +
          '<div class="wr-stat"><div class="wr-stat-val">' + deltaStr + '</div><div class="wr-stat-label">Bio 分变化</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="wr-card"><h3>本周亮点</h3><ul class="wr-list">' + highlightHtml + '</ul></div>' +
      '<div class="wr-card"><h3>待加强知识点</h3><ul class="wr-list">' + weakHtml + '</ul></div>' +
      '<div class="wr-card"><h3>下周建议</h3><ul class="wr-list">' + sugHtml + '</ul></div>' +
      '<div style="text-align:center;margin-top:8px;">' +
        '<button class="wr-export" id="wr-export-btn">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          '导出周报为图片' +
        '</button>' +
      '</div>';

    document.getElementById('wr-export-btn').addEventListener('click', function () {
      exportWeeklyReportPNG(rpt);
    });
  }

  function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- Canvas 导出周报卡片 ---------- */
  function exportWeeklyReportPNG(rpt) {
    var canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 800;
    var ctx = canvas.getContext('2d');
    if (!ctx.roundRect) {
      ctx.roundRect = function (x, y, w, h, r) {
        if (typeof r === 'number') r = [r, r, r, r];
        this.moveTo(x + r[0], y);
        this.lineTo(x + w - r[1], y);
        this.arcTo(x + w, y, x + w, y + r[1], r[1]);
        this.lineTo(x + w, y + h - r[2]);
        this.arcTo(x + w, y + h, x + w - r[2], y + h, r[2]);
        this.lineTo(x + r[3], y + h);
        this.arcTo(x, y + h, x, y + h - r[3], r[3]);
        this.lineTo(x, y + r[0]);
        this.arcTo(x, y, x + r[0], y, r[0]);
        this.closePath();
      };
    }

    // 深绿背景
    var grad = ctx.createLinearGradient(0, 0, 600, 800);
    grad.addColorStop(0, '#1a3a2a');
    grad.addColorStop(1, '#0f2418');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 800);

    // 装饰圆
    ctx.fillStyle = 'rgba(58,140,92,0.12)';
    ctx.beginPath(); ctx.arc(520, 90, 120, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(70, 720, 90, 0, Math.PI * 2); ctx.fill();

    // 标题
    ctx.fillStyle = '#e0e8e4';
    ctx.font = 'bold 30px "Noto Serif SC", serif';
    ctx.fillText('冲刺周报', 40, 60);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px sans-serif';
    ctx.fillText(rpt.weekStart + ' ~ ' + new Date().toISOString().split('T')[0], 40, 84);

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.moveTo(40, 100); ctx.lineTo(560, 100); ctx.stroke();

    // 数据卡片 2x2
    var data = [
      { label: '总答题数', value: String(rpt.total) },
      { label: '正确率', value: rpt.accuracy + '%' },
      { label: '学习天数', value: String(rpt.studyDays) },
      { label: 'Bio 分变化', value: (rpt.bioDelta >= 0 ? '+' : '') + rpt.bioDelta }
    ];
    data.forEach(function (item, idx) {
      var x = 40 + (idx % 2) * 270, y = 120 + Math.floor(idx / 2) * 80;
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath(); ctx.roundRect(x, y, 250, 65, 12); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '13px sans-serif';
      ctx.fillText(item.label, x + 18, y + 24);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(item.value, x + 18, y + 52);
    });

    // 亮点
    var y = 300;
    ctx.fillStyle = '#e8a830';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('本周亮点', 40, y);
    y += 28;
    ctx.fillStyle = '#e0e8e4';
    ctx.font = '14px sans-serif';
    var lines = [];
    if (rpt.bestModule) lines.push('· 「' + rpt.bestModule + '」模块正确率提升 ' + (rpt.bestDelta >= 0 ? rpt.bestDelta.toFixed(1) : '0') + '%');
    lines.push('· 连续学习 ' + rpt.streak + ' 天，本周学习 ' + rpt.studyDays + ' 天');
    lines.forEach(function (l) { ctx.fillText(l, 40, y); y += 24; });

    // 薄弱点
    y += 14;
    ctx.fillStyle = '#e8a830';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('待加强知识点', 40, y);
    y += 28;
    ctx.fillStyle = '#e0e8e4';
    ctx.font = '14px sans-serif';
    if (rpt.weakPoints.length > 0) {
      rpt.weakPoints.forEach(function (w) {
        ctx.fillText('· ' + w.name + '（错误率 ' + w.errorRate + '%）', 40, y);
        y += 24;
      });
    } else {
      ctx.fillText('· 各知识点掌握均衡', 40, y); y += 24;
    }

    // 建议
    y += 14;
    ctx.fillStyle = '#e8a830';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('下周建议', 40, y);
    y += 28;
    ctx.fillStyle = '#e0e8e4';
    ctx.font = '14px sans-serif';
    var suggestions = generateSuggestions(rpt);
    suggestions.forEach(function (s, i) {
      var txt = (i + 1) + '. ' + s;
      var lineCount = _drawWrappedText(ctx, txt, 40, y, 520, 22);
      y += 22 * lineCount + 8;
    });

    // 底部
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '12px sans-serif';
    ctx.fillText('TATABOX 高中生物学习平台 · ' + new Date().toLocaleDateString('zh-CN'), 40, 772);
    ctx.fillText('bioquest.dada.im', 470, 772);

    try {
      var link = document.createElement('a');
      link.download = 'bioquest-weekly-' + Date.now() + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('周报已导出');
    } catch (e) {
      showToast('导出失败：' + errText(e));
    }
  }

  function _drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    var chars = text.split('');
    var line = '';
    var yy = y;
    var lineCount = 0;
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = chars[i];
        yy += lineHeight;
        lineCount++;
      } else {
        line = test;
      }
    }
    if (line) { ctx.fillText(line, x, yy); lineCount++; }
    return lineCount;
  }

  /* ==================== 主入口 ==================== */

  function initTrends(target) {
    injectStyles();
    if (!target) target = document.getElementById('page-content');

    var history = readHistory();

    target.innerHTML =
      '<div class="trends-page">' +
        '<div class="trends-header">' +
          '<h2>学情趋势</h2>' +
          '<p>可视化你的学习数据，洞察成长轨迹与冲刺节奏</p>' +
        '</div>' +
        '<div class="trends-tabs">' +
          '<button class="trends-tab active" data-tab="trends">学情趋势</button>' +
          '<button class="trends-tab" data-tab="weekly">冲刺周报</button>' +
        '</div>' +
        '<div class="trends-tab-panel active" id="tp-trends"></div>' +
        '<div class="trends-tab-panel" id="tp-weekly"></div>' +
      '</div>';

    var trendsPanel = document.getElementById('tp-trends');
    var weeklyPanel = document.getElementById('tp-weekly');

    if (history.length === 0) {
      trendsPanel.innerHTML = emptyState('暂无学习数据', '完成一些练习后，这里会展示你的学情趋势图');
      weeklyPanel.innerHTML = emptyState('暂无周报数据', '开始练习，下周即可生成专属冲刺周报');
    } else {
      renderTrendsTab(trendsPanel, history, 30);
      renderWeeklyTab(weeklyPanel, history);
    }

    // tab 切换
    target.querySelector('.trends-tabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.trends-tab');
      if (!btn) return;
      var tab = btn.getAttribute('data-tab');
      target.querySelectorAll('.trends-tab').forEach(function (t) { t.classList.remove('active'); });
      btn.classList.add('active');
      trendsPanel.classList.toggle('active', tab === 'trends');
      weeklyPanel.classList.toggle('active', tab === 'weekly');
    });
  }

  function emptyState(title, desc) {
    return '<div class="trends-empty">' +
      '<svg class="trends-empty-icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/>' +
      '</svg>' +
      '<h3 style="font-size:1.1rem;color:var(--text-secondary,#555);margin:0 0 8px;">' + title + '</h3>' +
      '<p style="font-size:0.88rem;margin:0 0 20px;">' + desc + '</p>' +
      '<button class="wr-export" data-on=\'["navigateTo","/practice"]\'>去练习</button>' +
    '</div>';
  }

  window.initTrends = initTrends;

})();
