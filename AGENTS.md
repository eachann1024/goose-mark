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
- 支持一级/二级分类、搜索；添加书签默认存在一级分组，可按需创建二级。
- 图标获取优先使用本机网络，成功后永久持久化到 userData/bookmarks-icons，24h 冷却；缺失图标支持批量补全；书签编辑时 URL 变更且无图标才重抓。
- 默认图标为文字首字母；回退必须可靠。
- 设置页包含：缺失图标批量匹配、无效地址检测（本机 HEAD/GET，超时 3s）。

## 开发/运行
- 不要重复执行 `pnpm dev`（默认已启动时）。
- 调试 uTools：插件中心 -> 开发者工具 -> 选择本目录；控制台在右上角“查看控制台”。

## 角色参考
- 前端：Evan You / Monterail / Bacancy
- Node 后端：Ryan Dahl / Guillermo Rauch / Azat Mardan

## 其他
- 遵守 Anti-Slop 标准：零废话注释、避免过度防御、类型安全、一致风格。
- 软/硬链接（含本文件）禁止改动链接关系。
