# 项目规则（读取后遵守）
- 修改后请记住要 bun run build 生成 dist 文件。
- "dev": "vite --port 7001",

## 规范
- 始终使用中文回复。
- 改动最小化，不随意波及其他模块。
- 风格需与当前文件保持一致。
- `App.vue` 保持精简，仅负责全局布局和状态分发，业务逻辑封装在 composables 中。
- 遇到响应式或者存储问题优先排查 shadcn-vue 的组件使用方法是否正确, shadcn-vue 是基于 reka-ui (Radix Vue 的继承者) 的
- 构建/调试：不要重复执行 `bun run dev`（默认已启动）。

## 技术/组件约束
- 核心：Vue 3 + Vite + Pinia + UnoCSS + Tailwind CSS。
- UI 库：shadcn-vue (Radix Vue/Reka UI)。
  - 禁止手动导入 UI 组件：`src/components/ui/` 下的组件已通过 `unplugin-vue-components` 自动注册。
  - 手动导入：业务组件（如 `FaqNotice`）、第三方库（`vuedraggable`、`lucide-vue-next`、`vue-picture-cropper`）需显式导入。
- 图片/图标：
  - 图片使用 `Image` 组件，禁用原生 `img`。
