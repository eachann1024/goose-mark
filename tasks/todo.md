# Todo

- [x] 梳理“本地备份”相关界面文案与入口名称
- [x] 统一替换为“浏览器拓展”语义并保持提示文案一致
- [x] 调整设置页右侧菜单内容上边距，修复与左侧不平行
- [x] 运行 `bun run build` 验证并更新 `dist`
- [x] 根据截图反馈再次上移右侧内容区，改为顶边贴齐
- [x] 运行 `bun run build` 验证二次修复并更新 `dist`

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

## 2026-02-24 新标签扩展计划

- [x] 梳理当前项目数据结构、持久化键与导入导出格式
- [x] 明确“导航新增新标签页”与现有 `bookmarks/settings` 结构的改造点
- [x] 输出浏览器扩展实施方案（含新手引导导入 uTools 数据）
- [ ] 新增导航项：`newtab`（不破坏现有书签与设置入口）
- [ ] 抽离共享数据层（统一 Bookmark/Group/SubGroup 校验与迁移）
- [ ] 实现 uTools 端自动落盘镜像（防抖 + 原子写入 + 失败告警）
- [ ] 实现扩展端首次引导导入（选择镜像文件 + 版本校验 + 升级迁移）
- [ ] 实现新标签页界面（时钟 + 月日周 + 分组切换）
- [ ] 实现每小时背景图更新与前景可读性融合
- [ ] 完成 CRUD 全链路自动同步验证（增删改查 + 排序 + 回收站）
- [ ] 运行 `bun run build` 验证构建并更新 `dist`

## 2026-02-24 本地模式提示与跨设备路径改造

- [x] 新增右上角新功能提示中心组件（支持“立即查看 / 暂时忽略”）
- [x] 忽略后在设置页“本地模式”菜单展示红点，进入页面后清除
- [x] 本地存储路径改为“设备独立配置”，不跟随同步覆盖
- [x] 同步到新设备且本地优先开启但未配置路径时，弹窗提示选择本地路径
- [x] 未配置路径时启用安全模式：跳过启动本地覆盖，避免误覆盖
- [x] 本地模式设置页精简为单行路径展示，并支持修改/恢复默认
- [x] 补充 AI 提示词与文档说明，覆盖本次新功能行为
- [x] 运行 `bun run build` 验证并生成 `dist`

## 2026-02-24 浅色模式分组样式修复

- [x] 排查主分组与二级分组 hover/active 在浅色模式失效的样式覆盖链路
- [x] 移除误伤浅色模式的全局 `!important` 背景覆盖规则
- [x] 调整主分组与二级分组浅色 hover/active 样式，提高可见性并保持深色模式表现
- [x] 运行 `bun run build` 验证并生成 `dist`

## 2026-02-24 分组选中态组件重构（浅色模式）

- [x] 复核分组组件样式链路，确认浅色 active 失效的根因
- [x] 重构主分组与二级分组选中样式实现，移除对冲突类名的依赖
- [x] 运行 `bun run build` 验证并更新 `dist`
- [x] 补充 review 记录与 lessons 规则，避免同类问题重复出现

## 2026-02-24 深浅模式独立背景模块

- [x] 设计并新增浅色模式独立背景配置（白色 / #F4F4F4）
- [x] 调整设置页：深色显示深色模块，浅色显示浅色模块，选择互不关联
- [x] 调整 App 背景应用逻辑，按当前模式读取各自配置并应用 class
- [x] 运行 `bun run build` 验证并更新 `dist`
- [x] 追加 review 与 lessons 记录

## 2026-02-24 网址精灵导入与引导体验改造

- [x] 梳理现有导入链路（首页引导 / 设置页）与样例数据结构
- [x] 实现统一导入解析器：支持本应用 JSON、HTML、网址精灵 `data.json`
- [x] 增加边界处理（无效 URL、未知分类、重复分组/书签、空数据提示）
- [x] 首页引导接入统一导入并更新引导词/新手引导文案
- [x] 设置页接入统一导入并补充“网址精灵导入说明”
- [x] 运行 `bun run build` 验证并更新 `dist`
- [x] 补充本次 review 与 lessons 记录

## 2026-02-24 设置页工具精简

- [x] 复核工具设置页可删项与依赖边界，确定最小改动范围
- [x] 删除“无效地址分析”与检测结果相关 UI/逻辑
- [x] 删除低频选项（启动匹配、失败忽略、刷新全局搜索图标）及图标匹配日志展示
- [x] 运行 `bun run build` 验证并更新 `dist`
- [x] 补充本次 review 与 lessons 记录

## 2026-02-24 图标匹配条数与导入后自动触发修复

- [x] 复核缺失图标计数与实际匹配目标不一致的根因
- [x] 在 store 统一“缺失图标候选”计算逻辑，并排除回收站书签
- [x] 工具页条数改为复用统一候选逻辑，确保与按钮操作一致
- [x] 确认导入成功后的自动匹配继续执行并走统一过滤规则
- [x] 运行 `bun run build` 验证并更新 `dist`
- [x] 补充本次 review 与 lessons 记录

