# 项目规则（读取后遵守）
- 修改后请记住要 pnpm build 生成 dist 文件。

## 响应规范
- 始终使用中文回复。
- 改动最小化，不随意波及其他模块。
- 风格需与当前文件保持一致。
- `App.vue` 保持精简，仅负责全局布局和状态分发，业务逻辑封装在 composables 中。

## 开发环境与部署
- **运行环境**：预设运行在 uTools 插件环境 (版本 7.3.2)，不单独考虑纯浏览器完全兼容。
- **构建/调试**：macOS + pnpm。不要重复执行 `pnpm dev`（默认已启动）。
- **部署配置**：服务器 IP `43.142.149.157`，通过 GitHub Actions 自动化部署到 `/opt/1panel/apps/marks.com/index/server`。
- **软/硬链接**：禁止改动项目根目录下文件的链接关系。

## 技术/组件约束
- **核心**：Vue 3 + Vite + Pinia + UnoCSS + Tailwind CSS。
- **UI 库**：**shadcn-vue** (Radix Vue)。
  - **禁止手动导入 UI 组件**：`src/components/ui/` 下的组件已通过 `unplugin-vue-components` 自动注册。
  - **手动导入**：业务组件（如 `FaqNotice`）、第三方库（`vuedraggable`、`lucide-vue-next`、`vue-picture-cropper`）需显式导入。
- **图片/图标**：
  - 图片使用 `Image` 组件，禁用原生 `img`。
  - 图标优先使用 UnoCSS (e.g. `i-mdi-home`)，其次 Lucide。
- **UI 风格**：Bento Grid 布局，深圆角，暗黑模式优先，主色调 `primary`。

## UI 状态与通知规范
- **统一 UI 管理**：使用 `useUIManager` 管理全局 Tooltip、Toast 和 Dialog 生命周期。
  - 弹窗打开/关闭时需调用 `onDialogOpen`/`onDialogClose` 以正确清理状态。
- **提示反馈**：
  - 优先使用 `ResultToast.vue` 提代最终操作反馈（支持详细描述和可选动作）。
  - 避免在应用界面内使用 `window.utools.showNotification`，仅在应用不可见时作为降级。
- **滚动条保护**：使用 `isTooltipEnabled` 状态控制 Tooltip 显隐，避免销毁整个 Provider 导致布局重绘或滚动条复位。
- **帮助信息**：统一使用 `FaqNotice.vue` 承载提示、说明和免责声明。

## 书签功能约定
- **图标获取**：1. DuckDuckGo 2. uTools ubrowser HTML 解析 3. 失败则回退为文字图标。
- **图标编辑**：支持输入 1-4 字文字图标、文件上传、**剪贴板粘贴图像**，支持使用 `vue-picture-cropper` 进行裁剪。
- **链接检测**：使用 `siteProbe.ts` 进行可达性检测（HEAD/GET 自动切换，3s 超时）。
- **搜索增强**：
  - 支持拼音模糊匹配（标题、描述、标签）。
  - 在全局搜索（uTools 框）中，回车直接打开首位结果。
- **AI 辅助**：调用 `window.utools.askAI` 生成标题/描述，用户可在设置中关闭自动生成。

## 分享与同步约定
- **数据流向**：
  - **分享者**：修改后需手动或自动同步到服务器。
  - **接收者**：数据保留在本地，服务器有更新时提示（静默检查或手动）。
- **同步反馈**：更新已导入分组时，Toast 需展示详细的“新增/移除”项目列表。
- **只读约束**：导入的分组（`sourceShareId` 存在）视为只读，UI 上隐藏增删改按钮。
- **UI 区分**：
  - 我分享的分组：蓝色虚线边框 (`border-blue-500/50`)。
  - 我导入的分组：绿色虚线边框 (`border-green-500/50`)。
- **冲突处理**：同名分组导入时支持“合并”或“重命名”。

## 其他沉淀
- 破坏性操作必须通过应用内 `Dialog` 二次确认。
- 定位：极简、高效、高审美的 uTools 书签管理工具。