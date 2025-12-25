# 项目规则（读取后遵守）
- 修改后请记住要 pnpm build 生成 dist 文件。
- **同步要求**：需求改动、功能新增或删除，必须同步更新到本 `AGENTS.md` 文件中。

## 响应规范
- 始终使用中文回复。
- 改动最小化，不随意波及其他模块。
- 风格需与当前文件保持一致。
- `App.vue` 保持精简，仅负责全局布局和状态分发，业务逻辑封装在 composables 中。
- **遇到响应式或者存储问题优先排查 shadcn-vue 的组件使用方法是否正确, shadcn-vue 是基于 reka-ui (Radix Vue 的继承者) 的**

## 开发环境与部署
- **运行环境**：预设运行在 uTools 插件环境 (版本 7.3.2)，不单独考虑纯浏览器完全兼容。
- **构建/调试**：macOS + pnpm。不要重复执行 `pnpm dev`（默认已启动）。
- **部署配置**：服务器 IP `43.142.149.157`，通过 GitHub Actions 自动化部署到 `/opt/1panel/apps/marks.com/index/server`。
- **软/硬链接**：禁止改动项目根目录下文件的链接关系。

## 技术/组件约束
- **核心**：Vue 3 + Vite + Pinia + UnoCSS + Tailwind CSS。
- **UI 库**：**shadcn-vue** (Radix Vue/Reka UI)。
  - **禁止手动导入 UI 组件**：`src/components/ui/` 下的组件已通过 `unplugin-vue-components` 自动注册。
  - **手动导入**：业务组件（如 `FaqNotice`）、第三方库（`vuedraggable`、`lucide-vue-next`、`vue-picture-cropper`）需显式导入。
- **图片/图标**：
  - 图片使用 `Image` 组件，禁用原生 `img`。
  - 图标优先使用 UnoCSS (e.g. `i-mdi-home`)，其次 Lucide。
- **UI 风格**：Bento Grid 布局，深圆角，暗黑模式优先，主色调 `primary`。

## UI 状态与通知规范
- **统一 UI 管理**：使用 `useUIManager` 管理全局 Tooltip、Toast 和 Dialog 生命周期。
  - 弹窗打开/关闭时需调用 `onDialogOpen`/`onDialogClose` 以正确清理状态。
- **动画锚点规范**：全局弹窗（Toast/Dialog）支持从触发位置"生长"展开：
  - 调用 `showToast` 时传入 `anchor: { element }` 指定触发元素
  - 动画使用 CSS `@starting-style` + `allow-discrete` 实现零闪烁入场/退场
  - `transform-origin` 根据锚点位置自动计算（见 `calcAnimationOrigin`）
- **提示反馈**：
  - 优先使用 `ResultToast.vue` 提代最终操作反馈（支持详细描述和可选动作）。
  - 避免在应用界面内使用 `window.utools.showNotification`，仅在应用不可见时作为降级。
- **滚动条保护**：使用 `isTooltipEnabled` 状态控制 Tooltip 显隐，避免销毁整个 Provider 导致布局重绘或滚动条复位。
- **帮助信息**：统一使用 `FaqNotice.vue` 承载提示、说明和免责声明。

## 书签核心功能
- **图标获取与编辑**：
  - 获取：1. DuckDuckGo 2. uTools ubrowser HTML 解析 3. 失败则回退为文字图标。
  - 编辑：支持输入 1-4 字文字图标、文件上传、**剪贴板粘贴图像**，支持使用 `vue-picture-cropper` 进行裁剪。
- **链接检测**：使用 `siteProbe.ts` 进行可达性检测（HEAD/GET 自动切换，3s 超时）。
- **搜索增强**：
  - 支持拼音模糊匹配（标题、描述、标签）。
  - 在全局搜索（uTools 框）中，回车直接打开首位结果。
- **模板书签**：
  - 支持 `{占位符}` 语法，唤起专用 `TemplateSearch.vue` 界面。
  - 进入模板模式时暂停背景同步，使用 uTools 子输入框接收参数。
- **回收站机制**：书签删除后进入 `TRASH_GROUP_ID` 分组，支持清空回收站。
- **多分类管理**：书签可同时关联至多个子分组（`CategoryMultiSelect.vue`）。
- **AI 辅助**：调用 `window.utools.askAI` 生成标题/描述，用户可在设置中关闭自动生成。

## 分享、同步与导入
- **数据同步**：
  - **分享者**：修改后手动或自动同步到服务器。
  - **接收者**：本地保留副本，服务器有更新时提示或自动合并。
- **同步反馈**：更新已导入分组时，Toast 展示详细的“新增/移除”项目列表。
- **只读与 UI 区分**：
  - 导入的分组（`sourceShareId` 存在）为只读，UI 隐藏增删改按钮。
  - 我分享的分组：蓝色虚线边框 (`border-blue-500/50`)。
  - 我导入的分组：绿色虚线边框 (`border-green-500/50`)。
- **智能导入**：
  - 同名分组导入时，支持通过 `NameConflictDialog.vue` 选择“合并”或“重命名（新建）”。
  - 支持 `updateFromShare` 增量更新。

## 设置与体验
- **偏好设置**：网格列数 (2-5)、搜索自动退出时间、标签页布局 (wrap/scroll)、自动关闭窗口、优先使用内置浏览器等。
- **窗口管理**：支持动态调整窗口高度 (`setExpendHeight`)。

## 其他沉淀
- 破坏性操作必须通过应用内 `Dialog` 二次确认。
- **组件交互规范**：
  - **Switch 绑定**：`shadcn-vue` (Reka UI) 的 `Switch` 必须使用 `v-model:checked` 进行双向绑定。
  - **状态持久化与销毁**：对于悬停显示的交互组件（如 Switch），若其操作会触发全局重绘（如切换主题），应优先使用 `v-show` 而非 `v-if`，以防止组件在状态变更瞬间被销毁导致同步中断。
  - **冒泡控制**：在嵌套的点击区域中，务必使用 `@click.stop` 隔离事件。
- 定位：极简、高效、高审美的 uTools 书签管理工具。