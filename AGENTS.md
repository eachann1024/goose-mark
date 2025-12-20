# 项目规则（读取后遵守）

## 响应规范
- 始终使用中文回复。
- 代码简洁实用，控制圈复杂度，能复用则复用。
- 改动最小化，不随意波及其他模块。
- 禁止过度防御和多余注释（仅在逻辑复杂时解释“为什么”）。
- 禁用 `as any`，保持类型安全。
- 风格需与当前文件保持一致。

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

## 可复用约定（沉淀）
- 操作完成需“最终结果反馈”时，优先用 `src/components/ResultToast.vue`（支持标题/描述/可选动作按钮），避免到处手写 Toast。
- 轻量系统提示（不需要留在应用内）统一用 `src/lib/notify.ts` 的 `notify`（内部优先 `window.utools.showNotification`，无 uTools 降级 `console.info`）。
- 链接可达性检测统一走 `src/services/siteProbe.ts` 的 `probeUrl`（内置 URL 规范化、模板地址跳过、HEAD→GET 回退、默认 3s 超时）。
- 破坏性操作（清空/删除不可逆）优先用应用内 `Dialog` 二次确认，并在完成后给 `ResultToast` 最终反馈（必要时提供“复制列表”动作）。
