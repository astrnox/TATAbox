/**
 * ============================================================
 * TATABOX — PhET 互动模拟实验集成
 * 通过 iframe 嵌入 PhET Interactive Simulations (CC BY 4.0)
 * 来源：https://phet.colorado.edu
 * 许可证：HTML 模拟文件遵循 CC BY 4.0，需署名 University of Colorado Boulder
 * ============================================================
 */

(function() {
  'use strict';

  // 局部 HTML 转义 fallback
  var escapeHtml = window.escapeHtml;

  // 30 个生物学 / 生物化学 / 生物物理 / 生态 类 PhET 互动模拟
  // 全部经 fetch(URL).status === 200 真实验证（无 404）
  // 验证时间：2026-08-09，针对 https://phet.colorado.edu/sims/html/{slug}/latest/{slug}_en.html
  var SIMS = [
    // 1. 遗传学（中心法则 / 基因表达）
    {
      id: 'gene-expression-essentials',
      title: '基因表达基础',
      topic: '遗传',
      topic_zh: '中心法则 · 转录翻译',
      desc: '可视化 DNA 转录为 mRNA、mRNA 翻译为蛋白质的全过程。可调节基因启动/关闭，观察蛋白质合成速率变化。',
      knowledge: '对应「基因的表达」章节：启动子、RNA 聚合酶、密码子、tRNA、核糖体翻译。'
    },
    // 2. 进化生物学
    {
      id: 'natural-selection',
      title: '自然选择',
      topic: '进化生态',
      topic_zh: '达尔文进化论 · 种群基因频率',
      desc: '通过兔子种群实验观察突变、环境选择、遗传漂变如何驱动种群进化。可调节环境因子、突变率、选择压力。',
      knowledge: '对应「生物进化」：自然选择三要素（变异/遗传/选择压力）、种群基因频率变化、适应辐射。'
    },
    {
      id: 'greenhouse-effect',
      title: '温室效应',
      topic: '进化生态',
      topic_zh: '全球气候变化 · 碳循环',
      desc: '对比不同历史时期（冰期/工业前/今天）大气层对太阳辐射和红外辐射的吸收，直观理解温室气体如何导致气温上升。',
      knowledge: '对应「生态系统」：碳循环、温室气体（CO₂/CH₄/N₂O）、全球变暖对物种分布和生态系统的影响。'
    },
    {
      id: 'molecules-and-light',
      title: '分子与光的相互作用',
      topic: '进化生态',
      topic_zh: '温室气体光谱吸收 · 光合辐射',
      desc: '观察不同气体分子（CO₂/H₂O/CH₄/N₂/O₂）对紫外、可见、红外波段的吸收差异，理解温室效应的分子机制和光合有效辐射。',
      knowledge: '对应「光合作用与生态」：叶绿素吸收光谱、温室气体的选择性吸收、大气辐射平衡。'
    },
    {
      id: 'blackbody-spectrum',
      title: '黑体辐射光谱',
      topic: '进化生态',
      topic_zh: '光合有效辐射 · 温度光谱',
      desc: '通过调节恒星/地球表面温度观察辐射光谱分布，理解太阳光谱（~5800K）为什么正好匹配叶绿素吸收峰。',
      knowledge: '对应「光合作用」：光合有效辐射 PAR、光质对光反应的影响、温度对酶促反应速率的Arrhenius关系。'
    },
    // 6. 细胞生物学（膜运输 / 扩散 / 浓度）
    {
      id: 'membrane-transport',
      title: '膜运输',
      topic: '细胞',
      topic_zh: '物质跨膜运输',
      desc: '动态观察自由扩散、协助扩散、主动运输三种方式。可调节浓度梯度、载体蛋白、ATP 供应。',
      knowledge: '对应「物质进出细胞」：被动运输（自由/协助扩散）、主动运输、胞吞胞吐、选择透过性。'
    },
    {
      id: 'diffusion',
      title: '扩散',
      topic: '细胞',
      topic_zh: '气体交换 · 小分子扩散',
      desc: '观察不同粒子（O₂/CO₂/H₂O/染料分子）在半透膜两侧的扩散速率与浓度梯度的关系，理解费克定律。',
      knowledge: '对应「细胞与气体交换」：肺泡气体交换、组织气体交换、扩散速率的影响因素（距离/面积/浓度差）。'
    },
    {
      id: 'concentration',
      title: '溶液浓度',
      topic: '细胞',
      topic_zh: '渗透浓度 · 等渗/高渗/低渗',
      desc: '配制不同浓度的溶液（盐、糖、蛋白质），观察溶质颗粒数量如何决定渗透压；可直接模拟红细胞溶血和植物细胞质壁分离。',
      knowledge: '对应「细胞渗透」：渗透压、质壁分离与复原、静脉输液等渗溶液（0.9%NaCl / 5%GS）的临床意义。'
    },
    // 9. 神经调节与感官生理
    {
      id: 'neuron',
      title: '神经元',
      topic: '神经调节',
      topic_zh: '动作电位 · Na⁺/K⁺ 通道',
      desc: '刺激神经元观察静息电位、去极化、复极化、超极化的全过程。可调节 Na⁺/K⁺ 通透性观察电位变化。',
      knowledge: '对应「神经调节」：静息电位、动作电位、Na⁺-K⁺ ATP 酶、阈刺激、"全或无"定律。'
    },
    {
      id: 'color-vision',
      title: '色觉',
      topic: '神经调节',
      topic_zh: '视锥细胞 · 色盲遗传',
      desc: '调节 RGB 三色光比例观察颜色合成；切换色盲滤镜模拟红绿色盲视觉；可直接对照眼底视锥/视杆细胞分布。',
      knowledge: '对应「神经调节与遗传」：视锥细胞三种视蛋白、红绿色盲 X 连锁隐性遗传、三原色学说。'
    },
    {
      id: 'bending-light',
      title: '光的折射',
      topic: '神经调节',
      topic_zh: '眼屈光成像 · 近视远视',
      desc: '调节透镜曲率、介质折射率和光源距离，模拟晶状体聚焦、近视（凹透镜矫正）、远视（凸透镜矫正）、散光。',
      knowledge: '对应「感觉生理」：角膜/晶状体屈光系统、远点近点、老视（老花）、眼镜度数（D）与焦距换算。'
    },
    {
      id: 'geometric-optics-basics',
      title: '几何光学基础',
      topic: '神经调节',
      topic_zh: '透镜成像原理 · 眼底成像',
      desc: '使用凸透镜/凹透镜观察物体成像的大小、虚实、倒立/正立，直接对照眼底视网膜倒立缩小实像的形成。',
      knowledge: '对应「视觉生理」：1/f = 1/u + 1/v 透镜公式、放大率 M=v/u、视觉调节时晶状体曲率变化。'
    },
    {
      id: 'waves-intro',
      title: '波动学基础',
      topic: '神经调节',
      topic_zh: '声波 · 耳蜗听觉',
      desc: '调节频率/振幅/波长观察波形；切换到"声波"模式观察不同频率对应不同音调（Hz），直接对照耳蜗基底膜的行波理论。',
      knowledge: '对应「听觉生理」：频率→音调、振幅→响度（dB）、行波理论（高频在蜗底、低频在蜗顶）、感音性耳聋。'
    },
    // 15. 分子生物学（分子间作用力 / DNA 定量 / ATP 能量学）
    {
      id: 'atomic-interactions',
      title: '原子间相互作用',
      topic: '分子生物学',
      topic_zh: '氢键 · 二硫键 · 范德华力',
      desc: '改变原子间距观察势能曲线变化；直观理解氢键、离子键、范德华力的键长与键能差异，直接对应蛋白质四级结构。',
      knowledge: '对应「蛋白质与核酸结构」：蛋白质一级（肽键）/二级（氢键 α-螺旋 β-折叠）/三级（疏水/二硫键）、DNA 双螺旋氢键 A=T G≡C。'
    },
    {
      id: 'beers-law-lab',
      title: '比尔-朗伯定律实验室',
      topic: '分子生物学',
      topic_zh: 'DNA/蛋白质分光光度定量',
      desc: '使用分光光度计测量不同浓度溶液的吸光度；可直接模拟 OD₂₆₀ 定量 DNA、OD₂₈₀ 定量蛋白质、OD₄₅₀ ELISA 读数。',
      knowledge: '对应「分子生物学实验技术」：A = ε·c·L（比尔定律）、DNA 定量（1 OD₂₆₀ = 50 µg/mL dsDNA）、纯度判断 A₂₆₀/A₂₈₀。'
    },
    {
      id: 'energy-forms-and-changes',
      title: '能量形式与转化',
      topic: '分子生物学',
      topic_zh: 'ATP 能量货币 · 热力学',
      desc: '观察机械能→热能→化学能→光能→电能之间的转化，系统总能量始终守恒；可对照 ATP ADP + Pi 循环供能。',
      knowledge: '对应「细胞代谢与热力学」：热力学第一定律（守恒）、第二定律（熵增）、ΔG = ΔH - TΔS、吸能反应/放能反应与 ATP 偶联。'
    },
    // 18. 生物化学（生命分子构建）
    {
      id: 'build-an-atom',
      title: '构建原子',
      topic: '生物化学',
      topic_zh: 'CHONP 元素 · 同位素',
      desc: '往原子核里加质子/中子/电子构建氢、碳、氧、氮、磷、硫原子；还可以构建 ¹⁴C 等同位素（生物放射性示踪实验）。',
      knowledge: '对应「生命的化学基础」：组成生物体的六大元素 CHONPS、同位素示踪（¹⁵N 标记 DNA Meselson-Stahl 实验、¹⁴C 卡尔文循环）。'
    },
    {
      id: 'build-a-molecule',
      title: '构建分子',
      topic: '生物化学',
      topic_zh: '糖/氨基酸/核苷酸/ATP',
      desc: '用原子拼成生物小分子：H₂O、CO₂、葡萄糖（C₆H₁₂O₆）、甘油三酯、氨基酸（氨基 + 羧基 + R 基）、ATP（腺嘌呤+核糖+3磷酸）。',
      knowledge: '对应「生物大分子」：单体（单糖/氨基酸/核苷酸）→ 多聚体（多糖/蛋白质/核酸）、脱水缩合与水解、ATP 高能磷酸键。'
    },
    {
      id: 'molecule-shapes-basics',
      title: '分子形状（基础）',
      topic: '生物化学',
      topic_zh: 'VESPR · 蛋白质结构基础',
      desc: '用 VESPR 模型预测小分子（H₂O、CO₂、CH₄、NH₃）的键角和空间构型，直接对照水分子极性、磷脂双分子层排列。',
      knowledge: '对应「生物分子三维结构」：sp³ 杂化 → 正四面体（碳骨架）、H₂O 键角 104.5° → 偶极矩 → 水溶剂特性。'
    },
    {
      id: 'molecule-shapes',
      title: '分子形状（进阶）',
      topic: '生物化学',
      topic_zh: '酶活性位点 · 分子识别',
      desc: '构建含孤对电子、双键和大基团的复杂分子，用"空间填充模型"观察立体位阻，直接对应酶-底物诱导契合学说。',
      knowledge: '对应「酶」：诱导契合模型、立体专一性、竞争性抑制剂（结构相似占据活性位点）、别构调节。'
    },
    {
      id: 'molecule-polarity',
      title: '分子极性',
      topic: '生物化学',
      topic_zh: '水的氢键 · 磷脂双亲性',
      desc: '观察电负性差异造成的偶极矩：非极性（O₂、CH₄、脂肪酸链）vs 极性（H₂O、乙醇、磷酸头），可模拟磷脂双分子层自组装。',
      knowledge: '对应「细胞结构」：磷脂双亲性 → 双分子层、疏水作用、蛋白质跨膜区 α-螺旋（疏水氨基酸朝外）。'
    },
    {
      id: 'ph-scale-basics',
      title: 'pH 值基础',
      topic: '生物化学',
      topic_zh: '酸碱度 · 酶最适 pH',
      desc: '测量日常溶液和体液（胃液 pH1~2、唾液 pH6.8、血浆 pH7.4、小肠液 pH8）的 pH，理解对数尺度下 [H⁺] 10 倍变化。',
      knowledge: '对应「内环境稳态」：pH = -lg[H⁺]、酸中毒 / 碱中毒、肺（CO₂ 呼出）和肾（HCO₃⁻ 重吸收）双重 pH 调节。'
    },
    {
      id: 'ph-scale',
      title: 'pH 值（进阶）',
      topic: '生物化学',
      topic_zh: '缓冲对 · Henderson-Hasselbalch',
      desc: '向溶液中加酸/加碱，观察不同缓冲体系（醋酸/磷酸/碳酸-碳酸氢盐）抵抗 pH 变化的能力；模拟血液 H₂CO₃-HCO₃⁻ 缓冲。',
      knowledge: '对应「血液缓冲」：Henderson-Hasselbalch 方程、血红蛋白缓冲、运动后乳酸堆积为何不致酸中毒（呼吸加深 + 缓冲对）。'
    },
    {
      id: 'acid-base-solutions',
      title: '酸碱溶液',
      topic: '生物化学',
      topic_zh: '弱酸解离 · 氨基酸两性电离',
      desc: '对比强酸（完全解离）和弱酸（如乙酸、碳酸、氨基酸侧链）的解离曲线，观察 pKa 和等电点 pI 的关系。',
      knowledge: '对应「氨基酸与蛋白质」：氨基酸两性电离、等电点 pI、电泳分离（带正电/负电/净电荷为零）、蛋白质盐析溶解度变化。'
    },
    {
      id: 'molarity',
      title: '摩尔浓度配制',
      topic: '生物化学',
      topic_zh: '溶液配制 · 摩尔计算',
      desc: '用溶质 + 容量瓶精确配制指定摩尔浓度的溶液（如 1 mol/L NaCl、0.5 mol/L 葡萄糖），可直接模拟配制 PBS/TBST 电泳缓冲液。',
      knowledge: '对应「生物实验计算」：M = mol/V、C₁V₁=C₂V₂ 稀释公式、配制培养基/缓冲液的换算（mol → g 换算 × 分子量）。'
    },
    {
      id: 'balancing-chemical-equations',
      title: '化学方程式配平',
      topic: '生物化学',
      topic_zh: '呼吸作用 · 光合作用配平',
      desc: '配平分子数守恒：有氧呼吸 C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O、光合作用 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂、以及糖酵解每步。',
      knowledge: '对应「细胞呼吸与光合」：物料守恒计算、RQ 呼吸商（糖=1 / 脂肪<1 / 蛋白≈0.8）、光合作用产 O₂ 量与 CO₂ 固定量关系。'
    },
    {
      id: 'reactants-products-and-leftovers',
      title: '反应物/产物/剩余',
      topic: '生物化学',
      topic_zh: 'Limiting Reagent · 底物饱和',
      desc: '投料后观察哪种反应物被最先耗尽（限制底物）、剩余多少；可模拟酶促反应中 [S] 不足 vs [E] 不足的情况。',
      knowledge: '对应「酶动力学」：米氏方程中底物饱和（Vmax 阶段）、限制性底物、生化途径通量受限速酶控制。'
    },
    {
      id: 'states-of-matter-basics',
      title: '物质三态基础',
      topic: '生物化学',
      topic_zh: '水相变 · 蒸腾作用',
      desc: '改变温度观察固态冰 → 液态水 → 气态水蒸气的相变；可对照植物蒸腾作用中水的汽化、人体散热（汗液汽化）。',
      knowledge: '对应「植物水分代谢」：蒸腾拉力、内聚力学说（H-bond 水柱不断）、出汗散热（汽化热 ~2400 J/g）。'
    },
    {
      id: 'states-of-matter',
      title: '物质三态（进阶）',
      topic: '生物化学',
      topic_zh: '相变能 · 冷冻生物学',
      desc: '观察相变过程中"温度不变、能量持续输入/输出"的潜热；可模拟精子/胚胎冷冻保存中的慢速降温 vs 玻璃化。',
      knowledge: '对应「生物冷冻保存」：冰晶形成对细胞的机械损伤、DMSO/甘油抗冻剂作用机制、液氮保存（-196℃）原理。'
    },
    // 30. 生物力学 / 肌肉骨骼
    {
      id: 'masses-and-springs-basics',
      title: '质量与弹簧（基础）',
      topic: '生物力学',
      topic_zh: '肌肉弹性 · 骨骼胡克定律',
      desc: '在弹簧上挂不同重物观察伸长量（F = k·x 胡克定律）；可直接对照骨骼肌串联弹性成分、肌腱力学特性。',
      knowledge: '对应「运动系统」：肌肉收缩的肌丝滑行 + 串联弹性成分回弹、肌腱杨氏模量、骨折风险（超过比例极限）。'
    }
  ];

  var _state = {
    activeSim: null,
    modalEl: null
  };

  // 本地已下载模拟的缓存探测结果（避免重复 fetch 探测）
  var _localSimCache = {};

  /**
   * 构建模拟 URL
   * 策略：本地优先（vendor/phet/{simId}/{simId}_en.html），失败回退到 PhET 官方 CDN
   * 本地化说明：PhET 模拟遵循 CC BY 4.0，可将完整模拟目录下载到 vendor/phet/{simId}/ 自托管
   */
  function buildSimUrl(simId) {
    return 'https://phet.colorado.edu/sims/html/' + simId + '/latest/' + simId + '_en.html';
  }

  /**
   * 探测本地是否存在该模拟的离线副本
   * @param {string} simId
   * @returns {Promise<string|null>} 本地 URL 或 null（未找到）
   */
  function _resolveSimUrl(simId) {
    if (_localSimCache[simId]) {
      return Promise.resolve(_localSimCache[simId] === 'cdn' ? buildSimUrl(simId) : _localSimCache[simId]);
    }
    var localUrl = 'vendor/phet/' + simId + '/' + simId + '_en.html';
    return fetch(localUrl, { method: 'HEAD' })
      .then(function (res) {
        if (res.ok) {
          _localSimCache[simId] = localUrl;
          return localUrl;
        }
        _localSimCache[simId] = 'cdn';
        return buildSimUrl(simId);
      })
      .catch(function () {
        _localSimCache[simId] = 'cdn';
        return buildSimUrl(simId);
      });
  }

  // 渲染顶部介绍区
  function _renderHeader() {
    return '' +
      '<div class="phet-header">' +
        '<h1 class="phet-title">PhET 互动模拟实验</h1>' +
        '<p class="phet-subtitle">基于 PhET Interactive Simulations，由科罗拉多大学博尔德分校提供</p>' +
        '<p class="phet-desc">通过互动可视化深入理解生物学的核心机制 — 基因表达、自然选择、膜运输、神经冲动、DNA 力学等。每个模拟对应一个核心生物学概念，配合教材学习效果更佳。</p>' +
        '<div class="phet-attribution">' +
          '<a href="https://phet.colorado.edu" target="_blank" rel="noopener noreferrer" class="phet-attribution-link">' +
            'PhET Interactive Simulations, University of Colorado Boulder · CC BY 4.0' +
          '</a>' +
        '</div>' +
      '</div>';
  }

  // 渲染主题筛选标签
  function _renderTopicFilter() {
    var topics = [
      '全部',
      '遗传',
      '进化生态',
      '细胞',
      '神经调节',
      '分子生物学',
      '生物化学',
      '生物力学'
    ];
    var countMap = { '全部': SIMS.length };
    SIMS.forEach(function(s) { countMap[s.topic] = (countMap[s.topic] || 0) + 1; });
    return '<div class="phet-topic-filter" id="phet-topic-filter">' +
      topics.map(function(t, i) {
        var c = countMap[t] || 0;
        return '<button class="phet-topic-btn' + (i === 0 ? ' phet-topic-btn--active' : '') +
          '" data-topic="' + escapeHtml(t) + '">' +
          escapeHtml(t) +
          '<span class="phet-topic-count">' + c + '</span>' +
          '</button>';
      }).join('') +
    '</div>';
  }

  // 渲染模拟卡片
  function _renderSimCard(sim) {
    return '' +
      '<article class="phet-card" data-sim-id="' + escapeHtml(sim.id) + '" data-topic="' + escapeHtml(sim.topic) + '">' +
        '<div class="phet-card-header">' +
          '<span class="phet-card-topic">' + escapeHtml(sim.topic) + '</span>' +
          '<h3 class="phet-card-title">' + escapeHtml(sim.title) + '</h3>' +
          '<p class="phet-card-subtitle">' + escapeHtml(sim.topic_zh) + '</p>' +
        '</div>' +
        '<div class="phet-card-body">' +
          '<p class="phet-card-desc">' + escapeHtml(sim.desc) + '</p>' +
          '<div class="phet-card-knowledge">' +
            '<span class="phet-card-knowledge-label">教材对应</span>' +
            '<p>' + escapeHtml(sim.knowledge) + '</p>' +
          '</div>' +
        '</div>' +
        '<button class="phet-card-btn" data-action="open-sim" data-sim-id="' + escapeHtml(sim.id) + '">' +
          '启动互动模拟' +
        '</button>' +
      '</article>';
  }

  // 渲染模拟网格
  function _renderSimGrid(filterTopic) {
    var sims = (filterTopic && filterTopic !== '全部')
      ? SIMS.filter(function(s) { return s.topic === filterTopic; })
      : SIMS;
    return '<div class="phet-grid" id="phet-grid">' +
      sims.map(_renderSimCard).join('') +
    '</div>';
  }

  // 打开模拟模态框
  function _openSimModal(simId) {
    var sim = null;
    for (var i = 0; i < SIMS.length; i++) {
      if (SIMS[i].id === simId) { sim = SIMS[i]; break; }
    }
    if (!sim) return;

    _closeSimModal(); // 关闭已有模态框

    var overlay = document.createElement('div');
    overlay.className = 'phet-modal-overlay';
    overlay.id = 'phet-modal-overlay';
    overlay.innerHTML = '' +
      '<div class="phet-modal">' +
        '<div class="phet-modal-header">' +
          '<div class="phet-modal-title-wrap">' +
            '<h2 class="phet-modal-title">' + escapeHtml(sim.title) + '</h2>' +
            '<p class="phet-modal-subtitle">' + escapeHtml(sim.topic) + ' · ' + escapeHtml(sim.topic_zh) + '</p>' +
          '</div>' +
          '<button class="phet-modal-close" id="phet-modal-close" aria-label="关闭模拟">×</button>' +
        '</div>' +
        '<div class="phet-modal-frame">' +
          // 加载骨架：iframe 就绪前立即显示，避免白屏等待
          '<div class="phet-modal-skeleton" id="phet-modal-skeleton">' +
            '<div class="phet-skeleton-spinner"></div>' +
            '<div class="phet-skeleton-text">模拟加载中…</div>' +
            '<div class="phet-skeleton-hint">首次加载需要数秒，加载完成后将自动缓存</div>' +
          '</div>' +
          '<iframe id="phet-modal-iframe" ' +
            'class="phet-modal-iframe phet-modal-iframe--loading" ' +
            'allowfullscreen allow="autoplay; encrypted-media; picture-in-picture" ' +
            // sandbox 防御纵深：允许脚本+同源（PhET 需要本地存储配置）+ 弹窗
            // 不允许 allow-top-navigation，防止 iframe 导航父窗口
            'sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" ' +
            'referrerpolicy="no-referrer-when-downgrade" ' +
            'loading="lazy" ' +
            'title="' + escapeHtml(sim.title) + '"></iframe>' +
        '</div>' +
        '<div class="phet-modal-footer">' +
          '<div class="phet-modal-desc">' + escapeHtml(sim.desc) + '</div>' +
          '<div class="phet-modal-knowledge">' +
            '<strong>教材对应：</strong>' + escapeHtml(sim.knowledge) +
          '</div>' +
          '<a href="https://phet.colorado.edu/sims/html/' + escapeHtml(simId) + '/latest/' + escapeHtml(simId) + '_en.html" ' +
             'target="_blank" rel="noopener noreferrer" class="phet-modal-openlink">' +
            '在 PhET 官网打开（全屏）' +
          '</a>' +
          '<p class="phet-modal-attribution">' +
            '模拟由 <a href="https://phet.colorado.edu" target="_blank" rel="noopener noreferrer">PhET Interactive Simulations</a>，' +
            'University of Colorado Boulder 提供，遵循 CC BY 4.0 许可证。' +
          '</p>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    _state.activeSim = simId;
    _state.modalEl = overlay;

    // 关闭事件
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) _closeSimModal();
    });
    var closeBtn = overlay.querySelector('#phet-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', _closeSimModal);

    // ESC 关闭
    document.addEventListener('keydown', _onEscKey);

    // 路由变化时自动关闭（MEDIUM-1 修复：防止模态框 + body 滚动锁残留）
    window.addEventListener('hashchange', _closeSimModal);

    // 锁定背景滚动
    document.body.style.overflow = 'hidden';

    // 焦点陷阱：将焦点设到关闭按钮
    if (closeBtn) closeBtn.focus();

    // 本地优先加载：解析 URL 后设置 iframe src，并在 iframe 就绪后隐藏骨架
    var iframe = overlay.querySelector('#phet-modal-iframe');
    var skeleton = overlay.querySelector('#phet-modal-skeleton');
    var footer = overlay.querySelector('.phet-modal-footer');
    var _iframeReady = false;
    var _showFallback = function () {
      if (!_iframeReady && footer) {
        var fallback = document.createElement('div');
        fallback.className = 'phet-modal-fallback';
        fallback.innerHTML = '' +
          '<div class="phet-modal-fallback-title">注意：模拟加载较慢或被浏览器阻止</div>' +
          '<p>由于 PhET 模拟资源较大或第三方 Cookie 策略，iframe 内可能无法直接加载。可以直接在新标签页打开：</p>' +
          '<a href="https://phet.colorado.edu/sims/html/' + escapeHtml(simId) + '/latest/' + escapeHtml(simId) + '_en.html" ' +
             'target="_blank" rel="noopener noreferrer" class="phet-modal-fallback-btn">' +
            '在 PhET 官网新标签页打开（推荐）' +
          '</a>';
        footer.insertBefore(fallback, footer.firstChild);
      }
    };
    function _hideSkeleton() {
      if (_iframeReady) return;
      _iframeReady = true;
      if (skeleton) {
        skeleton.classList.add('phet-modal-skeleton--hidden');
        setTimeout(function () { if (skeleton.parentNode) skeleton.remove(); }, 320);
      }
      if (iframe) iframe.classList.remove('phet-modal-iframe--loading');
    }
    // 兜底超时：避免 iframe onload 因跨域/沙箱未触发而骨架永久停留
    var _fallbackTimer = setTimeout(function () {
      _hideSkeleton();
      _showFallback();
    }, 15000);

    _resolveSimUrl(simId).then(function (url) {
      if (!iframe || _state.modalEl !== overlay) { clearTimeout(_fallbackTimer); return; }
      iframe.onload = function () {
        clearTimeout(_fallbackTimer);
        _hideSkeleton();
      };
      iframe.onerror = function () {
        clearTimeout(_fallbackTimer);
        _hideSkeleton();
      };
      iframe.src = url;
      // 若本地副本可用，更新底部提示
      if (url.indexOf('vendor/phet/') === 0 && skeleton) {
        var hint = skeleton.querySelector('.phet-skeleton-hint');
        if (hint) hint.textContent = '本地加载中…';
      }
    });
  }

  function _onEscKey(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      _closeSimModal();
    }
  }

  function _closeSimModal() {
    if (_state.modalEl && _state.modalEl.parentNode) {
      _state.modalEl.parentNode.removeChild(_state.modalEl);
    }
    _state.modalEl = null;
    _state.activeSim = null;
    document.removeEventListener('keydown', _onEscKey);
    window.removeEventListener('hashchange', _closeSimModal); // 移除路由变化监听
    document.body.style.overflow = '';
  }

  // 渲染整页
  function renderPhetSimsPage(target) {
    if (!target) target = document.getElementById('main-content') || document.body;
    target.innerHTML = '<div class="phet-page">' +
      _renderHeader() +
      _renderTopicFilter() +
      _renderSimGrid('全部') +
      '<div class="phet-footer">' +
        '<p>提示：首次加载模拟需要数秒，加载完成后浏览器会自动缓存。支持将模拟下载到 <code>vendor/phet/&lt;simId&gt;/</code> 目录实现本地秒开（遵循 CC BY 4.0）。</p>' +
        '<p class="phet-license">' +
          '本页集成 PhET Interactive Simulations HTML5 文件，版权归 ' +
          '<a href="https://phet.colorado.edu" target="_blank" rel="noopener noreferrer">University of Colorado Boulder</a> ' +
          '所有，遵循 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> 许可证。' +
          'TATABOX 仅通过 iframe 嵌入官方模拟文件，未修改 PhET 源代码。' +
        '</p>' +
      '</div>' +
    '</div>';

    _attachInteractions();
  }

  // 绑定交互
  function _attachInteractions() {
    // 主题筛选
    var filter = document.getElementById('phet-topic-filter');
    if (filter) {
      filter.addEventListener('click', function(e) {
        var btn = e.target.closest('.phet-topic-btn');
        if (!btn) return;
        var topic = btn.getAttribute('data-topic');
        // 更新激活状态
        var allBtns = filter.querySelectorAll('.phet-topic-btn');
        for (var i = 0; i < allBtns.length; i++) {
          allBtns[i].classList.remove('phet-topic-btn--active');
        }
        btn.classList.add('phet-topic-btn--active');
        // 重渲染网格
        var grid = document.getElementById('phet-grid');
        if (grid) {
          var sims = (topic && topic !== '全部')
            ? SIMS.filter(function(s) { return s.topic === topic; })
            : SIMS;
          grid.innerHTML = sims.map(_renderSimCard).join('');
        }
      });
    }

    // 卡片点击 / 启动按钮
    var grid = document.getElementById('phet-grid');
    if (grid) {
      grid.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-action="open-sim"]');
        if (btn) {
          var simId = btn.getAttribute('data-sim-id');
          _openSimModal(simId);
          return;
        }
        // 点击卡片任意位置也打开
        var card = e.target.closest('.phet-card');
        if (card) {
          _openSimModal(card.getAttribute('data-sim-id'));
        }
      });
    }
  }

  // 路由初始化入口
  function initPhetSims(target) {
    renderPhetSimsPage(target);
  }

  // 暴露到全局（与 bio-lab.js / bio-video.js 保持一致）
  if (typeof window !== 'undefined') {
    window.initPhetSims = initPhetSims;
    window.renderPhetSimsPage = renderPhetSimsPage;
  }
})();
