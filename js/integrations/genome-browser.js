/**
 * ============================================================
 * TATABOX — 基因组浏览器集成（igv.js）
 *
 * igv.js (MIT)：Broad Institute 开发的基因组浏览器
 *   - 支持 hg38/mm10/danRer11 等多种参考基因组
 *   - 可视化染色体、基因、变异、测序数据
 *   - 交互式缩放、平移、搜索
 *
 * 设计：
 *   - 懒加载：用户访问 #/genome 路由时才动态加载 igv.min.js（1.5MB）
 *   - 不阻塞首屏：igv.min.js 不在 index.html 中预加载
 *   - 预设位点：生物竞赛常考基因（BRCA1/TP53/HBB 等）
 *   - 教学导向：每个预设附带简要说明
 *
 * 来源：https://github.com/igvteam/igv.js (MIT License)
 * 版权：Copyright (c) 2014-2025 Broad Institute of MIT and Harvard,
 *        Regents of the University of California
 * ============================================================
 */
(function () {
  'use strict';

  var V = '20260809a';
  var _igvLoaded = false;
  var _browser = null;
  var _genomeConfigCache = {};   // 本地基因组配置缓存（避免重复 fetch）

  // 生物竞赛常考基因预设（人类基因组 hg38 坐标）
  var PRESET_LOCI = [
    {
      name: 'BRCA1',
      label: 'BRCA1（乳腺癌易感基因1）',
      locus: 'chr17:43,044,295-43,125,482',
      desc: '参与 DNA 损伤修复，突变显著增加乳腺癌/卵巢癌风险。'
    },
    {
      name: 'TP53',
      label: 'TP53（抑癌基因 p53）',
      locus: 'chr17:7,668,421-7,687,490',
      desc: '"基因组卫士"，调控细胞周期与凋亡，人类肿瘤中突变率最高的基因。'
    },
    {
      name: 'HBB',
      label: 'HBB（β-珠蛋白）',
      locus: 'chr11:5,225,465-5,229,395',
      desc: '血红蛋白 β 链，突变导致镰刀型贫血（β^6 Glu→Val）。'
    },
    {
      name: 'CFTR',
      label: 'CFTR（囊性纤维化跨膜传导调节因子）',
      locus: 'chr7:117,287,120-117,715,971',
      desc: '氯离子通道，ΔF508 突变导致囊性纤维化。'
    },
    {
      name: 'INS',
      label: 'INS（胰岛素基因）',
      locus: 'chr11:2,180,770-2,182,250',
      desc: '编码胰岛素，调节血糖，糖尿病核心基因。'
    },
    {
      name: 'OXTR',
      label: 'OXTR（催产素受体）',
      locus: 'chr3:8,792,165-8,810,465',
      desc: '社会行为与亲缘识别相关，动物行为学常考。'
    },
    {
      name: 'HoxA',
      label: 'HOXA 簇（同源异型盒基因）',
      locus: 'chr7:27,085,290-27,110,940',
      desc: '身体前后轴发育图式形成，进化发育生物学核心。'
    },
    {
      name: 'MCM6-LCT',
      label: 'LCT（乳糖酶）',
      locus: 'chr2:136,545,000-136,560,000',
      desc: '乳糖酶持久性变异，人群遗传学经典案例（rs4988235）。'
    }
  ];

  var GENOMES = [
    { id: 'hg38',   label: '人类 hg38（GRCh38）' },
    { id: 'hg19',   label: '人类 hg19（GRCh37）' },
    { id: 'mm10',   label: '小鼠 mm10（GRCm38）' },
    { id: 'danRer11', label: '斑马鱼 danRer11' }
  ];

  /**
   * 懒加载 igv.min.js
   */
  function ensureLoaded() {
    if (_igvLoaded && typeof window.igv === 'object') {
      return Promise.resolve();
    }
    return window.loadScriptOnce('js/vendor/igv.min.js?v=' + V, {
      verify: function () {
        return typeof window.igv === 'object' && typeof window.igv.createBrowser === 'function';
      }
    }).then(function () {
      _igvLoaded = true;
    });
  }

  /**
   * 创建 igv 浏览器实例
   */
  function createBrowser(container, opts) {
    return ensureLoaded().then(function () {
      // 清空旧实例
      container.replaceChildren();
      return window.igv.createBrowser(container, opts);
    });
  }

  /**
   * 渲染基因组浏览器页面
   */
  function renderGenomeBrowserPage(target) {
    if (!target) return;

    var currentGenome = 'hg38';
    var igvContainerId = 'igv-browser-container';

    target.innerHTML =
      '<div style="max-width:1200px;margin:0 auto;padding:24px 20px 80px;">' +
      '<h1 style="font-family:var(--font-serif,serif);font-size:1.8rem;color:var(--color-deep,#1a3a2a);margin-bottom:8px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-6px;margin-right:8px"><path d="M4 4c4 4 12 4 16 0M4 20c4-4 12-4 16 0M4 4v16M20 4v16M8 8h8M8 16h8M6 12h12"/></svg>基因组浏览器</h1>' +
      '<p style="color:var(--text-muted,#8a8a8a);font-size:0.9rem;margin-bottom:24px;">' +
        '基于 <a href="https://github.com/igvteam/igv.js" target="_blank" rel="noopener">igv.js</a>（MIT）的交互式基因组可视化，' +
        '支持缩放染色体、查看基因位置、探索遗传变异</p>' +

      // 控制面板
      '<div style="background:var(--color-surface,#fff);border:1px solid var(--color-border-light,#ece8e1);' +
        'border-radius:var(--radius-lg, 12px);padding:20px;margin-bottom:20px;">' +

        // 基因组选择 + 位点输入
        '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:16px;">' +
          '<div style="flex:1;min-width:200px;">' +
            '<label style="display:block;font-size:0.8rem;color:var(--text-muted,#8a8a8a);margin-bottom:6px;">参考基因组</label>' +
            '<select id="igv-genome-select" style="width:100%;padding:8px 12px;border:1px solid var(--color-border-light,#ddd);' +
              'border-radius:var(--radius-sm, 4px);font-size:0.9rem;background:var(--color-surface,#fff);">' +
              GENOMES.map(function (g) {
                return '<option value="' + g.id + '"' + (g.id === currentGenome ? ' selected' : '') + '>' + g.label + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div style="flex:2;min-width:280px;">' +
            '<label style="display:block;font-size:0.8rem;color:var(--text-muted,#8a8a8a);margin-bottom:6px;">' +
              '基因座（如 chr1:1-1000000 或基因名 BRCA1）</label>' +
            '<div style="display:flex;gap:8px;">' +
              '<input id="igv-locus-input" type="text" placeholder="chr17:43,044,295-43,125,482" ' +
                'style="flex:1;padding:8px 12px;border:1px solid var(--color-border-light,#ddd);' +
                'border-radius:var(--radius-sm, 4px);font-size:0.9rem;font-family:var(--font-mono,monospace);">' +
              '<button id="igv-goto-btn" class="btn" style="padding:8px 16px;background:var(--color-primary,#3a6b4a);color:#fff;' +
                'border:none;border-radius:var(--radius-sm, 4px);cursor:pointer;font-size:0.9rem;">跳转</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // 预设基因快捷入口
        '<div style="border-top:1px solid var(--color-border-light,#ece8e1);padding-top:16px;">' +
          '<div style="font-size:0.8rem;color:var(--text-muted,#8a8a8a);margin-bottom:10px;">生物竞赛常考基因</div>' +
          '<div id="igv-presets" style="display:flex;flex-wrap:wrap;gap:8px;">' +
            PRESET_LOCI.map(function (p) {
              return '<button class="igv-preset-btn" data-locus="' + p.locus + '" data-name="' + p.name + '" ' +
                'style="padding:6px 14px;border:1px solid var(--color-border-light,#ddd);' +
                'border-radius:var(--radius-pill, 9999px);background:var(--color-surface-elevated,#f8f5f0);' +
                'color:var(--color-text,#2d2d2d);cursor:pointer;font-size:0.82rem;transition:all 0.2s;">' +
                p.label +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +

      // 基因说明区
      '<div id="igv-gene-info" style="background:var(--color-surface-elevated,#f8f5f0);border-left:3px solid var(--color-sage,#5a7d5c);' +
        'padding:12px 16px;margin-bottom:16px;border-radius:0 var(--radius-sm, 4px) var(--radius-sm, 4px) 0;' +
        'font-size:0.85rem;color:var(--color-text,#2d2d2d);min-height:20px;">' +
        '点击上方预设基因快速定位，或输入基因座手动跳转。' +
      '</div>' +

      // igv 浏览器容器
      '<div style="background:var(--color-surface,#fff);border:1px solid var(--color-border-light,#ece8e1);' +
        'border-radius:var(--radius-lg, 12px);padding:8px;overflow:hidden;">' +
        '<div id="' + igvContainerId + '" style="width:100%;"></div>' +
        '<div id="igv-loading" style="text-align:center;padding:60px 20px;color:var(--text-muted,#8a8a8a);">' +
          '<div style="margin-bottom:8px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div>' +
          '<div>正在加载基因组浏览器（igv.js ~1.5MB）...</div>' +
        '</div>' +
      '</div>' +

      // 教学说明
      '<div style="margin-top:24px;background:var(--color-surface,#fff);border:1px solid var(--color-border-light,#ece8e1);' +
        'border-radius:var(--radius-lg, 12px);padding:20px;">' +
        '<h3 style="font-family:var(--font-serif,serif);font-size:1.1rem;color:var(--color-deep,#1a3a2a);margin-bottom:12px;">使用指南</h3>' +
        '<ul style="margin:0;padding-left:20px;color:var(--text-secondary,#4a4a4a);font-size:0.85rem;line-height:1.8;">' +
          '<li><strong>缩放</strong>：鼠标滚轮或拖选区域放大</li>' +
          '<li><strong>平移</strong>：拖动轨道左右移动</li>' +
          '<li><strong>搜索</strong>：在输入框输入基因名（如 BRCA1）或基因座（如 chr1:1-1000000）</li>' +
          '<li><strong>轨道</strong>：基因轨道显示外显子（方块）和内含子（细线），箭头表示转录方向</li>' +
          '<li><strong>数据来源</strong>：参考基因组与基因注释来自 Broad Institute 公共数据</li>' +
        '</ul>' +
      '</div>' +
      '</div>';

    // 绑定事件
    _bindEvents(target, currentGenome, igvContainerId);
  }

  function _bindEvents(target, genome, containerId) {
    var genomeSelect = target.querySelector('#igv-genome-select');
    var locusInput = target.querySelector('#igv-locus-input');
    var gotoBtn = target.querySelector('#igv-goto-btn');
    var presetBtns = target.querySelectorAll('.igv-preset-btn');
    var geneInfo = target.querySelector('#igv-gene-info');

    // 初始化 igv 浏览器
    _initIgv(containerId, genome);

    // 跳转按钮
    if (gotoBtn) {
      gotoBtn.addEventListener('click', function () {
        var locus = locusInput.value.trim();
        if (locus && _browser) {
          _browser.search(locus).catch(function (e) {
            console.warn('[GenomeBrowser] 跳转失败:', e);
          });
        }
      });
    }

    // 回车跳转
    if (locusInput) {
      locusInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && gotoBtn) gotoBtn.click();
      });
    }

    // 预设基因
    presetBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var locus = btn.getAttribute('data-locus');
        var name = btn.getAttribute('data-name');
        var preset = PRESET_LOCI.find(function (p) { return p.name === name; });
        if (locusInput) locusInput.value = locus;
        if (preset && geneInfo) {
          geneInfo.innerHTML = '<strong>' + preset.label + '</strong>（' + locus + '）<br>' + preset.desc;
        }
        if (_browser && locus) {
          _browser.search(locus).catch(function (e) {
            console.warn('[GenomeBrowser] 预设跳转失败:', e);
          });
        }
      });
    });

    // 切换基因组
    if (genomeSelect) {
      genomeSelect.addEventListener('change', function () {
        var newGenome = genomeSelect.value;
        _initIgv(containerId, newGenome);
      });
    }
  }

  /**
   * 加载本地基因组配置（避免依赖 igv.org CDN 的 genomes3.json）
   * 本地配置文件位于 data/genomes/{id}.json，包含染色体长度等基本信息
   * igv.js 接受对象形式的 genome 配置，无需联网拉取
   */
  function _loadLocalGenomeConfig(genomeId) {
    if (_genomeConfigCache[genomeId]) {
      return Promise.resolve(_genomeConfigCache[genomeId]);
    }
    return fetch('data/genomes/' + genomeId + '.json')
      .then(function (res) {
        if (!res.ok) throw new Error('本地基因组配置 ' + genomeId + ' 加载失败: ' + res.status);
        return res.json();
      })
      .then(function (cfg) {
        // igv.js 需要的 genome 对象格式：直接传入 id + chromosomes 数组
        // 参考 igv.js 文档：https://github.com/igvteam/igv.js/wiki/Reference-Genomes
        var genomeObj = {
          id: cfg.id || genomeId,
          name: cfg.name || genomeId,
          chromosomes: cfg.chromosomes || []
        };
        _genomeConfigCache[genomeId] = genomeObj;
        return genomeObj;
      })
      .catch(function (err) {
        console.warn('[GenomeBrowser] 本地基因组配置加载失败，回退到 igv 内置 ID:', err);
        // 回退：直接用字符串 ID（可能触发 igv.org 联网，但作为最后兜底）
        return genomeId;
      });
  }

  function _initIgv(containerId, genome) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var loadingEl = document.getElementById('igv-loading');
    if (loadingEl) loadingEl.style.display = 'block';

    // 使用本地基因组配置，避免依赖 igv.org CDN（genomes3.json 不可访问时会导致 Unknown genome id）
    _loadLocalGenomeConfig(genome).then(function (genomeConfig) {
      var opts = {
        genome: genomeConfig,   // 传入对象而非字符串 ID，跳过 igv.org 联网
        locus: 'chr1:1-5,000,000',
        showNavigation: true,
        showRuler: true,
        tracks: []
        // 注意：Refseq Genes 轨道依赖 s3.amazonaws.com CDN，在离线/受限环境下会超时
        // 如需基因注释，用户可在联网环境下通过 igv 内置菜单手动添加
      };

      return createBrowser(container, opts);
    }).then(function (browser) {
      _browser = browser;
      if (loadingEl) loadingEl.style.display = 'none';
    }).catch(function (err) {
      console.error('[GenomeBrowser] 初始化失败:', err);
      container.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--color-error,#e53935);">' +
        '<div style="margin-bottom:8px;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>' +
          '<div>基因组浏览器加载失败</div>' +
          '<small class="bq-text-muted">' + (err.message || err) + '</small>' +
        '</div>';
    });
  }

  // 暴露到全局（与 renderSmilesPage / renderMoleculesPage 风格保持一致）
  /**
   * 渲染基因组浏览器页面入口，在目标容器内基于 igv.js 构建浏览器与预设位点选择。
   * @function
   * @param {HTMLElement} target - 挂载容器
   * @returns {void}
   */
  window.renderGenomeBrowserPage = renderGenomeBrowserPage;
  /**
   * 基因组浏览器模块对外接口，提供 igv.js 懒加载与页面渲染能力。
   * @type {Object}
   */
  window.GenomeBrowser = {
    ensureLoaded: ensureLoaded,
    renderGenomeBrowserPage: renderGenomeBrowserPage
  };

  // 页面入口（兼容 initXxx(route, target) 约定）
  /**
   * 哈希路由入口：根据路由与容器初始化基因组浏览器页面。
   * @function
   * @param {string} route - 哈希路由
   * @param {HTMLElement} target - 挂载容器
   * @returns {void}
   */
  window.initGenomeBrowser = function (route, target) {
    renderGenomeBrowserPage(target);
  };
})();
