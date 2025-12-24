# 富文本笔记编辑功能规划

> 状态：📋 待开发  
> 创建日期：2025-12-25

---

## 功能概述

将书签描述从纯文本升级为富文本笔记，支持完整的编辑功能，并通过抽屉（Drawer）形式提供沉浸式编辑体验。

---

## 核心需求

### 1. 描述字数扩展

- **当前**：`maxDescLen = 300`
- **目标**：`maxDescLen = 300`
- **改动文件**：`src/composables/useBookmarkForm.ts`

### 2. Tiptap 富文本编辑器集成

#### 2.1 支持的格式功能

| 功能 | 优先级 |
|------|-------|
| 粗体 / 斜体 / 下划线 | P0 |
| 标题 (H1-H3) | P0 |
| 有序 / 无序列表 | P0 |
| 任务列表 (Checklist) | P1 |
| 代码块 / 行内代码 | P1 |
| 链接 | P0 |
| 图片插入 | P2 |
| 表格 | P2 |
| Markdown 快捷输入 | P1 |

#### 2.2 依赖安装

```bash
pnpm add @tiptap/vue-3 @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-code-block-lowlight
```

#### 2.3 编辑器入口

- 在描述输入框右下角添加放大图标 `i-mdi-arrow-expand`
- 点击后弹出全屏 Dialog，内含 Tiptap 编辑器
- 支持工具栏快捷操作

### 3. 数据存储格式变更

#### 3.1 存储结构

```typescript
interface Bookmark {
  // ... 其他字段
  desc: string           // 保留原字段，存储纯文本摘要（用于搜索/卡片预览）
  descHtml?: string      // 新增：富文本 HTML 内容
  descFormat?: 'text' | 'html'  // 新增：标识格式类型
}
```

#### 3.2 向后兼容策略

1. 读取时：若 `descFormat` 不存在或为 `'text'`，按纯文本处理
2. 写入时：同时更新 `desc`（纯文本摘要）和 `descHtml`（完整内容）
3. 搜索时：使用 `desc` 字段进行拼音/关键词匹配

### 4. 抽屉（Drawer）完整编辑功能

#### 4.1 触发方式

- 点击书签卡片的图标（头像）→ 打开抽屉
- **不再直接打开链接**

#### 4.2 抽屉方向

- 图标在屏幕左半侧 → 抽屉从**右侧**滑入
- 图标在屏幕右半侧 → 抽屉从**左侧**滑入

#### 4.3 抽屉内容

```
┌─────────────────────────────────────┐
│  [图标]   书签标题                    │
│           https://example.com        │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Tiptap 富文本编辑器          │    │
│  │ - 支持完整格式               │    │
│  │ - 自动保存                  │    │
│  └─────────────────────────────┘    │
│                                     │
├─────────────────────────────────────┤
│  [打开链接]  [复制链接]  [删除]       │
└─────────────────────────────────────┘
```

#### 4.4 使用组件

- `Sheet` (shadcn-vue) 作为抽屉容器
- `side` 属性动态设置为 `"left"` 或 `"right"`

---

## 新增文件

| 文件路径 | 说明 |
|---------|-----|
| `src/components/TiptapEditor.vue` | Tiptap 编辑器封装组件 |
| `src/components/BookmarkDrawer.vue` | 书签详情抽屉组件 |
| `src/components/DescExpandDialog.vue` | 描述放大编辑弹窗 |

---

## 修改文件

| 文件路径 | 改动说明 |
|---------|---------|
| `src/composables/useBookmarkForm.ts` | `maxDescLen` 改为 300，新增 `descHtml` 处理 |
| `src/types/bookmark.ts` | 新增 `descHtml`、`descFormat` 字段 |
| `src/components/BookmarkCard.vue` | 图标点击改为打开抽屉 |
| `src/components/bookmarks/BookmarkFormDialog.vue` | 添加放大编辑入口 |

---

## 注意事项

1. **XSS 防护**：Tiptap 输出的 HTML 需通过 DOMPurify 过滤后再渲染
2. **性能优化**：Tiptap 较重，可考虑异步加载（`defineAsyncComponent`）
3. **移动端适配**：抽屉在小屏幕上可能需要全屏展示

---

## 参考资料

- [Tiptap 官方文档](https://tiptap.dev/)
- [shadcn-vue Sheet 组件](https://www.shadcn-vue.com/docs/components/sheet.html)
