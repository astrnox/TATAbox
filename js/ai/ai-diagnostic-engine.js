/**
 * ============================================================
 * TATABOX - 规则引擎版智能诊断系统
 * 完全免费：纯JS实现，无需任何API调用
 *
 * 核心原理：
 * 1. 贝叶斯知识追踪（Bayesian Knowledge Tracing, BKT）
 * 2. 基于练习行为的规则引擎推理
 * 3. 知识点依赖图谱分析
 * 4. 自适应推荐算法
 * ============================================================
 */

(function () {
  'use strict';


  /**
   * BKT 模型参数
   * p(L0): 初始掌握概率
   * p(T): 从不会到学会的转移概率
   * p(G): 猜对概率
   * p(S): 失误概率
   */
  var BKT_PARAMS = {
    pL0: 0.3,     // 初始30%掌握
    pT: 0.15,     // 每次练习15%概率学会
    pG: 0.25,     // 25%猜错概率
    pS: 0.10      // 10%失误概率
  };

  /**
   * 贝叶斯更新：根据一次答题结果更新掌握概率
   */
  function bktUpdate(pMastery, isCorrect) {
    var pL = pMastery;
    var pL0 = BKT_PARAMS.pL0;
    var pT = BKT_PARAMS.pT;
    var pG = BKT_PARAMS.pG;
    var pS = BKT_PARAMS.pS;

    // 计算观察概率 P(观察结果 | 掌握状态)
    var pObsGivenMastery;
    if (isCorrect) {
      // P(正确 | 掌握) = 1 - P(失误)
      pObsGivenMastery = 1 - pS;
    } else {
      // P(错误 | 掌握) = P(失误)
      pObsGivenMastery = pS;
    }

    var pObsGivenNotMastery;
    if (isCorrect) {
      // P(正确 | 未掌握) = P(猜对)
      pObsGivenNotMastery = pG;
    } else {
      // P(错误 | 未掌握) = 1 - P(猜对)
      pObsGivenNotMastery = 1 - pG;
    }

    // 贝叶斯公式：P(掌握 | 观察) = P(观察 | 掌握) * P(掌握) / P(观察)
    var pObs = pObsGivenMastery * pL + pObsGivenNotMastery * (1 - pL);
    var pPosterior = (pObsGivenMastery * pL) / pObs;

    // 加入学习转移概率（练习后可能学会）
    var pUpdated = pPosterior + (1 - pPosterior) * pT;

    return Math.min(Math.max(pUpdated, 0.01), 0.999);
  }

  /**
   * 从历史答题记录计算每个知识点的掌握概率
   */
  function calculateMasteryFromHistory(moduleId, history) {
    var mastery = {};

    history.forEach(function (record) {
      if (record.module !== moduleId) return;

      var key = record.concept || record.questionId;
      if (!mastery[key]) {
        mastery[key] = BKT_PARAMS.pL0;
      }

      mastery[key] = bktUpdate(mastery[key], record.isCorrect);
    });

    return mastery;
  }


  /**
   * 知识点依赖关系（从知识图谱提取）
   * 定义：如果 A → B，说明 A 是 B 的前置知识
   */
  var KNOWLEDGE_GRAPH = {
    // 模块一：生化/分子/细胞
    'cell_membrane': {
      depends: [],
      supports: ['cell_transport', 'cell_signal'],
      module: 'module1'
    },
    'cell_transport': {
      depends: ['cell_membrane'],
      supports: ['cell_signal', 'metabolism'],
      module: 'module1'
    },
    'mitochondria': {
      depends: ['cell_membrane'],
      supports: ['oxidative_phos', 'metabolism'],
      module: 'module1'
    },
    'chloroplast': {
      depends: ['cell_membrane'],
      supports: ['photosynthesis'],
      module: 'module1'
    },
    'dna_structure': {
      depends: [],
      supports: ['dna_replication', 'transcription', 'gene_regulation'],
      module: 'module1'
    },
    'dna_replication': {
      depends: ['dna_structure'],
      supports: ['cell_cycle', 'transcription'],
      module: 'module1'
    },
    'transcription': {
      depends: ['dna_structure'],
      supports: ['translation', 'gene_regulation'],
      module: 'module1'
    },
    'translation': {
      depends: ['transcription'],
      supports: ['protein_structure'],
      module: 'module1'
    },
    'metabolism': {
      depends: ['cell_membrane', 'mitochondria'],
      supports: ['glycolysis', 'krebs_cycle', 'oxidative_phos'],
      module: 'module1'
    },
    'enzyme': {
      depends: ['protein_structure'],
      supports: ['metabolism', 'glycolysis'],
      module: 'module1'
    },
    'glycolysis': {
      depends: ['enzyme', 'metabolism'],
      supports: ['krebs_cycle'],
      module: 'module1'
    },
    'krebs_cycle': {
      depends: ['glycolysis', 'mitochondria'],
      supports: ['oxidative_phos'],
      module: 'module1'
    },
    'oxidative_phos': {
      depends: ['krebs_cycle', 'mitochondria'],
      supports: [],
      module: 'module1'
    },
    'photosynthesis': {
      depends: ['chloroplast', 'metabolism'],
      supports: [],
      module: 'module1'
    },
    'protein_structure': {
      depends: ['translation'],
      supports: ['enzyme'],
      module: 'module1'
    },
    'cell_cycle': {
      depends: ['dna_replication'],
      supports: ['meiosis', 'cell_apoptosis'],
      module: 'module1'
    },
    'cell_signal': {
      depends: ['cell_membrane', 'cell_transport'],
      supports: ['cell_apoptosis', 'gene_regulation'],
      module: 'module1'
    },
    'cell_apoptosis': {
      depends: ['cell_signal', 'cell_cycle'],
      supports: [],
      module: 'module1'
    },
    'gene_regulation': {
      depends: ['transcription', 'cell_signal'],
      supports: [],
      module: 'module1'
    },

    // 模块二：植物/微生物
    'plant_tissue': {
      depends: ['cell_membrane'],
      supports: ['photosynthesis', 'plant_transport'],
      module: 'module2'
    },
    'plant_hormone': {
      depends: ['plant_tissue', 'cell_signal'],
      supports: ['plant_transport'],
      module: 'module2'
    },
    'plant_transport': {
      depends: ['plant_tissue', 'cell_transport'],
      supports: [],
      module: 'module2'
    },
    'bacteria': {
      depends: ['cell_membrane'],
      supports: ['microbial_eco', 'virus'],
      module: 'module2'
    },
    'virus': {
      depends: ['dna_structure', 'bacteria'],
      supports: ['microbial_eco'],
      module: 'module2'
    },
    'microbial_eco': {
      depends: ['bacteria', 'virus'],
      supports: [],
      module: 'module2'
    },

    // 模块三：动物/生态
    'animal_tissue': {
      depends: ['cell_membrane'],
      supports: ['nervous_system', 'immune_system', 'endocrine', 'circulatory'],
      module: 'module3'
    },
    'nervous_system': {
      depends: ['animal_tissue', 'cell_signal'],
      supports: ['endocrine'],
      module: 'module3'
    },
    'immune_system': {
      depends: ['animal_tissue', 'cell_signal'],
      supports: [],
      module: 'module3'
    },
    'endocrine': {
      depends: ['nervous_system', 'cell_signal'],
      supports: [],
      module: 'module3'
    },
    'circulatory': {
      depends: ['animal_tissue'],
      supports: [],
      module: 'module3'
    },
    'population_eco': {
      depends: [],
      supports: ['community', 'ecosystem'],
      module: 'module3'
    },
    'community': {
      depends: ['population_eco'],
      supports: ['ecosystem', 'biodiversity'],
      module: 'module3'
    },
    'ecosystem': {
      depends: ['community', 'population_eco'],
      supports: ['biogeochemical', 'biodiversity'],
      module: 'module3'
    },
    'biodiversity': {
      depends: ['ecosystem', 'community'],
      supports: [],
      module: 'module3'
    },
    'biogeochemical': {
      depends: ['ecosystem'],
      supports: [],
      module: 'module3'
    },

    // 模块四：遗传/进化
    'mendel': {
      depends: [],
      supports: ['linkage', 'sex_linkage', 'population_gen'],
      module: 'module4'
    },
    'linkage': {
      depends: ['mendel'],
      supports: ['gene_mutation', 'chromosome_var'],
      module: 'module4'
    },
    'sex_linkage': {
      depends: ['mendel'],
      supports: [],
      module: 'module4'
    },
    'gene_mutation': {
      depends: ['dna_structure', 'linkage'],
      supports: ['chromosome_var', 'population_gen'],
      module: 'module4'
    },
    'chromosome_var': {
      depends: ['gene_mutation', 'cell_cycle'],
      supports: ['population_gen'],
      module: 'module4'
    },
    'population_gen': {
      depends: ['mendel', 'gene_mutation', 'chromosome_var'],
      supports: [],
      module: 'module4'
    },
    'meiosis': {
      depends: ['cell_cycle', 'mendel'],
      supports: ['linkage'],
      module: 'module4'
    }
  };

  /**
   * 分析薄弱知识点链
   */
  function analyzeWeaknessChain(mastery, threshold) {
    threshold = threshold || 0.6;
    var weakPoints = [];

    // 找到掌握度低于阈值的知识点
    Object.keys(KNOWLEDGE_GRAPH).forEach(function (nodeId) {
      var node = KNOWLEDGE_GRAPH[nodeId];
      var currentMastery = mastery[nodeId] !== undefined ? mastery[nodeId] : 0.3;

      if (currentMastery < threshold) {
        // 检查是否有前置依赖也薄弱
        var weakDependencies = [];
        node.depends.forEach(function (dep) {
          var depMastery = mastery[dep] !== undefined ? mastery[dep] : 0.3;
          if (depMastery < threshold) {
            weakDependencies.push(dep);
          }
        });

        weakPoints.push({
          id: nodeId,
          module: node.module,
          mastery: Math.round(currentMastery * 100),
          weakDependencies: weakDependencies,
          priorityScore: (1 - currentMastery) * (1 + weakDependencies.length * 0.5)
        });
      }
    });

    // 按优先级排序（综合考虑掌握度和依赖链长度）
    weakPoints.sort(function (a, b) { return b.priorityScore - a.priorityScore; });
    return weakPoints;
  }


  /**
   * 生成个性化学习路径
   * 算法：拓扑排序 + BKT掌握度权重
   */
  function generateLearningPath(moduleId, mastery, maxSteps) {
    maxSteps = maxSteps || 10;
    var nodeIds = Object.keys(KNOWLEDGE_GRAPH).filter(function (id) {
      return KNOWLEDGE_GRAPH[id].module === moduleId;
    });

    // 计算每个节点的推荐分数
    var scores = nodeIds.map(function (id) {
      var node = KNOWLEDGE_GRAPH[id];
      var current = mastery[id] !== undefined ? mastery[id] : BKT_PARAMS.pL0;

      // 检查前置依赖是否已满足
      var depsReady = true;
      node.depends.forEach(function (dep) {
        var depMastery = mastery[dep] !== undefined ? mastery[dep] : BKT_PARAMS.pL0;
        if (depMastery < 0.5) depsReady = false;
      });

      // 分数 = (1 - 掌握度) * 依赖满足系数 * 支持下游权重
      var downstreamSupport = node.supports.length * 0.1;
      var score = (1 - current) * (depsReady ? 1 : 0.3) * (1 + downstreamSupport);

      return { id: id, score: score, mastery: Math.round(current * 100), depsReady: depsReady };
    });

    scores.sort(function (a, b) { return b.score - a.score; });
    return scores.slice(0, maxSteps);
  }


  /**
   * 分析答题模式：
   * - 速度vs正确率（速度过快可能是瞎猜）
   * - 错题重复模式
   * - 模块稳定性
   */
  function analyzeBehavior(history) {
    var stats = {
      totalQuestions: history.length,
      avgTimePerQuestion: 0,
      fastGuessRate: 0,    // < 5秒答题的比例（可能瞎猜）
      accuracyByModule: {},
      repeatErrorPatterns: {}
    };

    var totalTime = 0;
    var fastCount = 0;
    var moduleStats = {};

    history.forEach(function (record) {
      // 分析时间
      if (record.duration) {
        totalTime += record.duration;
        if (record.duration < 5000) fastCount++;
      }

      // 模块统计
      var mod = record.module || 'unknown';
      if (!moduleStats[mod]) {
        moduleStats[mod] = { total: 0, correct: 0 };
      }
      moduleStats[mod].total++;
      if (record.isCorrect) moduleStats[mod].correct++;

      // 错题模式
      if (!record.isCorrect && record.concept) {
        stats.repeatErrorPatterns[record.concept] =
          (stats.repeatErrorPatterns[record.concept] || 0) + 1;
      }
    });

    stats.avgTimePerQuestion = stats.totalQuestions > 0
      ? Math.round(totalTime / stats.totalQuestions / 1000)
      : 0;
    stats.fastGuessRate = stats.totalQuestions > 0
      ? Math.round(fastCount / stats.totalQuestions * 100)
      : 0;

    Object.keys(moduleStats).forEach(function (mod) {
      var ms = moduleStats[mod];
      stats.accuracyByModule[mod] = ms.total > 0
        ? Math.round(ms.correct / ms.total * 100)
        : 0;
    });

    return stats;
  }


  function generateDiagnosticReport(history, moduleId) {
    // 1. 计算各知识点掌握度
    var mastery = calculateMasteryFromHistory(moduleId, history);

    // 2. 分析薄弱点
    var weakPoints = analyzeWeaknessChain(mastery);

    // 3. 生成学习路径
    var learningPath = generateLearningPath(moduleId, mastery);

    // 4. 行为分析
    var behavior = analyzeBehavior(history);

    // 5. 综合诊断
    var moduleMastery = 0;
    var moduleNodeCount = 0;
    Object.keys(KNOWLEDGE_GRAPH).forEach(function (id) {
      if (KNOWLEDGE_GRAPH[id].module === moduleId) {
        moduleNodeCount++;
        moduleMastery += mastery[id] !== undefined ? mastery[id] : BKT_PARAMS.pL0;
      }
    });
    var avgMastery = moduleNodeCount > 0 ? Math.round(moduleMastery / moduleNodeCount * 100) : 30;

    // 6. 等级评定
    var grade, gradeDesc, recommendation;
    if (avgMastery >= 80) {
      grade = 'A';
      gradeDesc = '优秀';
      recommendation = '建议开始高级主题或竞赛真题训练';
    } else if (avgMastery >= 65) {
      grade = 'B';
      gradeDesc = '良好';
      recommendation = '建议针对薄弱知识点进行专项巩固';
    } else if (avgMastery >= 50) {
      grade = 'C';
      gradeDesc = '中等';
      recommendation = '建议系统性复习该模块的基础知识';
    } else if (avgMastery >= 35) {
      grade = 'D';
      gradeDesc = '需加强';
      recommendation = '建议从最基础的概念开始重新学习';
    } else {
      grade = 'E';
      gradeDesc = '待学习';
      recommendation = '建议先学习该模块的核心概念卡片';
    }

    return {
      module: moduleId,
      overallMastery: avgMastery,
      grade: grade,
      gradeDesc: gradeDesc,
      recommendation: recommendation,
      weakPoints: weakPoints.slice(0, 8),
      learningPath: learningPath.slice(0, 8),
      behavior: behavior,
      masteryBreakdown: mastery,
      totalPractice: behavior.totalQuestions,
      forecastDaysToMaster: Math.max(0, Math.ceil((80 - avgMastery) / 5))
    };
  }


  var HISTORY_KEY = 'tatabox_practice_history';

  function loadHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-500)));
    } catch (e) {}
  }

  function recordPractice(moduleId, concept, isCorrect, duration) {
    var history = loadHistory();
    history.push({
      module: moduleId,
      concept: concept,
      isCorrect: isCorrect,
      duration: duration,
      timestamp: Date.now()
    });
    saveHistory(history);
    return history;
  }


  window.BioQuestAI = {
    // BKT 核心
    updateMastery: bktUpdate,
    calculateMastery: calculateMasteryFromHistory,

    // 依赖分析
    analyzeWeakness: analyzeWeaknessChain,
    generateLearningPath: generateLearningPath,

    // 行为分析
    analyzeBehavior: analyzeBehavior,

    // 诊断报告
    generateReport: generateDiagnosticReport,

    // 数据管理
    loadHistory: loadHistory,
    saveHistory: saveHistory,
    recordPractice: recordPractice,

    // 知识图谱（只读）
    knowledgeGraph: KNOWLEDGE_GRAPH,

    // 参数
    params: BKT_PARAMS
  };

})();
