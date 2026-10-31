/**
 * M-02：ESLint 扁平配置
 * ------------------------------------------------------------------
 * 项目是「多脚本共享全局」的经典 SPA，暂不做模块化重写，因此：
 *   - no-undef 关闭：跨文件函数/常量是设计现状，交给运行时与测试兜底；
 *   - no-unused-vars 先记为 warning，避免一次引入上千条 error；
 *   - 只把「确定是 bug」的规则设为 error：重复键、不可达代码、fallthrough、
 *     async Promise executor、常量条件等。
 * 目标：先建立门禁，再逐步收紧。vendor 与第三方产物不参与 lint。
 */
import js from '@eslint/js';

const sharedRules = {
  ...js.configs.recommended.rules,
  'no-undef': 'off',
  'no-unused-vars': ['warn', {
    args: 'none',
    caughtErrors: 'none',
    varsIgnorePattern: '^_'
  }],
  'no-redeclare': 'off',
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-prototype-builtins': 'off',
  'no-control-regex': 'off',
  'no-useless-escape': 'warn',
  'no-cond-assign': ['error', 'except-parens'],
  'no-constant-condition': ['error', { checkLoops: false }]
};

export default [
  {
    ignores: [
      'js/vendor/**',
      'node_modules/**',
      'archive/**',
      'docs/**',
      'dist/**',
      '**/*.min.js',
      '**/*.wasm'
    ]
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script'
    },
    rules: sharedRules
  },
  {
    files: ['scripts/**/*.js', 'tests/**/*.js', 'tests/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs'
    },
    rules: sharedRules
  }
];
