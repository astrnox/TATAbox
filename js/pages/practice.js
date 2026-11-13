/**
 * ============================================================
 * TATABOX — 练习模式模块
 * 支持 MTF（多重判断）题型的专项练习，含筛选、答题、计分、
 * 收藏、错题管理和数据持久化
 * ============================================================
 */

'use strict';

const PracticeModuleGroups = [
  {
    id: 'module1',
    label: '模块一',
    subjects: ['生物化学', '分子生物学', '细胞生物学']
  },
  {
    id: 'module2',
    label: '模块二',
    subjects: ['植物学', '植物生理学', '微生物学']
  },
  {
    id: 'module3',
    label: '模块三',
    subjects: ['动物学', '动物生理学', '生态学']
  },
  {
    id: 'module4',
    label: '模块四',
    subjects: ['遗传学', '进化生物学', '演化生物学', '生物信息学', '群体遗传学']
  }
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '基础' },
  { value: 'medium', label: '进阶' },
  { value: 'hard', label: '挑战' }
];

const TARGET_OPTIONS = [
  { value: 'high_school', label: '高考' },
  { value: 'competition', label: '竞赛' },
  { value: 'both', label: '共通' }
];

const QUESTION_COUNT_OPTIONS = [5, 10, 20, 50];

const PracticeState = {
  allQuestions: [],
  logicData: [],           // 逻辑推理题库
  logicLoaded: false,      // 逻辑推理题是否已加载
  leagueData: [],          // 联赛真题池（resource/all.json，2873 道）
  leagueLoaded: false,     // 联赛真题是否已加载
  filteredQuestions: [],
  currentSet: [],
  currentIndex: 0,
  userAnswers: {},
  submitted: false,
  favorites: new Set(),
  wrongMarked: new Set(),
  totalScore: 0,
  totalAnswered: 0,
  moduleStats: {},
  startTime: 0,
  started: false,
  selectedModules: ['module1', 'module2', 'module3', 'module4'],
  selectedDifficulties: ['easy', 'medium', 'hard'],
  selectedCategory: 'all',  // 'all' | 'basic' | 'logic' | 'ggbo'（ggbo = 其他/竞赛拓展题）
  selectedTargets: ['high_school', 'competition', 'both'], // 目标群体：高考/竞赛/重叠
  questionCount: 10,
  redoMode: false,
  conceptFilter: null,      // 来自知识图谱的专项概念过滤
  kgSource: null,           // 知识图谱来源信息
  kgCategory: null          // 知识图谱来源的学科分类（如"植物学"），用于精确过滤
};

let practiceStylesInjected = false;

/**
 * 带超时与自动重试的 JSON 拉取：首次访问 CDN/静态代理冷加载常较慢甚至超时。
 * 超时后取消挂起请求、短暂退避重试一次（CDN/HTTP 缓存往往已预热），
 * 避免练习/逻辑题库首次加载失败后整页不可用。
 */
