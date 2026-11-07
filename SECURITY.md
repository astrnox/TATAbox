# 安全策略（Security Policy）

> 对应审计 Issue #101 / #103：将本项目的安全架构与边界文档化，便于贡献者理解设计取舍。

## 支持版本

| 版本 | 支持状态 |
| ---- | -------- |
| main 分支最新提交 | ✅ 支持 |
| 历史版本 / 旧 release | ❌ 不支持 |

## 漏洞报告

请勿通过公开 Issue 报告安全漏洞。请使用 GitHub 私有安全通告（Security → Report a vulnerability），
或联系仓库维护者。收到报告后我们会尽快评估并修复。

---

## 架构总览

TATABOX 是**纯前端静态应用 + Supabase（Auth / 数据库 / RLS）**架构：

- 前端静态托管（如 GitHub Pages），无自建业务后端、无服务端会话；
- 认证与数据全部直连 Supabase，写权限由服务端 **RLS（Row Level Security）强制**；
- 浏览器端数据使用 localStorage / sessionStorage / IndexedDB，**不使用 Cookie**。

## 无 Cookie 架构与 CSRF 免疫（#101）

本平台**不设置、不读取任何 Cookie**（全代码库无 `document.cookie` 调用）：

- 认证凭据为 Supabase JWT，通过 `Authorization` 请求头由 Supabase JS SDK 携带，
  存于 localStorage（`sb-*` 前缀），**不会**由浏览器自动附带；
- 所有状态变更请求必须显式附带 token，跨站页面无法伪造用户请求 → **天然免疫经典 CSRF**；
- 该结论的前提：凭据不进 Cookie。若未来引入 Cookie（如服务端渲染），
  必须同步引入 CSRF 防护（如 SameSite=Lax + CSRF token）并更新本文档。

## 会话与认证（#103）

- **登录/注册**：`js/core/supabase-client.js` 走 Supabase Auth（`signInWithPassword` / `signUp`），
  密码经 HTTPS 传输、由 Supabase 服务端哈希存储，前端不落盘；
- **会话持久化**：Supabase SDK `persistSession: true`，token 存 localStorage；
  `autoRefreshToken: true` 自动续期；`restoreSession()` 恢复会话（带 5 秒超时保护）；
- **登出清理**：`logoutUser()` / `forceLogout()` 分层清除 `sb-*` 会话、游客会话、
  管理员状态等全部敏感键，保留学习数据；
- **管理员会话加固**：admin 前端 token 存 sessionStorage，**5 分钟 TTL** 自动过期；
  登录后二次校验 `profiles.user_group === 'admin'`，非 admin 立即登出；
  真正的写权限始终由服务端 RLS 强制，伪造前端状态无法提权。

## AI 服务商 API Key（BYOK）

采用 BYOK（用户自带 Key）模式，`js/ai/ai-key-store.js`：

- Key 默认仅存**页面内存**（闭包单例，非枚举属性），刷新即失；
- 仅当用户显式勾选「会话内记住」才写入会话存储：优先用 **WebCrypto AES-GCM**
  加密（密钥为不可导出的 CryptoKey，保存在 IndexedDB），sessionStorage 只保存密文；
  不支持 WebCrypto/IndexedDB 的环境退回 sessionStorage 明文（关闭标签页即清除）；
- **绝不写 localStorage**；检测到旧版 localStorage 残留明文 Key 会自动搬入内存并擦除。

## 内容安全策略（CSP）

`index.html` 通过 meta CSP 收紧（`js/ai/ai-client.js` 同样受 `connect-src` 约束）：

- `script-src 'self'` + CDN 白名单，**无 `unsafe-inline` / `unsafe-eval`**
  （内联脚本已外部化，`onclick` 改为事件委托）；OCR 的 Tesseract WASM 通过
  `'wasm-unsafe-eval'` 单独放行 WebAssembly 编译，不放开 JS `eval()`；
- `object-src 'none'`、`base-uri 'self'`、`form-action 'self'`；
- 外连域最小化：Supabase、jsDelivr/unpkg、题图（Wikimedia）、PhET、6 家 AI 服务商。

## 数据完整性

- 题库分片带 SHA-256 校验（`js/core/loader.js`），CDN 回退数据防篡改；
- 本地备份采用 WebCrypto AES-GCM 加密（`js/core/storage.js`），新备份密钥由用户密码
  经 PBKDF2-HMAC-SHA256（310,000 次迭代 + 随机盐）派生；旧版 v2 备份仅为兼容保留读取路径；
- URL 参数经 `sanitizeUrlParam` 清洗（控制字符 / HTML 定界符过滤 + 长度上限）。

## 已知风险面（如实披露）

- **localStorage 持久会话的 XSS 风险面**：token 存 localStorage 意味着一旦发生 XSS 即可窃取会话。
  缓解手段：严格 CSP、全站输出转义、无第三方脚本注入面。这是「无 Cookie + CSRF 免疫」
  与「token 不受 XSS 影响」之间的显式取舍；
- **游客模式密码哈希非加密安全**：游客可选密码使用加盐 FNV-1a（非加密哈希），
  仅防明文泄漏，不防御离线暴力破解（代码注释已声明）。正式账号无此问题；
- **纯前端权限门禁仅为 UX**：admin 前端校验只是 UI 门禁，安全边界完全依赖 Supabase RLS。
