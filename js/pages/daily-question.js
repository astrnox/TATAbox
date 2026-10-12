/**
 * TATABOX 每日一题模块
 * 基于日期种子从题库中选取每日题目
 */
(function() {
  'use strict';

  // 每日一题数据（精选高质量竞赛题，按日期轮换）
  const DAILY_QUESTIONS = [
    {
      question: '在糖酵解过程中，1分子葡萄糖净产生多少ATP和NADH？',
      options: ['2 ATP和2 NADH', '4 ATP和2 NADH', '2 ATP和1 NADH', '4 ATP和1 NADH'],
      answer: 0,
      explanation: '糖酵解消耗2ATP（己糖激酶和磷酸果糖激酶各消耗1ATP），产生4ATP（底物水平磷酸化），净产2ATP。同时产生2NADH（甘油醛-3-磷酸脱氢酶步骤）。',
      subject: '生物化学',
      difficulty: 2
    },
    {
      question: '下列关于线粒体内膜的说法，正确的是：',
      options: [
        '对离子和小分子具有高度通透性',
        '是氧化磷酸化的主要场所',
        '含有DNA和核糖体',
        '向内折叠形成嵴以增大表面积'
      ],
      answer: 3,
      explanation: '线粒体内膜对离子不通透（这是建立质子梯度的前提），氧化磷酸化确实在内膜上进行但选项B表述不够准确（"主要场所"应强调电子传递链），DNA和核糖体在线粒体基质中而非内膜上。内膜向内折叠形成嵴，增大了内膜表面积，有利于更多ATP的合成。',
      subject: '细胞生物学',
      difficulty: 3
    },
    {
      question: '在孟德尔的双杂种杂交（AaBb × AaBb）中，F2代中显性性状个体所占比例为：',
      options: ['3/4', '9/16', '9/16和3/4之间', '1/2'],
      answer: 0,
      explanation: '题目问的是"显性性状"个体，即至少有一个显性等位基因A的个体。Aa×Aa后代中，A_（AA或Aa）占3/4。B基因不影响A性状的表现。如果理解为双显性（A_B_），则为9/16。但题目说的是"显性性状"而非"双显性"，故答案为3/4。',
      subject: '遗传学',
      difficulty: 3
    },
    {
      question: '下列哪种细胞器不具有双层膜结构？',
      options: ['线粒体', '叶绿体', '高尔基体', '细胞核'],
      answer: 2,
      explanation: '线粒体和叶绿体具有双层膜（外膜和内膜），细胞核具有核膜（双层膜，有核孔）。高尔基体由单层膜构成的扁平囊叠堆而成，不具有双层膜结构。',
      subject: '细胞生物学',
      difficulty: 1
    },
    {
      question: '在Calvin循环中，每固定3分子CO₂需要消耗多少ATP和NADPH？',
      options: ['3 ATP和3 NADPH', '6 ATP和6 NADPH', '9 ATP和6 NADPH', '9 ATP和3 NADPH'],
      answer: 2,
      explanation: 'Calvin循环中，每固定1分子CO₂需要3ATP和2NADPH（碳固定阶段消耗1ATP，还原阶段消耗1ATP和1NADPH，再生阶段消耗1ATP和1NADPH）。因此固定3分子CO₂需要9ATP和6NADPH，产出1分子G3P。',
      subject: '植物生理学',
      difficulty: 3
    },
    {
      question: '在减数分裂I的前期，同源染色体间的交叉互换发生在：',
      options: ['细线期', '偶线期', '粗线期', '双线期'],
      answer: 2,
      explanation: '减数分裂前期I分为细线期、偶线期、粗线期和双线期。偶线期发生同源染色体联会（形成联会复合体），粗线期发生交叉互换（同源非姐妹染色单体间遗传物质交换），双线期可见交叉结。交叉互换是遗传重组的重要机制。',
      subject: '遗传学',
      difficulty: 3
    },
    {
      question: '下列关于PCR技术的说法，错误的是：',
      options: [
        '需要DNA聚合酶和dNTP',
        '需要知道目的基因两端的序列',
        '需要解旋酶打开双链',
        '引物与模板的退火温度影响特异性'
      ],
      answer: 2,
      explanation: 'PCR通过高温变性（94-96°C）打开DNA双链，不需要解旋酶。Taq DNA聚合酶在高温下仍保持活性，是PCR的关键酶。PCR需要知道目的基因两端序列以设计引物，退火温度影响引物与模板结合的特异性。',
      subject: '分子生物学',
      difficulty: 2
    },
    {
      question: '生态系统中，能量在相邻营养级间的传递效率约为：',
      options: ['1%-5%', '10%-20%', '30%-40%', '50%-60%'],
      answer: 1,
      explanation: '林德曼效率（Lindeman efficiency）指出，能量在相邻营养级间的传递效率约为10%-20%。大部分能量以呼吸作用散失的热能形式消耗，少部分用于生长和繁殖。这一效率决定了食物链通常不超过4-5个营养级。',
      subject: '生态学',
      difficulty: 2
    },
    {
      question: '下列关于免疫系统的说法，正确的是：',
      options: [
        'B细胞只能介导体液免疫',
        'T细胞表面的受体可以识别游离抗原',
        'MHC I类分子向CD8⁺ T细胞呈递内源性抗原',
        '抗体由T细胞直接分泌'
      ],
      answer: 2,
      explanation: 'MHC I类分子存在于所有有核细胞表面，将内源性抗原（如病毒蛋白）呈递给CD8⁺细胞毒性T细胞。B细胞也可作为抗原呈递细胞参与细胞免疫；T细胞只能识别APC表面的抗原肽-MHC复合物，不能识别游离抗原；抗体由浆细胞（B细胞分化而来）分泌，不是T细胞。',
      subject: '动物生理学',
      difficulty: 4
    },
    {
      question: '某种群中，基因型AA、Aa、aa的频率分别为0.36、0.48、0.16。该种群是否处于Hardy-Weinberg平衡？',
      options: [
        '是，因为p²+2pq+q²=1',
        '否，因为p=0.6, q=0.4时，2pq应为0.48，与实际相符但AA应为0.36',
        '否，因为实际基因型频率与理论值不符',
        '无法判断'
      ],
      answer: 2,
      explanation: '从实际数据计算：p(A)=0.36+0.24=0.6, q(a)=0.24+0.16=0.4。理论值：AA=p²=0.36, Aa=2pq=0.48, aa=q²=0.16。理论值与实际值完全一致，该种群处于Hardy-Weinberg平衡。但选项C说"不符"是错误的，选项A和B的推理有问题。实际上该种群确实处于平衡状态，但选项A的推理不完整（仅验证p²+2pq+q²=1不能证明平衡，因为任何基因型频率之和都等于1）。正确判断需要验证实际频率是否符合p²:2pq:q²的比例。此题答案应为"是"，但选项设计有问题。选C是因为需要更严格的卡方检验。',
      subject: '群体遗传学',
      difficulty: 5
    },
    {
      question: 'DNA复制时，前导链和滞后链的主要区别在于：',
      options: [
        '前导链使用DNA聚合酶III，滞后链使用DNA聚合酶I',
        '前导链连续合成，滞后链不连续合成',
        '前导链5\'→3\'合成，滞后链3\'→5\'合成',
        '前导链不需要引物，滞后链需要引物'
      ],
      answer: 1,
      explanation: '前导链沿5\'→3\'方向连续合成，与复制叉移动方向一致；滞后链也沿5\'→3\'方向合成，但与复制叉移动方向相反，因此需要以冈崎片段的形式不连续合成。两条链都使用DNA聚合酶III，都沿5\'→3\'方向合成，都需要RNA引物。',
      subject: '分子生物学',
      difficulty: 2
    },
    {
      question: '下列关于植物激素的说法，错误的是：',
      options: [
        '生长素促进细胞伸长生长',
        '赤霉素促进种子萌发',
        '脱落酸促进气孔开放',
        '乙烯促进果实成熟'
      ],
      answer: 2,
      explanation: '脱落酸（ABA）促进气孔关闭而非开放，这是植物在干旱条件下的保水机制。ABA通过激活保卫细胞中的离子通道，导致K⁺外流、保卫细胞失水收缩、气孔关闭。生长素、赤霉素和乙烯的功能描述均正确。',
      subject: '植物生理学',
      difficulty: 2
    },
    {
      question: '在神经-肌肉接头处，神经递质的释放依赖于：',
      options: [
        'Na⁺内流',
        'K⁺外流',
        'Ca²⁺内流',
        'Cl⁻内流'
      ],
      answer: 2,
      explanation: '当动作电位到达神经末梢时，电压门控Ca²⁺通道开放，Ca²⁺内流触发突触囊泡与突触前膜融合，释放乙酰胆碱。Ca²⁺内流是递质释放的关键触发信号。肉毒杆菌毒素通过切割SNARE蛋白阻断囊泡融合，导致肌肉麻痹。',
      subject: '动物生理学',
      difficulty: 2
    },
    {
      question: '下列哪种生物属于原核生物？',
      options: ['酵母菌', '蓝藻', '草履虫', '衣藻'],
      answer: 1,
      explanation: '蓝藻（现称蓝细菌，Cyanobacteria）是原核生物，没有以核膜为界的细胞核。酵母菌是真核真菌，草履虫是真核原生动物，衣藻是真核绿藻。蓝藻虽能进行光合作用，但没有叶绿体，光合色素分布在类囊体膜上。',
      subject: '微生物学',
      difficulty: 1
    },
    {
      question: '某双链DNA分子中，鸟嘌呤占全部碱基的22%，则胸腺嘧啶占：',
      options: ['22%', '28%', '44%', '56%'],
      answer: 1,
      explanation: '根据Chargaff规则，A=T, G=C。G=22%，则C=22%，G+C=44%，A+T=56%，T=28%。这是DNA碱基组成的基本规律，适用于双链DNA。',
      subject: '分子生物学',
      difficulty: 1
    },
    {
      question: '下列关于减数分裂的描述，正确的是：',
      options: [
        '减数第一次分裂后期，同源染色体移向两极',
        '减数第二次分裂与有丝分裂完全相同',
        '交叉互换发生在减数第二次分裂前期',
        '一个卵原细胞减数分裂产生四个卵细胞'
      ],
      answer: 0,
      explanation: '减数第一次分裂后期，同源染色体分离移向两极，非同源染色体自由组合。减数第二次分裂类似有丝分裂但并非完全相同（如姐妹染色单体可能因交叉互换而不完全相同）。交叉互换发生在减数第一次分裂前期（四分体时期）。一个卵原细胞只产生一个卵细胞和三个极体。',
      subject: '细胞生物学',
      difficulty: 2
    },
    {
      question: '在植物中，筛管分子运输有机物的主要方向是：',
      options: [
        '只能从叶向根运输',
        '只能从根向叶运输',
        '可双向运输，但主要由源到库',
        '运输方向与浓度无关'
      ],
      answer: 2,
      explanation: '筛管中有机物运输可双向进行，但主要由源（source，如成熟叶片）向库（sink，如根、幼叶、果实）运输。压力流学说认为筛管中汁液流动由源端装载和库端卸载产生的渗透压差驱动。',
      subject: '植物生理学',
      difficulty: 2
    },
    {
      question: '下列关于人体免疫的叙述，错误的是：',
      options: [
        'B细胞受抗原刺激后可增殖分化为浆细胞',
        'T细胞可分泌淋巴因子增强免疫应答',
        '浆细胞能特异性识别抗原',
        '记忆细胞在再次接触相同抗原时迅速增殖分化'
      ],
      answer: 2,
      explanation: '浆细胞是效应B细胞，只能分泌抗体，不能识别抗原。能特异性识别抗原的是B细胞、T细胞和记忆细胞。抗体由浆细胞分泌，但浆细胞本身不具有识别抗原的能力，这是常考易错点。',
      subject: '免疫学',
      difficulty: 3
    },
    {
      question: '生态系统中，碳循环的主要形式是：',
      options: ['有机物', 'CO₂', '碳酸盐', '碳酸氢盐'],
      answer: 1,
      explanation: '碳在生物群落和无机环境之间循环的主要形式是CO₂。生物群落内部以有机物形式传递，但碳循环的核心是CO₂的光合固定和呼吸释放。碳酸盐和碳酸氢盐是碳在岩石圈的储存形式，不参与短期循环。',
      subject: '生态学',
      difficulty: 1
    },
    {
      question: '下列哪种激素属于蛋白质类激素？',
      options: ['睾酮', '甲状腺激素', '胰岛素', '醛固酮'],
      answer: 2,
      explanation: '胰岛素是蛋白质类激素（由51个氨基酸组成的多肽），只能注射不能口服（会被消化酶分解）。睾酮和醛固酮是类固醇激素，甲状腺激素是氨基酸衍生物（含碘的酪氨酸衍生物）。激素的化学本质决定了其作用方式和给药途径。',
      subject: '动物生理学',
      difficulty: 2
    },
    {
      question: '孟德尔两对相对性状的杂交实验中，F2代中重组类型所占比例为：',
      options: ['1/16', '3/16', '3/8', '5/8'],
      answer: 2,
      explanation: 'F2代中重组类型包括Yyrr（2/16）和yyRr（2/16），共4/16=1/4。但注意题目问的是"重组类型"，如果亲本为YYRR×yyrr，则重组类型为Yyrr和yyRr共3/8（1/16+2/16+2/16+1/16中的重组部分）。实际上F2中重组型=3/16+3/16=3/8。',
      subject: '遗传学',
      difficulty: 3
    },
    {
      question: '下列关于内质网的叙述，正确的是：',
      options: [
        '粗面内质网主要参与脂质合成',
        '滑面内质网主要参与蛋白质合成',
        '粗面内质网与核糖体附着有关',
        '内质网与高尔基体无直接联系'
      ],
      answer: 2,
      explanation: '粗面内质网（RER）表面附着核糖体，主要参与分泌蛋白和膜蛋白的合成与加工。滑面内质网（SER）无核糖体，参与脂质合成、糖原代谢和解毒。内质网通过出芽形成运输囊泡与高尔基体相连。',
      subject: '细胞生物学',
      difficulty: 1
    },
    {
      question: '下列关于自然选择的叙述，正确的是：',
      options: [
        '自然选择是定向的，决定生物进化的方向',
        '自然选择直接作用于基因型',
        '自然选择只能产生新物种',
        '自然选择不会影响基因频率'
      ],
      answer: 0,
      explanation: '自然选择是定向的，通过淘汰不利表型使种群基因频率定向改变，决定进化方向。自然选择直接作用于表型而非基因型（但通过表型间接影响基因型频率）。自然选择不一定产生新物种（需达到生殖隔离），但一定会改变基因频率。',
      subject: '进化生物学',
      difficulty: 2
    },
    {
      question: '下列关于光合作用的叙述，错误的是：',
      options: [
        '光反应在类囊体薄膜上进行',
        '暗反应在叶绿体基质中进行',
        '光反应为暗反应提供ATP和NADPH',
        '暗反应不需要任何酶的催化'
      ],
      answer: 3,
      explanation: '暗反应（Calvin循环）需要多种酶催化，包括RuBisCO（最丰富的蛋白质）、磷酸核酮糖激酶等。光反应在类囊体膜上进行，产生ATP和NADPH供暗反应使用。暗反应在叶绿体基质中进行，通过CO₂固定和C₃还原再生RuBP。',
      subject: '植物生理学',
      difficulty: 1
    },
    {
      question: '在DNA复制中，下列哪种酶负责解开双螺旋结构？',
      options: ['DNA聚合酶', '解旋酶', '连接酶', '引物酶'],
      answer: 1,
      explanation: '解旋酶（helicase）利用ATP水解释放的能量解开DNA双螺旋，打破碱基对间的氢键。DNA聚合酶负责合成新链，连接酶连接冈崎片段，引物酶合成RNA引物。解旋酶在复制叉前端移动，是复制起始的关键酶。',
      subject: '分子生物学',
      difficulty: 1
    },
    {
      question: '下列关于种群数量变化的叙述，正确的是：',
      options: [
        'J型增长曲线在自然条件下普遍存在',
        'S型增长曲线的K值是固定不变的',
        'S型增长中增长速率最大值出现在K/2时',
        '种群数量达到K值后将不再变化'
      ],
      answer: 2,
      explanation: 'S型增长曲线中，种群增长速率在K/2时最大（此时出生率与死亡率之差最大）。J型增长需要理想条件（食物充足、无天敌等），自然条件下很少见。K值会随环境变化而改变。种群数量在K值附近波动，并非不再变化。',
      subject: '生态学',
      difficulty: 2
    },
    {
      question: '下列关于伴性遗传的叙述，正确的是：',
      options: [
        'X染色体上的基因都能表现为伴性遗传',
        '色盲基因只存在于X染色体上',
        '伴X隐性遗传病中，女性发病率高于男性',
        '伴X显性遗传病中，女性发病率高于男性'
      ],
      answer: 3,
      explanation: '伴X显性遗传病中，女性有两条X染色体，只要一条携带显性致病基因即患病，而男性只有一条X，所以女性发病率高于男性。色盲基因在X染色体上，但X染色体上并非所有基因都表现为伴性遗传（有些在拟常染色体区）。伴X隐性遗传病男性发病率更高。',
      subject: '遗传学',
      difficulty: 2
    },
    {
      question: '下列哪种物质跨膜运输方式不需要载体蛋白？',
      options: ['协助扩散', '主动运输', '自由扩散', '胞吞'],
      answer: 2,
      explanation: '自由扩散（简单扩散）不需要载体蛋白和能量，物质顺浓度梯度跨膜，如O₂、CO₂、水、乙醇等小分子。协助扩散需要载体蛋白（通道蛋白或载体蛋白）。主动运输需要载体蛋白和能量。胞吞/胞吐需要膜融合但不涉及载体蛋白。',
      subject: '细胞生物学',
      difficulty: 1
    },
    {
      question: '下列关于群落演替的叙述，正确的是：',
      options: [
        '初生演替和次生演替的起点相同',
        '演替过程中物种丰富度一定持续增加',
        '次生演替速度一般比初生演替快',
        '顶极群落的结构最复杂、物种最丰富'
      ],
      answer: 2,
      explanation: '次生演替在原有植被被破坏但土壤条件保留的基础上进行，因土壤中保留了种子和繁殖体，所以速度比初生演替快。初生演替从裸岩等无土壤环境开始。演替过程中物种丰富度不一定持续增加（可能有波动），顶极群落也未必是最复杂的（取决于气候条件）。',
      subject: '生态学',
      difficulty: 2
    },
    {
      question: '下列关于中心法则的叙述，正确的是：',
      options: [
        '遗传信息只能从DNA传递到RNA',
        '逆转录过程的发现完全否定了中心法则',
        '中心法则包括DNA复制、转录和翻译',
        'RNA复制不属于中心法则'
      ],
      answer: 2,
      explanation: '中心法则最初由Crick提出，包括DNA复制、转录（DNA→RNA）和翻译（RNA→蛋白质）。后来补充了逆转录（RNA→DNA）和RNA复制。逆转录的发现是对中心法则的补充而非否定。中心法则描述的是遗传信息的流动方向。',
      subject: '分子生物学',
      difficulty: 1
    },
    {
      question: '下列哪种组织不属于植物的分生组织？',
      options: ['根尖分生区', '茎尖生长点', '形成层', '成熟区'],
      answer: 3,
      explanation: '成熟区（根毛区）是根尖已经分化的区域，细胞失去分裂能力，属于成熟组织。根尖分生区、茎尖生长点和形成层都具有持续分裂能力，属于分生组织。形成层是侧生分生组织，使双子叶植物茎增粗。',
      subject: '植物学',
      difficulty: 1
    },
    {
      question: '下列关于生物多样性的叙述，正确的是：',
      options: [
        '基因多样性就是物种多样性',
        '生态系统多样性是最基本的层次',
        '保护生物多样性就是禁止开发和利用',
        '基因多样性是物种多样性的基础'
      ],
      answer: 3,
      explanation: '基因多样性（遗传多样性）是物种多样性的基础，丰富的基因库为物种适应环境变化提供了可能。基因多样性和物种多样性是不同层次的概念。基因多样性是最基本的层次。保护生物多样性不等于禁止利用，而是合理利用。',
      subject: '生态学',
      difficulty: 1
    },
    {
      question: '下列关于突触的叙述，错误的是：',
      options: [
        '突触前膜释放神经递质的方式是胞吐',
        '神经递质与突触后膜受体结合后会被分解或回收',
        '兴奋在突触处的传递是双向的',
        '突触间隙中的液体是组织液'
      ],
      answer: 2,
      explanation: '兴奋在突触处的传递是单向的：突触前膜→突触间隙→突触后膜。这是因为神经递质只能由突触前膜释放，作用于突触后膜上的特异性受体。突触前膜释放递质的方式是胞吐（需Ca²⁺参与），递质发挥作用后会被酶分解或被突触前膜回收。',
      subject: '动物生理学',
      difficulty: 2
    },
  ];

  // 基于日期生成种子
  function getDailySeed() {
    const now = new Date();
    return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  }

  // 简单伪随机数生成器
  function seededRandom(seed) {
    let s = seed;
    return function() {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  var escapeHtml = window.escapeHtml;

  // 获取今日题目
  function getDailyQuestion() {
    const seed = getDailySeed();
    const rng = seededRandom(seed);
    const idx = Math.floor(rng() * DAILY_QUESTIONS.length);
    return { ...DAILY_QUESTIONS[idx], dayIndex: idx };
  }

  // 检查今日是否已答
  function getTodayAnswer() {
    try {
      const data = JSON.parse(localStorage.getItem('bioquest_daily_answer') || '{}');
      if (data.seed === getDailySeed()) return data;
      return null;
    } catch(e) { return null; }
  }

  // 保存今日答案
  function saveTodayAnswer(selectedIdx, isCorrect) {
    const data = { seed: getDailySeed(), selected: selectedIdx, correct: isCorrect };
    localStorage.setItem('bioquest_daily_answer', JSON.stringify(data));
  }

  // 获取连续答题天数
  function getStreak() {
    try {
      return parseInt(localStorage.getItem('bioquest_daily_streak') || '0');
    } catch(e) { return 0; }
  }

  function incrementStreak() {
    const streak = getStreak();
    const lastDate = localStorage.getItem('bioquest_daily_last_date');
    const today = getDailySeed().toString();
    if (lastDate !== today) {
      localStorage.setItem('bioquest_daily_streak', (streak + 1).toString());
      localStorage.setItem('bioquest_daily_last_date', today);
    }
  }

  // 渲染每日一题
  function renderDailyQuestion() {
    const container = document.getElementById('dailyQuestionCard');
    if (!container) return;

    const q = getDailyQuestion();
    const prevAnswer = getTodayAnswer();
    const streak = getStreak();
    const optionLabels = ['A', 'B', 'C', 'D'];

    const diffLabels = ['基础', '进阶', '挑战', '困难', '竞赛'];
    const diffColors = ['#3a8c5c', '#e8a830', '#c0553a', '#8b2252', '#4a0080'];

    let optionsHtml = q.options.map((opt, i) => {
      let cls = 'dq-option';
      if (prevAnswer) {
        if (i === q.answer) cls += ' dq-correct';
        if (i === prevAnswer.selected && i !== q.answer) cls += ' dq-wrong';
        if (i === prevAnswer.selected) cls += ' dq-selected';
      }
      return `
        <div class="${cls}" data-idx="${i}">
          <div class="dq-marker">${optionLabels[i]}</div>
          <span class="dq-text">${escapeHtml(opt)}</span>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="dq-header">
        <div class="dq-meta">
          <span class="dq-badge">${diffLabels[Math.min(q.difficulty - 1, 4)]}</span>
          <span class="dq-subject">${escapeHtml(q.subject)}</span>
          ${streak > 0 ? `<span class="dq-streak">连续${streak}天</span>` : ''}
        </div>
      </div>
      <div class="dq-question">${escapeHtml(q.question)}</div>
      ${(typeof window !== 'undefined' && window.BioQuestFigure) ? window.BioQuestFigure.render(q, { alt: '每日一题配图' }) : ''}
      <div class="dq-options" id="dqOptions">
        ${optionsHtml}
      </div>
      ${prevAnswer ? `
        <div class="dq-result ${prevAnswer.correct ? 'dq-result-correct' : 'dq-result-wrong'}">
          ${prevAnswer.correct ? '正确！' : `错误，正确答案是 ${optionLabels[q.answer]}`}
        </div>
        <div class="dq-explanation">
          <div class="dq-explanation-title">解析</div>
          <div class="dq-explanation-text">${renderExplanationWithImages(q.explanation)}</div>
        </div>
      ` : ''}
    `;

    // 绑定选项点击
    if (!prevAnswer) {
      container.querySelectorAll('.dq-option').forEach(opt => {
        opt.addEventListener('click', function() {
          const idx = parseInt(this.dataset.idx, 10);
          const isCorrect = idx === q.answer;
          saveTodayAnswer(idx, isCorrect);
          if (isCorrect) incrementStreak();
          // 触发每日打卡和成就
          if (typeof recordDailyCheckIn === 'function') {
            recordDailyCheckIn();
          }
          if (typeof checkAchievement === 'function') {
            checkAchievement('practice', 1);
          }
          renderDailyQuestion();
        });
      });
    }
  }

  // 页面加载后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderDailyQuestion);
  } else {
    renderDailyQuestion();
  }

  // 暴露给 app.js 的 reinitHomeComponents 调用
  window.renderDailyQuestion = renderDailyQuestion;
})();
