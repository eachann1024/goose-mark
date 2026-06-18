# 项目规则（读取后遵守）
- 修改后请记住要 bun run build 生成 dist 文件。
- 埋点我想看的是每个用户有没有用这个功能 这种一个功能一天用多少次

## 规范
- 始终使用中文回复
- 技术栈：React 19 + TypeScript + zustand + Tailwind v4，UI 基于 HeroUI v3 / react-aria-components。
- `App.tsx` 保持精简，仅负责全局布局和状态分发，业务逻辑封装在 `src/hooks/` 与 `src/stores/` 中。
- 构建/调试：不要重复执行 `bun run dev`（默认已启动）。
- `src/components/ui/` 下已有基础组件（button/dialog/popover/image 等），优先复用，不要重复造。
- 图片使用 `Image` 组件（`src/components/ui/image`），禁用原生 `img`。
- 组件使用应参考 HeroUI v3 与 react-aria-components 文档（context7 可查）。

## UI 审美（对标 Claude 官网，克制现代）
- 配色为暖灰 + 珊瑚橙（`home.css :root` 的 `--accent`/`--accent-subtle`/`--surface` 等 token），禁止 `#000`/`#fff` 硬编码，一律用现成 token。
- 选中/激活态一律**胶囊填充**：选中 = `--accent-subtle` 背景 + `--accent` 文字 + 圆角；hover = `--surface` 浅垫底（选中深度 ≥ hover）。**禁用下划线式 Tab（border-bottom 选中）**。
- 动效只过渡 `color`/`background-color`，不动 layout 属性（不靠 border 撑高度）。
- UI 改动须浅色 + 深色双模式浏览器实跑截图核对，build 通过 ≠ 视觉对。
