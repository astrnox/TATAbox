# TATABOX — 高中生生物学习平台

> [English Version](./README-en.md) | 中文版

<div align="center">

![TATABOX 首页截图](screenshots/home-final.png)

**从联赛备考到高考模拟，一个网站搞定你的生物练习**

[在线 Demo](https://tatabox.cc.cd/) · [开始刷题](https://tatabox.cc.cd/#/practice) · [出题/讨论](https://github.com/astrnox/BioQuest/discussions) · [反馈问题](https://github.com/astrnox/BioQuest/issues)

[![Platform](https://img.shields.io/badge/platform-Web-blue?style=flat-square)]()
[![Version](https://img.shields.io/badge/version-5.2.14-blue?style=flat-square)]()
[![License](https://img.shields.io/badge/license-MPL--2.0%20%2F%20CC%20BY--NC--SA%204.0-green?style=flat-square)]()
[![Status](https://img.shields.io/badge/status-Active-success?style=flat-square)]()
[![PWA](https://img.shields.io/badge/PWA-Supported-purple?style=flat-square)]()
[![GitHub Stars](https://img.shields.io/github/stars/astrnox/BioQuest?style=flat-square)]()

</div>

---

## 这是什么

TATABOX 是一个面向高中生的生物学习网站。无论是备战全国中学生生物联赛、刷高考模拟题，还是巩固课本知识，都可以在这里完成。

> [!IMPORTANT]
> 📚 **题库现状**：题库已扩充至 **3400+ 道**（联赛真题、模块练习、逻辑题、每日联赛等 9 个数据源），覆盖 80 个生物学科主题。高质量真题与精编解析仍在持续补充，欢迎一起出题。
>
> 🙌 **欢迎来出题！** 如果你是生物老师、竞赛党或学科大佬，甚至只是一个对生物感兴趣的普通人，欢迎在 [GitHub Discussions](https://github.com/astrnox/BioQuest/discussions) 里交流出题、认领主题，或直接提交 PR 补充 JSON 题库（建议先在 Discussion 交流，如果一段时间内没有回复，直接 PR 也可以）。每一道好题都会被认真对待。

---

## 快速开始

### 直接使用（学生 / 教师）

打开在线版本即可：**[https://tatabox.cc.cd/](https://tatabox.cc.cd/)**

- 无需注册即可刷题；注册后可同步错题本与学习进度
- **极简版**：手机或低性能设备可打开 [tatabox.cc.cd/lite.html](https://tatabox.cc.cd/lite.html)，只有「今日 / 练 / 复 / 错 / 榜」五个视图，启动更快、干扰更少
- 错题本、练习与组卷均支持打印：A4 自动分页、题目与答案解析可分模式出纸
- AI 导师、拍照搜题等功能需自行配置 API Key（均使用各大模型的免费额度，站内有教程）
- 支持离线使用，可添加到手机主屏幕或 PC 作为 App 运行

### 自行部署 / 二次开发

纯静态网站，无需后端，部署简单：

```bash
# 1. 克隆仓库
git clone https://github.com/astrnox/BioQuest.git
cd TATABOX

# 2. 本地预览（任选其一）
python -m http.server 8000   # Python
npx serve .                  # Node.js

# 3. 浏览器访问 http://localhost:8000
```

**在线部署**：将整个文件夹上传至 GitHub Pages、Vercel、Netlify、Cloudflare Pages 等任意免费托管平台即可，无需构建步骤。

**可选配置**：

- **数据库**：在 [Supabase](https://supabase.com) 创建免费项目，按顺序执行 `sql/` 下的迁移（至少 `migration_v3_security.sql` → `migration_v15_admin_totp.sql` → `migration_v16_login_contract.sql` → `migration_v17_review_cards_options.sql`），再把地址与 Key 填入 `js/core/supabase-client.js`（不配置则自动使用浏览器本地存储）
- **AI 功能**：用户在「我的 → 设置」中自行填写 API Key，开发者无需管理
- **门禁自查**：提交前运行 `npm test`（manifest 锚点 + 设计审计 + 单元测试 + 烟雾测试）

---

## 功能一览

| 功能 | 说明 |
|------|------|
| **刷题模考** | 覆盖 80 个生物学科主题的分模块练习，3400+ 道题（联赛真题 / 模块练习 / 逻辑题 / 每日联赛），自动判分并给出解析 |
| **智能错题本** | 错题自动归集，支持拍照录题（印刷体与手写识别）与 FSRS 到期排序 |
| **错题打印** | 错题本 / 练习 / 组卷均可打印，支持「题目+答案解析 / 仅题目 / 仅答案」三种模式，A4 自动分页、每页页脚标记 |
| **知识卡片** | Anki 风格间隔重复卡片，基于遗忘曲线自动安排复习 |
| **知识图谱 v5.0** | 80 个考点 + 百科词条层（459 条）+ 词云视图，支持 AI 讲解与直达百科 |
| **视频演示** | 37 条考点演示视频（动画 / 3D / 显微 / 延时 / 拟真 / 讲解 / 实拍 七类标签筛选） |
| **极简版** | 独立的 `lite.html` 五视图（今日 / 练 / 复 / 错 / 榜），零框架、启动快，适合手机与低性能设备 |
| **能力诊断** | 答题后生成能力雷达图，定位薄弱知识点 |
| **AI 导师** | 随时提问，支持画图讲解、举一反三 |
| **虚拟实验** | 质壁分离、色素分离、DNA 提取等实验可在浏览器中模拟操作 |
| **分子可视化** | 输入 SMILES 查看 2D 结构，加载 PDB 查看 3D 分子，内置基因组浏览器 |
| **学习分析** | 统计每日学习时长与高频错题 |
| **社区讨论** | 与其他学生交流题目 |
| **安全与隐私** | Supabase 行级安全（RLS）、公开资料视图、管理员 TOTP 动态码、敏感字段服务端保护 |

### 近期更新（5.2.x）

- **打印体系**：新增零依赖 `print-utils.js`，三类场景 × 三种模式统一出纸；修复脏数据导致整批打印失败的问题
- **FSRS 闭环**：答错建卡 / 答对仅推进已有卡，错题本显示到期徽标与今日复习入口
- **知识图谱 v5.0**：百科词条层按需加载（DB → 本地种子回退），词云按考点 3 / 标题 2 / 标签 1 加权
- **视频库**：34 条竞赛核心考点视频补齐，全部视频增加标签分类与版权白名单校验
- **极简版登录**：薄荷纸底 + 森林绿单点 CTA，密码显隐、错误聚焦、关闭清空密码
- **安全加固**：`profiles` 收紧为仅本人可读，用户名登录改窄 RPC，管理员仅 TOTP

---

## 核心算法

<details>
<summary><b>展开查看：让平台变得「聪明」的算法细节</b></summary>

### 1. 间隔重复调度（FSRS）

采用 FSRS 替代传统 Anki SM-2 算法。根据每张卡片的记忆难度，基于稳定度、难度、可提取性三个指标自动计算最优复习间隔，无需手动安排。

错题已接入完整闭环：答错时本地镜像 Again 并在云端 `review_cards` 建卡；答对时只有当该题已在错题本时才推进 Good，不会为普通题滥建卡；游客则回退到本地到期队列。

```js
const scheduler = tsFsrs.fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: true
});
const result = scheduler.next(card, now, Rating.Good);
```

### 2. 能力估计（IRT + BKT）

不采用简单的正确率计分，而是运用项目反应理论（3PL 模型）从答题历史中估计真实能力水平，同时考虑每道题的难度与区分度。此外使用贝叶斯知识追踪（BKT）估算各知识点的掌握概率。

### 3. 拍照搜题/加错题（OCR）

双层识别策略：若用户配置了多模态大模型 Key，优先使用 AI 识别（准确率更高，支持斜体与公式）；否则使用 Tesseract.js 在浏览器本地识别，经过放大、灰度化、对比度拉伸、二值化等预处理后，再用正则修正常见识别错误。

```js
// 图像预处理
const stretched = gray.map(v => ((v - min) / (max - min)) * 255);
const bin = stretched.map(v => v > 140 ? 255 : 0);
```

### 4. 流式渲染

AI 回答时先以纯文本逐字输出（保证响应速度），回答完成后再统一渲染为 Markdown，内联 SVG 图表自动绘制。

```js
chunkEl.textContent += delta;                              // 流式：纯文本追加
finalEl.innerHTML = DOMPurify.sanitize(marked.parse(text)); // 完成后渲染
```

</details>

---

## 技术栈

纯前端架构，无需运行后端服务：

- **前端**：原生 JavaScript（单页应用）+ CSS3 + PWA（离线支持）；另有零框架极简版 `lite.html`
- **数据**：Supabase（免费版，RLS + 窄 RPC）+ IndexedDB（浏览器本地数据库）
- **AI**：前端直连 6 家大模型（DeepSeek、智谱、通义、Kimi、NVIDIA、硅基流动），支持流式输出
- **可视化**：Chart.js、Cytoscape.js、纯 SVG 力导向知识图谱（含百科词条层 / 词云）、Mermaid（流程图）、3Dmol.js（3D 分子）、igv.js（基因组）
- **打印**：零依赖 `js/core/print-utils.js`，A4 + 分页 + 固定页脚，走浏览器原生打印
- **OCR**：Tesseract.js（本地识别）+ 多模态大模型（云端识别）
- **视频**：Wikimedia Commons 公共领域 / CC 授权素材，逐条白名单校验
- **字体**：霞鹜文楷（本地加载，无需网络等待）

---

## 开源依赖

项目打包了 24 个开源第三方库，均采用 MIT / Apache / BSD 等宽松协议，完整许可证声明见 [`js/vendor/THIRD_PARTY_LICENSES.txt`](./js/vendor/THIRD_PARTY_LICENSES.txt)。

主要依赖：

- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) — 间隔重复算法（MIT）
- [KaTeX](https://katex.org/) — 数学公式渲染（MIT）
- [Dexie.js](https://dexie.org/) — 浏览器本地数据库（Apache-2.0）
- [Chart.js](https://www.chartjs.org/) — 图表（MIT）
- [3Dmol.js](https://3dmol.org/) — 3D 分子可视化（BSD-3）
- [RDKit.js](https://www.rdkitjs.com/) — SMILES 转 2D 分子（BSD-3）
- [DOMPurify](https://github.com/cure53/DOMPurify) — XSS 防护（MPL-2.0 / Apache-2.0）
- [Excalidraw](https://excalidraw.com/) — 手绘画板（MIT）
- [PhET](https://phet.colorado.edu) — 互动模拟实验（CC BY 4.0）
- [LXGW WenKai](https://github.com/lxgw/LxgwWenKai) — 中文字体（OFL-1.1）

---
## 许可证

本项目采用**双授权**：

- **代码**（`js/`、`css/`、`scripts/`、`*.html` 等）：[MPL-2.0](./LICENSE)
- **内容**（`data/` 题库、`images/`、PDF 教材、百科词条、动画等）：[CC BY-NC-SA 4.0](./LICENSE-CONTENT)

### 代码部分（MPL-2.0）

MPL-2.0 为弱 copyleft 协议：允许修改与商用，但修改过的文件及其派生作品须继续以 MPL-2.0 开源；协议边界为文件级，可与闭源项目一同分发。

### 内容部分（CC BY-NC-SA 4.0）

只要不直接销售内容本身，学习与教育用途均被允许：

- 个人学习、二次使用
- 学校、辅导班、培训机构用于教学（收取学费不受限制，因为销售的是教学服务而非内容）
- 公益教育项目、教育扶贫

以下行为**不被允许**：

- 将题库、PDF、动画等内容直接打包售卖
- 移除版权声明或冒充原创

### 内容商用授权

内容默认禁止商业用途。如需将题库、PDF、动画等用于商业场景（企业培训、付费平台、商用 SaaS、批量售卖题库等），须与版权所有者 **astrnox** 另行签订商业授权协议（可通过 GitHub Issues 联系）。教育及公益项目通常可免费获得授权。

---

## 路线图

题库建设是当前最高优先级：

- [ ] 📚 **继续扩充高质量题库**：联赛真题、高考真题与模拟题、分模块精编题（当前 3400+ 道，目标继续提升真题占比与解析质量）
- [x] 错题本打印（浏览器原生 A4，可另存为 PDF；题目与答案解析可分模式出纸）
- [x] FSRS 云端闭环与多端同步（错题卡、到期排序、今日复习入口）
- [x] 竞赛核心考点视频库与标签筛选
- [x] 知识图谱 v5.0 百科词条层与词云
- [ ] 生物画图题自动判分
- [ ] 更多虚拟实验
- [ ] 更多动画与百科词条
- [ ] 班级 / 教师管理功能完善
- [ ] 移动端 App 打包（TWA / PWA 已支持，后续考虑原生壳）

欢迎提交 Issue 或在 [Discussions](https://github.com/astrnox/BioQuest/discussions) 中提出功能建议。

---

## 反馈与联系

遇到 Bug、有功能想法或发现题目错误，欢迎反馈：

- **GitHub Issues**：[https://github.com/astrnox/TATAbox/issues](https://github.com/astrnox/TATAbox/issues)
  - 点击「New Issue」后选择对应模板，按模板填写最为高效：
    - Bug 报告：复现步骤 + 浏览器 / 设备信息 + 截图
    - 功能建议：想解决的问题 + 期望的解决方案
    - 题目 / 内容纠错：出错位置 + 当前错误 + 正确内容
    - 其他：求助或任意反馈
  - 也可在站内「用户反馈」弹窗中留言（分类一致）
- **邮件**：astrnox@163.com

> 作者是一名高中生，学业较忙，回复可能不够及时，也有可能有问题，但每条建议都会认真阅读，感谢理解。

---

## 贡献指南

欢迎各种形式的贡献，**尤其是出题**：

- 🧬 **擅长生物**：来出题！补充题库、修正题目错误、撰写详细解析——可在 [Discussions](https://github.com/astrnox/BioQuest/discussions) 认领主题或交流题目质量
- 💻 **擅长代码**：修复 Bug、添加新功能
- 🎨 **擅长设计**：优化界面
- 💡 **其他**：使用中遇到问题或有想法，直接提 Issue 即可
### 代码贡献流程

1. Fork 本仓库
2. 创建分支（`git checkout -b feat/xxx`，命名规范见 [CONTRIBUTING.md](CONTRIBUTING.md)）
3. 提交改动（`git commit -m 'feat: 描述你的改动 (#issue号)'`，遵循 Conventional Commits）
4. 推送至分支（`git push origin feat/xxx`）
5. 发起 Pull Request

提交前请执行 `npm run lint:js && npm run audit:design` 自查。
完整代码风格约定见 **[docs/代码风格指南.md](docs/代码风格指南.md)**。

---

## 致谢

- 感谢 **Congqianguo** 在项目初期的贡献与支持
- 感谢各位本仓库的贡献者
- 感谢 Open Spaced Repetition 社区提供的 FSRS 算法
- 感谢所有开源库的作者
- 感谢 [PhET Interactive Simulations](https://phet.colorado.edu)（科罗拉多大学博尔德分校）提供的优质互动模拟
- 感谢[DNSHE](https://dnshe.com)的免费二级域名
- 感谢每一位使用 TATABOX 学生物的同学，祝考试顺利


---
**计划改名为GAGABOX,敬请期待~**
<div align="center">

用 TATABOX，学生物不迷路

</div>
