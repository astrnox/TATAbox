/**
 * ============================================================
 * TATABOX — PRD §1.3：社会价值落地
 * 乡村科普模式 + 濒危物种卡片收集系统
 * ============================================================
 */
(function () {
  'use strict';

  // 乡村科普模式（低流量模式）
  var LOW_FLOW_KEY = 'bioquest_low_flow_mode';

  var LowFlowMode = {
    isEnabled: function () {
      try { return localStorage.getItem(LOW_FLOW_KEY) === 'true'; } catch (e) { return false; }
    },
    enable: function () {
      try { localStorage.setItem(LOW_FLOW_KEY, 'true'); } catch (e) {}
      document.documentElement.setAttribute('data-low-flow', 'true');
      this._apply();
    },
    disable: function () {
      try { localStorage.removeItem(LOW_FLOW_KEY); } catch (e) {}
      document.documentElement.removeAttribute('data-low-flow');
      this._restore();
    },
    _apply: function () {
      // 禁用图片自动加载
      document.querySelectorAll('img').forEach(function (img) {
        if (!img.dataset.originalSrc) {
          img.dataset.originalSrc = img.src;
          img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E';
        }
      });
      // 禁用视频/动画
      document.querySelectorAll('video, canvas[data-animation]').forEach(function (el) {
        if (!el.dataset.originalDisplay) {
          el.dataset.originalDisplay = el.style.display || '';
          el.style.display = 'none';
        }
      });
      // 添加低流量模式提示
      var tip = document.getElementById('low-flow-tip');
      if (!tip) {
        tip = document.createElement('div');
        tip.id = 'low-flow-tip';
        tip.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:9990;background:rgba(90,125,92,0.9);color:#fff;padding:6px 14px;border-radius:12px;font-size:0.75rem;';
        tip.textContent = '低流量模式 - 图片/动画已禁用';
        document.body.appendChild(tip);
      }
    },
    _restore: function () {
      document.querySelectorAll('img[data-original-src]').forEach(function (img) {
        img.src = img.dataset.originalSrc;
        delete img.dataset.originalSrc;
      });
      document.querySelectorAll('[data-original-display]').forEach(function (el) {
        el.style.display = el.dataset.originalDisplay;
        delete el.dataset.originalDisplay;
      });
      var tip = document.getElementById('low-flow-tip');
      if (tip) tip.remove();
    },
    init: function () {
      if (this.isEnabled()) {
        this._apply();
      }
    }
  };

  // 自动初始化
  if (document.readyState === 'complete') {
    LowFlowMode.init();
  } else {
    document.addEventListener('DOMContentLoaded', function () { LowFlowMode.init(); });
  }

  // 濒危物种卡片收集系统
  var COLLECTION_KEY = 'bioquest_species_collection';

  var ENDANGERED_SPECIES = [
    { id: 'panda', name: '大熊猫', latin: 'Ailuropoda melanoleuca', status: 'VU', iucn: '易危', desc: '中国特有物种，栖息于四川、陕西、甘肃的山区竹林中。' },
    { id: 'tiger', name: '华南虎', latin: 'Panthera tigris amoyensis', status: 'CR', iucn: '极危', desc: '中国特有亚种，野外可能已灭绝，仅存于动物园。' },
    { id: 'snowleopard', name: '雪豹', latin: 'Panthera uncia', status: 'VU', iucn: '易危', desc: '栖息于中亚高山地区，被称为"雪山之王"。' },
    { id: 'yangsifen', name: '扬子鳄', latin: 'Alligator sinensis', status: 'CR', iucn: '极危', desc: '中国特有鳄鱼，野生种群不足200条。' },
    { id: 'chinese_sturgeon', name: '中华鲟', latin: 'Acipenser sinensis', status: 'CR', iucn: '极危', desc: '长江特有洄游鱼类，被誉为"水中大熊猫"。' },
    { id: 'golden_monkey', name: '金丝猴', latin: 'Rhinopithecus roxellana', status: 'VU', iucn: '易危', desc: '中国特有灵长类，生活在海拔3000米以上的高山森林。' },
    { id: 'baiji', name: '白鱀豚', latin: 'Lipotes vexillifer', status: 'CR', iucn: '极危（可能已灭绝）', desc: '长江特有淡水豚类，2006年后未在野外发现。' },
    { id: 'crested_ibis', name: '朱鹮', latin: 'Nipponia nippon', status: 'EN', iucn: '濒危', desc: '曾被认为灭绝，1981年在陕西洋县重新发现7只。' }
  ];

  var SpeciesCollection = {
    getAll: function () {
      try { return JSON.parse(localStorage.getItem(COLLECTION_KEY)) || []; } catch (e) { return []; }
    },
    add: function (speciesId) {
      var collection = this.getAll();
      if (collection.indexOf(speciesId) >= 0) return false;
      collection.push(speciesId);
      try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection)); } catch (e) {}
      return true;
    },
    has: function (speciesId) {
      return this.getAll().indexOf(speciesId) >= 0;
    },
    count: function () {
      return this.getAll().length;
    },
    getSpecies: function (speciesId) {
      return ENDANGERED_SPECIES.find(function (s) { return s.id === speciesId; });
    },
    getAllSpecies: function () {
      return ENDANGERED_SPECIES;
    },
    // 答题触发收集
    checkAndCollect: function (questionData) {
      if (!questionData) return null;
      var text = (questionData.stem || questionData.question || '').toLowerCase();
      var collected = null;
      ENDANGERED_SPECIES.forEach(function (species) {
        var keywords = [species.name, species.latin.split(' ')[0].toLowerCase()];
        var match = keywords.some(function (k) { return text.indexOf(k) >= 0; });
        if (match && !SpeciesCollection.has(species.id)) {
          SpeciesCollection.add(species.id);
          collected = species;
        }
      });
      return collected;
    },
    // 渲染收集册
    renderCollection: function (container) {
      if (!container) return;
      var collection = this.getAll();
      var html = '<div style="padding:20px;">';
      html += '<h3 style="font-size:1.1rem;font-weight:700;color:#1a1a1a;margin-bottom:4px;">濒危物种卡片</h3>';
      html += '<p style="font-size:0.85rem;color:#666;margin-bottom:16px;">已收集 ' + collection.length + ' / ' + ENDANGERED_SPECIES.length + ' 种</p>';

      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">';
      ENDANGERED_SPECIES.forEach(function (species) {
        var owned = collection.indexOf(species.id) >= 0;
        html += '<div style="border-radius:12px;padding:12px;text-align:center;' +
          (owned ? 'background:rgba(90,125,92,0.1);border:1px solid rgba(90,125,92,0.2);' : 'background:rgba(0,0,0,0.03);border:1px dashed #ddd;') + '">';
        html += '<div style="font-size:0.85rem;font-weight:600;color:' + (owned ? '#1a1a1a' : '#999') + ';">' + (owned ? species.name : '???') + '</div>';
        if (owned) {
          html += '<div style="font-size:0.7rem;color:#999;font-style:italic;">' + species.latin + '</div>';
          var statusColor = species.status === 'CR' ? '#c0392b' : species.status === 'EN' ? '#e67e22' : '#f39c12';
          html += '<div style="font-size:0.7rem;color:' + statusColor + ';margin-top:2px;">' + species.iucn + '</div>';
        }
        html += '</div>';
      });
      html += '</div></div>';

      container.innerHTML = html;
    }
  };

  // 暴露全局
  window.LowFlowMode = LowFlowMode;
  window.SpeciesCollection = SpeciesCollection;
  window.ENDANGERED_SPECIES = ENDANGERED_SPECIES;

  console.log('[TATABOX] 社会价值模块已加载（乡村科普模式 + 濒危物种卡片）');
})();