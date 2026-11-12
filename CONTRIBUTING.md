# CONTRIBUTING

欢迎为 **TATABOX** 贡献代码。本文档约定仓库的分支命名、提交信息、PR 与版本发布规范，请在动手前通读一遍。

---

## 仓库概况

- **项目**：TATABOX —— 面向生物竞赛（联赛）备考的全栈学习平台，包含知识卡片、模拟试题、学习分析、社区讨论等模块。
- **形态**：纯静态站点，托管于 GitHub Pages（主分支直接发布）。
- **主分支**：`main`。所有合并最终收敛到 `main`，`main` 仅通过 PR + Squash 合并接收变更。
- **Node 环境**：Node.js ≥ 20（CI 使用 20）。
- **仓库地址**：<https://github.com/astrnox/TATAbox>

---

## 1. 分支命名约定

每个 issue（或独立需求）一条分支，一条分支原则上只解决一个 issue。

分支前缀与提交 `type` 保持一致，常用：

| 场景 | 分支名 |
| --- | --- |
| Bug 修复 | `fix/<issue编号或简述>` （例：`fix/113`） |
| 新功能 | `feat/<简述>` （例：`feat/learning-hub`） |
| 文档 / 重构 / 性能 / 测试 / 构建 / CI | `docs/`、`refactor/`、`perf/`、`test/`、`build/`、`ci/` + `<简述>` |
| 杂项/工程/依赖 | `chore/<简述>` （例：`chore/ci-cleanup`） |

要点：

- 如需个性化描述，可写 `<issue编号>-<简述>`，例如 `fix/113-commit-conventions`。
- 分支名一律小写、以 `-` 连接，避免使用空格与特殊字符。
- **一个 issue 一个分支**；完成后合入并删除本地/远端该分支。

---

## 2. 提交信息规范（Conventional Commits）

