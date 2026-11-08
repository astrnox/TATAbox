/**
 * ============================================================
 * TATABOX — 虚拟生物实验室
 * 六项实验：显微镜观察、叶绿体色素层析、DNA 粗提取、平板划线、酶活性探究、质壁分离
 * ============================================================
 */

(function() {
  'use strict';

  var escapeHtml = (typeof window !== 'undefined' ? window : globalThis).escapeHtml; // 规范实现见 js/core/utils.js（Q-01 统一）

  var _experiments = {
    microscope: {
      id: 'microscope',
      name: '显微镜观察',
      goal: '按低倍镜规范完成对光、调焦，并观察已染色的洋葱鳞片叶表皮细胞。',
      steps: [
        { name: '取镜与安放', text: '将显微镜放在实验台距边缘约 7 cm 处，略偏左。', tool: 'microscope', feedback: '显微镜已就位。' },
        { name: '放置装片', text: '把已染色的洋葱鳞片叶表皮装片放在载物台上，使材料正对通光孔，并用压片夹固定。', tool: 'slide', feedback: '装片已固定，材料位于通光孔中央。' },
        {
          name: '低倍镜对光', text: '转动转换器使低倍物镜对准通光孔，调节光圈和反光镜（或内置光源），使视野亮度均匀适中。', tool: 'light', feedback: '视野亮度均匀，已完成低倍镜对光。',
          param: {
            type: 'range', label: '亮度', unit: '', min: 0, max: 100, okMin: 40, okMax: 70,
            prompt: '调节反光镜至合适亮度',
            tooLow: '视野太暗，无法看清细胞结构。请重新对光（中等亮度 40-70 为宜）。',
            tooHigh: '视野过亮，刺眼且细胞细节被淹没。请重新对光（中等亮度 40-70 为宜）。'
          }
        },
        {
          name: '低倍镜粗调焦', text: '从侧面观察物镜与装片的距离，使低倍物镜接近装片但不接触；再从目镜观察并反向调节，直到出现物像。', tool: 'coarse', feedback: '低倍镜已安全接近装片，物像轮廓出现。',
          param: {
            type: 'range', label: '物镜—装片距离', unit: 'mm', min: 0, max: 15, step: 0.5, okMin: 5, okMax: 8,
            prompt: '模拟调节低倍物镜与装片的距离',
            tooLow: '物镜过近，有压坏装片的风险。应从侧面观察并保留安全间距。',
            tooHigh: '物镜距离装片过远，低倍视野仍不能形成清晰物像。'
          }
        },
        { name: '观察', text: '左眼向目镜内看，反向转动粗准焦螺旋，直到看清物像，再微调细准焦螺旋。', tool: 'fine', feedback: '细胞结构清晰可见！' }
      ],
      observation: {
        prompt: '你在视野中看到了什么？请选择正确的观察结果：',
        choices: [
          {
            label: '规则多边形细胞',
            svg: '<svg width="80" height="60" viewBox="0 0 80 60"><rect x="8" y="10" width="20" height="14" fill="none" stroke="#38a169" stroke-width="1.5"/><rect x="30" y="10" width="20" height="14" fill="none" stroke="#38a169" stroke-width="1.5"/><rect x="52" y="10" width="20" height="14" fill="none" stroke="#38a169" stroke-width="1.5"/><rect x="8" y="26" width="20" height="14" fill="none" stroke="#38a169" stroke-width="1.5"/><rect x="30" y="26" width="20" height="14" fill="none" stroke="#38a169" stroke-width="1.5"/><rect x="52" y="26" width="20" height="14" fill="none" stroke="#38a169" stroke-width="1.5"/><circle cx="18" cy="17" r="2" fill="#2f855a"/><circle cx="40" cy="33" r="2" fill="#2f855a"/><circle cx="62" cy="17" r="2" fill="#2f855a"/></svg>',
            correct: true
          },
          {
            label: '圆形动物细胞',
            svg: '<svg width="80" height="60" viewBox="0 0 80 60"><circle cx="22" cy="22" r="11" fill="none" stroke="#3182ce" stroke-width="1.5"/><circle cx="55" cy="38" r="11" fill="none" stroke="#3182ce" stroke-width="1.5"/><circle cx="22" cy="22" r="3" fill="#2c5282"/><circle cx="55" cy="38" r="3" fill="#2c5282"/></svg>',
            correct: false,
            wrong: '这是动物细胞（圆形无细胞壁），但你观察的是洋葱表皮装片，应是植物细胞。'
          },
          {
            label: '杆状细菌',
            svg: '<svg width="80" height="60" viewBox="0 0 80 60"><rect x="8" y="18" width="22" height="6" rx="3" fill="#d69e2e"/><rect x="40" y="30" width="28" height="6" rx="3" fill="#d69e2e"/><rect x="18" y="42" width="20" height="6" rx="3" fill="#d69e2e"/></svg>',
            correct: false,
            wrong: '这是细菌（杆状），洋葱表皮不是细菌，应是植物细胞。'
          }
        ]
      },
      report: '洋葱鳞片叶表皮细胞呈规则多边形，可辨认细胞壁和大液泡；经适当染色后可较清楚地观察细胞核。'
    },
    pigment: {
      id: 'pigment',
      name: '叶绿体色素提取与分离',
      goal: '用纸层析法分离叶绿体中的色素。',
      steps: [
        { name: '制备滤纸条', text: '将干燥定性滤纸剪成长约 10 cm、宽约 1 cm 的滤纸条，一端剪去两角。', tool: 'paper', feedback: '滤纸条已剪好。' },
        { name: '画滤液细线', text: '用毛细吸管吸取少量滤液，沿铅笔线均匀画一条细而直的滤液细线，待干后再画一两次。', tool: 'capillary', feedback: '滤液细线已画好。' },
        { name: '倒入层析液', text: '在烧杯中倒入适量层析液，注意液面不能没及滤液细线。', tool: 'solvent', feedback: '层析液已倒入。' },
        {
          name: '插入滤纸条', text: '将滤纸条垂直插入层析液并盖好容器，确保层析液液面低于滤液细线。', tool: 'dip', feedback: '滤液细线保持在液面上方，层析开始。',
          param: {
            type: 'range', label: '液面低于滤液细线', unit: 'mm', min: -8, max: 20, step: 1, okMin: 3, okMax: 12,
            prompt: '调节层析液液面与滤液细线的相对位置',
            tooLow: '液面已接近或没过滤液细线，色素会直接溶入层析液。请让液面低于细线。',
            tooHigh: '滤纸浸入层析液过浅，溶剂前沿上升缓慢且不稳定。'
          }
        },
        { name: '观察结果', text: '待色素带分开后，取出滤纸条，观察色素带。', tool: 'observe', feedback: '从上到下依次出现胡萝卜素、叶黄素、叶绿素 a、叶绿素 b。' }
      ],
      report: '滤纸条上出现四条色素带：橙黄色胡萝卜素、黄色叶黄素、蓝绿色叶绿素 a、黄绿色叶绿素 b。'
    },
    dna: {
      id: 'dna',
      name: 'DNA 粗提取与鉴定',
      goal: '从植物组织中粗提取 DNA，并用二苯胺试剂鉴定。',
      steps: [
        { name: '研磨材料', text: '将香蕉或草莓放入研钵中，加入少量洗涤剂和食盐，充分研磨。', tool: 'grind', feedback: '材料已研磨成匀浆。' },
        { name: '过滤', text: '用纱布过滤研磨液，收集滤液于烧杯中。', tool: 'filter', feedback: '已获取含 DNA 的滤液。' },
        {
          name: '加入冷酒精', text: '沿烧杯壁缓缓加入预冷的 95% 乙醇，出现白色丝状物。', tool: 'ethanol', feedback: 'DNA 已析出呈白色絮状。',
          param: {
            type: 'select', label: '倾倒速度', options: ['快', '中', '慢'], ok: '慢',
            prompt: '选择冷酒精倾倒速度',
            wrong: '倾倒过快会破坏 DNA 析出层，DNA 无法析出。请缓慢沿壁加入（应选"慢"）。'
          }
        },
        { name: '鉴定', text: '将 DNA 溶于 2 mol/L NaCl，加入二苯胺试剂，沸水浴加热。', tool: 'test', feedback: '溶液呈现蓝色，证明存在 DNA。' }
      ],
      report: 'DNA 不溶于冷酒精，析出白色丝状物；二苯胺鉴定呈蓝色。'
    },
    microbe: {
      id: 'microbe',
      name: '微生物接种与平板划线',
      goal: '在虚拟环境中练习无菌操作，用平板划线法获得分离的单菌落。',
      steps: [
        { name: '灭菌', text: '将接种环在酒精灯火焰上灼烧，待冷却后使用。', tool: 'flame', feedback: '接种环已灭菌。' },
        { name: '取菌', text: '用冷却的接种环蘸取少量菌液。', tool: 'sample', feedback: '已蘸取菌液。' },
        { name: '一区划线', text: '在琼脂平板一侧密集划线，作为第一区。', tool: 'streak1', feedback: '第一区划线完成。' },
        { name: '再次灭菌与冷却', text: '第一区划线后再次灼烧接种环，并在无菌区域冷却，避免把第一区大量菌体直接带入后续区域。', tool: 'flame', feedback: '接种环已再次灭菌并冷却。' },
        { name: '二三区划线', text: '从第一区末端带出少量菌体，依次向第二、三区划线，使菌体逐步稀释。', tool: 'streak2', feedback: '二、三区划线完成，菌体密度逐区降低。' },
        { name: '倒置培养与观察', text: '封好培养皿并倒置，按所用安全菌株的培养条件进行培养；培养后只观察，不随意开启培养皿。', tool: 'incubate', feedback: '第三区出现分离良好的单菌落。' }
      ],
      report: '平板划线通过连续分区稀释菌体，使后一区形成分离的单菌落。本实验用于分离菌落，不用“30—300”标准进行定量计数。'
    },
    // 修复 P1-4：补全 PRD 承诺的 6 个实验（原 4 个 + 新增 2 个）
    enzyme: {
      id: 'enzyme',
      name: '酶活性影响因素探究',
      goal: '探究温度、pH、底物浓度对过氧化氢酶活性的影响。',
      steps: [
        { name: '制备酶液', text: '取等量新鲜肝脏研磨液（含过氧化氢酶）并过滤，作为各组共同的酶液；各组酶量必须相同。', tool: 'prepare', feedback: '等量酶液已制备，可设置单一变量进行比较。' },
        {
          name: '温度探究', text: '取 4 支试管，各加入 2 mL 酶液和 2 mL 3% H₂O₂，分别置于 0℃、20℃、40℃、60℃ 水浴中。', tool: 'temp', feedback: '温度梯度已设置。',
          param: {
            type: 'range', label: '观察组温度', unit: '℃', min: 0, max: 80, step: 1, explore: true,
            prompt: '拖动温度，比较低温、适温与高温时的气泡速率'
          }
        },
        {
          name: 'pH 探究', text: '取 4 支试管，各加入酶液和 H₂O₂，分别滴加 pH 4、7、8、11 的缓冲液。', tool: 'ph', feedback: 'pH 梯度已设置。',
          param: {
            type: 'range', label: '观察组 pH', unit: '', min: 2, max: 13, step: 0.5, explore: true,
            prompt: '拖动 pH，比较酸性、中性与碱性条件下的反应速率'
          }
        },
        {
          name: '底物浓度探究', text: '取 4 支试管，各加入酶液，分别加入 1%、3%、6%、10% H₂O₂ 溶液。', tool: 'substrate', feedback: '底物浓度梯度已设置。',
          param: {
            type: 'range', label: 'H₂O₂ 浓度', unit: '%', min: 0, max: 10, step: 0.5, explore: true,
            prompt: '拖动底物浓度，观察酶量一定时反应速率如何趋于饱和'
          }
        },
        { name: '观察气泡', text: '观察各试管中气泡产生速率（O₂ 释放量反映酶活性），记录数据。', tool: 'observe', feedback: '气泡产生速率：最适温度和 pH 下最多，极端条件下显著减少。' }
      ],
      observation: {
        prompt: '过氧化氢酶催化 H₂O₂ 分解的产物是什么？',
        choices: [
          { label: 'H₂O + O₂', svg: '<svg width="80" height="40" viewBox="0 0 80 40"><text x="10" y="25" font-size="14" fill="#38a169">H₂O + O₂↑</text></svg>', correct: true },
          { label: 'H₂ + O₂', svg: '<svg width="80" height="40" viewBox="0 0 80 40"><text x="10" y="25" font-size="14" fill="#3182ce">H₂↑ + O₂↑</text></svg>', correct: false, wrong: '错误。过氧化氢酶催化 2H₂O₂ → 2H₂O + O₂，产物是水和氧气，不是氢气。' },
          { label: 'H₂O₂ → H₂ + O₂', svg: '<svg width="80" height="40" viewBox="0 0 80 40"><text x="5" y="25" font-size="11" fill="#d69e2e">H₂ + O₂</text></svg>', correct: false, wrong: '错误。这是直接分解，酶催化的产物是 H₂O 和 O₂。' }
        ]
      },
      report: '温度和 pH 会影响酶的空间结构与催化速率；最适条件随酶的来源和实验体系而变化。酶量一定时，提高底物浓度可使速率先上升，随后因活性位点趋于饱和而接近平台。'
    },
    plasmolysis: {
      id: 'plasmolysis',
      name: '质壁分离与复原',
      goal: '观察植物细胞的质壁分离与复原现象，验证渗透作用。',
      steps: [
        { name: '制备装片', text: '制作紫色洋葱鳞片叶外表皮临时装片（紫色便于观察液泡变化）。', tool: 'slide', feedback: '洋葱表皮装片已制备。' },
        { name: '初始观察', text: '在低倍镜下找到紫色液泡明显的细胞，记录初始状态。', tool: 'observe', feedback: '可见紫色液泡充满细胞，原生质层紧贴细胞壁。' },
        {
          name: '滴加蔗糖溶液', text: '在盖玻片一侧滴 0.3 g/mL 蔗糖溶液，另一侧用吸水纸引流。', tool: 'sucrose', feedback: '蔗糖溶液已引流至细胞周围。',
          param: {
            type: 'range', label: '蔗糖浓度', unit: 'g/mL', min: 0, max: 0.8, step: 0.05, okMin: 0.25, okMax: 0.35,
            prompt: '调节蔗糖溶液浓度',
            tooLow: '浓度过低（<0.25 g/mL），外界溶液浓度低于细胞液，细胞吸水膨胀，无法发生质壁分离。请提高浓度（0.3 g/mL 为宜）。',
            tooHigh: '浓度过高（>0.5 g/mL），细胞过度失水导致死亡，无法复原。请降低浓度（0.3 g/mL 为宜）。'
          }
        },
        { name: '观察质壁分离', text: '显微镜下观察：液泡收缩，原生质层与细胞壁分离。', tool: 'observe', feedback: '原生质层与细胞壁分离，液泡明显变小变深。质壁分离成功！' },
        { name: '滴加清水', text: '在盖玻片一侧滴加清水，另一侧用吸水纸引流（替换蔗糖溶液）。', tool: 'water', feedback: '清水已替换蔗糖溶液。' },
        { name: '观察复原', text: '显微镜下观察：液泡膨胀，原生质层恢复紧贴细胞壁。', tool: 'observe', feedback: '原生质层恢复原状，液泡重新充满细胞。质壁分离复原成功！' }
      ],
      observation: {
        prompt: '质壁分离发生时，原生质层与细胞壁分离的原因是？',
        choices: [
          { label: '细胞壁伸缩性小，原生质层伸缩性大', svg: '<svg width="80" height="40" viewBox="0 0 80 40"><text x="5" y="25" font-size="10" fill="#38a169">壁伸缩性＜原生质层</text></svg>', correct: true },
          { label: '细胞壁伸缩性大，原生质层伸缩性小', svg: '<svg width="80" height="40" viewBox="0 0 80 40"><text x="5" y="25" font-size="10" fill="#3182ce">壁伸缩性＞原生质层</text></svg>', correct: false, wrong: '错误。若细胞壁伸缩性更大，则不会出现分离现象。实际是细胞壁伸缩性小（保持原状），原生质层失水收缩导致分离。' },
          { label: '细胞壁与原生质层同时收缩', svg: '<svg width="80" height="40" viewBox="0 0 80 40"><text x="5" y="25" font-size="11" fill="#d69e2e">同时收缩</text></svg>', correct: false, wrong: '错误。细胞壁伸缩性小，基本不收缩；只有原生质层因失水而收缩，二者才会分离。' }
        ]
      },
      report: '质壁分离：外界溶液（0.3 g/mL 蔗糖）浓度 > 细胞液浓度，细胞失水，原生质层收缩（伸缩性大）与细胞壁（伸缩性小）分离。复原：清水浓度 < 细胞液浓度，细胞吸水恢复。验证了植物细胞的渗透作用。'
    }
  };

  var _state = {
    experiment: 'microscope',
    step: 0,
    mistakes: 0,
    finished: false,
    failed: false,
    animPhase: 0,
    lastTime: 0,
    animId: null,
    feedback: '',
    feedbackType: 'info',
    placed: {}
  };

  function _addStyles() {
    if (document.getElementById('bio-lab-styles')) return;
    var style = document.createElement('style');
    style.id = 'bio-lab-styles';
    style.textContent = `
      .bl-page { max-width: 1200px; margin: 0 auto; padding: 20px; }
      .bl-header { text-align: center; margin-bottom: 18px; }
      .bl-header h1 { margin: 0; color: var(--color-deep, #2c4a3b); font-family: var(--font-serif, serif); }
      .bl-header p { margin: 6px 0 0; color: var(--text-muted, #888); }
      .bl-layout { display: grid; grid-template-columns: 320px 1fr; gap: 20px; }
      .bl-sidebar { background: var(--card-bg, #fff); border-radius: 16px; padding: 18px; box-shadow: var(--shadow-sm); }
      .bl-exp-select { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 14px; font-size: 0.95rem; background: var(--input-bg, #fff); color: var(--text-primary, #222); }
      .bl-goal { font-size: 0.9rem; color: var(--text-secondary, #555); margin-bottom: 14px; line-height: 1.5; }
      .bl-steps { list-style: none; padding: 0; margin: 0; }
      .bl-step { display: flex; gap: 10px; padding: 10px; border-radius: 8px; margin-bottom: 6px; font-size: 0.9rem; color: var(--text-secondary, #555); background: #f9fafb; }
      .bl-step.active { background: rgba(90,125,92,0.12); color: var(--color-deep, #2c4a3b); font-weight: 600; }
      .bl-step.done { background: rgba(16,185,129,0.1); color: #047857; }
      .bl-step-num { width: 22px; height: 22px; border-radius: 50%; background: #e5e7eb; color: #374151; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; flex-shrink: 0; }
      .bl-step.active .bl-step-num { background: var(--color-sage, #5a7d5c); color: #fff; }
      .bl-step.done .bl-step-num { background: #10b981; color: #fff; }
      .bl-feedback { margin-top: 14px; padding: 12px; border-radius: 8px; font-size: 0.9rem; line-height: 1.5; min-height: 60px; }
      .bl-feedback.info { background: #eff6ff; color: #1e40af; }
      .bl-feedback.success { background: #ecfdf5; color: #047857; }
      .bl-feedback.error { background: #fef2f2; color: #b91c1c; }
      .bl-bench { background: #1a2f1d; border-radius: 16px; position: relative; overflow: hidden; min-height: 420px; box-shadow: var(--shadow-lg); }
      .bl-canvas { display: block; width: 100%; height: 420px; }
      .bl-tools { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; justify-content: center; align-items: center; }
      .bl-tool { padding: 10px 16px; border-radius: 8px; border: 1px solid #ddd; background: var(--card-bg, #fff); color: var(--text-primary, #222); cursor: pointer; font-size: 0.9rem; transition: all 0.15s; }
      .bl-tool:hover { border-color: var(--color-sage, #5a7d5c); color: var(--color-sage, #5a7d5c); }
      .bl-tool:disabled { opacity: 0.5; cursor: not-allowed; }
      .bl-tool--primary { background: var(--color-sage, #5a7d5c); color: #fff; border-color: var(--color-sage, #5a7d5c); }
      .bl-tool--primary:hover { background: #4a6b4c; color: #fff; }
      .bl-param-control { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; background: var(--card-bg, #fff); padding: 12px 16px; border-radius: 12px; border: 1px solid #e5e7eb; }
      .bl-param-label { font-size: 0.9rem; color: var(--text-primary, #222); font-weight: 500; }
      .bl-param-range-wrap { display: flex; align-items: center; gap: 10px; flex: 1 1 180px; }
      .bl-param-range { flex: 1; min-width: 120px; }
      .bl-param-value { font-family: var(--font-mono, monospace); font-size: 0.9rem; color: var(--color-sage, #5a7d5c); min-width: 60px; text-align: right; }
      .bl-param-select { padding: 8px 12px; border-radius: 8px; border: 1px solid #ddd; background: var(--input-bg, #fff); color: var(--text-primary, #222); font-size: 0.9rem; }
      .bl-report { display: none; background: var(--card-bg, #fff); border-radius: 16px; padding: 20px; margin-top: 16px; box-shadow: var(--shadow-sm); }
      .bl-report h3 { margin: 0 0 10px; color: var(--color-deep, #2c4a3b); }
      .bl-report p { margin: 0; color: var(--text-secondary, #555); line-height: 1.6; }
      .bl-actions { display: flex; gap: 10px; margin-top: 14px; justify-content: center; }
      .bl-btn { padding: 8px 18px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.9rem; background: var(--color-sage, #5a7d5c); color: #fff; }
      .bl-btn--secondary { background: #e5e7eb; color: #374151; }
      .bl-why { margin-top: 10px; font-size: 0.85rem; color: var(--text-muted, #888); }
      .bl-why a { color: var(--color-sage, #5a7d5c); cursor: pointer; }
      @media (max-width: 800px) {
        .bl-layout { grid-template-columns: 1fr; }
        .bl-canvas { height: 340px; }
      }
    `;
    document.head.appendChild(style);
  }

  function _setFeedback(text, type) {
    _state.feedback = text;
    _state.feedbackType = type || 'info';
    var box = document.getElementById('bl-feedback');
    if (box) {
      box.textContent = text;
      box.className = 'bl-feedback ' + _state.feedbackType;
    }
  }

  function _resetExperiment(message) {
    _state.step = 0;
    _state.mistakes = 0;
    _state.finished = false;
    _state.failed = false;
    _state.placed = {};
    _setFeedback(message || '请选择正确的工具开始实验。', 'info');
    _renderReport(false);
    var sidebar = document.getElementById('bl-sidebar');
    if (sidebar) _renderSidebar(sidebar);
    var tools = document.getElementById('bl-tools');
    if (tools) _renderTools(tools);
  }

  function _renderSidebar(container) {
    var exp = _experiments[_state.experiment];
    if (!exp || !exp.steps) {
      container.replaceChildren();
      return;
    }
    container.innerHTML = '<select class="bl-exp-select" id="bl-exp-select">' +
      '<option value="microscope">显微镜观察</option>' +
      '<option value="pigment">色素提取与分离</option>' +
      '<option value="dna">DNA 粗提取与鉴定</option>' +
      '<option value="microbe">微生物培养与计数</option>' +
      '<option value="enzyme">酶活性影响因素探究</option>' +
      '<option value="plasmolysis">质壁分离与复原</option>' +
      '</select>' +
      '<div class="bl-goal"><strong>实验目的：</strong>' + exp.goal + '</div>' +
      '<ul class="bl-steps" id="bl-steps"></ul>' +
      '<div class="bl-feedback info" id="bl-feedback">' + _state.feedback + '</div>' +
      '<div class="bl-why">连续操作错误 2 次后，可点击 <a id="bl-why-link">为什么这样做？</a> 查看原理。</div>';

    document.getElementById('bl-exp-select').value = _state.experiment;
    document.getElementById('bl-exp-select').addEventListener('change', function(e) {
      _state.experiment = e.target.value;
      _resetExperiment('请选择正确的工具开始实验。');
      _renderTools(document.getElementById('bl-tools'));
    });

    document.getElementById('bl-why-link').addEventListener('click', function() {
      var step = exp.steps[_state.step];
      if (step) {
        _setFeedback('原理：' + step.text, 'info');
      }
    });

    var stepsEl = document.getElementById('bl-steps');
    stepsEl.innerHTML = exp.steps.map(function(s, i) {
      var cls = i < _state.step ? 'done' : (i === _state.step ? 'active' : '');
      var icon = i < _state.step ? '✓' : (i + 1);
      return '<li class="bl-step ' + cls + '"><span class="bl-step-num">' + icon + '</span><div>' + s.name + '</div></li>';
    }).join('');
  }

  function _renderTools(container) {
    var exp = _experiments[_state.experiment];
    if (!exp || !exp.steps || _state.step < 0 || _state.step >= exp.steps.length) {
      container.replaceChildren();
      return;
    }
    var current = exp.steps[_state.step];

    // 若当前步骤需要参数调节，优先渲染参数控件
    if (current && current.param) {
      container.innerHTML = _renderParamControl(current);
      _bindParamControl(current, container);
      return;
    }

    var tools = {
      microscope: [
        { id: 'microscope', label: '显微镜' },
        { id: 'slide', label: '洋葱表皮装片' },
        { id: 'light', label: '对光' },
        { id: 'coarse', label: '粗准焦螺旋' },
        { id: 'fine', label: '细准焦螺旋' }
      ],
      pigment: [
        { id: 'paper', label: '滤纸条' },
        { id: 'capillary', label: '毛细吸管' },
        { id: 'solvent', label: '层析液' },
        { id: 'dip', label: '插入滤纸条' },
        { id: 'observe', label: '观察结果' }
      ],
      dna: [
        { id: 'grind', label: '研磨' },
        { id: 'filter', label: '过滤' },
        { id: 'ethanol', label: '冷酒精' },
        { id: 'test', label: '二苯胺鉴定' }
      ],
      microbe: [
        { id: 'flame', label: '火焰灭菌' },
        { id: 'sample', label: '蘸取菌液' },
        { id: 'streak1', label: '一区划线' },
        { id: 'streak2', label: '二三区划线' },
        { id: 'incubate', label: '培养计数' }
      ],
      enzyme: [
        { id: 'prepare', label: '制备酶液' },
        { id: 'temp', label: '温度梯度' },
        { id: 'ph', label: 'pH 梯度' },
        { id: 'substrate', label: '底物浓度' },
        { id: 'observe', label: '观察气泡' }
      ],
      plasmolysis: [
        { id: 'slide', label: '制备装片' },
        { id: 'observe', label: '观察' },
        { id: 'sucrose', label: '蔗糖溶液' },
        { id: 'water', label: '清水' }
      ]
    };
    var currentTools = tools[_state.experiment];
    container.innerHTML = currentTools.map(function(t) {
      return '<button class="bl-tool" data-tool="' + t.id + '">' + t.label + '</button>';
    }).join('');

    container.querySelectorAll('.bl-tool').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _handleTool(btn.dataset.tool);
      });
    });
  }

  function _renderParamControl(step) {
    var p = step.param;
    var html = '<div class="bl-param-control" data-tool="' + step.tool + '">';
    html += '<label class="bl-param-label">' + escapeHtml(p.prompt || p.label) + '</label>';
    if (p.type === 'range') {
      var stepAttr = p.step !== undefined ? p.step : ((p.max - p.min) <= 1 ? 0.01 : 1);
      html += '<div class="bl-param-range-wrap">' +
        '<input type="range" class="bl-param-range" id="bl-param-input" ' +
        'min="' + p.min + '" max="' + p.max + '" step="' + stepAttr + '" value="' + p.min + '">' +
        '<span class="bl-param-value" id="bl-param-value">' + p.min + (p.unit || '') + '</span>' +
        '</div>';
    } else if (p.type === 'select') {
      html += '<select class="bl-param-select" id="bl-param-input">' +
        p.options.map(function(opt) {
          return '<option value="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</option>';
        }).join('') +
        '</select>';
    }
    html += '<button class="bl-tool bl-tool--primary" id="bl-param-submit">确认</button>';
    html += '</div>';
    return html;
  }

  function _bindParamControl(step, container) {
    var p = step.param;
    var input = container.querySelector('#bl-param-input');
    var valueEl = container.querySelector('#bl-param-value');
    if (input && valueEl && p.type === 'range') {
      input.addEventListener('input', function() {
        valueEl.textContent = input.value + (p.unit || '');
      });
    }
    var submit = container.querySelector('#bl-param-submit');
    if (submit) {
      submit.addEventListener('click', function() {
        _handleParamSubmit(step, input ? input.value : '');
      });
    }
  }

  function _handleParamSubmit(step, rawValue) {
    if (_state.finished) return;
    if (!step || !step.param) {
      _setFeedback('当前步骤无需设置参数。', 'error');
      return;
    }
    var p = step.param;
    var value = p.type === 'range' ? parseFloat(rawValue) : rawValue;
    if (p.type === 'range' && (isNaN(value) || !isFinite(value))) {
      _setFeedback('请输入有效的数值。', 'error');
      return;
    }
    if (p.type === 'range') {
      value = Math.max(p.min || p.okMin, Math.min(p.max || p.okMax, value));
    }
    var ok = false;
    if (p.type === 'range') {
      ok = value >= p.okMin && value <= p.okMax;
    } else if (p.type === 'select') {
      ok = value === p.ok;
    }

    if (ok) {
      _state.mistakes = 0;
      _state.step++;
      _setFeedback(step.feedback, 'success');
      _state.placed[step.tool] = true;
      if (_state.step >= _experiments[_state.experiment].steps.length) {
        _state.finished = true;
        _setFeedback('实验完成！' + _experiments[_state.experiment].report, 'success');
        _renderReport(true);
        if (typeof window.awardCR === 'function') window.awardCR('lab_complete', 2);
      }
      _renderSidebar(document.getElementById('bl-sidebar'));
      _renderTools(document.getElementById('bl-tools'));
    } else {
      _state.mistakes++;
      var msg = '';
      if (p.type === 'range') {
        msg = value < p.okMin ? p.tooLow : p.tooHigh;
      } else if (p.type === 'select') {
        msg = p.wrong;
      }
      var hint = _state.mistakes >= 2 ? ' 提示：当前步骤「' + step.name + '」需要设置正确的 ' + p.label + '。' : '';
      _setFeedback('操作错误：' + msg + hint, 'error');
    }
  }

  function _handleTool(toolId) {
    if (_state.finished) return;
    var exp = _experiments[_state.experiment];
    var current = exp.steps[_state.step];
    if (!current) return;

    if (toolId === current.tool) {
      _state.mistakes = 0;
      _state.step++;
      _setFeedback(current.feedback, 'success');
      _state.placed[toolId] = true;
      if (_state.step >= exp.steps.length) {
        _state.finished = true;
        _setFeedback('实验完成！' + exp.report, 'success');
        _renderReport(true);
        if (typeof window.awardCR === 'function') window.awardCR('lab_complete', 2);
      }
      _renderSidebar(document.getElementById('bl-sidebar'));
      _renderTools(document.getElementById('bl-tools'));
    } else {
      _state.mistakes++;
      var hint = _state.mistakes >= 2 ? ' 提示：当前步骤是“' + current.name + '”，需要“' + current.tool + '”。可点击“为什么这样做？”查看原理。' : '';
      _setFeedback('操作错误：' + current.name + ' 不需要该工具。' + hint, 'error');
    }
  }

  function _renderReport(show) {
    var el = document.getElementById('bl-report');
    if (!el) return;
    el.style.display = show ? 'block' : 'none';
    if (show) {
      var exp = _experiments[_state.experiment];
      el.innerHTML = '<h3>实验报告：' + exp.name + '</h3><p>' + exp.report + '</p>';
    }
  }

  function _drawBench(canvas) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var w = canvas.width = canvas.clientWidth;
    var h = canvas.height = canvas.clientHeight;

    // 深色实验台背景
    ctx.fillStyle = '#1a2f1d';
    ctx.fillRect(0, 0, w, h);

    // 网格
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (var x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (var y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    var cx = w / 2;
    var cy = h / 2;

    if (_state.experiment === 'microscope') _drawMicroscope(ctx, cx, cy, w, h);
    else if (_state.experiment === 'pigment') _drawPigment(ctx, cx, cy, w, h);
    else if (_state.experiment === 'dna') _drawDNA(ctx, cx, cy, w, h);
    else if (_state.experiment === 'microbe') _drawMicrobe(ctx, cx, cy, w, h);
    else if (_state.experiment === 'enzyme') _drawEnzyme(ctx, cx, cy, w, h);
    else if (_state.experiment === 'plasmolysis') _drawPlasmolysis(ctx, cx, cy, w, h);
  }

  function _drawMicroscope(ctx, cx, cy, w, h) {
    // 显微镜轮廓
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(cx - 60, cy + 60, 120, 16);
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(cx - 8, cy - 80, 16, 140);
    ctx.fillStyle = '#718096';
    ctx.beginPath(); ctx.arc(cx, cy - 90, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a0aec0';
    ctx.fillRect(cx - 45, cy - 20, 90, 8);

    // 装片
    if (_state.placed.slide) {
      ctx.fillStyle = 'rgba(200,230,255,0.4)';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(cx - 30, cy + 50, 60, 24);
      ctx.fill(); ctx.stroke();
    }

    // 视野
    if (_state.step >= 4) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy - 90, 16, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#e6fffa';
      ctx.fillRect(cx - 20, cy - 110, 40, 40);
      // 细胞
      var phase = _state.animPhase;
      ctx.strokeStyle = '#38a169';
      ctx.lineWidth = 1.5;
      for (var i = 0; i < 4; i++) {
        var ox = cx + Math.cos(phase + i) * 8;
        var oy = cy - 90 + Math.sin(phase + i * 1.3) * 6;
        ctx.beginPath();
        ctx.moveTo(ox - 8, oy - 6);
        ctx.lineTo(ox + 8, oy - 6);
        ctx.lineTo(ox + 8, oy + 6);
        ctx.lineTo(ox - 8, oy + 6);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 状态标签
    _drawLabel(ctx, cx, cy + 110, _state.finished ? '观察完成' : (_state.step === 0 ? '准备观察' : '步骤 ' + _state.step));
  }

  function _drawPigment(ctx, cx, cy, w, h) {
    // 烧杯
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 50, cy - 40);
    ctx.lineTo(cx - 50, cy + 50);
    ctx.lineTo(cx + 50, cy + 50);
    ctx.lineTo(cx + 50, cy - 40);
    ctx.stroke();

    // 层析液
    if (_state.placed.solvent) {
      ctx.fillStyle = 'rgba(90,125,92,0.4)';
      ctx.fillRect(cx - 47, cy + 10, 94, 38);
    }

    // 滤纸条
    if (_state.placed.paper) {
      ctx.fillStyle = '#f7fafc';
      ctx.fillRect(cx - 6, cy - 70, 12, 110);
      // 色素带
      if (_state.step >= 4) {
        var bands = ['#f6ad55', '#f6e05e', '#48bb78', '#2f855a'];
        bands.forEach(function(c, i) {
          ctx.fillStyle = c;
          ctx.fillRect(cx - 5, cy - 60 + i * 16, 10, 8);
        });
      } else if (_state.placed.capillary) {
        ctx.strokeStyle = '#2d3748';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - 5, cy - 50); ctx.lineTo(cx + 5, cy - 50); ctx.stroke();
      }
    }

    _drawLabel(ctx, cx, cy + 90, _state.finished ? '层析完成' : '纸层析法');
  }

  function _drawDNA(ctx, cx, cy, w, h) {
    // 烧杯
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 45, cy - 50);
    ctx.lineTo(cx - 50, cy + 50);
    ctx.lineTo(cx + 50, cy + 50);
    ctx.lineTo(cx + 45, cy - 50);
    ctx.stroke();

    // 滤液
    if (_state.placed.filter) {
      ctx.fillStyle = 'rgba(246,224,126,0.3)';
      ctx.fillRect(cx - 47, cy + 10, 94, 38);
    }

    // DNA 白色絮状物
    if (_state.placed.ethanol) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      var phase = _state.animPhase;
      for (var i = 0; i < 5; i++) {
        var px = cx + Math.sin(phase + i) * 20;
        var py = cy - 10 + Math.cos(phase * 0.7 + i) * 10;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // 二苯胺蓝色
    if (_state.placed.test) {
      ctx.fillStyle = 'rgba(66,153,225,0.6)';
      ctx.fillRect(cx - 47, cy + 10, 94, 38);
    }

    _drawLabel(ctx, cx, cy + 90, _state.finished ? '鉴定完成' : 'DNA 粗提取');
  }

  function _drawMicrobe(ctx, cx, cy, w, h) {
    // 培养皿
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 90, 0, Math.PI * 2);
    ctx.stroke();

    // 琼脂
    ctx.fillStyle = 'rgba(255,245,230,0.2)';
    ctx.beginPath();
    ctx.arc(cx, cy, 84, 0, Math.PI * 2);
    ctx.fill();

    // 划线
    if (_state.placed.streak1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 60, cy - 60);
      ctx.lineTo(cx - 60, cy + 60);
      ctx.stroke();
    }
    if (_state.placed.streak2) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (var i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - 20 + i * 25, cy - 70);
        ctx.quadraticCurveTo(cx + 20 + i * 20, cy, cx - 20 + i * 25, cy + 70);
        ctx.stroke();
      }
    }

    // 菌落
    if (_state.placed.incubate) {
      var rng = function(seed) { var x = Math.sin(seed) * 10000; return x - Math.floor(x); };
      ctx.fillStyle = '#f6e05e';
      for (var j = 0; j < 40; j++) {
        var r = rng(j) * 70;
        var ang = rng(j + 100) * Math.PI * 2;
        var px = cx + Math.cos(ang) * r;
        var py = cy + Math.sin(ang) * r;
        ctx.beginPath();
        ctx.arc(px, py, 1 + rng(j + 200) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _drawLabel(ctx, cx, cy + 120, _state.finished ? '培养完成' : '平板划线法');
  }

  function _drawEnzyme(ctx, cx, cy, w, h) {
    // 试管架
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(cx - 140, cy + 60, 280, 8);
    ctx.fillRect(cx - 140, cy + 110, 280, 8);
    ctx.fillRect(cx - 145, cy + 55, 10, 70);
    ctx.fillRect(cx + 135, cy + 55, 10, 70);

    // 4 支试管对应 0/20/40/60℃ 或 pH 4/7/8/11 或底物浓度梯度
    var tubeCount = 4;
    var tubeW = 30;
    var tubeH = 70;
    var spacing = 60;
    var startX = cx - ((tubeCount - 1) * spacing) / 2;

    var labels = [];
    if (_state.step <= 1) labels = ['准备', '准备', '准备', '准备'];
    else if (_state.placed.temp && !_state.placed.ph && !_state.placed.substrate) labels = ['0℃', '20℃', '40℃', '60℃'];
    else if (_state.placed.ph && !_state.placed.substrate) labels = ['pH 4', 'pH 7', 'pH 8', 'pH 11'];
    else labels = ['1%', '3%', '6%', '10%'];

    for (var i = 0; i < tubeCount; i++) {
      var tx = startX + i * spacing;
      var ty = cy + 45;

      // 试管
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx - tubeW / 2, ty);
      ctx.lineTo(tx - tubeW / 2, ty + tubeH - 8);
      ctx.quadraticCurveTo(tx - tubeW / 2, ty + tubeH, tx, ty + tubeH);
      ctx.quadraticCurveTo(tx + tubeW / 2, ty + tubeH, tx + tubeW / 2, ty + tubeH - 8);
      ctx.lineTo(tx + tubeW / 2, ty);
      ctx.stroke();

      // 酶液
      var fillLevel = 0.55;
      ctx.fillStyle = 'rgba(200,230,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(tx - tubeW / 2 + 2, ty + tubeH * (1 - fillLevel));
      ctx.lineTo(tx - tubeW / 2 + 2, ty + tubeH - 8);
      ctx.quadraticCurveTo(tx - tubeW / 2 + 2, ty + tubeH - 2, tx, ty + tubeH - 2);
      ctx.quadraticCurveTo(tx + tubeW / 2 - 2, ty + tubeH - 2, tx + tubeW / 2 - 2, ty + tubeH - 8);
      ctx.lineTo(tx + tubeW / 2 - 2, ty + tubeH * (1 - fillLevel));
      ctx.fill();

      // 气泡：最适条件（第 3 支，索引 2）最多，两侧递减
      if (_state.placed.observe) {
        var bubbleIntensity = [0.2, 0.5, 1.0, 0.3][i];
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (var b = 0; b < 12 * bubbleIntensity; b++) {
          var bx = tx + (Math.sin(b * 1.3 + i) * 8);
          var by = ty + tubeH * (1 - fillLevel) + b * 4 + (_state.animPhase * 20) % 30;
          if (by > ty + tubeH - 6) by = ty + tubeH - 6;
          ctx.beginPath();
          ctx.arc(bx, by, 1 + Math.random() * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 标签
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], tx, ty + tubeH + 18);
    }

    _drawLabel(ctx, cx, cy + 150, _state.finished ? '探究完成' : '酶活性影响因素');
  }

  function _drawPlasmolysis(ctx, cx, cy, w, h) {
    // 显微镜视野：浅绿色背景圆
    var radius = 110;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#e6fffa';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    // 根据步骤决定细胞状态：0-1 正常，2-3 质壁分离，4-5 复原
    var state = 'normal';
    if (_state.placed.sucrose && !_state.placed.water) state = 'plasmolysis';
    else if (_state.placed.water) state = 'recovery';

    var cellCount = 5;
    for (var i = 0; i < cellCount; i++) {
      var ox = cx + Math.cos(i * 1.2) * 45;
      var oy = cy + Math.sin(i * 1.5) * 35;
      _drawPlantCell(ctx, ox, oy, 34, state);
    }

    ctx.restore();

    // 显微镜外框
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    var statusText = state === 'plasmolysis' ? '质壁分离' : (state === 'recovery' ? '质壁分离复原' : '正常细胞');
    _drawLabel(ctx, cx, cy + radius + 24, _state.finished ? '实验完成' : statusText);
  }

  function _drawPlantCell(ctx, cx, cy, size, state) {
    // 细胞壁（规则多边形）
    ctx.strokeStyle = '#38a169';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(200,255,220,0.25)';
    ctx.beginPath();
    var half = size / 2;
    ctx.moveTo(cx - half, cy - half + 4);
    ctx.lineTo(cx + half - 4, cy - half);
    ctx.lineTo(cx + half, cy + half - 4);
    ctx.lineTo(cx - half + 4, cy + half);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // 原生质层 / 液泡
    var shrink = 0;
    var color = '#9f7aea';
    if (state === 'plasmolysis') {
      shrink = 0.45;
      color = '#6b46c1';
    } else if (state === 'recovery') {
      shrink = 0.1;
      color = '#805ad5';
    }
    var inner = half * (1 - shrink);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - inner, cy - inner + 3);
    ctx.lineTo(cx + inner - 3, cy - inner);
    ctx.lineTo(cx + inner, cy + inner - 3);
    ctx.lineTo(cx - inner + 3, cy + inner);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // 细胞核
    ctx.fillStyle = '#2f855a';
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function _drawLabel(ctx, x, y, text) {
    ctx.font = '14px sans-serif';
    var tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(x - tw / 2 - 8, y - 14, tw + 16, 24, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y + 3);
  }

  function _loop(timestamp) {
    if (!_state.lastTime) _state.lastTime = timestamp;
    var dt = timestamp - _state.lastTime;
    _state.lastTime = timestamp;
    _state.animPhase += dt * 0.002;

    var canvas = document.getElementById('bio-lab-canvas');
    _drawBench(canvas);

    _state.animId = requestAnimationFrame(_loop);
  }

  function _renderActions(container) {
    container.innerHTML = '<button class="bl-btn" id="bl-restart">重新开始</button>' +
      '<button class="bl-btn bl-btn--secondary" id="bl-hint">查看提示</button>';
    document.getElementById('bl-restart').addEventListener('click', function() {
      _resetExperiment('实验已重置，请选择正确工具开始。');
    });
    document.getElementById('bl-hint').addEventListener('click', function() {
      var exp = _experiments[_state.experiment];
      var step = exp.steps[_state.step];
      if (step) {
        _setFeedback('提示：当前步骤「' + step.name + '」需要使用「' + step.tool + '」。', 'info');
      }
    });
  }

  function initBioLab(target) {
    _addStyles();
    var pageTarget = target || document.getElementById('page-content');
    if (!pageTarget) return;

    pageTarget.innerHTML = '<div class="bl-page">' +
      '<div class="bl-header">' +
        '<h1>虚拟生物实验室</h1>' +
        '<p>按正确步骤操作，完成高中生物高频考点实验</p>' +
      '</div>' +
      '<div class="bl-layout">' +
        '<div class="bl-sidebar" id="bl-sidebar"></div>' +
        '<div>' +
          '<div class="bl-bench">' +
            '<canvas class="bl-canvas" id="bio-lab-canvas"></canvas>' +
          '</div>' +
          '<div class="bl-tools" id="bl-tools"></div>' +
          '<div class="bl-observation" id="bl-observation"></div>' +
          '<div class="bl-actions" id="bl-actions"></div>' +
          '<div class="bl-report" id="bl-report"></div>' +
        '</div>' +
      '</div>' +
    '</div>';

    _setFeedback('请选择正确的工具开始实验。', 'info');
    _renderSidebar(document.getElementById('bl-sidebar'));
    _renderTools(document.getElementById('bl-tools'));
    _renderActions(document.getElementById('bl-actions'));

    if (_state.animId) cancelAnimationFrame(_state.animId);
    _state.lastTime = 0;
    _state.animId = requestAnimationFrame(_loop);
  }

  function renderBioLabPage(target) {
    initBioLab(target);
  }

  window.initBioLab = initBioLab;
  window.renderBioLabPage = renderBioLabPage;

  /* ==========================================================
   * 交互实验室 2.0
   * 保留上方实验数据，重新实现界面、操作反馈和六套实时模型。
   * ========================================================== */

  var _labState = {
    experiment: 'microscope',
    step: 0,
    mistakes: 0,
    finished: false,
    awaitingObservation: false,
    pendingTool: '',
    values: {},
    touched: {},
    feedback: '先阅读实验目标，再从器材台选择本步骤所需器材。',
    feedbackType: 'info',
    hintVisible: false,
    stageElapsed: 0,
    phase: 0,
    lastTime: 0,
    animId: null,
    awarded: false,
    focus: null
  };

  var _labAssetSources = {
    pigment: 'assets/lab/chromatography-apparatus.webp',
    dna: 'assets/lab/dna-extraction-bench.webp',
    microbe: 'assets/lab/microbe-streak-bench.webp',
    enzyme: 'assets/lab/catalase-test-tubes.webp',
    plasmolysisNormal: 'assets/lab/plasmolysis-normal.webp',
    plasmolysisSeparated: 'assets/lab/plasmolysis-separated.webp'
  };
  var _labAssets = {};

  function _labPrimeAssets() {
    Object.keys(_labAssetSources).forEach(function(key) {
      if (_labAssets[key]) return;
      var image = new Image();
      image.decoding = 'async';
      image.onload = function() { image.ready = true; };
      image.onerror = function() { image.failed = true; };
      image.src = _labAssetSources[key];
      _labAssets[key] = image;
    });
  }

  var _labTools = {
    microscope: [
      { id: 'microscope', code: '镜', name: '显微镜' },
      { id: 'slide', code: '片', name: '染色装片' },
      { id: 'light', code: '光', name: '光源调节' },
      { id: 'coarse', code: '粗', name: '粗准焦螺旋' },
      { id: 'fine', code: '细', name: '细准焦螺旋' }
    ],
    pigment: [
      { id: 'paper', code: '纸', name: '层析滤纸' },
      { id: 'capillary', code: '管', name: '毛细吸管' },
      { id: 'solvent', code: '液', name: '层析液' },
      { id: 'dip', code: '置', name: '密闭层析杯' },
      { id: 'observe', code: '察', name: '观察记录' }
    ],
    dna: [
      { id: 'grind', code: '研', name: '研钵与材料' },
      { id: 'filter', code: '滤', name: '纱布漏斗' },
      { id: 'ethanol', code: '醇', name: '预冷乙醇' },
      { id: 'test', code: '鉴', name: '二苯胺与水浴' }
    ],
    microbe: [
      { id: 'flame', code: '焰', name: '酒精灯' },
      { id: 'sample', code: '菌', name: '菌液与接种环' },
      { id: 'streak1', code: 'Ⅰ', name: '第一划线区' },
      { id: 'streak2', code: 'Ⅱ', name: '第二、三区' },
      { id: 'incubate', code: '培', name: '密封培养皿' }
    ],
    enzyme: [
      { id: 'prepare', code: '酶', name: '等量酶液' },
      { id: 'temp', code: '温', name: '恒温水浴' },
      { id: 'ph', code: '酸', name: 'pH 缓冲液' },
      { id: 'substrate', code: '底', name: 'H₂O₂ 梯度' },
      { id: 'observe', code: '泡', name: '气泡记录' }
    ],
    plasmolysis: [
      { id: 'slide', code: '片', name: '洋葱鳞片叶装片' },
      { id: 'observe', code: '察', name: '显微观察' },
      { id: 'sucrose', code: '糖', name: '蔗糖溶液' },
      { id: 'water', code: '水', name: '清水与吸水纸' }
    ]
  };

  var _labWhy = {
    microscope: [
      '镜身稳定、位置略偏左，可让左眼观察时右眼同时绘图；搬运时应一手握镜臂、一手托镜座。',
      '材料必须位于通光孔中央，否则即使调焦正确，视野里也可能没有目标细胞。染色能增强细胞核等结构的对比度。',
      '先使用低倍物镜，是因为它的视野更大、工作距离更长，更容易找到材料且不易压坏装片。',
      '让物镜接近装片时必须从侧面观察；随后从目镜观察并反向调节，才能兼顾安全和成像。',
      '先粗调得到轮廓，再用细准焦螺旋获得清晰物像。显微镜下物像与装片移动方向相反。'
    ],
    pigment: [
      '滤纸下端剪去两角，可以让溶剂前沿较平整地上升，减少边缘效应对色素带的干扰。',
      '细线要细、直、颜色深。分次描线并等待干燥，可在不扩大起点的前提下增加色素量。',
      '层析液是流动相。不同色素在层析液中的溶解度、在滤纸上的吸附能力不同，因此移动速度不同。',
      '滤液细线必须高于液面；若被浸没，色素会直接溶入层析液，无法形成清晰色素带。容器加盖可减少有机溶剂挥发。',
      '一般由上至下为胡萝卜素、叶黄素、叶绿素 a、叶绿素 b；最上方色素随层析液移动最快。'
    ],
    dna: [
      '洗涤剂有助于破坏细胞膜和核膜，食盐有助于 DNA 从蛋白质等成分中分离；研磨可释放细胞内容物。',
      '过滤用于去除较大的组织碎片，滤液中仍含 DNA、蛋白质和其他可溶性物质，因此这里只是粗提取。',
      'DNA 不溶于冷乙醇。沿杯壁缓慢加入可形成清楚的液层界面，便于观察白色丝状 DNA 析出。',
      '在沸水浴条件下，DNA 遇二苯胺试剂呈蓝色。颜色反应是鉴定依据，不代表得到的是纯 DNA。'
    ],
    microbe: [
      '灼烧接种环可降低杂菌污染风险；必须冷却后取菌，否则高温会杀死待接种微生物并产生气溶胶风险。',
      '只需蘸取少量菌液。取样量过大会使各区菌体过密，不利于后续获得分离菌落。',
      '第一划线区承担初步铺开菌液的作用，线条应连续但不要划破培养基表面。',
      '换区前再次灭菌并冷却，只从上一分区末端带出少量菌体，才能形成连续稀释。',
      '第二、三区逐步减少菌量，后一区才有机会形成由单个或少数细胞繁殖得到的分离菌落。',
      '培养皿倒置可减少冷凝水滴落扩散菌落。本虚拟实验只训练流程；培养后不随意开皿，并按实验室规范处置。'
    ],
    enzyme: [
      '比较实验要保持酶量、总体积、反应时间等无关变量一致，每次只改变一个自变量。',
      '低温通常使反应变慢；升温可在一定范围内提高速率，过高温度可能使酶的空间结构遭到破坏。最适温度随酶和实验体系而变。',
      '过酸或过碱都可能改变酶分子及底物的带电状态和空间结构。最适 pH 不是所有酶都相同。',
      '酶量一定时，增加底物浓度会让速率先上升；活性位点逐渐被占满后，速率趋近平台。',
      '气泡是反应产生的 O₂。相同时间内气泡产生越快，表示该条件下的表观反应速率越高。'
    ],
    plasmolysis: [
      '紫色洋葱鳞片叶外表皮液泡有颜色，便于直接比较液泡和原生质层的位置变化。装片应薄而平整。',
      '先记录正常状态，才能把后续变化归因于外界溶液。此时原生质层紧贴细胞壁，中央液泡较大。',
      '外界蔗糖溶液浓度较高时，水通过原生质层向外运输，液泡和原生质层逐渐收缩。浓度过高或处理过久可能损伤细胞。',
      '细胞壁伸缩性较小，原生质层伸缩性较大；二者收缩程度不同，形成肉眼可辨的质壁分离。',
      '用清水从一侧引流，逐步置换蔗糖溶液，细胞外水势条件改变，水重新进入细胞。',
      '活细胞在损伤不严重时可发生质壁分离复原；若不能复原，应考虑细胞已受损或处理条件不合适。'
    ]
  };

  function _labAddStyles() {
    if (document.getElementById('bio-lab-v2-styles')) return;
    var style = document.createElement('style');
    style.id = 'bio-lab-v2-styles';
    style.textContent = `
      .bl2-page, .bl2-page * { box-sizing: border-box; }
      .bl2-page { --bl-green:#4a7c59; --bl-green-dark:#2c3e30; --bl-warm:#c4956a; --bl-paper:#faf8f5; --bl-stage:#f2f5f3; --bl-ink:#26352b; --bl-muted:#657269; --bl-line:#d9e1db; --bl-fluor:#cfff57; max-width:1440px; margin:0 auto; padding:26px 22px 56px; color:var(--bl-ink); font-family:var(--font-sans,'LXGW WenKai','PingFang SC',sans-serif); color-scheme:light; }
      .bl2-header { display:grid; grid-template-columns:minmax(0,1fr) minmax(250px,340px); gap:24px; align-items:end; padding:26px 30px; background:#fff; border:1px solid var(--bl-line); border-radius:16px 16px 8px 8px; box-shadow:var(--shadow-floating); position:relative; overflow:hidden; }
      .bl2-header::after { content:''; position:absolute; width:190px; height:190px; right:-70px; top:-95px; border:38px solid rgba(207,255,87,.38); border-radius:50%; pointer-events:none; }
      .bl2-kicker { margin:0 0 8px; color:var(--bl-green); font:700 .73rem/1 var(--font-mono,monospace); letter-spacing:.16em; text-transform:uppercase; }
      .bl2-header h1 { margin:0; color:var(--bl-green-dark); font-family:var(--font-serif,'LXGW WenKai',serif); font-size:clamp(1.85rem,3vw,3rem); letter-spacing:-.035em; }
      .bl2-subtitle { max-width:760px; margin:10px 0 0; color:var(--bl-muted); line-height:1.75; }
      .bl2-select-wrap { position:relative; z-index:1; }
      .bl2-select-wrap label { display:block; margin:0 0 7px; color:var(--bl-muted); font-size:.78rem; font-weight:700; letter-spacing:.08em; }
      .bl2-select { width:100%; appearance:none; padding:13px 42px 13px 15px; border:1px solid #cdd8d0; border-radius:12px; background:#fbfcfb url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%234a7c59' stroke-width='1.6'/%3E%3C/svg%3E") calc(100% - 17px) 52%/10px 6px no-repeat; color:var(--bl-ink); font:700 .95rem/1.2 inherit; outline:none; }
      .bl2-select:focus-visible { border-color:var(--bl-green); box-shadow:0 0 0 4px rgba(74,124,89,.15); }
      .bl2-progress { padding:18px 22px 16px; background:#fff; border:1px solid var(--bl-line); border-top:0; }
      .bl2-progress-line { height:4px; margin:0 5px 13px; border-radius:16px; background:#e8ede9; overflow:hidden; }
      .bl2-progress-fill { height:100%; width:0; border-radius:inherit; background:var(--bl-green); transition:width .45s ease; }
      .bl2-step-list { display:flex; gap:8px; margin:0; padding:0 2px 2px; list-style:none; overflow-x:auto; scrollbar-width:thin; }
      .bl2-step-item { min-width:132px; flex:1; display:flex; align-items:center; gap:8px; padding:8px 10px; color:#879188; border-radius:8px; background:#f7f8f7; font-size:.79rem; line-height:1.25; }
      .bl2-step-item strong { display:grid; place-items:center; width:23px; height:23px; flex:0 0 23px; border-radius:50%; border:1px solid #d5ddd7; background:#fff; font:700 .72rem/1 var(--font-mono,monospace); }
      .bl2-step-item.is-current { color:var(--bl-green-dark); background:#edf4ef; box-shadow:inset 0 0 0 1px rgba(74,124,89,.18); font-weight:700; }
      .bl2-step-item.is-current strong { color:#fff; border-color:var(--bl-green); background:var(--bl-green); }
      .bl2-step-item.is-done { color:#3c6f4c; background:#f2f6ed; }
      .bl2-step-item.is-done strong { color:var(--bl-green-dark); border-color:var(--bl-fluor); background:var(--bl-fluor); }
      .bl2-workspace { display:grid; grid-template-columns:minmax(0,1fr) minmax(330px,380px); gap:18px; margin-top:18px; align-items:start; }
      .bl2-visual-column, .bl2-panel { min-width:0; }
      .bl2-stage { position:relative; height:600px; overflow:hidden; border:1px solid #d5ded7; border-radius:16px; background:var(--bl-stage); box-shadow:var(--shadow-floating); }
      .bl2-canvas { display:block; width:100%; height:100%; }
      .bl2-stage-top { position:absolute; inset:16px 16px auto; display:flex; align-items:center; justify-content:space-between; gap:10px; pointer-events:none; }
      .bl2-microscope-launch { position:absolute; inset:0; z-index:2; display:grid; grid-template-columns:minmax(0,1.14fr) minmax(310px,.86fr); background:var(--color-primary-50,#edf5f0); }
      .bl2-microscope-launch[hidden] { display:none; }
      .bl2-microscope-preview { display:block; width:100%; height:100%; object-fit:cover; object-position:center; border-right:1px solid rgba(74,124,89,.16); }
      .bl2-microscope-copy { display:flex; flex-direction:column; justify-content:center; align-items:flex-start; padding:clamp(28px,4vw,56px); background:rgba(255,255,255,.94); }
      .bl2-microscope-badge { display:inline-flex; padding:6px 10px; border-radius:16px; background:var(--bl-fluor); color:#30451c; font-size:.73rem; font-weight:800; letter-spacing:.04em; }
      .bl2-microscope-copy h2 { max-width:470px; margin:18px 0 0; color:var(--bl-green-dark); font-family:var(--font-serif,'LXGW WenKai',serif); font-size:clamp(1.75rem,3vw,2.75rem); line-height:1.16; letter-spacing:-.035em; }
      .bl2-microscope-copy p { max-width:480px; margin:16px 0 0; color:#536258; font-size:.94rem; line-height:1.8; }
      .bl2-microscope-features { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; }
      .bl2-microscope-features span { padding:7px 10px; border:1px solid #ccd9cf; border-radius:8px; background:#fff; color:#41604b; font-size:.78rem; font-weight:700; }
      .bl2-microscope-enter { display:inline-flex; align-items:center; justify-content:center; min-height:44px; margin-top:24px; padding:11px 18px; border-radius:8px; background:var(--bl-green); color:#fff; font-size:.88rem; font-weight:800; text-decoration:none; box-shadow:var(--shadow-lg); transition:transform .18s ease,box-shadow .18s ease; }
      .bl2-microscope-enter:hover { transform:translateY(-2px); box-shadow:var(--shadow-floating); }
      .bl2-microscope-enter:focus-visible { outline:3px solid rgba(74,124,89,.25); outline-offset:3px; }
      .bl2-page.is-microscope-launch .bl2-progress, .bl2-page.is-microscope-launch .bl2-tray, .bl2-page.is-microscope-launch .bl2-panel, .bl2-page.is-microscope-launch .bl2-stage-top { display:none; }
      .bl2-page.is-microscope-launch .bl2-workspace { grid-template-columns:1fr; }
      .bl2-page.is-microscope-launch .bl2-stage { height:620px; }
      .bl2-live, .bl2-model { display:inline-flex; align-items:center; gap:7px; padding:7px 10px; border:1px solid rgba(74,124,89,.18); border-radius:16px; background:rgba(255,255,255,.96); color:var(--bl-green-dark); font-size:.72rem; font-weight:700; }
      .bl2-live::before { content:''; width:7px; height:7px; border-radius:50%; background:var(--bl-fluor); box-shadow:0 0 0 4px rgba(207,255,87,.25); }
      .bl2-model { color:var(--bl-muted); font-weight:500; }
      .bl2-tray { margin-top:12px; padding:15px; border:1px solid var(--bl-line); border-radius:16px; background:#fff; box-shadow:var(--shadow-floating); }
      .bl2-tray-head { display:flex; justify-content:space-between; gap:12px; margin-bottom:10px; color:var(--bl-muted); font-size:.74rem; }
      .bl2-tools { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:9px; }
      .bl2-tool { min-height:70px; padding:9px 6px; border:1px solid #dce3de; border-radius:12px; background:#fbfcfb; color:var(--bl-ink); font:600 .78rem/1.25 inherit; cursor:pointer; transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease; }
      .bl2-tool-code { display:grid; place-items:center; width:27px; height:27px; margin:0 auto 6px; border-radius:8px; background:#e9f0eb; color:var(--bl-green); font:800 .78rem/1 var(--font-mono,monospace); }
      .bl2-tool:hover:not(:disabled) { transform:translateY(-2px); border-color:#9bb6a2; box-shadow:var(--shadow-lg); }
      .bl2-tool:focus-visible, .bl2-btn:focus-visible, .bl2-choice:focus-visible { outline:3px solid rgba(74,124,89,.25); outline-offset:2px; }
      .bl2-tool.is-used { color:#66806e; background:#f3f7f4; }
      .bl2-tool.is-needed { border-color:#9bb929; background:#fbffe9; box-shadow:0 0 0 3px rgba(207,255,87,.42),0 8px 20px rgba(122,150,40,.12); animation:bl2-tool-pulse 1.45s ease-in-out infinite; }
      .bl2-tool:disabled { opacity:.5; cursor:not-allowed; transform:none; }
      .bl2-panel { position:sticky; top:16px; min-height:600px; padding:22px; border:1px solid var(--bl-line); border-radius:16px; background:#fff; box-shadow:var(--shadow-floating); }
      .bl2-panel-index { margin:0 0 8px; color:var(--bl-green); font:700 .73rem/1 var(--font-mono,monospace); letter-spacing:.12em; }
      .bl2-panel h2 { margin:0; color:var(--bl-green-dark); font-family:var(--font-serif,'LXGW WenKai',serif); font-size:1.55rem; line-height:1.3; }
      .bl2-instruction { margin:13px 0 0; color:#46544a; line-height:1.8; font-size:.94rem; }
      .bl2-instruction mark, .bl2-why mark, .bl2-report mark { padding:.02em .18em; border-radius:2px; color:inherit; background:rgba(207,255,87,.55); }
      .bl2-why { margin-top:16px; padding:14px 15px; border-left:4px solid var(--bl-warm); border-radius:4px 12px 12px 4px; background:#fbf6ef; color:#5f5549; font-size:.86rem; line-height:1.7; }
      .bl2-why strong { display:block; margin-bottom:3px; color:#8a5f38; font-size:.74rem; letter-spacing:.08em; }
      .bl2-param { margin-top:16px; padding:16px; border:1px solid #cdddcf; border-radius:12px; background:#f4f8f5; }
      .bl2-param-head { display:flex; align-items:end; justify-content:space-between; gap:12px; margin-bottom:11px; }
      .bl2-param-label { color:var(--bl-green-dark); font-size:.82rem; font-weight:700; }
      .bl2-param-value { color:var(--bl-green); font:800 1rem/1 var(--font-mono,monospace); text-align:right; }
      .bl2-range { width:100%; accent-color:var(--bl-green); cursor:ew-resize; }
      .bl2-param-select { width:100%; padding:10px 12px; border:1px solid #bacabd; border-radius:8px; background:#fff; color:var(--bl-ink); font:600 .9rem inherit; }
      .bl2-param-note { margin:10px 0 0; color:var(--bl-muted); font-size:.78rem; line-height:1.55; }
      .bl2-param-actions { display:flex; gap:8px; margin-top:12px; }
      .bl2-feedback { margin-top:16px; padding:12px 13px; border-radius:12px; font-size:.84rem; line-height:1.6; }
      .bl2-feedback.info { color:#315d46; background:#edf5ef; }
      .bl2-feedback.success { color:#315d20; background:#f0f8e8; box-shadow:inset 4px 0 0 var(--bl-fluor); }
      .bl2-feedback.error { color:#9a3f39; background:#fff0ee; box-shadow:inset 4px 0 0 #e9a29b; }
      .bl2-observation { margin-top:16px; }
      .bl2-observation h3 { margin:0 0 10px; color:var(--bl-green-dark); font-size:.95rem; line-height:1.5; }
      .bl2-choices { display:grid; gap:8px; }
      .bl2-choice { display:grid; grid-template-columns:82px 1fr; align-items:center; gap:10px; width:100%; padding:8px 10px; border:1px solid #dce3de; border-radius:12px; background:#fff; color:var(--bl-ink); text-align:left; font:600 .82rem/1.45 inherit; cursor:pointer; }
      .bl2-choice:hover { border-color:#97b09d; background:#f7faf7; }
      .bl2-choice svg { display:block; max-width:80px; }
      .bl2-report { margin-top:16px; padding:17px; border:1px solid #bfd19f; border-radius:12px; background:#f8fbe9; }
      .bl2-report-badge { display:inline-block; margin-bottom:8px; padding:4px 8px; border-radius:16px; background:var(--bl-fluor); color:#30451c; font-size:.72rem; font-weight:800; }
      .bl2-report h3 { margin:0 0 8px; color:var(--bl-green-dark); font-size:1.05rem; }
      .bl2-report p { margin:0; color:#4d5a50; font-size:.87rem; line-height:1.75; }
      .bl2-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; padding-top:15px; border-top:1px dashed #d7dfd9; }
      .bl2-btn { min-height:38px; padding:9px 14px; border:0; border-radius:8px; background:var(--bl-green); color:#fff; font:700 .82rem/1 inherit; cursor:pointer; }
      .bl2-btn:hover { filter:brightness(.96); }
      .bl2-btn--ghost { border:1px solid #d7dfd9; background:#fff; color:var(--bl-green-dark); }
      .bl2-btn--fluor { background:var(--bl-fluor); color:#30451c; }
      .bl2-footer-note { display:flex; justify-content:space-between; gap:18px; margin-top:14px; padding:0 4px; color:#718077; font-size:.75rem; line-height:1.55; }
      @keyframes bl2-tool-pulse { 50% { box-shadow:0 0 0 6px rgba(207,255,87,.2),0 8px 20px rgba(122,150,40,.12); } }
      @media (max-width:1050px) { .bl2-workspace { grid-template-columns:minmax(0,1fr) 330px; } .bl2-stage { height:540px; } .bl2-panel { min-height:540px; } }
      @media (max-width:820px) { .bl2-page { padding:16px 12px 40px; } .bl2-header { grid-template-columns:1fr; padding:22px 20px; } .bl2-workspace { grid-template-columns:1fr; } .bl2-stage { height:430px; } .bl2-panel { position:static; min-height:0; } .bl2-tools { grid-template-columns:repeat(3,minmax(0,1fr)); } .bl2-footer-note { display:block; } .bl2-microscope-launch { grid-template-columns:1fr; grid-template-rows:minmax(0,1fr) auto; } .bl2-microscope-preview { border-right:0; border-bottom:1px solid rgba(74,124,89,.16); } .bl2-microscope-copy { padding:24px; } .bl2-page.is-microscope-launch .bl2-stage { height:720px; } }
      @media (max-width:480px) { .bl2-page { padding-inline:8px; } .bl2-header { border-radius:16px 16px 8px 8px; } .bl2-progress { padding-inline:10px; } .bl2-stage { height:400px; border-radius:16px; } .bl2-stage-top { inset:10px 10px auto; } .bl2-model { display:none; } .bl2-tray { padding:10px; } .bl2-tools { grid-template-columns:repeat(2,minmax(0,1fr)); } .bl2-tool { min-height:62px; } .bl2-panel { padding:18px 15px; border-radius:16px; } .bl2-choice { grid-template-columns:72px 1fr; } .bl2-microscope-copy { padding:20px 18px 22px; } .bl2-microscope-copy h2 { font-size:1.62rem; } .bl2-microscope-copy p { font-size:.86rem; line-height:1.65; } .bl2-page.is-microscope-launch .bl2-stage { height:650px; } }
      @media (prefers-reduced-motion:reduce) { .bl2-page * { scroll-behavior:auto!important; animation:none!important; transition:none!important; } }
    `;
    document.head.appendChild(style);
  }

  function _labEscape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function _labEmphasize(text) {
    var safe = _labEscape(text);
    var terms = ['低倍物镜', '低倍镜', '细准焦螺旋', '粗准焦螺旋', '通光孔', '滤液细线', '高于液面', '层析液', '冷乙醇', '白色丝状', '二苯胺', '蓝色', '无菌操作', '再次灭菌', '分离菌落', '单一变量', '温度', 'pH', '底物浓度', '活性位点', 'O₂', '原生质层', '细胞壁', '质壁分离', '复原', '清水'];
    var pattern = new RegExp('(' + terms.map(function(term) { return term.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'); }).join('|') + ')', 'g');
    return safe.replace(pattern, '<mark>$1</mark>');
  }

  function _labExperiment() {
    return _experiments[_labState.experiment];
  }

  function _labCurrentStep() {
    var exp = _labExperiment();
    return _labState.step < exp.steps.length ? exp.steps[_labState.step] : null;
  }

  function _labUsed(toolId) {
    var exp = _labExperiment();
    for (var i = 0; i < Math.min(_labState.step, exp.steps.length); i++) {
      if (exp.steps[i].tool === toolId) return true;
    }
    return false;
  }

  function _labSetFeedback(text, type) {
    _labState.feedback = text;
    _labState.feedbackType = type || 'info';
    var box = document.getElementById('bl2-feedback');
    if (box) {
      box.className = 'bl2-feedback ' + _labState.feedbackType;
      box.textContent = text;
    }
  }

  function _labReset(expId, message) {
    _labState.experiment = expId || _labState.experiment;
    _labState.step = 0;
    _labState.mistakes = 0;
    _labState.finished = false;
    _labState.awaitingObservation = false;
    _labState.pendingTool = '';
    _labState.values = {};
    _labState.touched = {};
    _labState.feedback = message || '实验已重置。先阅读目标，再选择第一个器材。';
    _labState.feedbackType = 'info';
    _labState.hintVisible = false;
    _labState.stageElapsed = 0;
    _labState.awarded = false;
    _labRender();
  }

  function _labDefaultValue(param) {
    if (param.type === 'select') return param.options[0];
    return Number(param.min);
  }

  function _labUseTool(toolId) {
    if (_labState.finished || _labState.awaitingObservation || _labState.pendingTool) return;
    var step = _labCurrentStep();
    if (!step) return;
    if (toolId !== step.tool) {
      _labState.mistakes += 1;
      if (_labState.mistakes >= 2) _labState.hintVisible = true;
      _labSetFeedback('这个器材暂时用不上。先根据“' + step.name + '”判断本步要改变什么。', 'error');
      _labRenderTools();
      return;
    }
    _labState.hintVisible = false;
    if (step.param) {
      _labState.pendingTool = toolId;
      _labState.values[_labState.step] = _labDefaultValue(step.param);
      _labState.touched[_labState.step] = false;
      _labState.stageElapsed = 0;
      _labState.feedback = step.param.prompt || '调整参数后确认。';
      _labState.feedbackType = 'info';
      _labRender();
      return;
    }
    _labAdvance(step.feedback);
  }

  function _labAdvance(message) {
    var exp = _labExperiment();
    _labState.step += 1;
    _labState.pendingTool = '';
    _labState.hintVisible = false;
    _labState.stageElapsed = 0;
    if (_labState.step >= exp.steps.length) {
      if (exp.observation) {
        _labState.awaitingObservation = true;
        _labState.feedback = '操作完成。根据实时观察结果回答判读题，才能生成实验报告。';
        _labState.feedbackType = 'info';
      } else {
        _labFinish(message || '实验操作完成。');
      }
    } else {
      _labState.feedback = message || '操作正确，继续下一步。';
      _labState.feedbackType = 'success';
    }
    _labRender();
  }

  function _labConfirmParam() {
    var step = _labCurrentStep();
    if (!step || !step.param || !_labState.pendingTool) return;
    var param = step.param;
    var value = _labState.values[_labState.step];
    if (!_labState.touched[_labState.step]) {
      _labSetFeedback(param.type === 'range' ? '先拖动滑块并观察模型变化，再确认设置。' : '先选择一个设置，再确认。', 'error');
      return;
    }
    if (param.explore) {
      _labAdvance(step.feedback + ' 已记录本次观察值：' + _labFormatValue(param, value) + '。');
      return;
    }
    var valid = true;
    if (param.type === 'select') valid = value === param.ok;
    else {
      value = Number(value);
      valid = value >= Number(param.okMin) && value <= Number(param.okMax);
    }
    if (!valid) {
      _labState.mistakes += 1;
      var detail = param.wrong;
      if (!detail) detail = Number(value) < Number(param.okMin) ? param.tooLow : param.tooHigh;
      _labSetFeedback(detail || '参数不合适，请结合实验目的重新调整。', 'error');
      return;
    }
    _labAdvance(step.feedback);
  }

  function _labAnswer(index) {
    var exp = _labExperiment();
    if (!_labState.awaitingObservation || !exp.observation) return;
    var choice = exp.observation.choices[index];
    if (!choice) return;
    if (!choice.correct) {
      _labState.mistakes += 1;
      _labSetFeedback(choice.wrong || '这个判断与观察结果不一致，请再比较结构特征。', 'error');
      return;
    }
    _labState.awaitingObservation = false;
    _labFinish('判读正确，实验报告已生成。');
    _labRender();
  }

  function _labFinish(message) {
    _labState.finished = true;
    _labState.awaitingObservation = false;
    _labState.pendingTool = '';
    _labState.feedback = message || '实验完成。';
    _labState.feedbackType = 'success';
    _labState.stageElapsed = 5000;
    if (!_labState.awarded && typeof window.awardCR === 'function') {
      _labState.awarded = true;
      try { window.awardCR('lab_complete', 2); } catch (ignore) {}
    }
  }

  function _labFormatValue(param, value) {
    if (_labState.experiment === 'pigment' && _labState.step === 3) {
      var distance = Number(value);
      if (distance < 0) return '液面高于细线 ' + Math.abs(distance) + ' mm';
      if (distance === 0) return '液面与细线齐平';
      return '液面低于细线 ' + distance + ' mm';
    }
    return String(value) + (param.unit || '');
  }

  function _labLiveMessage(param, value) {
    var v = Number(value);
    if (_labState.experiment === 'enzyme') {
      if (_labState.step === 1) {
        if (v < 15) return '低温组：分子运动较慢，气泡生成速率较低。';
        if (v <= 50) return '本模拟酶液在这一温区反应较快；继续比较邻近温度，不能据此推广到所有酶。';
        return '高温组：气泡速率下降，提示酶的空间结构可能受到破坏。';
      }
      if (_labState.step === 2) {
        if (v < 5.5) return '偏酸条件：本模拟酶液的反应速率较低。';
        if (v <= 8) return '接近中性的条件下，本模拟酶液气泡较多；不同酶的适宜 pH 不同。';
        return '偏碱条件：本模拟酶液的反应速率下降。';
      }
      if (_labState.step === 3) return v < 3 ? '底物较少，反应速率随浓度上升较明显。' : '继续增加底物，速率仍上升但逐渐趋近平台。';
    }
    if (param.okMin != null) {
      if (v < Number(param.okMin)) return param.tooLow || '当前值偏低。';
      if (v > Number(param.okMax)) return param.tooHigh || '当前值偏高。';
      return '当前设置落在合理范围内，可以确认。';
    }
    return param.prompt || '观察模型变化。';
  }

  function _labProgress() {
    var exp = _labExperiment();
    var total = exp.steps.length + (exp.observation ? 1 : 0);
    var done = Math.min(_labState.step, exp.steps.length) + (_labState.finished && exp.observation ? 1 : 0);
    return Math.round(done / total * 100);
  }

  function _labRenderSteps() {
    var exp = _labExperiment();
    var list = document.getElementById('bl2-step-list');
    var fill = document.getElementById('bl2-progress-fill');
    if (!list || !fill) return;
    var html = exp.steps.map(function(step, index) {
      var cls = index < _labState.step ? ' is-done' : (index === _labState.step && !_labState.finished ? ' is-current' : '');
      var current = index === _labState.step && !_labState.finished ? ' aria-current="step"' : '';
      return '<li class="bl2-step-item' + cls + '"' + current + '><strong>' + (index < _labState.step ? '✓' : index + 1) + '</strong><span>' + _labEscape(step.name) + '</span></li>';
    }).join('');
    if (exp.observation) {
      var qClass = _labState.finished ? ' is-done' : (_labState.awaitingObservation ? ' is-current' : '');
      html += '<li class="bl2-step-item' + qClass + '"><strong>' + (_labState.finished ? '✓' : '?') + '</strong><span>结果判读</span></li>';
    }
    list.innerHTML = html;
    fill.style.width = _labProgress() + '%';
    var currentItem = list.querySelector('.is-current');
    if (currentItem) {
      var targetLeft = currentItem.offsetLeft - (list.clientWidth - currentItem.clientWidth) / 2;
      if (typeof list.scrollTo === 'function') {
        list.scrollTo({ left: Math.max(0, targetLeft), behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      } else {
        list.scrollLeft = Math.max(0, targetLeft);
      }
    }
  }

  function _labRenderTools() {
    var holder = document.getElementById('bl2-tools');
    if (!holder) return;
    var current = _labCurrentStep();
    var lock = _labState.finished || _labState.awaitingObservation || !!_labState.pendingTool;
    holder.innerHTML = (_labTools[_labState.experiment] || []).map(function(tool) {
      var used = _labUsed(tool.id);
      var needed = current && current.tool === tool.id && (_labState.hintVisible || _labState.mistakes >= 2);
      var cls = (used ? ' is-used' : '') + (needed ? ' is-needed' : '');
      return '<button type="button" class="bl2-tool' + cls + '" data-tool="' + _labEscape(tool.id) + '"' + (lock ? ' disabled' : '') + '><span class="bl2-tool-code">' + _labEscape(tool.code) + '</span><span>' + _labEscape(tool.name) + '</span></button>';
    }).join('');
    holder.querySelectorAll('[data-tool]').forEach(function(button) {
      button.addEventListener('click', function() { _labUseTool(button.getAttribute('data-tool')); });
    });
  }

  function _labRenderParam(step) {
    if (!_labState.pendingTool || !step || !step.param) return '';
    var param = step.param;
    var value = _labState.values[_labState.step];
    var control = '';
    if (param.type === 'select') {
      control = '<select class="bl2-param-select" id="bl2-param-control" aria-label="' + _labEscape(param.label) + '">' + param.options.map(function(option) {
        return '<option value="' + _labEscape(option) + '"' + (option === value ? ' selected' : '') + '>' + _labEscape(option) + '</option>';
      }).join('') + '</select>';
    } else {
      control = '<input class="bl2-range" id="bl2-param-control" type="range" min="' + param.min + '" max="' + param.max + '" step="' + (param.step || 1) + '" value="' + value + '" aria-label="' + _labEscape(param.label) + '">';
    }
    return '<div class="bl2-param"><div class="bl2-param-head"><span class="bl2-param-label">' + _labEscape(param.label) + '</span><output class="bl2-param-value" id="bl2-param-value">' + _labEscape(_labFormatValue(param, value)) + '</output></div>' + control + '<p class="bl2-param-note">' + _labEscape(param.prompt || '调整参数并观察变化。') + (param.explore ? ' 本步骤记录趋势，不把某个数值当作所有酶的统一最适值。' : '') + '</p><div class="bl2-param-actions"><button type="button" class="bl2-btn bl2-btn--fluor" id="bl2-param-confirm">确认并记录</button><button type="button" class="bl2-btn bl2-btn--ghost" id="bl2-param-cancel">重选器材</button></div></div>';
  }

  function _labRenderObservation(exp) {
    if (!_labState.awaitingObservation || !exp.observation) return '';
    return '<section class="bl2-observation"><h3>' + _labEscape(exp.observation.prompt) + '</h3><div class="bl2-choices">' + exp.observation.choices.map(function(choice, index) {
      return '<button type="button" class="bl2-choice" data-choice="' + index + '"><span aria-hidden="true">' + choice.svg + '</span><span>' + _labEscape(choice.label) + '</span></button>';
    }).join('') + '</div></section>';
  }

  function _labRenderPanel() {
    var exp = _labExperiment();
    var step = _labCurrentStep();
    var panel = document.getElementById('bl2-panel');
    if (!panel) return;
    var heading = '实验完成';
    var instruction = exp.goal;
    var why = '回看操作过程，把现象、变量和结论对应起来。';
    var indexText = '完成 · ' + exp.steps.length + ' 个操作步骤';
    if (_labState.awaitingObservation) {
      heading = '结果判读';
      instruction = '不要只凭记忆作答，先回看左侧模型中的结构或反应产物。';
      why = '实验结论必须由观察到的现象支持；现象、解释和结论不能相互替代。';
      indexText = '最后一步 · 观察证据';
    } else if (step) {
      heading = step.name;
      instruction = step.text;
      why = (_labWhy[_labState.experiment] || [])[_labState.step] || exp.goal;
      indexText = '操作 ' + (_labState.step + 1) + ' / ' + exp.steps.length;
    }
    var report = _labState.finished ? '<section class="bl2-report"><span class="bl2-report-badge">实验报告已生成</span><h3>结果与解释</h3><p>' + _labEmphasize(exp.report) + '</p></section>' : '';
    panel.innerHTML = '<p class="bl2-panel-index">' + _labEscape(indexText) + '</p><h2>' + _labEscape(heading) + '</h2><p class="bl2-instruction">' + _labEmphasize(instruction) + '</p><aside class="bl2-why"><strong>为什么这样做</strong>' + _labEmphasize(why) + '</aside>' + _labRenderParam(step) + '<div class="bl2-feedback ' + _labState.feedbackType + '" id="bl2-feedback" role="status" aria-live="polite">' + _labEscape(_labState.feedback) + '</div>' + _labRenderObservation(exp) + report + '<div class="bl2-actions"><button type="button" class="bl2-btn bl2-btn--ghost" id="bl2-restart">重新开始</button>' + (!_labState.finished && !_labState.awaitingObservation && !_labState.pendingTool ? '<button type="button" class="bl2-btn" id="bl2-hint">高亮所需器材</button>' : '') + '</div>';

    var restart = document.getElementById('bl2-restart');
    if (restart) restart.addEventListener('click', function() { _labReset(_labState.experiment); });
    var hint = document.getElementById('bl2-hint');
    if (hint) hint.addEventListener('click', function() {
      _labState.hintVisible = true;
      var current = _labCurrentStep();
      _labSetFeedback(current ? '已在器材台和实验模型中高亮本步操作对象。' : '请根据观察结果完成判读。', 'info');
      _labRenderTools();
    });
    var control = document.getElementById('bl2-param-control');
    if (control && step && step.param) {
      var eventName = step.param.type === 'select' ? 'change' : 'input';
      control.addEventListener(eventName, function() {
        var value = step.param.type === 'select' ? control.value : Number(control.value);
        _labState.values[_labState.step] = value;
        _labState.touched[_labState.step] = true;
        var output = document.getElementById('bl2-param-value');
        if (output) output.textContent = _labFormatValue(step.param, value);
        _labSetFeedback(_labLiveMessage(step.param, value), 'info');
      });
    }
    var confirm = document.getElementById('bl2-param-confirm');
    if (confirm) confirm.addEventListener('click', _labConfirmParam);
    var cancel = document.getElementById('bl2-param-cancel');
    if (cancel) cancel.addEventListener('click', function() {
      _labState.pendingTool = '';
      _labState.feedback = '参数设置已取消，可重新选择器材。';
      _labState.feedbackType = 'info';
      _labRender();
    });
    panel.querySelectorAll('[data-choice]').forEach(function(button) {
      button.addEventListener('click', function() { _labAnswer(Number(button.getAttribute('data-choice'))); });
    });
  }

  function _labRender() {
    var select = document.getElementById('bl2-exp-select');
    if (select) select.value = _labState.experiment;
    var microscopeMode = _labState.experiment === 'microscope';
    var page = document.querySelector('.bl2-page');
    if (page) page.classList.toggle('is-microscope-launch', microscopeMode);
    var microscopeLaunch = document.getElementById('bl2-microscope-launch');
    if (microscopeLaunch) microscopeLaunch.hidden = !microscopeMode;
    var canvas = document.getElementById('bio-lab-canvas');
    if (canvas) canvas.hidden = microscopeMode;
    _labRenderSteps();
    _labRenderTools();
    _labRenderPanel();
    var name = document.getElementById('bl2-live-name');
    if (name) name.textContent = _labExperiment().name;
    var modelKind = document.getElementById('bl2-model-kind');
    if (modelKind) {
      modelKind.textContent = _labState.experiment === 'plasmolysis'
        ? '显微视野 · 教学模拟'
        : (_labState.experiment === 'microscope' ? '设备联动 · 教学模拟' : '真实材质 · 教学模拟');
    }
  }

  function _labRoundRect(ctx, x, y, w, h, r) {
    var radius = Math.max(0, Math.min(r, Math.min(Math.abs(w), Math.abs(h)) / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function _labCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, rect.width);
    var h = Math.max(1, rect.height);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pw = Math.round(w * dpr);
    var ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function _labBackdrop(ctx, w, h) {
    var gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#f8faf8');
    gradient.addColorStop(.55, '#edf3ef');
    gradient.addColorStop(1, '#f6f0e8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.strokeStyle = 'rgba(74,124,89,.06)';
    ctx.lineWidth = 1;
    for (var x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (var y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    _labRoundRect(ctx, 16, h - 46, w - 32, 30, 9);
    ctx.fill();
    ctx.fillStyle = '#6a786f';
    ctx.font = '600 12px "LXGW WenKai",sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('教学模拟 · 操作实时改变实验现象，右侧文字解释原因', 28, h - 31);
  }

  function _labLabel(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = '700 12px "LXGW WenKai",sans-serif';
    var tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    _labRoundRect(ctx, x - tw / 2 - 8, y - 12, tw + 16, 24, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,124,89,.16)';
    ctx.stroke();
    ctx.fillStyle = color || '#435248';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + .5);
    ctx.restore();
  }

  function _labCallout(ctx, w, x, y, tx, ty, text, accent) {
    if (w < 560) return;
    ctx.save();
    var color = accent || '#4a7c59';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.font = '600 12px "LXGW WenKai",sans-serif';
    var textWidth = ctx.measureText(text).width;
    var alignRight = tx < x || tx + textWidth + 12 > w;
    var textX = alignRight ? Math.min(w - 12, tx - 6) : Math.max(12, tx + 6);
    var boxX = alignRight ? textX - textWidth - 7 : textX - 7;
    var boxW = textWidth + 14;
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.strokeStyle = 'rgba(44,62,48,.12)';
    ctx.lineWidth = 1;
    _labRoundRect(ctx, boxX, ty - 11, boxW, 22, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = alignRight ? 'right' : 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, textX, ty);
    ctx.restore();
  }

  function _labFocus(ctx) {
    if ((!_labState.hintVisible && _labState.mistakes < 2) || !_labState.focus || _labState.pendingTool || _labState.awaitingObservation || _labState.finished) return;
    var f = _labState.focus;
    var pulse = (Math.sin(_labState.phase * 2.4) + 1) / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(185,230,46,' + (.65 - pulse * .22) + ')';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#cfff57';
    ctx.shadowBlur = 16 + pulse * 12;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r + pulse * 8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function _labAsset(key) {
    var image = _labAssets[key];
    return image && image.ready && image.naturalWidth ? image : null;
  }

  function _labDrawAssetLoading(ctx, w, h, label) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.76)';
    _labRoundRect(ctx, w / 2 - 112, h / 2 - 34, 224, 68, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,124,89,.18)';
    ctx.stroke();
    ctx.fillStyle = '#405448';
    ctx.font = '700 13px "LXGW WenKai",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label || '正在载入实验资产…', w / 2, h / 2);
    ctx.restore();
  }

  function _labDrawCoverImage(ctx, image, w, h) {
    var iw = image.naturalWidth || image.width;
    var ih = image.naturalHeight || image.height;
    var compact = w / h < 1.05 && iw / ih > 1.15;
    var scale = compact
      ? Math.min((w - 12) / iw, (h - 92) / ih)
      : Math.max(w / iw, h / ih);
    var dw = iw * scale;
    var dh = ih * scale;
    var frame = { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
    if (compact) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.shadowColor = 'rgba(31,45,36,.2)';
      ctx.shadowBlur = 18;
      _labRoundRect(ctx, frame.x - 4, frame.y - 4, frame.w + 8, frame.h + 8, 13);
      ctx.fill();
      ctx.restore();
      ctx.save();
      _labRoundRect(ctx, frame.x, frame.y, frame.w, frame.h, 10);
      ctx.clip();
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h);
      ctx.restore();
    } else {
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h);
    }
    var shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(26,44,34,.03)');
    shade.addColorStop(.72, 'rgba(26,44,34,0)');
    shade.addColorStop(1, 'rgba(26,44,34,.16)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    return frame;
  }

  function _labDrawContainImage(ctx, image, w, h, padX, padY) {
    var iw = image.naturalWidth || image.width;
    var ih = image.naturalHeight || image.height;
    var scale = Math.min((w - (padX || 0) * 2) / iw, (h - (padY || 0) * 2) / ih);
    var dw = iw * scale;
    var dh = ih * scale;
    var frame = { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h);
    return frame;
  }

  function _labFramePoint(frame, u, v) {
    return { x: frame.x + frame.w * u, y: frame.y + frame.h * v };
  }

  function _labHighlightRegion(ctx, frame, region, label, active) {
    var x = frame.x + frame.w * region[0];
    var y = frame.y + frame.h * region[1];
    var width = frame.w * region[2];
    var height = frame.h * region[3];
    ctx.save();
    ctx.strokeStyle = active ? '#cfff57' : 'rgba(255,255,255,.64)';
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.shadowColor = active ? 'rgba(207,255,87,.72)' : 'transparent';
    ctx.shadowBlur = active ? 16 : 0;
    _labRoundRect(ctx, x, y, width, height, 14);
    ctx.stroke();
    ctx.restore();
    if (label && active) _labLabel(ctx, x + width / 2, Math.max(58, y - 14), label, '#315d46');
    return { x: x + width / 2, y: y + height / 2, r: Math.min(width, height) * .24 };
  }

  function _labDrawMicroscope(ctx, w, h) {
    var compact = w < 560;
    var cx = compact ? w * .28 : w * .27;
    var cy = h * .52;
    var scale = compact ? .72 : Math.min(1, w / 860);
    var s = _labState.step;
    var visible = s > 0 || _labState.pendingTool === 'microscope';
    ctx.save();
    ctx.globalAlpha = visible ? 1 : .28;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.shadowColor = 'rgba(30,50,38,.18)'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#486353'; _labRoundRect(ctx, -115, 118, 230, 30, 15); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#dfe7e1'; _labRoundRect(ctx, -78, 63, 156, 17, 4); ctx.fill();
    ctx.fillStyle = '#60786a'; _labRoundRect(ctx, -20, -22, 40, 105, 16); ctx.fill();
    ctx.strokeStyle = '#486353'; ctx.lineWidth = 26; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-73, 113); ctx.quadraticCurveTo(-118, 5, -47, -76); ctx.stroke();
    ctx.save(); ctx.translate(-25, -102); ctx.rotate(-.34);
    ctx.fillStyle = '#d9e3dc'; _labRoundRect(ctx, -23, -58, 46, 132, 15); ctx.fill();
    ctx.fillStyle = '#334b3d'; _labRoundRect(ctx, -27, -67, 54, 27, 8); ctx.fill();
    ctx.fillStyle = '#a97b52'; _labRoundRect(ctx, -18, 65, 15, 34, 4); ctx.fill();
    ctx.fillStyle = '#a97b52'; _labRoundRect(ctx, 3, 65, 15, 34, 4); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#2e4437'; ctx.beginPath(); ctx.arc(48, 5, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8fa297'; ctx.beginPath(); ctx.arc(48, 5, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2e4437'; ctx.beginPath(); ctx.arc(58, 38, 11, 0, Math.PI * 2); ctx.fill();
    if (s >= 2 || _labState.pendingTool === 'slide') {
      ctx.fillStyle = 'rgba(160,203,216,.78)'; _labRoundRect(ctx, -58, 56, 116, 8, 3); ctx.fill();
      ctx.fillStyle = '#98739b'; _labRoundRect(ctx, -18, 55, 36, 5, 2); ctx.fill();
    }
    var brightness = s < 2 ? .08 : (s === 2 && _labState.pendingTool ? Number(_labState.values[2] || 0) / 100 : Number(_labState.values[2] || 55) / 100);
    if (s >= 2) {
      var beam = ctx.createLinearGradient(0, 112, 0, 55); beam.addColorStop(0, 'rgba(255,226,137,' + brightness * .75 + ')'); beam.addColorStop(1, 'rgba(255,247,202,0)');
      ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(-28, 112); ctx.lineTo(28, 112); ctx.lineTo(14, 55); ctx.lineTo(-14, 55); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b18454'; ctx.beginPath(); ctx.ellipse(0, 113, 31, 12, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    var fieldX = compact ? w * .72 : w * .72;
    var fieldY = h * .48;
    var radius = compact ? Math.min(82, w * .235) : Math.min(155, h * .29, w * .2);
    ctx.save();
    ctx.shadowColor = 'rgba(35,60,45,.18)'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(fieldX, fieldY, radius + 10, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    var fieldBrightness = .18 + brightness * .82;
    ctx.fillStyle = 'rgb(' + Math.round(232 + fieldBrightness * 20) + ',' + Math.round(226 + fieldBrightness * 24) + ',' + Math.round(235 + fieldBrightness * 18) + ')';
    ctx.beginPath(); ctx.arc(fieldX, fieldY, radius, 0, Math.PI * 2); ctx.fill();
    ctx.clip();
    if (s >= 2 || _labState.pendingTool === 'coarse' || _labState.pendingTool === 'fine') {
      var focused = s >= 5 || _labState.finished;
      var distance = Number(_labState.values[3] == null ? 12 : _labState.values[3]);
      var coarseReady = s >= 4 || (distance >= 5 && distance <= 8);
      ctx.globalAlpha = focused ? 1 : coarseReady ? .72 : .36;
      ctx.filter = focused ? 'none' : 'blur(' + (coarseReady ? 1.4 : 4) + 'px)';
      var cellW = radius * .62;
      var cellH = radius * .38;
      for (var row = -3; row <= 3; row++) {
        for (var col = -3; col <= 3; col++) {
          var px = fieldX + col * cellW + (row % 2) * cellW * .12;
          var py = fieldY + row * cellH;
          ctx.strokeStyle = '#7d5b82'; ctx.lineWidth = focused ? 2 : 3;
          ctx.fillStyle = 'rgba(191,133,190,.13)';
          ctx.beginPath(); ctx.rect(px - cellW * .48, py - cellH * .45, cellW * .94, cellH * .9); ctx.fill(); ctx.stroke();
          if (focused) { ctx.fillStyle = '#724a78'; ctx.beginPath(); ctx.ellipse(px + cellW * .18, py, 3.5, 4.5, 0, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      ctx.filter = 'none';
    }
    ctx.restore();
    _labLabel(ctx, fieldX, fieldY + radius + 28, s >= 5 ? '清晰：染色洋葱表皮细胞' : '目镜视野');
    if (!compact && s >= 2) _labCallout(ctx, w, fieldX + radius * .45, fieldY - radius * .2, fieldX + radius + 55, fieldY - radius * .5, s >= 5 ? '细胞核' : '物像尚未清晰', '#8b5f8f');
    if (_labState.pendingTool === 'coarse') {
      var dv = Number(_labState.values[3]);
      var gx = cx + 34 * scale;
      var gy = cy - 14 * scale;
      ctx.strokeStyle = dv < 5 ? '#d86d66' : '#4a7c59'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + Math.max(5, dv * 3)); ctx.stroke();
      _labLabel(ctx, gx, gy - 20, dv + ' mm', dv < 5 ? '#a33b35' : '#315d46');
    }
    var points = [{x:cx,y:cy,r:95*scale},{x:cx,y:cy+60*scale,r:46*scale},{x:cx,y:cy+100*scale,r:38*scale},{x:cx,y:cy-20*scale,r:42*scale},{x:fieldX,y:fieldY,r:radius*.7}];
    _labState.focus = points[Math.min(s, 4)];
  }

  function _labDrawPigment(ctx, w, h) {
    var s = _labState.step;
    var cx = w * .5;
    var top = 82;
    var bottom = h - 72;
    var beakerW = Math.min(260, w * .48);
    var beakerX = cx - beakerW / 2;
    var lineY = bottom - 130;
    var distance = s === 3 && _labState.pendingTool ? Number(_labState.values[3]) : 7;
    var liquidY = lineY + distance * 4;
    liquidY = Math.max(top + 80, Math.min(bottom - 24, liquidY));
    ctx.save();
    ctx.shadowColor = 'rgba(44,62,48,.13)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 12;
    ctx.fillStyle = 'rgba(255,255,255,.58)'; _labRoundRect(ctx, beakerX, top + 36, beakerW, bottom - top - 34, 20); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#759087'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(beakerX, top + 40); ctx.lineTo(beakerX + 10, bottom); ctx.lineTo(beakerX + beakerW - 10, bottom); ctx.lineTo(beakerX + beakerW, top + 40); ctx.stroke();
    ctx.strokeStyle = '#4f6c5c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(beakerX - 5, top + 40); ctx.lineTo(beakerX + beakerW + 5, top + 40); ctx.stroke();
    if (s >= 3 || _labState.pendingTool === 'solvent' || _labState.pendingTool === 'dip') {
      var solventGrad = ctx.createLinearGradient(0, liquidY, 0, bottom); solventGrad.addColorStop(0, 'rgba(229,202,123,.52)'); solventGrad.addColorStop(1, 'rgba(188,145,69,.62)');
      ctx.fillStyle = solventGrad; ctx.beginPath(); ctx.moveTo(beakerX + 9, liquidY); ctx.lineTo(beakerX + beakerW - 9, liquidY); ctx.lineTo(beakerX + beakerW - 13, bottom - 3); ctx.lineTo(beakerX + 13, bottom - 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#b88d50'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(beakerX + 9, liquidY); ctx.lineTo(beakerX + beakerW - 9, liquidY); ctx.stroke();
    }
    var stripW = Math.min(76, w * .17);
    var stripX = cx - stripW / 2;
    ctx.globalAlpha = s >= 1 || _labState.pendingTool === 'paper' ? 1 : .25;
    ctx.fillStyle = '#fffdf2'; _labRoundRect(ctx, stripX, top, stripW, bottom - top - 14, 4); ctx.fill();
    ctx.strokeStyle = '#dfd8c1'; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
    if (s >= 2 || _labState.pendingTool === 'capillary') {
      ctx.strokeStyle = '#4e7b46'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(stripX + 7, lineY); ctx.lineTo(stripX + stripW - 7, lineY); ctx.stroke();
    }
    if (s >= 4) {
      var p = s >= 5 || _labState.finished ? 1 : Math.min(1, _labState.stageElapsed / 2600);
      var ease = 1 - Math.pow(1 - p, 3);
      var bandData = [
        { name:'胡萝卜素', color:'#f19a2a', rise:190 },
        { name:'叶黄素', color:'#d8c63e', rise:148 },
        { name:'叶绿素 a', color:'#2e8173', rise:92 },
        { name:'叶绿素 b', color:'#759641', rise:54 }
      ];
      bandData.forEach(function(band, i) {
        var y = lineY - band.rise * ease;
        ctx.fillStyle = band.color; ctx.globalAlpha = .45 + ease * .5;
        _labRoundRect(ctx, stripX + 8, y - 4, stripW - 16, 8, 4); ctx.fill();
        ctx.globalAlpha = 1;
        if (p > .82 && w >= 560) _labCallout(ctx, w, stripX + stripW - 5, y, stripX + stripW + 72, y - 2, band.name, band.color);
      });
      var frontY = lineY - 220 * ease;
      ctx.setLineDash([5,4]); ctx.strokeStyle = '#87958d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(stripX + 6, frontY); ctx.lineTo(stripX + stripW - 6, frontY); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    if (s === 3 && _labState.pendingTool) _labLabel(ctx, cx + beakerW * .42, liquidY, _labFormatValue(_labCurrentStep().param, distance), distance < 3 ? '#ad423d' : '#315d46');
    else _labLabel(ctx, cx, bottom + 18, s >= 4 ? '密闭纸层析进行中' : '层析装置');
    var focusY = [top + 40,lineY,liquidY,lineY + 20,lineY - 120][Math.min(s,4)];
    _labState.focus = { x: cx, y: focusY, r: s === 0 ? 54 : 36 };
  }

  function _labStation(ctx, x, y, width, height, number, label, active, done) {
    ctx.save();
    ctx.fillStyle = active ? '#fbffe9' : 'rgba(255,255,255,.78)';
    ctx.strokeStyle = active ? '#a7c43e' : '#d6e0d9';
    ctx.lineWidth = active ? 2 : 1;
    _labRoundRect(ctx, x, y, width, height, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = done ? '#cfff57' : '#e7efe9'; ctx.beginPath(); ctx.arc(x + 22, y + 22, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#33483a'; ctx.font = '800 11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(done ? '✓' : number, x + 22, y + 22);
    ctx.fillStyle = '#4b5b50'; ctx.font = '700 12px "LXGW WenKai",sans-serif'; ctx.fillText(label, x + width / 2, y + height - 18);
    ctx.restore();
  }

  function _labDrawDNA(ctx, w, h) {
    var compact = w < 620;
    var gap = compact ? 10 : 14;
    var cardW = compact ? (w - 46) / 2 : (w - 76) / 4;
    var cardH = compact ? (h - 122) / 2 : Math.min(330, h - 145);
    var baseY = compact ? 66 : 116;
    var positions = [];
    for (var i = 0; i < 4; i++) {
      var col = compact ? i % 2 : i;
      var row = compact ? Math.floor(i / 2) : 0;
      positions.push({ x: 16 + col * (cardW + gap), y: baseY + row * (cardH + gap) });
    }
    var labels = ['研磨裂解','过滤除渣','冷醇析出','二苯胺鉴定'];
    positions.forEach(function(p, i) { _labStation(ctx, p.x, p.y, cardW, cardH, i + 1, labels[i], _labState.step === i, _labState.step > i); });
    positions.forEach(function(p, i) {
      var cx = p.x + cardW / 2;
      var cy = p.y + cardH * .5;
      ctx.save();
      if (i === 0) {
        ctx.fillStyle = '#cbb28e'; ctx.beginPath(); ctx.ellipse(cx, cy + 26, cardW * .3, 23, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9eb36d'; ctx.beginPath(); ctx.ellipse(cx, cy + 18, cardW * .23, 13, 0, 0, Math.PI * 2); ctx.fill();
        var move = _labState.step === 0 ? Math.sin(_labState.phase * 3) * 7 : 0;
        ctx.strokeStyle = '#795f45'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx + 18 + move, cy - 55); ctx.lineTo(cx - 10 + move, cy + 12); ctx.stroke();
      } else if (i === 1) {
        ctx.fillStyle = 'rgba(239,244,240,.9)'; ctx.beginPath(); ctx.moveTo(cx - 38, cy - 48); ctx.lineTo(cx + 38, cy - 48); ctx.lineTo(cx + 13, cy + 5); ctx.lineTo(cx + 13, cy + 52); ctx.lineTo(cx - 13, cy + 52); ctx.lineTo(cx - 13, cy + 5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#71877a'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#819c61'; ctx.beginPath(); ctx.ellipse(cx, cy - 35, 29, 8, 0, 0, Math.PI * 2); ctx.fill();
        if (_labState.step >= 1) { for (var d=0; d<3; d++) { var dy = (cy + 8 + ((_labState.phase*26+d*17)%38)); ctx.fillStyle='rgba(116,147,79,.72)'; ctx.beginPath(); ctx.arc(cx,dy,2.5,0,Math.PI*2); ctx.fill(); } }
      } else if (i === 2) {
        ctx.strokeStyle = '#63786b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 34, cy - 55); ctx.lineTo(cx - 25, cy + 55); ctx.lineTo(cx + 25, cy + 55); ctx.lineTo(cx + 34, cy - 55); ctx.stroke();
        ctx.fillStyle = 'rgba(126,163,99,.46)'; ctx.fillRect(cx - 27, cy + 6, 54, 47);
        if (_labState.pendingTool === 'ethanol' || _labState.step >= 3) { ctx.fillStyle='rgba(225,239,244,.62)'; ctx.fillRect(cx-30,cy-24,60,30); ctx.strokeStyle='#fff'; ctx.lineWidth=2; for(var t=0;t<7;t++){ctx.beginPath();ctx.moveTo(cx-19+t*6,cy-9);ctx.bezierCurveTo(cx-28+t*8,cy+3,cx-9+t*5,cy+18,cx-17+t*7,cy+32);ctx.stroke();} }
      } else {
        ctx.fillStyle = '#a9c9d7'; _labRoundRect(ctx,cx-50,cy+17,100,42,8); ctx.fill();
        ctx.strokeStyle='#607a70';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx-19,cy-55);ctx.lineTo(cx-14,cy+35);ctx.lineTo(cx+14,cy+35);ctx.lineTo(cx+19,cy-55);ctx.stroke();
        var blue = _labState.step >= 4 || _labState.finished;
        ctx.fillStyle = blue ? '#456fb3' : 'rgba(132,164,112,.52)'; ctx.beginPath();ctx.moveTo(cx-15,cy+2);ctx.lineTo(cx-13,cy+32);ctx.lineTo(cx+13,cy+32);ctx.lineTo(cx+15,cy+2);ctx.closePath();ctx.fill();
        if (_labState.step === 3) { for(var b=0;b<4;b++){ctx.fillStyle='rgba(255,255,255,.7)';ctx.beginPath();ctx.arc(cx+Math.sin(b*2.3)*30,cy+42-((_labState.phase*18+b*11)%24),2,0,Math.PI*2);ctx.fill();} }
      }
      ctx.restore();
    });
    var current = positions[Math.min(_labState.step,3)];
    _labState.focus = { x: current.x + cardW/2, y: current.y + cardH*.5, r: Math.min(cardW,cardH)*.25 };
  }

  function _labDrawMicrobe(ctx, w, h) {
    var s = _labState.step;
    var compact = w < 560;
    var dishX = compact ? w * .56 : w * .62;
    var dishY = h * .49;
    var r = compact ? Math.min(128,w*.34) : Math.min(190,h*.33,w*.27);
    var flameX = compact ? w*.18 : w*.18;
    var flameY = h*.64;
    ctx.save();
    ctx.fillStyle='#9c704b';_labRoundRect(ctx,flameX-28,flameY,56,60,10);ctx.fill();
    ctx.fillStyle='#365347';_labRoundRect(ctx,flameX-11,flameY-12,22,18,5);ctx.fill();
    var flameOn = s === 0 || s === 3 || _labState.pendingTool === 'flame';
    if (flameOn || s>0) {
      var flicker=Math.sin(_labState.phase*5)*4;
      ctx.fillStyle='rgba(245,161,60,.92)';ctx.beginPath();ctx.moveTo(flameX,flameY-12);ctx.bezierCurveTo(flameX-24,flameY-40,flameX-5,flameY-68+flicker,flameX,flameY-79+flicker);ctx.bezierCurveTo(flameX+8,flameY-55,flameX+25,flameY-38,flameX,flameY-12);ctx.fill();
      ctx.fillStyle='#fff1a8';ctx.beginPath();ctx.ellipse(flameX,flameY-35,8,18,0,0,Math.PI*2);ctx.fill();
    }
    ctx.shadowColor='rgba(42,62,50,.2)';ctx.shadowBlur=18;ctx.fillStyle='rgba(255,255,255,.72)';ctx.beginPath();ctx.arc(dishX,dishY,r+8,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';
    ctx.fillStyle='rgba(225,194,135,.58)';ctx.beginPath();ctx.arc(dishX,dishY,r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#7f9488';ctx.lineWidth=3;ctx.beginPath();ctx.arc(dishX,dishY,r,0,Math.PI*2);ctx.stroke();
    ctx.save();ctx.beginPath();ctx.arc(dishX,dishY,r-6,0,Math.PI*2);ctx.clip();
    ctx.strokeStyle='#ad7158';ctx.lineWidth=2.2;ctx.lineCap='round';
    if(s>=3){for(var a=0;a<9;a++){ctx.beginPath();var y=dishY-r*.55+a*r*.07;ctx.moveTo(dishX-r*.78,y);ctx.bezierCurveTo(dishX-r*.55,y+12,dishX-r*.35,y-12,dishX-r*.1,y);ctx.stroke();}}
    if(s>=5){for(var q=0;q<7;q++){ctx.beginPath();ctx.arc(dishX-r*.04,dishY-r*.5+q*r*.13,r*.48,-2.1,1.25);ctx.stroke();}for(var z=0;z<6;z++){ctx.beginPath();ctx.arc(dishX+r*.18,dishY+r*.08+z*r*.06,r*.53,-1.7,1.1);ctx.stroke();}}
    if(s>=6||_labState.finished){for(var c=0;c<25;c++){var angle=c*2.41;var rr=r*(.18+(c%8)/13);var px=dishX+Math.cos(angle)*rr;var py=dishY+Math.sin(angle)*rr; if(px>dishX-r*.08){var cr=2.5+(c%3);ctx.fillStyle='rgba(246,242,211,.95)';ctx.beginPath();ctx.arc(px,py,cr+Math.sin(_labState.phase+c)*.25,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(129,104,68,.45)';ctx.lineWidth=1;ctx.stroke();}}}
    ctx.restore();
    ctx.strokeStyle='#4e6256';ctx.lineWidth=4;ctx.beginPath();var loopX=s===0||s===3?flameX:dishX-r*.15;var loopY=s===0||s===3?flameY-58:dishY-r*.18;ctx.moveTo(loopX-70,loopY+65);ctx.lineTo(loopX,loopY);ctx.stroke();ctx.beginPath();ctx.arc(loopX+7,loopY-7,10,0,Math.PI*2);ctx.stroke();
    ctx.restore();
    _labLabel(ctx,dishX,dishY+r+23,s>=6?'密封倒置 · 分离菌落':'三区平板划线');
    if(w>=560&&s>=6)_labCallout(ctx,w,dishX+r*.45,dishY+r*.2,dishX+r+45,dishY+r*.08,'后一区分离菌落','#8b684c');
    if(s===0||s===3)_labState.focus={x:flameX,y:flameY-42,r:46};
    else if(s===1)_labState.focus={x:flameX+80,y:flameY-65,r:38};
    else _labState.focus={x:dishX,y:dishY,r:r*.55};
  }

  function _labEnzymeRate(mode, value) {
    var v=Number(value);
    if(mode==='temp') return Math.exp(-Math.pow((v-40)/22,2));
    if(mode==='ph') return Math.exp(-Math.pow((v-7)/2.4,2));
    if(mode==='substrate') return v/(v+2.1);
    return .2;
  }

  function _labDrawEnzyme(ctx,w,h){
    var s=_labState.step;
    var mode=s===1?'temp':s===2?'ph':s===3?'substrate':s>=4?'result':'prepare';
    var currentStep=Math.min(s,3);
    var val=_labState.values[currentStep];
    var values,labels;
    if(mode==='temp'){values=[0,25,val==null?0:val,70];labels=values.map(function(v){return v+'℃';});}
    else if(mode==='ph'){values=[4,7,val==null?2:val,11];labels=values.map(function(v){return 'pH '+v;});}
    else if(mode==='substrate'){values=[1,3,val==null?0:val,10];labels=values.map(function(v){return v+'%';});}
    else {values=[.18,.48,.88,.3];labels=['低速','中速','较快','极端条件'];}
    var left=Math.max(28,w*.08),right=w-left;
    var spacing=(right-left)/4;
    var tubeW=Math.min(62,spacing*.46);
    var top=h*.23,bottom=h*.71;
    ctx.fillStyle='#b58b63';_labRoundRect(ctx,left-10,bottom-5,right-left+20,24,8);ctx.fill();
    ctx.fillStyle='#d7b38e';_labRoundRect(ctx,left+5,bottom-28,right-left-10,18,7);ctx.fill();
    for(var i=0;i<4;i++){
      var x=left+spacing*(i+.5);
      ctx.save();ctx.strokeStyle=i===2&&_labState.pendingTool?'#a3c72e':'#678075';ctx.lineWidth=i===2&&_labState.pendingTool?4:3;
      ctx.beginPath();ctx.moveTo(x-tubeW/2,top);ctx.lineTo(x-tubeW*.38,bottom);ctx.quadraticCurveTo(x,bottom+18,x+tubeW*.38,bottom);ctx.lineTo(x+tubeW/2,top);ctx.stroke();
      var rate=mode==='result'?values[i]:_labEnzymeRate(mode,values[i]);
      var liquidTop=bottom-92;
      var grad=ctx.createLinearGradient(0,liquidTop,0,bottom);grad.addColorStop(0,'rgba(226,214,129,.38)');grad.addColorStop(1,'rgba(186,155,73,.7)');ctx.fillStyle=grad;
      ctx.beginPath();ctx.moveTo(x-tubeW*.43,liquidTop);ctx.lineTo(x+tubeW*.43,liquidTop);ctx.lineTo(x+tubeW*.36,bottom-2);ctx.quadraticCurveTo(x,bottom+12,x-tubeW*.36,bottom-2);ctx.closePath();ctx.fill();
      var count=Math.round(2+rate*15);
      for(var b=0;b<count;b++){
        var seed=(b*37+i*19)%97/97;
        var bx=x+(seed-.5)*tubeW*.58;
        var travel=((_labState.phase*(18+rate*38)+b*17)%88);
        var by=bottom-9-travel;
        var br=1.5+(b%3)*.7;
        ctx.fillStyle='rgba(255,255,255,.82)';ctx.beginPath();ctx.arc(bx,by,br,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(102,139,128,.45)';ctx.lineWidth=.7;ctx.stroke();
      }
      ctx.restore();
      _labLabel(ctx,x,bottom+43,labels[i]);
    }
    ctx.fillStyle='#3d5145';ctx.font='700 13px "LXGW WenKai",sans-serif';ctx.textAlign='center';ctx.fillText(mode==='result'?'2H₂O₂  →  2H₂O + O₂↑':'本模型：新鲜肝脏过氧化氢酶示例',w/2,top-45);
    if(mode!=='prepare'&&mode!=='result'){
      var rate=_labEnzymeRate(mode,values[2]);
      ctx.fillStyle='#4a7c59';ctx.fillRect(w*.2,top-24,(w*.6)*rate,5);ctx.strokeStyle='#cbd8ce';ctx.strokeRect(w*.2,top-24,w*.6,5);
    }
    _labState.focus={x:left+spacing*(s===0?.5:2.5),y:(top+bottom)/2,r:58};
  }

  function _labDrawPlasmolysis(ctx,w,h){
    var s=_labState.step;
    var compact=w<560;
    var concentration=s===2&&_labState.pendingTool?Number(_labState.values[2]):.3;
    var shrink=0;
    if(s>=3)shrink=.62;
    if(s===2&&_labState.pendingTool)shrink=Math.max(0,Math.min(.82,(concentration-.14)/.48));
    if(s>=5)shrink=.62*(1-Math.min(1,_labState.stageElapsed/2400));
    if(_labState.finished)shrink=0;
    var fieldX=w*.5,fieldY=h*.48;
    var fieldW=compact?w-38:Math.min(w*.76,700);
    var fieldH=Math.min(h*.62,350);
    var x0=fieldX-fieldW/2,y0=fieldY-fieldH/2;
    ctx.save();ctx.shadowColor='rgba(38,62,45,.16)';ctx.shadowBlur=20;ctx.fillStyle='rgba(255,255,255,.88)';_labRoundRect(ctx,x0-11,y0-11,fieldW+22,fieldH+22,22);ctx.fill();ctx.shadowColor='transparent';
    ctx.fillStyle='#eee5ef';_labRoundRect(ctx,x0,y0,fieldW,fieldH,14);ctx.fill();ctx.save();_labRoundRect(ctx,x0,y0,fieldW,fieldH,14);ctx.clip();
    var cols=compact?2:3,rows=2;var cw=fieldW/cols,ch=fieldH/rows;
    for(var row=0;row<rows;row++)for(var col=0;col<cols;col++){
      var cx=x0+col*cw+cw/2,cy=y0+row*ch+ch/2;
      ctx.strokeStyle='#6b4b70';ctx.lineWidth=3;ctx.fillStyle='rgba(181,134,186,.15)';ctx.fillRect(x0+col*cw+2,y0+row*ch+2,cw-4,ch-4);ctx.strokeRect(x0+col*cw+2,y0+row*ch+2,cw-4,ch-4);
      var inset=10+Math.min(cw,ch)*.24*shrink;
      var wobble=Math.sin(_labState.phase+row*2+col)*1.2;
      ctx.fillStyle='rgba(127,70,139,'+(.42+shrink*.28)+')';_labRoundRect(ctx,x0+col*cw+inset+wobble,y0+row*ch+inset,cw-inset*2-wobble*2,ch-inset*2,Math.max(8,18-inset*.25));ctx.fill();
      ctx.strokeStyle='#86588d';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='rgba(224,186,226,.72)';_labRoundRect(ctx,x0+col*cw+inset+7,y0+row*ch+inset+7,cw-inset*2-14-wobble*2,ch-inset*2-14,10);ctx.fill();
      ctx.fillStyle='#5b3561';ctx.beginPath();ctx.ellipse(cx+(cw*.18)*(1-shrink),cy,4,6,0,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();ctx.restore();
    var stateLabel=shrink>.18?'质壁分离：原生质层收缩':'正常 / 复原：原生质层贴近细胞壁';
    _labLabel(ctx,fieldX,fieldY+fieldH/2+34,stateLabel,shrink>.18?'#704477':'#315d46');
    if(s>=2){
      ctx.save();ctx.strokeStyle=s>=5?'#3987a6':'#8a5e92';ctx.fillStyle=s>=5?'#3987a6':'#8a5e92';ctx.lineWidth=2;
      var outward=s<5;for(var a=0;a<3;a++){var ay=fieldY-40+a*40;var start=outward?fieldX+fieldW*.22:fieldX+fieldW*.45;var end=outward?fieldX+fieldW*.45:fieldX+fieldW*.22;ctx.beginPath();ctx.moveTo(start,ay);ctx.lineTo(end,ay);ctx.stroke();ctx.beginPath();ctx.moveTo(end,ay);ctx.lineTo(end+(outward?-8:8),ay-5);ctx.lineTo(end+(outward?-8:8),ay+5);ctx.closePath();ctx.fill();}
      ctx.restore();
      if(!compact)_labCallout(ctx,w,fieldX-fieldW*.2,fieldY-fieldH*.15,fieldX-fieldW*.48,fieldY-fieldH*.32,shrink>.18?'原生质层离开细胞壁':'原生质层紧贴细胞壁','#7d4d84');
    }
    if(_labState.pendingTool==='sucrose')_labLabel(ctx,fieldX,68,concentration.toFixed(2)+' g/mL'+(concentration>.5?' · 细胞损伤风险':''),concentration>.5?'#a33b35':'#315d46');
    _labState.focus={x:fieldX,y:fieldY,r:Math.min(fieldW,fieldH)*.25};
  }

  function _labDrawPigmentRealistic(ctx, w, h) {
    var image = _labAsset('pigment');
    if (!image) { _labDrawAssetLoading(ctx, w, h, '正在载入真实层析装置…'); return; }
    var frame = _labDrawCoverImage(ctx, image, w, h);
    var step = _labState.step;
    var stripLeft = frame.x + frame.w * .425;
    var stripRight = frame.x + frame.w * .57;
    var originY = frame.y + frame.h * .747;
    var solventY = frame.y + frame.h * .805;

    if (step >= 4 || _labState.finished) {
      var progress = _labState.finished || step >= 5 ? 1 : Math.min(1, _labState.stageElapsed / 3600);
      var eased = 1 - Math.pow(1 - progress, 3);
      var bands = [
        { name: '胡萝卜素', color: '#ef9826', rise: .41 },
        { name: '叶黄素', color: '#d9bf35', rise: .31 },
        { name: '叶绿素 a', color: '#177465', rise: .20 },
        { name: '叶绿素 b', color: '#648a39', rise: .12 }
      ];
      ctx.save();
      ctx.beginPath();
      ctx.rect(stripLeft + 3, frame.y + frame.h * .25, stripRight - stripLeft - 6, originY - frame.y - frame.h * .25 + 10);
      ctx.clip();
      bands.forEach(function(band, index) {
        var y = originY - frame.h * band.rise * eased;
        var spread = 4 + eased * (3 + index * .45);
        var bandGradient = ctx.createLinearGradient(stripLeft, 0, stripRight, 0);
        bandGradient.addColorStop(0, 'rgba(255,255,255,0)');
        bandGradient.addColorStop(.16, band.color);
        bandGradient.addColorStop(.84, band.color);
        bandGradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = .34 + eased * .64;
        ctx.fillStyle = bandGradient;
        _labRoundRect(ctx, stripLeft + 5, y - spread / 2, stripRight - stripLeft - 10, spread, spread / 2);
        ctx.fill();
      });
      var frontY = originY - frame.h * .46 * eased;
      ctx.globalAlpha = .9;
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(67,82,72,.6)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(stripLeft + 7, frontY); ctx.lineTo(stripRight - 7, frontY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      if (progress > .78 && w >= 700) {
        bands.forEach(function(band) {
          var y = originY - frame.h * band.rise;
          _labCallout(ctx, w, stripRight - 4, y, stripRight + 70, y, band.name, band.color);
        });
      }
    }

    if (step === 3 && _labState.pendingTool === 'dip') {
      var value = Number(_labState.values[3]);
      var safe = value >= 3 && value <= 12;
      ctx.save();
      ctx.strokeStyle = safe ? '#9cbd2f' : '#d56b62';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 5]);
      ctx.beginPath(); ctx.moveTo(stripLeft - 24, solventY); ctx.lineTo(stripRight + 24, solventY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      _labLabel(ctx, (stripLeft + stripRight) / 2, solventY + 28, _labFormatValue(_labCurrentStep().param, value), safe ? '#315d46' : '#a23e38');
    } else {
      _labLabel(ctx, w / 2, h - 69, step >= 4 ? '溶剂前沿上升 · 四种色素逐步分离' : '滤液细线必须保持在层析液液面上方');
    }

    var focusPoints = [
      _labFramePoint(frame, .5, .43),
      _labFramePoint(frame, .5, .747),
      _labFramePoint(frame, .5, .84),
      _labFramePoint(frame, .5, .79),
      _labFramePoint(frame, .5, .51)
    ];
    var focus = focusPoints[Math.min(step, focusPoints.length - 1)];
    _labState.focus = { x: focus.x, y: focus.y, r: step >= 4 ? 70 : 42 };
  }

  function _labDrawDNARealistic(ctx, w, h) {
    var image = _labAsset('dna');
    if (!image) { _labDrawAssetLoading(ctx, w, h, '正在载入 DNA 实验台…'); return; }
    var frame = _labDrawCoverImage(ctx, image, w, h);
    var step = _labState.step;
    var stations = [
      { region: [.015, .36, .245, .49], label: '研磨裂解' },
      { region: [.265, .27, .235, .57], label: '过滤除渣' },
      { region: [.505, .25, .22, .58], label: '冷醇析出' },
      { region: [.72, .26, .265, .59], label: '二苯胺鉴定' }
    ];
    stations.forEach(function(station, index) {
      _labHighlightRegion(ctx, frame, station.region, station.label, Math.min(step, 3) === index && !_labState.finished);
    });

    if (step >= 1) {
      var filterPoint = _labFramePoint(frame, .39, .56);
      for (var drop = 0; drop < 4; drop++) {
        var travel = (_labState.phase * 34 + drop * 27) % 88;
        ctx.fillStyle = 'rgba(138,166,91,.68)';
        ctx.beginPath();
        ctx.ellipse(filterPoint.x + Math.sin(drop * 2.1) * 7, filterPoint.y + travel, 2.2, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (step >= 3 || _labState.finished) {
      var fiberProgress = _labState.finished || step > 3 ? 1 : Math.min(1, _labState.stageElapsed / 2300);
      var beaker = _labFramePoint(frame, .62, .64);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,250,' + (.28 + fiberProgress * .7) + ')';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = 'rgba(255,255,255,.9)';
      ctx.shadowBlur = 5;
      for (var fiber = 0; fiber < 13; fiber++) {
        var offset = (fiber - 6) * 5.2;
        var lift = fiberProgress * (18 + (fiber % 4) * 6);
        ctx.beginPath();
        ctx.moveTo(beaker.x + offset * .45, beaker.y + 48 - lift * .15);
        ctx.bezierCurveTo(beaker.x - 28 + offset, beaker.y + 27 - lift, beaker.x + 28 - offset * .2, beaker.y + 2 - lift * .4, beaker.x + offset, beaker.y - 22 - lift * .2);
        ctx.stroke();
      }
      ctx.restore();
      if (w >= 720) _labCallout(ctx, w, beaker.x - 6, beaker.y - 4, beaker.x - 88, beaker.y - 62, '冷酒精界面析出白色丝状 DNA', '#315d46');
    }

    if (step >= 4 || _labState.finished) {
      var blueProgress = _labState.finished ? 1 : Math.min(1, _labState.stageElapsed / 1800);
      var tube = _labFramePoint(frame, .82, .63);
      ctx.save();
      ctx.globalAlpha = .15 + blueProgress * .75;
      var blue = ctx.createLinearGradient(0, tube.y - 10, 0, tube.y + 57);
      blue.addColorStop(0, '#6ea5d5');
      blue.addColorStop(1, '#274f94');
      ctx.fillStyle = blue;
      _labRoundRect(ctx, tube.x - 10, tube.y - 8, 20, 66, 9);
      ctx.fill();
      ctx.restore();
      _labLabel(ctx, tube.x, tube.y - 31, '蓝色反应 = 检出 DNA', '#315d68');
    }

    var current = stations[Math.min(step, 3)].region;
    var center = _labFramePoint(frame, current[0] + current[2] / 2, current[1] + current[3] / 2);
    _labState.focus = { x: center.x, y: center.y, r: Math.min(frame.w * current[2], frame.h * current[3]) * .24 };
  }

  function _labDrawMicrobeRealistic(ctx, w, h) {
    var image = _labAsset('microbe');
    if (!image) { _labDrawAssetLoading(ctx, w, h, '正在载入无菌操作实验台…'); return; }
    var frame = _labDrawCoverImage(ctx, image, w, h);
    var step = _labState.step;
    var dish = _labFramePoint(frame, .66, .505);
    var dishRx = frame.w * .275;
    var dishRy = frame.h * .265;
    var progress = Math.min(1, _labState.stageElapsed / 1450);

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(dish.x, dish.y, dishRx, dishRy, -.06, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(124,76,54,.76)';
    ctx.lineWidth = Math.max(1.8, frame.w * .0022);
    ctx.lineCap = 'round';

    if (step >= 3) {
      for (var row = 0; row < 9; row++) {
        var rowProgress = Math.max(0, Math.min(1, progress * 1.7 - row * .08));
        var x1 = dish.x - dishRx * .72;
        var x2 = dish.x - dishRx * .08;
        var y = dish.y - dishRy * .58 + row * dishRy * .11;
        ctx.globalAlpha = .24 + rowProgress * .68;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.bezierCurveTo(x1 + dishRx * .2, y + (row % 2 ? 8 : -7), x2 - dishRx * .18, y - (row % 2 ? 7 : -8), x1 + (x2 - x1) * rowProgress, y);
        ctx.stroke();
      }
    }

    if (step >= 5) {
      var laterProgress = step > 5 || _labState.finished ? 1 : progress;
      for (var arc = 0; arc < 7; arc++) {
        ctx.globalAlpha = .28 + laterProgress * .66;
        ctx.beginPath();
        ctx.arc(dish.x - dishRx * .02, dish.y - dishRy * .46 + arc * dishRy * .12, dishRx * (.31 + arc * .025), -2.05, -2.05 + 2.35 * laterProgress);
        ctx.stroke();
      }
      for (var sweep = 0; sweep < 6; sweep++) {
        ctx.beginPath();
        ctx.arc(dish.x + dishRx * .16, dish.y + dishRy * .02 + sweep * dishRy * .07, dishRx * (.35 + sweep * .022), -1.78, -1.78 + 2.18 * laterProgress);
        ctx.stroke();
      }
    }

    if (_labState.finished || step >= 6) {
      var colonyProgress = Math.min(1, .18 + _labState.stageElapsed / 2900);
      for (var colony = 0; colony < 30; colony++) {
        var angle = colony * 2.399 + .45;
        var radiusFactor = .2 + ((colony * 37) % 71) / 100;
        var px = dish.x + Math.cos(angle) * dishRx * radiusFactor;
        var py = dish.y + Math.sin(angle) * dishRy * radiusFactor;
        if (px < dish.x - dishRx * .02) continue;
        var colonyRadius = (2.2 + colony % 4) * colonyProgress;
        var colonyGradient = ctx.createRadialGradient(px - colonyRadius * .25, py - colonyRadius * .25, .2, px, py, colonyRadius + 1);
        colonyGradient.addColorStop(0, 'rgba(255,253,231,.98)');
        colonyGradient.addColorStop(.75, 'rgba(231,219,180,.96)');
        colonyGradient.addColorStop(1, 'rgba(141,112,75,.72)');
        ctx.globalAlpha = colonyProgress;
        ctx.fillStyle = colonyGradient;
        ctx.beginPath(); ctx.arc(px, py, colonyRadius, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    if (step === 0 || step === 3) {
      var flame = _labFramePoint(frame, .145, .19);
      var flicker = 5 + Math.sin(_labState.phase * 6) * 2.5;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      var glow = ctx.createRadialGradient(flame.x, flame.y, 2, flame.x, flame.y, 36 + flicker);
      glow.addColorStop(0, 'rgba(255,245,185,.85)');
      glow.addColorStop(.38, 'rgba(247,151,58,.35)');
      glow.addColorStop(1, 'rgba(247,151,58,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(flame.x, flame.y, 38 + flicker, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      _labLabel(ctx, flame.x + 8, flame.y + 74, '灼烧后必须冷却接种环');
      _labState.focus = { x: flame.x, y: flame.y + 18, r: 46 };
    } else if (step === 1) {
      var loop = _labFramePoint(frame, .25, .72);
      _labState.focus = { x: loop.x, y: loop.y, r: 46 };
    } else {
      _labState.focus = { x: dish.x, y: dish.y, r: Math.min(dishRx, dishRy) * .55 };
    }

    _labLabel(ctx, dish.x, Math.min(h - 69, dish.y + dishRy + 34), _labState.finished ? '倒置培养后：后一区出现分离菌落' : '每次换区先灭菌，菌量逐区降低');
    if (_labState.finished && w >= 720) _labCallout(ctx, w, dish.x + dishRx * .38, dish.y + dishRy * .12, dish.x + dishRx + 35, dish.y + dishRy * .08, '分离良好的单菌落', '#846542');
  }

  function _labDrawEnzymeRealistic(ctx, w, h) {
    var image = _labAsset('enzyme');
    if (!image) { _labDrawAssetLoading(ctx, w, h, '正在载入酶反应装置…'); return; }
    var frame = _labDrawCoverImage(ctx, image, w, h);
    var step = _labState.step;
    var mode = step === 1 ? 'temp' : step === 2 ? 'ph' : step === 3 ? 'substrate' : step >= 4 ? 'result' : 'prepare';
    var currentStep = Math.min(step, 3);
    var selectedValue = _labState.values[currentStep];
    var values;
    var labels;
    if (mode === 'temp') {
      values = [0, 25, selectedValue == null ? 0 : selectedValue, 70];
      labels = values.map(function(value) { return value + '℃'; });
    } else if (mode === 'ph') {
      values = [4, 7, selectedValue == null ? 2 : selectedValue, 11];
      labels = values.map(function(value) { return 'pH ' + value; });
    } else if (mode === 'substrate') {
      values = [1, 3, selectedValue == null ? 0 : selectedValue, 10];
      labels = values.map(function(value) { return value + '%'; });
    } else {
      values = [.18, .48, .88, .3];
      labels = ['低速', '中速', '较快', '极端条件'];
    }
    var centers = [.307, .435, .565, .694];
    var tubeTop = frame.y + frame.h * .16;
    var liquidTop = frame.y + frame.h * .625;
    var liquidBottom = frame.y + frame.h * .792;

    centers.forEach(function(u, index) {
      var x = frame.x + frame.w * u;
      var rate = mode === 'result' || mode === 'prepare' ? values[index] : _labEnzymeRate(mode, values[index]);
      var bubbleCount = Math.round(2 + rate * 19);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - frame.w * .027, liquidTop - frame.h * .10, frame.w * .054, liquidBottom - liquidTop + frame.h * .11);
      ctx.clip();
      for (var bubble = 0; bubble < bubbleCount; bubble++) {
        var seed = ((bubble * 43 + index * 19) % 101) / 101;
        var bx = x + (seed - .5) * frame.w * .038;
        var travel = (_labState.phase * (14 + rate * 44) + bubble * 13.7) % Math.max(20, liquidBottom - tubeTop);
        var by = liquidBottom - travel;
        var radius = 1.3 + (bubble % 4) * .65;
        ctx.fillStyle = 'rgba(255,255,255,.82)';
        ctx.strokeStyle = 'rgba(91,126,116,.55)';
        ctx.lineWidth = .7;
        ctx.beginPath(); ctx.arc(bx, by, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      if (rate > .72) {
        var foam = 3 + rate * 9 + Math.sin(_labState.phase * 3 + index) * 1.3;
        ctx.fillStyle = 'rgba(255,255,244,.76)';
        for (var f = 0; f < 8; f++) {
          ctx.beginPath();
          ctx.arc(x - frame.w * .021 + f * frame.w * .006, liquidTop - foam + (f % 2) * 2, 2.6 + f % 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      _labLabel(ctx, x, Math.min(h - 69, frame.y + frame.h * .865), labels[index]);
    });

    var observedX = frame.x + frame.w * centers[(mode === 'prepare' || mode === 'result') ? 0 : 2];
    if (mode !== 'prepare' && mode !== 'result') {
      var observedRate = _labEnzymeRate(mode, values[2]);
      var meterX = w * .2;
      var meterY = Math.max(72, frame.y + frame.h * .10);
      var meterW = w * .6;
      ctx.fillStyle = 'rgba(255,255,255,.82)';
      _labRoundRect(ctx, meterX - 9, meterY - 17, meterW + 18, 34, 11); ctx.fill();
      ctx.fillStyle = '#dce5de'; _labRoundRect(ctx, meterX, meterY - 3, meterW, 6, 3); ctx.fill();
      ctx.fillStyle = '#4a7c59'; _labRoundRect(ctx, meterX, meterY - 3, meterW * observedRate, 6, 3); ctx.fill();
      ctx.fillStyle = '#3e5146'; ctx.font = '700 11px "LXGW WenKai",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('相同时间内 O₂ 气泡速率', w / 2, meterY - 9);
    } else {
      _labLabel(ctx, w / 2, Math.max(72, frame.y + frame.h * .1), mode === 'result' ? '2H₂O₂ → 2H₂O + O₂↑' : '四组酶量与总体积保持一致');
    }
    _labState.focus = { x: observedX, y: (liquidTop + liquidBottom) / 2, r: 52 };
  }

  function _labDrawPlasmolysisRealistic(ctx, w, h) {
    var normal = _labAsset('plasmolysisNormal');
    var separated = _labAsset('plasmolysisSeparated');
    if (!normal || !separated) { _labDrawAssetLoading(ctx, w, h, '正在载入洋葱表皮显微视野…'); return; }
    var step = _labState.step;
    var separation = 0;
    if (step === 2 && _labState.pendingTool === 'sucrose') {
      var concentration = Number(_labState.values[2]);
      separation = Math.max(0, Math.min(1, (concentration - .14) / .34));
    } else if (step === 3) {
      separation = Math.min(1, _labState.stageElapsed / 2600);
    } else if (step === 4) {
      separation = 1;
    } else if (step === 5) {
      separation = 1 - Math.min(1, _labState.stageElapsed / 3000);
    }
    if (_labState.finished) separation = 0;

    var iw = normal.naturalWidth || normal.width;
    var ih = normal.naturalHeight || normal.height;
    var scale = Math.min((w - 56) / iw, (h - 104) / ih);
    var frame = { x: (w - iw * scale) / 2, y: (h - ih * scale) / 2, w: iw * scale, h: ih * scale };
    var fieldRadius = Math.min(frame.w, frame.h) * .465;
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, fieldRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(normal, frame.x, frame.y, frame.w, frame.h);
    ctx.globalAlpha = separation;
    ctx.drawImage(separated, frame.x, frame.y, frame.w, frame.h);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.94)';
    ctx.lineWidth = 8;
    ctx.shadowColor = 'rgba(31,45,36,.28)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, fieldRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    var opticalShade = ctx.createRadialGradient(w / 2, h / 2, Math.min(frame.w, frame.h) * .37, w / 2, h / 2, Math.min(frame.w, frame.h) * .54);
    opticalShade.addColorStop(.72, 'rgba(0,0,0,0)');
    opticalShade.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = opticalShade;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, fieldRadius, 0, Math.PI * 2); ctx.fill();

    var stateLabel = separation > .62
      ? '质壁分离：原生质层离开细胞壁'
      : (separation > .12 ? '渗透失水：原生质层正在收缩' : '正常 / 复原：原生质层贴近细胞壁');
    _labLabel(ctx, w / 2, h - 69, stateLabel, separation > .18 ? '#744b7d' : '#315d46');

    if (step >= 2) {
      var arrowY = h * .49;
      var outward = step < 5;
      ctx.save();
      ctx.globalAlpha = .42 + Math.abs(Math.sin(_labState.phase * 1.7)) * .28;
      ctx.strokeStyle = outward ? '#7a4f82' : '#397f9a';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 2;
      for (var row = -1; row <= 1; row++) {
        var startX = outward ? w * .58 : w * .72;
        var endX = outward ? w * .72 : w * .58;
        var y = arrowY + row * 42;
        ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(endX, y);
        ctx.lineTo(endX + (outward ? -8 : 8), y - 5);
        ctx.lineTo(endX + (outward ? -8 : 8), y + 5);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    if (step === 2 && _labState.pendingTool === 'sucrose') {
      var currentConcentration = Number(_labState.values[2]);
      _labLabel(ctx, w / 2, 72, currentConcentration.toFixed(2) + ' g/mL' + (currentConcentration > .5 ? ' · 细胞损伤风险' : ''), currentConcentration > .5 ? '#a33b35' : '#315d46');
    } else if (step >= 3 && w >= 700) {
      var cellPoint = _labFramePoint(frame, .6, .43);
      _labCallout(ctx, w, cellPoint.x, cellPoint.y, cellPoint.x + 145, cellPoint.y - 70, separation > .18 ? '原生质层与细胞壁之间出现间隙' : '原生质层重新贴近细胞壁', '#744b7d');
    }
    _labState.focus = { x: w / 2, y: h / 2, r: Math.min(frame.w, frame.h) * .24 };
  }

  function _labDraw() {
    if (_labState.experiment === 'microscope') return true;
    var canvas=document.getElementById('bio-lab-canvas');
    var surface=_labCanvas(canvas);
    if(!surface)return false;
    var ctx=surface.ctx,w=surface.w,h=surface.h;
    _labBackdrop(ctx,w,h);
    _labState.focus=null;
    if(_labState.experiment==='microscope')_labDrawMicroscope(ctx,w,h);
    else if(_labState.experiment==='pigment')_labDrawPigmentRealistic(ctx,w,h);
    else if(_labState.experiment==='dna')_labDrawDNARealistic(ctx,w,h);
    else if(_labState.experiment==='microbe')_labDrawMicrobeRealistic(ctx,w,h);
    else if(_labState.experiment==='enzyme')_labDrawEnzymeRealistic(ctx,w,h);
    else _labDrawPlasmolysisRealistic(ctx,w,h);
    _labFocus(ctx);
    return true;
  }

  function _labLoop(timestamp) {
    if (!_labState.lastTime) _labState.lastTime=timestamp;
    var dt=Math.min(50,timestamp-_labState.lastTime);
    _labState.lastTime=timestamp;
    var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    _labState.phase+=reduced?0:dt*.002;
    _labState.stageElapsed+=reduced?3000:dt;
    if(!_labDraw()){_labState.animId=null;return;}
    _labState.animId=requestAnimationFrame(_labLoop);
  }

  function _labInit(target) {
    _labAddStyles();
    _labPrimeAssets();
    var host=target||document.getElementById('page-content');
    if(!host)return;
    if(_state.animId){cancelAnimationFrame(_state.animId);_state.animId=null;}
    if(_labState.animId){cancelAnimationFrame(_labState.animId);_labState.animId=null;}
    host.innerHTML='<section class="bl2-page"><header class="bl2-header"><div><p class="bl2-kicker">TATABOX · Interactive Lab</p><h1>虚拟生物实验室</h1><p class="bl2-subtitle">不是按按钮播放答案：选择器材、调整条件、观察实时变化，再用证据完成结果判读。</p></div><div class="bl2-select-wrap"><label for="bl2-exp-select">选择实验</label><select class="bl2-select" id="bl2-exp-select">'+Object.keys(_experiments).map(function(key){return '<option value="'+key+'">'+_labEscape(_experiments[key].name)+'</option>';}).join('')+'</select></div></header><nav class="bl2-progress" aria-label="实验步骤"><div class="bl2-progress-line"><div class="bl2-progress-fill" id="bl2-progress-fill"></div></div><ol class="bl2-step-list" id="bl2-step-list"></ol></nav><div class="bl2-workspace"><div class="bl2-visual-column"><div class="bl2-stage"><canvas class="bl2-canvas" id="bio-lab-canvas" aria-label="实验现象实时模型"></canvas><div class="bl2-stage-top"><span class="bl2-live"><span id="bl2-live-name"></span></span><span class="bl2-model" id="bl2-model-kind">真实材质 · 教学模拟</span></div></div><section class="bl2-tray" aria-label="实验器材台"><div class="bl2-tray-head"><strong>器材台</strong><span>选错会提示，连续两次可见高亮</span></div><div class="bl2-tools" id="bl2-tools"></div></section></div><aside class="bl2-panel" id="bl2-panel"></aside></div><footer class="bl2-footer-note"><span>模型用于理解变量与现象的因果关系；真实实验须遵守教师指导和实验室安全规范。</span><span>荧光绿 = 当前重点 / 合理设置</span></footer></section>';
    var stage = host.querySelector('.bl2-stage');
    var microscopeLaunch = document.createElement('section');
    microscopeLaunch.className = 'bl2-microscope-launch';
    microscopeLaunch.id = 'bl2-microscope-launch';
    microscopeLaunch.hidden = true;
    microscopeLaunch.setAttribute('aria-label', '已审核的 3D 显微镜联动实验入口');
    microscopeLaunch.innerHTML = '<img class="bl2-microscope-preview" src="assets/lab/microscope-3d-preview.webp" alt="已审核的 3D 显微镜、真实视野与调焦联动实验界面"><div class="bl2-microscope-copy"><span class="bl2-microscope-badge">已通过审核 · 独立原型</span><h2>3D 显微镜＋真实视野＋调焦联动</h2><p>旋转观察真实显微镜模型，联动粗准焦、细准焦、光照、物镜倍数与载物台位置；显微视野会同步改变清晰度、亮度和观察区域。</p><div class="bl2-microscope-features"><span>真实 3D 模型</span><span>调焦实时联动</span><span>洋葱表皮视野</span></div><a class="bl2-microscope-enter" href="microscope-3d/index.html" target="_blank" rel="noopener">进入 3D 显微镜实验</a></div>';
    stage.insertBefore(microscopeLaunch, stage.querySelector('.bl2-stage-top'));
    document.getElementById('bl2-exp-select').addEventListener('change',function(){_labReset(this.value,'已切换实验。先阅读实验目标和第一步。');});
    _labRender();
    _labState.lastTime=0;
    _labState.animId=requestAnimationFrame(_labLoop);
  }

  window.BioLabController = {
    selectExperiment: function(id){if(_experiments[id])_labReset(id);},
    useTool: _labUseTool,
    confirmParameter: _labConfirmParam,
    answerObservation: _labAnswer,
    restart: function(){_labReset(_labState.experiment);},
    getState: function(){return {experiment:_labState.experiment,step:_labState.step,finished:_labState.finished,awaitingObservation:_labState.awaitingObservation,pendingTool:_labState.pendingTool,mistakes:_labState.mistakes};}
  };
  window.initBioLab = _labInit;
  window.renderBioLabPage = _labInit;
})();
