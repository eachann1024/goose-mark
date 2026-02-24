# 本地实时数据契约（Chrome 新标签扩展）

> 状态：已定义并落地  
> 版本：`goose-marks.local-data.v1`

## 1. 目标

定义“数据提供端 -> 本地文件 -> 新标签扩展消费端”的统一契约。  
扩展只需要读取本地文件，不依赖任何运行时私有 API。

## 2. 文件位置与刷新机制

- 目录：`<runtime-user-data>/goose-marks-sync/`
- 文件：`snapshot.json`
- 刷新：数据变更后防抖写入（500ms）
- 写入方式：原子替换（先写 `snapshot.tmp`，再重命名为 `snapshot.json`）

说明：消费端在读取时只读取 `snapshot.json`，不要读取 `snapshot.tmp`。

### 2.1 跨设备路径策略（2026-02-24）

- `本地优先开关` 允许跟随同步。
- `本地目录路径` 按设备独立配置，不直接跟随同步覆盖。
- 当新设备同步到“本地优先已开启”但尚未配置本机路径时：
  - 右上角弹窗提示用户选择本地路径。
  - 进入安全模式：启动时只读云端数据，不执行本地快照覆盖。

## 3. 顶层格式

```json
{
  "schemaVersion": "goose-marks.local-data.v1",
  "generatedAt": "2026-02-24T01:23:45.678Z",
  "revision": 1761288225678,
  "data": {
    "groups": [],
    "bookmarks": []
  },
  "meta": {
    "recordCount": 0,
    "checksum": "f7c8a1..."
  }
}
```

## 4. 字段定义

### 4.1 顶层字段

- `schemaVersion`: `string`，固定为 `goose-marks.local-data.v1`
- `generatedAt`: `string`，ISO 8601 时间
- `revision`: `number`，毫秒时间戳，用于增量判断
- `data.groups`: `Group[]`
- `data.bookmarks`: `Bookmark[]`
- `meta.recordCount`: `number`，等于 `data.bookmarks.length`
- `meta.checksum`: `string`，对核心内容计算的 SHA-256 摘要

### 4.2 Group

```ts
type Group = {
  id: string
  name: string
  children: SubGroup[]
  lastSyncedAt?: number
  createdAt: number
  updatedAt: number
  serverUpdatedAt?: number
  isDeleted?: boolean
  shareId?: string
  sourceShareId?: string
}
```

### 4.3 SubGroup

```ts
type SubGroup = {
  id: string
  name: string
  bookmarkIds: string[]
  lastSyncedAt?: number
  createdAt: number
  updatedAt: number
  serverUpdatedAt?: number
  isDeleted?: boolean
  shareId?: string
  sourceShareId?: string
}
```

### 4.4 Bookmark

```ts
type BookmarkLocation = {
  groupId: string
  subGroupId: string
}

type IconSource =
  | { type: 'file'; path: string; hash?: string; fetchedAt?: number; bgColor?: string }
  | { type: 'remote'; src: string; cache?: string; fetchedAt?: number; bgColor?: string }
  | { type: 'text'; value: string; bgColor?: string }
  | { type: 'custom'; data: string; bgColor?: string }

type Bookmark = {
  id: string
  title: string
  url: string
  desc?: string
  tags: string[]
  icon?: IconSource
  pinned?: boolean
  locations?: BookmarkLocation[]
  prevLocations?: BookmarkLocation[]
  allowUniversal?: boolean
  iconMatchedAt?: number
  iconMatchFailedAt?: number
  iconMatchFailedReason?: string
  createdAt: number
  updatedAt: number
  serverUpdatedAt?: number
  isDeleted?: boolean
}
```

## 5. 消费端读取规则（扩展侧）

1. 启动时读取一次 `snapshot.json`。
2. 轮询检测文件更新时间（建议 1s~2s），或使用文件监听。
3. 仅当 `revision` 变大时才重新解析。
4. `schemaVersion` 不匹配时走迁移或降级提示。
5. 解析失败时保留上一次可用数据，避免页面空白。

## 6. 数据一致性规则

1. `bookmarkIds` 是排序源，UI 列表顺序以它为准。
2. `bookmarks` 是实体池，`bookmarkIds` 通过 `id` 关联。
3. `isDeleted=true` 的实体默认不展示。
4. 回收站实体由 `locations` 指向回收站分组判定，不另建新结构。

## 7. 兼容与升级

1. 增加字段：向后兼容，消费端应忽略未知字段。
2. 删除/重命名字段：必须升级 `schemaVersion`。
3. 消费端建议保留最近一次成功载入缓存，升级失败时回退。

## 8. 当前落地情况

- 数据提供端已实现本地实时镜像输出。
- 当前写入策略：防抖 + 原子替换 + 校验摘要。
- 扩展可直接按本契约接入读取，不影响现有业务逻辑。