提交信息采用 [Conventional Commits](https://www.conventionalcommits.org/) 格式，便于追溯与自动生成 changelog。issue 关联建议写在 PR 描述中；`check-commit-msg.js` 只校验标题格式，不强制标题携带编号。

常规格式：

```
<type>(<scope>): <描述，1~120 字符>
```

允许的 `type`（**必须严格取自此表**，否则 `check-commit-msg.js` 会 FAIL）：

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 仅文档（如本文档） |
| `chore` | 杂项、依赖、构建无关改动 |
| `refactor` | 不改变行为的代码重构 |
| `perf` | 性能优化 |
| `test` | 补充/修改测试 |
| `build` | 构建系统/打包配置 |
| `ci` | CI 配置与门禁 |
| `style` | 代码格式/设计系统（不改业务逻辑） |
| `revert` | 回退 |

> ⚠️ **注意**：本文档早前提到的 `design`（如 `design: P0 去 AI 味…`）**不在白名单内**，
> 会导致 CI 失败。纯样式/设计系统改动请用 `style`。
>
> `type` 一律小写，不加中文修饰（如不要写 `新功能 feat:`）。

`scope` 可选（括号内小写字母/数字/逗号/下划线/连字符），用于标注影响模块。**描述**使用祈使句、简洁达意；可选地尾缀 issue 编号（`(#136)`），但这不是 CI 强制项。

示例：

```
fix: 修复答题进度在刷新后丢失 (#136)
feat: 新增学习热力图模块 (#128)
docs: 补充贡献与提交规范 (#113)
chore: 升级 playwright 依赖到 v1.4x (#120)
refactor: 抽取公共的代数引擎函数 (#115)
perf: 预热首页路由以降低首屏耗时 (#129)
test: 为 IRT 引擎补充边界用例 (#131)
```

> 描述控制在 1 ~ 120 字符内；更长的说明放正文（空一行后的 message body），正文同样建议注明 `Closes #xxx`。

### 提交校验脚本

仓库提供了零依赖校验脚本，可用于提交前自查或 CI 门禁：

```bash
# 校验最近一次提交是否符合规范
node scripts/check-commit-msg.js

# 独立校验任意消息（无需真的提交）
node scripts/check-commit-msg.js --subject "fix: 修复答题进度丢失 (#136)"
```

符合规范 exit 0；不符合则打印示例并 exit 1。该脚本只读、不改写任何内容。

---

## 3. PR 流程

1. 从最新的 `main` 拉出上述规范命名的分支并开发。
2. 本地自查（见下方「提交校验脚本」与 `npm run lint:js`），推送远端分支。
3. 创建 PR：
   - **base**：`main`；**compare**：你的修复分支。
   - 标题遵循 Conventional Commits 风格。
   - 描述中**引用所要解决的问题**（如 `Closes #113`），简述改动与验证方式。
4. **CI 必须全绿方可合并**。`lint + unit + smoke` 作业含以下 11 个检查步骤，任一失败即阻断：
   - vendor 完整性校验（供应链门禁）
   - 第三方资源白名单 + SRI 完整性校验（仅 `script`/`link` 资源；正文 `<a>` 外链不受限）
   - 提交信息规范校验
   - JS 语法检查（`node --check`）
   - manifest CDN 锚点一致性校验
   - 题库分片一致性校验
   - 单元测试（IRT / FSRS / 调度器，含覆盖率门禁；覆盖率当前只统计 6 个核心模块）
   - RLS 策略静态审计
   - **设计规范审计**（emoji / 渐变 / 毛玻璃 / 内联样式棘轮）
   - 发布资源压缩构建验证
   - 烟雾测试（Wiki）
   - 另有 `Playwright E2E` 作业

   > ⚠️ **排在前面的步骤失败会导致后续步骤被跳过**（显示为 `skipped`）。例如提交信息
   > 校验一旦失败，单元测试与设计规范审计都**不会执行**。若你在 PR 描述里写
   > 「测试全部通过」，请先确认 CI 真的跑到了单元测试那一步，而不是在前几步就断了。

5. 合并统一使用 **Squash and merge**，保持 `main` 历史线性、每个合并对应一个 git 提交。

   > **部署与安全头**：`_headers`（HSTS / X-Frame-Options / Trusted Types）只在
   > Cloudflare Pages/Workers 生效，GitHub Pages 会忽略该文件。部署到 Pages 时以页面内
   > 的 CSP meta 为准，`_headers` 仅作为 Cloudflare 场景的增强，不能当作唯一防护。

---

## 4. 发布与版本

本项目由 GitHub Pages 直接发布 `main`，无独立发布步骤；`package.json` 中的 `version` 与 git tag 用于标记里程碑。

- **标签**：semver 格式 `v1.x.y`（例：`v1.2.0`）。发布里程碑时打 tag 并推送：
  ```bash
  git tag v1.2.0
  git push origin v1.2.0
  ```
- **bump:sw**：修改 `js/`、`css/`、`data/` 下文件后，运行 `npm run bump:sw` 自动按内容计算哈希并写入 `sw.js` 的 `CACHE_VERSION`，避免新旧资源混用。内容未变时幂等、不弄脏工作区。

### 常用 npm scripts

```bash
npm test          # 锚点 + 单元 + 烟雾三连（= test:anchor && test:unit && test:smoke）
npm run test:unit # Jest 单元测试（含覆盖率门禁）
npm run test:e2e  # Playwright E2E
npm run build:min # 用 esbuild 压缩 js/css 进 dist/（产物不入库）
npm run build:css # 合并首屏同步 CSS 为 bundle-core.css
npm run bump:sw   # 刷新 Service Worker 缓存版本号
npm run lint:js   # node --check 全部 JS 语法检查
```

---

## 5. 代码风格与注意事项

**完整风格约定见 [`docs/代码风格指南.md`](docs/代码风格指南.md)**（含命名、缩进、引号、
兼容性、设计系统、文案规范，每条均标注实测依据）。以下是必须遵守的要点：

### 硬性要求（违反会被 CI 拦下）

- **改动`css/` 下源文件后必须执行 `npm run build:css`** 重新生成 `bundle-core.css`；
  直接改 `bundle-core.css` 产物会被审计脚本拦下。
- **改过 `js/`、`css/`、`data/` 后执行 `npm run bump:sw`**，避免新旧资源混用。
- **JS 模板中禁止 `style="..."`**，一律用 `.bq-*` 全局组件类（见风格指南 §6.2）。
- **禁止用彩色 emoji 当图标**（CI 硬门禁，预算 0 处），统一用 `js/core/utils.js` 的 `BQ_ICONS`。
- **禁止 `backdrop-filter` 毛玻璃**（全站已下线，实色面 + 1px 边框 + 单档阴影）。
- **禁止装饰性渐变**（全站预算 4 处，装饰性渐变已清理）。
- 所有注入 DOM 的用户数据必须转义（`escapeHtml` / `_escapeHtmlAttr`）。
- 业务 JS 需兼容旧内核浏览器：**用 `var` 而非 `let`/`const`、用 `function` 而非箭头函数**。

### 提交前自查

```bash
npm run lint:js       # 全部 JS 语法（node --check）
npm run audit:design  # 设计规范门禁
npm test              # 锚点 + 单元 + 烟雾
npm run bump:sw       # 改过 js/ css/ data/ 后必须
```

### 依赖与产物

- 拦截仅发生在 `scripts/`、`tests/` 的零依赖脚本使用 Node 内置模块；业务代码若引入新依赖请先在 issue/PR 中说明理由。
- 不把构建产物（`dist/`、压缩后的 vendor 副本等）提交入库。
- 涉及第三方 vendor 文件升级时，需同步更新 integrity 清单并说明，否则 CI 的 vendor 完整性门禁会 FAIL。
- 提交前请 `git diff` 复核，避免夹带无关改动；注意行尾保持 LF（用脚本批量改文件极易把 LF 转成 CRLF，导致 diff 假膨胀）。

### 界面文案

界面文案不得有 AI 腔（情绪化评价、空泛承诺、营销自夸）。原则是**给事实，不给评价**——
写「72 道题全部答对，满分。」而非「太厉害了！」。详见风格指南 §7。