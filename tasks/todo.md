# Todo

- [x] 梳理 uTools 现有入口、AI 可用性判断与进入处理链路
- [x] 新增按 AI 可用性动态显示的「AI 快速保存」入口，并接入进入处理
- [x] 构建并确认产物已更新到 dist

## Review

- 通过 uTools 动态 feature 追加 `AI 快速保存`，开启 AI 且当前配置可用时显示，关闭或不可用时自动移除。
- `ai_quick_save` 进入后复用现有快速保存链路，并在可用时先走 AI 生成标题/简介，失败时自动回退普通快速保存。
- `bun run build` 已执行，dist 产物已更新；`bun run type-check` 仍被仓库现有 TS6305 配置问题阻塞。
