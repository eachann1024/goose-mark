## 2026-03-01 全局提示仅首次展示

- [x] 梳理右上角全局提示触发链路与持久化状态
- [x] 将全局提示中心改为“每个提示 ID 仅展示一次”
- [x] 运行 `bun run build` 验证并更新 `dist`
- [x] 记录本次 review 结论

## Review

- 根因（本次）：`useFeatureNoticeCenter` 只对“是否在当前队列”去重，没有“已展示历史”持久化，导致同类全局提示在后续会话会再次出现。
- 修复（本次）：新增 `GLOBAL_NOTICE_SEEN_KEY` 持久化映射；`enqueueNotice` 改为先判断 `isNoticeSeen`，首次入队后立即 `markNoticeSeen`，确保每个提示 ID 仅首次展示一次。
- 验证（本次）：`bun run build` 通过并更新 `dist`，无新增构建错误。

## 2026-03-01 全局提示策略优化

- [x] 将“已展示”打点时机改为“提示真正成为当前可见项”
- [x] 按提示类型拆分策略：公告一次性、设备风险按条件触发并加冷却
- [x] 运行 `bun run build` 验证并更新 `dist`
- [x] 补充本次 review 记录

## Review（策略优化）

- 根因（优化前）：一次性逻辑在 `enqueueNotice` 阶段就写入“已展示”，当队列里有后续提示但尚未真正显示时，可能被提前吞掉。
- 修复（本次）：新增 `NOTICE_DISPLAY_STRATEGY`，将 `local-mode-intro` 设为 `once`，`local-mode-device-path` 设为 `conditional`；并改为 `watch(activeNotice)` 在提示真正成为当前可见项时才写入“已展示”。
- 修复（本次）：为 `local-mode-device-path` 增加 12 小时冷却（`DEVICE_PATH_PROMPT_COOLDOWN_UNTIL_KEY`），忽略后进入冷却，配置成功或条件消失时清除冷却，避免永久静默。
- 验证（本次）：`bun run build` 通过并更新 `dist`，无新增构建错误。
