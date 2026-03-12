# 项目规则（读取后遵守）
- 修改后请记住要 bun run build 生成 dist 文件。
- "dev": "vite --port 7001",

## 规范
- 始终使用中文回复
- `App.vue` 保持精简，仅负责全局布局和状态分发，业务逻辑封装在 composables 中。
- 构建/调试：不要重复执行 `bun run dev`（默认已启动）。
- 禁止手动导入 UI 组件：`src/components/ui/` 下的组件已通过 `unplugin-vue-components` 自动注册。
- 图片使用 `Image` 组件，禁用原生 `img`。
- 组件使用应参考 reka-ui 和 shadcn-vue 文档

## UI 设计风格：Grouped Inset（Apple 分组内嵌）

采用 Apple macOS System Settings 风格，核心原则：**无边框、分层表面、重内容轻装饰**。

- **画布底色**（`bg-background`）作为最底层灰色背景，所有内容区域用**白色圆角色块**（`settings-block` / `bg-card`）浮于其上
- **禁止用 border 划分区域**，用背景色差替代描边；输入框、选择器等表单元素使用 `border-0` + `bg-muted/20` 或 `bg-transparent`
- **按钮 hover**：ghost 按钮使用 `bg-foreground/8` 半透明前景色，不要使用 `bg-accent`（暗色模式下太深会遮挡文字）
- **对话框 / 弹窗**：底色用 `bg-background`（与主界面一致），内部用 `settings-block` 色块分组
- **留白要充足**：色块之间 `gap-3`，色块内 `padding: 0.75rem~1rem`，避免拥挤