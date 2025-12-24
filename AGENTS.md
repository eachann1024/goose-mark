# 项目规则（读取后遵守）

## 响应规范
- 始终使用中文回复。
- 代码简洁实用，控制圈复杂度，能复用则复用。
- 改动最小化，不随意波及其他模块。
- 禁止过度防御和多余注释（仅在逻辑复杂时解释“为什么”）。
- 禁用 `as any` 保持类型安全。
- 风格需与当前文件保持一致。
- app.vue 这个页面不应该编写业务逻辑，应该保持尽量精简

## 技术/组件约束
- 前端基于 Vue 3 + Vite + Pinia + Tailwind CSS + UnoCSS。
- UI 组件库：**shadcn-vue** (Radix Vue) + 自定义 Tailwind 样式。
- 样式系统：Tailwind CSS (Bento 风格, dark/light 适配) + UnoCSS (图标支持)。
- 图标：使用 UnoCSS 方案 (e.g. `i-mdi-home`) 或 Lucide Vue。
- 图片：使用 `src/components/ui/image` 组件，禁用原生 `img` 标签。
- 风格：Bento Grid 布局，圆角 Card，深色模式优先。

## UI 规范
- 常见问题/提示类信息统一使用 `src/components/FaqNotice.vue`，采用主题色（primary + muted-foreground），避免硬编码色值，确保暗黑/亮色一致。

## 书签功能约定
- 支持一级/二级分类、搜索（模糊匹配标题、描述、URL、标签）
- **图标获取策略**：
  1. DuckDuckGo Icons（`https://icons.duckduckgo.com/ip3/{host}.ico`）优先
  2. uTools ubrowser 解析网页 HTML 备选（获取 apple-touch-icon/icon/og:image）
  3. 都失败则显示文字图标
- 默认图标为文字首字母；回退必须可靠。
- **AI 功能**：使用 `window.utools.askAI` 调用 uTools 内置 AI，无需 Mock。
- 设置页包含：缺失图标批量匹配、无效地址检测（本机 HEAD/GET，超时 3s）、AI 自动生成开关。

## 分享功能约定
- **数据存储**：默认使用 uTools 存储 (utoolsStorage)，Web 端降级为 localStorage。
- **分享同步策略**：
  - 分享者：修改后需手动触发更新（或自动）以同步到服务器。
  - 接收者：本地保留一份副本，仅在服务器有更新时提示更新。
  - **导入的数据**：视为只读，禁止新增/修改/删除书签，UI 上隐藏相关按钮。
- **UI 区分**：
  - 分享源（我分享的）：蓝色虚线边框。
  - 导入源（我接收的）：绿色虚线边框。
  - 接收者可点击“管理”图标查看更新状态（如有更新显示角标）。

## 运行环境
- **预设运行在 uTools 插件环境**，不考虑纯浏览器兼容。
- 不要重复执行 `pnpm dev`（默认已启动）。
- 调试 uTools：插件中心 -> 开发者工具 -> 选择本目录；控制台在右上角"查看控制台"。

## 角色参考
- 前端：Evan You / Monterail / Bacancy
- Node 后端：Ryan Dahl / Guillermo Rauch / Azat Mardan

## 其他
- 遵守 Anti-Slop 标准：零废话注释、避免过度防御、类型安全、一致风格。
- 软/硬链接（含本文件）禁止改动链接关系。
- 文档地址：https://www.u-tools.cn/docs/developer/api-reference/utools/ai.html
- utools 版本：7.3.2

## 组件导入规则（自动导入）
- **禁止手动导入 UI 组件库**：`src/components/ui/` 下的所有组件已通过 `unplugin-vue-components` 全局自动注册（见 `src/components.d.ts`）。
- **自定义组件需手动导入**：业务组件（如 `FaqNotice`、`ResultToast`、`BookmarkFormDialog` 等）仍需显式导入。
- **第三方库需手动导入**：`vuedraggable`、`lucide-vue-next` 等第三方库需显式导入。
- **检查方法**：使用 `grep "^import.*from.*@/components/ui"` 搜索不应有任何结果。

## 可复用约定（沉淀）
- 操作完成需“最终结果反馈”时，优先用 `src/components/ResultToast.vue`（支持标题/描述/可选动作按钮），避免到处手写 Toast。
- 轻量系统提示（不需要留在应用内）统一用 `src/lib/notify.ts` 的 `notify`（内部优先 `window.utools.showNotification`，无 uTools 降级 `console.info`）。
- 链接可达性检测统一走 `src/services/siteProbe.ts` 的 `probeUrl`（内置 URL 规范化、模板地址跳过、HEAD→GET 回退、默认 3s 超时）。
- 破坏性操作（清空/删除不可逆）优先用应用内 `Dialog` 二次确认，并在完成后给 `ResultToast` 最终反馈（必要时提供“复制列表”动作）。

## 服务器部署配置

### 腾讯云服务器
- **服务器 IP**：`43.142.149.157`
- **SSH 用户名**：`ubuntu`
- **面板**：1Panel (Docker 容器化管理)

### 自动化部署 (CI/CD)
- **触发方式**：推送到 `master` 分支自动触发 GitHub Actions
- **构建环境**：GitHub Actions (pnpm + Node 20)
- **部署路径**：`/opt/1panel/apps/marks.com/index/server`
- **容器名称**：`GooseMarks`
- **后端端口**：`3001`（避免与其他服务冲突）

### PostgreSQL 数据库
- **数据库名称**：`GooseMarks`
- **用户名**：`GooseMarks`
- **密码**：存储在 GitHub Secrets `DB_PASSWORD` 中

### GitHub Secrets 配置
| Secret 名称 | 说明 |
| :--- | :--- |
| `SERVER_IP` | 腾讯云服务器公网 IP |
| `SERVER_USER` | SSH 登录用户名 |
| `SERVER_SSH_KEY` | SSH 私钥（完整内容） |
| `DEPLOY_PATH` | 1Panel 站点部署路径 |

### 部署流程
1. `git push origin master` 触发 Actions
2. GitHub 构建前端 (pnpm build) 并安装后端依赖
3. 通过 SCP 同步 `server/` 目录（含 `dist/`）到服务器
4. 通过 SSH 执行 `docker restart GooseMarks`

### 相关文件
- `.github/workflows/deploy.yml`：自动化部署配置
- `scripts/deploy.sh`：服务器端部署脚本
- `server/index.js`：后端入口（Fastify + 静态文件）
