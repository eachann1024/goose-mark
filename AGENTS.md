# 项目规则（读取后遵守）
- 修改后请记住要 bun run build 生成 dist 文件。
- 埋点我想看的是每个用户有没有用这个功能 这种一个功能一天用多少次

## 规范
- 始终使用中文回复
- `App.vue` 保持精简，仅负责全局布局和状态分发，业务逻辑封装在 composables 中。
- 构建/调试：不要重复执行 `bun run dev`（默认已启动）。
- 禁止手动导入 UI 组件：`src/components/ui/` 下的组件已通过 `unplugin-vue-components` 自动注册。
- 图片使用 `Image` 组件，禁用原生 `img`。
- 组件使用应参考 reka-ui 和 shadcn-vue 文档