## 2026-02-24 缺失图标统计排除回收站（漏判修复）

- [x] 复核“缺失图标条数包含回收站”场景与触发条件
- [x] 修复回收站判定：locations 与分组索引双重校验
- [x] 运行 `bun run build` 验证并更新 `dist`
- [x] 补充本次 review 与 lessons 记录

## 2026-02-24 设置页文案易懂化

- [x] 梳理设置页所有菜单与操作文案，统一术语
- [x] 替换设置导航与各子页文案，降低技术表述门槛
- [x] 全量复查设置页可见文案，避免歧义与风格不一致
- [x] 运行 `bun run build` 验证并更新 `dist`
- [x] 补充本次 review 与 lessons 记录

## 2026-02-24 磁盘 JSON 单一真相源双向同步

- [x] 在 `useLocalDataMirror` 增加 `clientId` 持久化与单调 `revision` 生成
- [x] 在 `useLocalDataMirror` 增加运行期外部快照监听（`fs.watchFile` + Web 轮询回退）
- [x] 在 `useLocalDataMirror` 增加远端应用保护与冲突合并（`updatedAt -> revision -> clientId`）
- [x] 调整启动本地优先逻辑为“加载 + 合并”并保留损坏回写安全策略
- [x] 更新 `docs/newtab-local-data-contract.md` 契约字段与冲突/恢复规则
- [x] 运行 `bun run build` 验证并更新 `dist`
- [x] 追加本次 review 与 lessons 记录

## 2026-02-24 浏览器拓展设置页精简

- [x] 精简“浏览器拓展”设置卡片文案，仅保留关键信息
- [x] 注释并隐藏“浏览器拓展操作”整块模块
- [x] 清理对应未使用脚本逻辑，避免页面冗余
- [x] 运行 `bun run build` 验证并更新 `dist`

## Review

