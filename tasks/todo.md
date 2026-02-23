# Todo

- [x] 定位默认 Tab 与设置页导入实现差异
- [x] 修复默认 Tab 导入在 uTools 读取失败时无反馈且不生效的问题
- [x] 运行 `bun run build` 验证构建与类型
- [x] 定位设置页切换无效与卡死问题
- [x] 修复分类管理页运行时异常导致的空白/假死
- [x] 运行 `bun run build` 验证本次修复
- [x] 定位启动后 favicon 418 报错风暴与卡死链路
- [x] 为 favicon 抓取添加失败冷却，避免同源重复请求
- [x] 修复 uTools 图标抓取回退窗口未释放风险
- [x] 运行 `bun run build` 验证本次修复
- [x] 重做设置页左侧菜单的深浅色选中样式
- [x] 全局移除 focus / focus-visible 选中效果
- [x] 运行 `bun run build` 验证本次修复
- [x] 将 AI 默认模型调整为 deepseek-v3.2
- [x] 运行 `bun run build` 验证本次修复

## Review

- 根因：默认 Tab 优先走 `utools.showOpenDialog + readFileSync`，当 `readFileSync` 不可用/失败时静默返回，未进入导入逻辑。
- 修复：在引导导入中增加双重读取（`utools.readFileSync` + `window.require('fs')` 回退），失败时给出通知并回退到原生 `input[type=file]`。
- 验证：`bun run build` 通过，`dist` 已重新生成。
- 根因（本次）：`src/views/settings/CategoryManager.vue` 使用 `TRASH_GROUP_ID` 但未导入，进入“分类管理”触发运行时异常，导致右侧内容空白且反复切换会卡顿。
- 修复（本次）：补充 `TRASH_GROUP_ID` 导入，恢复分类页与设置页切换渲染链路。
- 验证（本次）：`bun run build` 通过，`dist` 已重新生成。
- 根因（待验证）：部分站点 `favicon.ico` 返回 418 时被重复请求，叠加 uTools 高成本图标抓取回退导致主线程与资源压力升高。
- 修复（本次）：为 favicon 同源 4xx 增加 10 分钟冷却；uTools 回退分支执行后强制关闭/销毁隐藏窗口；调试日志仅在开发环境输出。
- 验证（本次）：`bun run build` 通过，`dist` 已重新生成。
- 根因（本次）：设置侧栏选中态在不同主题下对比度不稳定，同时组件默认 focus ring 造成全局“黄框/描边”视觉干扰。
- 修复（本次）：重做设置侧栏选中/悬停样式（深浅色分离），并通过全局 CSS 移除 `focus/focus-visible` 的 outline 和 ring。
- 验证（本次）：`bun run build` 通过，`dist` 已重新生成。
- 修复（本次）：AI 调用在未开启自定义模型时，默认传 `deepseek-v3.2`；设置页文案同步为 `deepseek-v3.2`。
- 验证（本次）：`bun run build` 通过，`dist` 已重新生成。
