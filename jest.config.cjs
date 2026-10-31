module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.js'],
  verbose: true,
  // #140/#141 覆盖率门禁：只统计「require 加载」的模块（Istanbul 可插桩）。
  // irt-engine / fsrs-* 系列在测试中经 (0, eval)(SRC) 动态求值加载，
  // Istanbul 无法插桩（恒报 0%），纳入统计反而使门禁失真，故不在此列。
  collectCoverageFrom: [
    'js/ai/ai-client.js',
    'js/core/utils.js',
    // M-03：这些模块以 CommonJS/UMD 形式加载，Istanbul 可插桩，
    // 且已有 require 式测试，纳入门禁才能真实反映回归覆盖。
    'js/core/question-model.js',
    'js/core/rating.js',
    'js/core/loader.js',
    'js/algo/fsrs.worker.js'
  ],
  coverageDirectory: 'coverage',
  // #140/#141 覆盖率门禁：任一指标低于阈值即整体失败（CI 已启用 --coverage）。
  // 阈值定在当前实测值下方留有余量：防止覆盖率回退，而非追求虚高。
  coverageThreshold: {
    // M-03：从「仅两个模块」扩到题库/评分/加载器/FSRS Worker，并按实测值留 3-8% 余量。
    global: { statements: 25, branches: 20, functions: 22, lines: 27 },
    './js/ai/ai-client.js': { statements: 15, branches: 7, functions: 20, lines: 18 },
    './js/core/utils.js': { statements: 6, branches: 5, functions: 3, lines: 7 },
    './js/core/question-model.js': { statements: 90, branches: 88, functions: 90, lines: 95 },
    './js/core/rating.js': { statements: 85, branches: 78, functions: 80, lines: 90 },
    './js/core/loader.js': { statements: 15, branches: 10, functions: 12, lines: 16 },
    './js/algo/fsrs.worker.js': { statements: 70, branches: 55, functions: 70, lines: 75 }
  }
};