- 根因（本次）：导入链路分散在首页与设置页两套实现，只支持“浏览器 HTML + 本应用 JSON”，无法识别网址精灵 `data.json`，且边界数据缺少统一处理。
- 修复（本次）：新增 `src/composables/useImportExport.ts` 统一导入解析与写入，支持鹅的书签 JSON、网址精灵 `data.json`，并提供 merge/overwrite 通用写入、无效 URL 跳过、未知分类回退、重复去重与 locations 同步修复。
- 修复（本次）：首页引导导入改为复用统一解析器；设置页导入确认弹窗新增“识别来源/跳过数量/边界提示”，并补充网址精灵 data.json 使用说明。
- 验证（本次）：`bun run build` 通过并更新 `dist`；`bun run type-check` 仍受项目既有 `TS6305`（`vite.config.d.ts`/`uno.config.d.ts`）影响失败，与本次功能改动无直接关系。
- 修复（追加）：导入文件选择器移除扩展名限制，支持选择无后缀 `data` 文件；导入提示文案同步更新为 `data.json / data`。
- 验证（追加）：`bun run build` 通过并更新 `dist`。
- 修复（追加2）：网址精灵 `cat@dustbin` 改为映射系统回收站（`g-trash/sg-trash`），`cat@default` 映射默认分组，移除“网址精灵导入”伪分组来源。
- 验证（追加2）：`bun run build` 通过并更新 `dist`。
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
- 现状（本次规划）：数据主结构为 `groups + bookmarks`，并通过 Pinia persistedstate 按 store id 持久化到 `utools.dbStorage`（回退 `localStorage`）。
- 风险（本次规划）：`shareId/sourceShareId` 在视图层被使用但未在核心类型中显式声明，扩展接入前需统一 schema。
- 结论（本次规划）：扩展侧首版应以“导入 uTools 落盘镜像文件”桥接，避免直接依赖浏览器环境不可用的 uTools API。
- 根因（本次）：本地路径跟随 settings 同步会把 A 设备绝对路径带到 B 设备，开启本地优先后存在误覆盖风险。
- 修复（本次）：新增 `FeatureNoticeCenter` + `useFeatureNoticeCenter` 统一管理右上角提示/忽略红点；本地路径改为设备本地键持久化并从 settings 持久化中排除；同步 settings 时忽略远端路径并回填本机路径。
- 修复（本次）：当“本地优先”已开启但当前设备未配置路径时，启动阶段跳过本地覆盖并弹窗提示选择路径；设置页改为单行“保存位置”展示并保留路径修改入口。
- 修复（本次）：AI prompt 补充“本地模式 + 扩展 + 跨设备路径”上下文；`docs/newtab-local-data-contract.md` 新增跨设备路径策略说明。
- 验证（本次）：`bun run build` 通过，`dist` 已重新生成。
- 根因（本次）：`App.vue` 存在 `body:not(.easter-egg-active) .subgroup-sort-item button { background-color: transparent !important; }`，覆盖了浅色模式下二级分组的 hover/active 背景。
- 修复（本次）：删除上述全局覆盖，改为由组件内状态类控制；主分组按钮改用浅色 `bg-muted` + 深色 `bg-accent` 的分离方案，二级分组同样分离浅/深色交互态。
- 验证（本次）：`bun run build` 通过，浅色模式下主分组与二级分组 hover/选中可见，深色模式样式保持不变。
- 根因（本次）：`bg-muted/text-foreground/border-l-primary` 等同名类被 UnoCSS 生成规则覆盖为 `var(--token)`，但项目 token 值是 HSL 片段（如 `210 40% 96.1%`），浅色模式下关键背景/边框声明无效。
- 修复（本次）：重构 `GroupTabs.vue` 与 `SubGroupItem.vue` 的选中态实现，改为组件内显式 `hsl(var(--token))`，并用状态类 `group-tab-btn / subgroup-btn--active` 接管 hover 与 active 表现。
- 验证（本次）：`bun run build` 通过并生成新 `dist`；分组与子分组在浅色/深色模式都具备稳定可见的选中反馈。
- 根因（本次）：背景设置只有深色配置，浅色模式下无法独立选择“白色 / uTools 灰”，切换明暗模式后缺少独立记忆。
- 修复（本次）：`settings` 新增 `lightBackgroundStyle`（`white | utools`）；设置页按当前模式切换模块展示；`App.vue` 监听深浅模式分别应用 `easter-egg/solid` 与 `light-white/light-utools` class。
- 验证（本次）：`bun run build` 通过并生成新 `dist`；深色与浅色背景选择可独立保存，互不覆盖。
- 根因（本次）：工具设置页叠加了“无效地址分析 + 图标日志 + 低频开关”等重操作，用户主路径中使用率低且干扰核心操作。
- 修复（本次）：`ToolsSettings.vue` 仅保留“匹配缺失图标”主能力，删除无效地址分析、检测结果面板、低频开关与图标匹配日志展示。
- 验证（本次）：`bun run build` 通过并生成新 `dist`；设置页工具模块已收敛为单卡片主操作。
- 根因（本次）：工具页“缺失图标”条数按全量书签计算，而匹配操作会跳过失败标记书签，导致数字与实际处理数量不一致。
- 修复（本次）：在 `bookmark store` 新增统一候选计算（`getMissingIconCandidates/countMissingIconCandidates`），工具页与匹配动作共用同一规则；并明确排除回收站书签。
- 验证（本次）：`bun run build` 通过并生成新 `dist`；导入成功后仍会触发自动匹配，且匹配范围不再包含回收站。
- 根因（本次）：`isBookmarkInTrash` 在 `locations` 非空时提前返回，遇到历史数据 `locations` 与分组索引不一致时会漏判回收站书签，导致“缺失图标”计数偏大。
- 修复（本次）：`isBookmarkInTrash` 改为“位置 + 分组索引”双重判定，并额外识别 `sg-trash` 子分组，确保统计与匹配均排除回收站。
- 验证（本次）：`bun run build` 通过并生成新 `dist`；工具页缺失图标计数不再包含回收站条目。
- 根因（本次）：设置页多处沿用“快照/覆盖/模式”等技术词，普通用户难以快速理解操作后果，导航术语也存在不统一。
- 修复（本次）：统一设置导航与 6 个设置子页文案，重点将“本地快照/覆盖”改为“本地备份/恢复”，并同步 App 通知与入口提示词，保持全链路一致。
- 验证（本次）：`bun run build` 通过并更新 `dist`；设置页菜单与关键操作文案已统一为更易懂表述。
- 根因（本次）：本地数据入口文案仍存在“本地备份”旧称，且设置页右侧内容顶部留白偏大，造成左右区块不平行。
- 修复（本次）：统一 `SettingsLayout/LocalModeSettings/App/useFeatureNoticeCenter` 的可见文案为“浏览器拓展（数据）”，并把设置页右侧内容区上边距改为 `pt-3`。
- 验证（本次）：`bun run build` 通过并更新 `dist`，构建无新增错误。
- 根因（追加）：首次上移仅从 `pt-6` 调整到 `pt-3`，与左侧外框仍有可见顶边差，未达到“平行贴齐”。
- 修复（追加）：设置页右侧内容区进一步改为 `pt-0`，消除顶部残余留白。
- 验证（追加）：`bun run build` 通过并更新 `dist`，二次修复已产出可发布文件。
- 根因（本次）：本地镜像仅支持“整包覆盖 + 时间戳写入”，缺少客户端标识、单调 revision、运行期外部变更监听与记录级冲突合并，导致双端并发编辑存在覆盖抖动风险。
- 修复（本次）：重写 `useLocalDataMirror`：新增 `writerClientId/writtenAt` 写入、单调 revision（`max(Date.now(), lastSeenRevision + 1)`）、`fs.watchFile`/轮询监听、远端应用静默窗、防循环回写、以及 `updatedAt -> revision -> clientId` 的记录级合并并回写收敛。
- 修复（本次）：更新 `docs/newtab-local-data-contract.md`，补充元字段、冲突判定、快速丢弃规则和异常恢复约束，形成可供独立扩展仓库直接对接的契约。
- 验证（本次）：`bun run build` 通过并更新 `dist`，无新增构建错误。
