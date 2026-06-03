import { useMemo, useRef, useState } from 'react'
import {
  Upload,
  Download,
  Copy,
  Trash,
  FileCode,
  ChevronDown,
  Loader2,
  Check
} from 'lucide-react'
import {
  parseHtmlBookmarks,
  isHtmlBookmarkFile,
  type ParseResult
} from '@/lib/htmlBookmarkParser'
import type { Group, Bookmark } from '@/types/bookmark'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { useUIManager } from '@/hooks/useUIManager'
import {
  parseJsonImportText,
  applyImportDataToStore
} from '@/hooks/useImportExport'
import {
  Button,
  Input,
  SettingsBlock,
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
  ResultToast,
  type ResultToastState
} from './_ui'
import {
  getBookmarkMutations,
  createBookmarkStoreAdapter
} from './_bookmarkActions'

type ImportMode = 'overwrite' | 'merge'

const INITIAL_TOAST: ResultToastState = {
  visible: false,
  variant: 'info',
  title: ''
}

const requiredClearText = '确认清空'

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

/**
 * DataSettings：导入与备份（JSON 备份导入/导出、浏览器 HTML 书签导入、清空、复制全部）。
 * 对应旧 Vue views/settings/DataSettings.vue，功能等价；无埋点。
 */
export default function DataSettings() {
  const showToast = useUIManager((u) => u.showToast)
  const mutations = useMemo(() => getBookmarkMutations(), [])

  const [importing, setImporting] = useState(false)
  const [importMode, setImportMode] = useState<ImportMode>('merge')
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [pendingImportData, setPendingImportData] = useState<{
    groups: Group[]
    bookmarks: Bookmark[]
  } | null>(null)
  const [pendingImportSourceLabel, setPendingImportSourceLabel] = useState('')
  const [pendingImportWarnings, setPendingImportWarnings] = useState<string[]>(
    []
  )
  const [pendingImportSkipped, setPendingImportSkipped] = useState(0)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [debugOpen, setDebugOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // HTML 导入
  const [showHtmlImportDialog, setShowHtmlImportDialog] = useState(false)
  const [htmlParseResult, setHtmlParseResult] = useState<ParseResult | null>(
    null
  )
  const [selectedHtmlFolders, setSelectedHtmlFolders] = useState<Set<string>>(
    new Set()
  )
  const [htmlImporting, setHtmlImporting] = useState(false)

  const [resultToast, setResultToast] =
    useState<ResultToastState>(INITIAL_TOAST)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const closeResultToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = null
    setResultToast((prev) => ({ ...prev, visible: false, onAction: undefined }))
  }
  const showResultToast = (
    payload: Omit<ResultToastState, 'visible'>,
    timeoutMs = 4500
  ) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setResultToast({ ...payload, visible: true })
    toastTimer.current = setTimeout(closeResultToast, timeoutMs)
  }

  const buildBackupPayload = () => {
    const { groups, bookmarks } = useBookmarkStore.getState()
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      groups,
      bookmarks
    }
  }

  const exportData = () => {
    const json = JSON.stringify(buildBackupPayload(), null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `goose-marks-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showResultToast({
      variant: 'success',
      title: '备份已导出',
      description: '文件已开始下载（JSON）'
    })
  }

  const triggerImport = () => fileInputRef.current?.click()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      if (isHtmlBookmarkFile(text)) {
        const result = parseHtmlBookmarks(text)
        if (result.stats.totalBookmarks === 0) {
          showResultToast(
            {
              variant: 'error',
              title: '导入失败',
              description: '文件里没有可用书签'
            },
            6500
          )
          return
        }
        setHtmlParseResult(result)
        setSelectedHtmlFolders(new Set())
        setShowHtmlImportDialog(true)
      } else {
        const parsed = parseJsonImportText(text)
        if (!parsed.ok) {
          showResultToast(
            { variant: 'error', title: '导入失败', description: parsed.message },
            6500
          )
          return
        }
        setPendingImportData({
          groups: parsed.data.groups,
          bookmarks: parsed.data.bookmarks
        })
        setPendingImportSourceLabel(parsed.sourceLabel)
        setPendingImportWarnings(parsed.warnings)
        setPendingImportSkipped(parsed.stats.skipped)
        setShowImportConfirm(true)
      }
    } catch {
      showResultToast(
        {
          variant: 'error',
          title: '导入失败',
          description:
            '文件无法识别，请选择有效的 JSON（含 data.json）或浏览器导出的 HTML'
        },
        6500
      )
    } finally {
      input.value = ''
    }
  }

  const resetImportState = () => {
    setShowImportConfirm(false)
    setPendingImportData(null)
    setPendingImportSourceLabel('')
    setPendingImportWarnings([])
    setPendingImportSkipped(0)
  }

  const confirmImport = () => {
    if (!pendingImportData) return
    setImporting(true)
    try {
      const { adapter, commit } = createBookmarkStoreAdapter()
      const summary = applyImportDataToStore(
        adapter,
        pendingImportData,
        importMode
      )
      commit()
      const skippedText =
        pendingImportSkipped > 0
          ? `，忽略 ${pendingImportSkipped} 条无效数据`
          : ''
      showResultToast(
        {
          variant: 'success',
          title: '导入完成',
          description:
            importMode === 'overwrite'
              ? `已按“完全替换”导入（${
                  pendingImportSourceLabel || '导入文件'
                }）：当前分组 ${summary.after.groups} / 书签 ${
                  summary.after.bookmarks
                }${skippedText}`
              : `已按“仅新增”导入（${
                  pendingImportSourceLabel || '导入文件'
                }）：新增分组 ${summary.added.groups} / 新增书签 ${
                  summary.added.bookmarks
                }${skippedText}`
        },
        6500
      )
      if (pendingImportWarnings.length > 0) {
        console.warn('[Settings] import warnings:', pendingImportWarnings)
      }
      void mutations.refreshMissingIcons()
    } catch (err) {
      console.error('[Settings] import failed:', err)
      showResultToast(
        {
          variant: 'error',
          title: '导入失败',
          description: '导入过程中出错，请更换备份文件后重试'
        },
        6500
      )
    } finally {
      setImporting(false)
      resetImportState()
    }
  }

  /* --------------------------- HTML 书签导入 --------------------------- */

  const toggleHtmlFolder = (name: string) => {
    setSelectedHtmlFolders((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const cancelHtmlImport = () => {
    setShowHtmlImportDialog(false)
    setHtmlParseResult(null)
    setSelectedHtmlFolders(new Set())
  }

  const confirmHtmlImport = () => {
    if (!htmlParseResult) return
    setHtmlImporting(true)

    const snapshot = useBookmarkStore.getState()
    const groups: Group[] = JSON.parse(JSON.stringify(snapshot.groups))
    const bookmarks: Bookmark[] = JSON.parse(JSON.stringify(snapshot.bookmarks))
    const before = { groups: groups.length, bookmarks: bookmarks.length }

    try {
      const now = Date.now()
      type Folder = ParseResult['folders'][number]
      type FlatSubGroup = { name: string; bookmarks: Folder['bookmarks'] }

      const flattenFolder = (
        folder: Folder,
        pathPrefix: string
      ): FlatSubGroup[] => {
        const result: FlatSubGroup[] = []
        const currentPath = pathPrefix
          ? `${pathPrefix}/${folder.name}`
          : folder.name
        if (folder.bookmarks.length > 0) {
          result.push({ name: currentPath, bookmarks: folder.bookmarks })
        }
        folder.children.forEach((child) => {
          result.push(...flattenFolder(child, currentPath))
        })
        return result
      }

      htmlParseResult.folders
        .filter((folder) => selectedHtmlFolders.has(folder.name))
        .forEach((folder) => {
          let targetGroup = groups.find(
            (g) => g.name === folder.name && g.id !== TRASH_GROUP_ID
          )

          if (!targetGroup) {
            const newGroupId = uid()
            const newGroup: Group = {
              id: newGroupId,
              name: folder.name,
              createdAt: now,
              updatedAt: now,
              children: []
            }

            if (folder.bookmarks.length > 0) {
              const subId = uid()
              const newBookmarks: Bookmark[] = folder.bookmarks.map((b) => ({
                id: uid(),
                title: b.title,
                url: b.url,
                desc: '',
                tags: [],
                createdAt: b.addDate || now,
                updatedAt: now,
                locations: [{ groupId: newGroupId, subGroupId: subId }]
              }))
              newGroup.children.push({
                id: subId,
                name: '未分类',
                bookmarkIds: newBookmarks.map((b) => b.id),
                createdAt: now,
                updatedAt: now
              })
              bookmarks.push(...newBookmarks)
            }

            folder.children.forEach((subFolder) => {
              flattenFolder(subFolder, '').forEach((flatSub) => {
                const subId = uid()
                const subBookmarks: Bookmark[] = flatSub.bookmarks.map((b) => ({
                  id: uid(),
                  title: b.title,
                  url: b.url,
                  desc: '',
                  tags: [],
                  createdAt: b.addDate || now,
                  updatedAt: now,
                  locations: [{ groupId: newGroupId, subGroupId: subId }]
                }))
                if (subBookmarks.length > 0) {
                  newGroup.children.push({
                    id: subId,
                    name: flatSub.name,
                    bookmarkIds: subBookmarks.map((b) => b.id),
                    createdAt: now,
                    updatedAt: now
                  })
                  bookmarks.push(...subBookmarks)
                }
              })
            })

            if (newGroup.children.length === 0) {
              newGroup.children.push({
                id: uid(),
                name: '未分类',
                bookmarkIds: [],
                createdAt: now,
                updatedAt: now
              })
            }

            const trashIdx = groups.findIndex((g) => g.id === TRASH_GROUP_ID)
            if (trashIdx !== -1) groups.splice(trashIdx, 0, newGroup)
            else groups.push(newGroup)
          } else {
            const groupId = targetGroup.id

            if (folder.bookmarks.length > 0) {
              let defaultSub = targetGroup.children[0]
              if (!defaultSub) {
                const subId = uid()
                defaultSub = {
                  id: subId,
                  name: '未分类',
                  bookmarkIds: [],
                  createdAt: now,
                  updatedAt: now
                }
                targetGroup.children.push(defaultSub)
              }
              folder.bookmarks.forEach((b) => {
                const nb: Bookmark = {
                  id: uid(),
                  title: b.title,
                  url: b.url,
                  desc: '',
                  tags: [],
                  createdAt: b.addDate || now,
                  updatedAt: now,
                  locations: [{ groupId, subGroupId: defaultSub.id }]
                }
                bookmarks.push(nb)
                defaultSub.bookmarkIds.push(nb.id)
              })
              defaultSub.updatedAt = now
            }

            folder.children.forEach((subFolder) => {
              flattenFolder(subFolder, '').forEach((flatSub) => {
                let targetSub = targetGroup!.children.find(
                  (c) => c.name === flatSub.name
                )
                if (!targetSub) {
                  const subId = uid()
                  targetSub = {
                    id: subId,
                    name: flatSub.name,
                    bookmarkIds: [],
                    createdAt: now,
                    updatedAt: now
                  }
                  targetGroup!.children.push(targetSub)
                }
                flatSub.bookmarks.forEach((b) => {
                  const nb: Bookmark = {
                    id: uid(),
                    title: b.title,
                    url: b.url,
                    desc: '',
                    tags: [],
                    createdAt: b.addDate || now,
                    updatedAt: now,
                    locations: [{ groupId, subGroupId: targetSub!.id }]
                  }
                  bookmarks.push(nb)
                  targetSub!.bookmarkIds.push(nb.id)
                })
                targetSub.updatedAt = now
              })
            })
            targetGroup.updatedAt = now
          }
        })

      useBookmarkStore.setState({ groups, bookmarks })

      const after = { groups: groups.length, bookmarks: bookmarks.length }
      const addedGroups = Math.max(0, after.groups - before.groups)
      const addedBookmarks = Math.max(0, after.bookmarks - before.bookmarks)

      showResultToast(
        {
          variant: 'success',
          title: '浏览器书签导入完成',
          description: `新增分组 ${addedGroups} / 新增书签 ${addedBookmarks}`
        },
        4000
      )
      void mutations.refreshMissingIcons()
    } catch (err) {
      console.error('[Settings] HTML import failed:', err)
      showResultToast(
        { variant: 'error', title: '导入失败', description: '导入过程中出错' },
        6500
      )
    } finally {
      setHtmlImporting(false)
      setShowHtmlImportDialog(false)
      setHtmlParseResult(null)
      setSelectedHtmlFolders(new Set())
    }
  }

  /* ----------------------------- 调试操作 ----------------------------- */

  const copyAllData = async () => {
    const json = JSON.stringify(buildBackupPayload(), null, 2)
    if (!navigator.clipboard) {
      showToast({ title: '当前环境不支持剪贴板复制', variant: 'warning' })
      return
    }
    try {
      await navigator.clipboard.writeText(json)
      showToast({ title: '已复制到剪贴板', variant: 'success' })
    } catch {
      showToast({ title: '复制失败，请检查权限后重试', variant: 'error' })
    }
  }

  const clearAllBookmarks = () => {
    const snapshot = useBookmarkStore.getState()
    const backup = {
      groups: JSON.parse(JSON.stringify(snapshot.groups)) as Group[],
      bookmarks: JSON.parse(JSON.stringify(snapshot.bookmarks)) as Bookmark[]
    }
    mutations.$patch({
      groups: [
        {
          id: 'g-default',
          name: '默认分组',
          children: [{ id: 'sg-default', name: '未分组', bookmarkIds: [] }]
        },
        {
          id: TRASH_GROUP_ID,
          name: '回收站',
          children: [{ id: 'sg-trash', name: '已删除', bookmarkIds: [] }]
        }
      ],
      bookmarks: [],
      search: '',
      activeGroupId: 'g-default',
      activeSubGroupId: 'sg-default'
    })
    setShowClearConfirm(false)
    setClearConfirmText('')
    showResultToast(
      {
        variant: 'warning',
        title: '已清空全部书签',
        description: '可在短时间内撤销本次操作',
        actionLabel: '撤回',
        onAction: () => {
          useBookmarkStore.setState({
            groups: backup.groups,
            bookmarks: backup.bookmarks
          })
          closeResultToast()
          showToast({ title: '已撤回清空操作', variant: 'success' })
        }
      },
      9000
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingsBlock
        title="导入与备份"
        desc="导出当前书签，或从备份文件恢复数据"
      >
        <div className="flex gap-3">
          <Button className="flex-1" variant="outline" onClick={exportData}>
            <Upload className="mr-2 size-4" />
            导出备份
          </Button>
          <Button className="flex-1" variant="outline" onClick={triggerImport}>
            <Download className="mr-2 size-4" />
            导入备份
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          导入已有数据可以直接开始使用：支持浏览器导出的 HTML、鹅的书签备份 JSON、网址精灵导出的 data.json。
        </p>

        {/* Debug Tools */}
        <div className="mt-4 pt-2">
          <Button
            variant="ghost"
            className="mb-2 flex h-auto w-full items-center justify-between px-0 py-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => setDebugOpen((v) => !v)}
          >
            <span>高级操作（调试）</span>
            <ChevronDown
              className={`size-4 transition-transform ${
                debugOpen ? 'rotate-180' : ''
              }`}
            />
          </Button>
          {debugOpen && (
            <div className="flex gap-3">
              <Button
                className="flex-1"
                variant="outline"
                size="sm"
                onClick={copyAllData}
              >
                <Copy className="mr-2 size-4" />
                复制全部数据（JSON）
              </Button>
              <Button
                className="flex-1"
                variant="destructive"
                size="sm"
                onClick={() => setShowClearConfirm(true)}
              >
                <Trash className="mr-2 size-4" />
                清空全部书签
              </Button>
            </div>
          )}
        </div>
      </SettingsBlock>

      {/* Import Confirmation Dialog */}
      <Modal open={showImportConfirm} onClose={resetImportState}>
        <ModalHeader>
          <ModalTitle>导入前确认</ModalTitle>
          <ModalDescription>
            请确认导入方式，系统将按下方规则写入数据
          </ModalDescription>
        </ModalHeader>

        <div className="space-y-4 py-2">
          {pendingImportSourceLabel && (
            <div className="rounded-lg border border-border/80 bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">文件类型：</span>
              <span className="font-medium">{pendingImportSourceLabel}</span>
            </div>
          )}
          {pendingImportData && (
            <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">分组数量</span>
                <span className="font-medium">
                  {pendingImportData.groups.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">书签数量</span>
                <span className="font-medium">
                  {pendingImportData.bookmarks.length}
                </span>
              </div>
              {pendingImportSkipped > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">将忽略</span>
                  <span className="font-medium text-foreground">
                    {pendingImportSkipped} 条无效数据
                  </span>
                </div>
              )}
            </div>
          )}

          {pendingImportWarnings.length > 0 && (
            <div className="rounded-lg border border-input bg-muted/35 p-3 text-xs text-muted-foreground">
              <div className="mb-1 font-medium">注意事项</div>
              <div className="max-h-24 space-y-1 overflow-y-auto custom-scroll">
                {pendingImportWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <span className="text-sm font-medium">导入方式</span>
            <div className="grid gap-3">
              {(
                [
                  {
                    value: 'merge' as const,
                    title: '仅新增（推荐）',
                    desc: '保留现有数据，只补充新分组和新书签'
                  },
                  {
                    value: 'overwrite' as const,
                    title: '完全替换',
                    desc: '清空现有数据，并使用备份内容替换'
                  }
                ]
              ).map((opt) => {
                const active = importMode === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setImportMode(opt.value)}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? 'border-foreground/10 bg-muted text-foreground'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                        active
                          ? 'border-foreground bg-foreground'
                          : 'border-input'
                      }`}
                    >
                      {active && (
                        <span className="size-1.5 rounded-full bg-background" />
                      )}
                    </span>
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{opt.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {opt.desc}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={resetImportState}>
            取消
          </Button>
          <Button disabled={importing} onClick={confirmImport}>
            {importing && <Loader2 className="mr-2 size-4 animate-spin" />}
            开始导入
          </Button>
        </ModalFooter>
      </Modal>

      {/* HTML Import Preview Dialog */}
      <Modal
        open={showHtmlImportDialog}
        onClose={cancelHtmlImport}
        className="max-w-lg"
      >
        <ModalHeader>
          <ModalTitle>
            <span className="flex items-center gap-2">
              <FileCode className="size-5 text-muted-foreground" />
              导入浏览器书签（HTML）
            </span>
          </ModalTitle>
          <ModalDescription>
            已解析 HTML 文件，请选择要导入的文件夹
          </ModalDescription>
        </ModalHeader>

        {htmlParseResult && (
          <div className="space-y-4 py-2">
            <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">总书签数</span>
                <span className="font-medium">
                  {htmlParseResult.stats.totalBookmarks}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">文件夹数</span>
                <span className="font-medium">
                  {htmlParseResult.stats.totalFolders}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">选择要导入的文件夹</span>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto custom-scroll">
                {htmlParseResult.folders.map((folder) => {
                  const checked = selectedHtmlFolders.has(folder.name)
                  return (
                    <div
                      key={folder.name}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-all hover:bg-muted/50 ${
                        checked
                          ? 'border-foreground/10 bg-muted/50'
                          : 'border-border'
                      }`}
                      onClick={() => toggleHtmlFolder(folder.name)}
                    >
                      <div
                        className={`flex size-4 shrink-0 items-center justify-center rounded-sm border bg-background shadow-sm transition-colors ${
                          checked
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-input'
                        }`}
                      >
                        {checked && <Check className="size-3" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {folder.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {folder.bookmarks.length} 个书签
                          {folder.children.length > 0 && (
                            <span>, {folder.children.length} 个子文件夹</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {htmlParseResult.folders.length === 0 && (
                  <p className="py-2 text-center text-sm text-muted-foreground">
                    未找到顶级文件夹，所有书签会导入到默认分组
                  </p>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              文件夹会作为主分组导入，子文件夹会作为子分组导入；同名分组会自动合并。
            </p>
          </div>
        )}

        <ModalFooter>
          <Button variant="ghost" onClick={cancelHtmlImport}>
            取消
          </Button>
          <Button
            disabled={htmlImporting || selectedHtmlFolders.size === 0}
            onClick={confirmHtmlImport}
          >
            {htmlImporting && <Loader2 className="mr-2 size-4 animate-spin" />}
            导入 {selectedHtmlFolders.size} 个文件夹
          </Button>
        </ModalFooter>
      </Modal>

      {/* Clear All Confirmation Dialog */}
      <Modal open={showClearConfirm} onClose={() => setShowClearConfirm(false)}>
        <ModalHeader>
          <ModalTitle>确认清空全部书签？</ModalTitle>
          <ModalDescription>
            此操作会删除全部书签数据，无法恢复。请输入{' '}
            <span className="font-medium text-foreground">
              "{requiredClearText}"
            </span>{' '}
            确认。
          </ModalDescription>
        </ModalHeader>
        <div className="space-y-3 py-2">
          <Input
            value={clearConfirmText}
            onChange={(e) => setClearConfirmText(e.target.value)}
            placeholder="输入确认文字后才可清空"
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            可手动输入或粘贴确认文字，再点击确认。
          </p>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowClearConfirm(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={clearConfirmText.trim() !== requiredClearText}
            onClick={clearAllBookmarks}
          >
            立即清空
          </Button>
        </ModalFooter>
      </Modal>

      <ResultToast
        open={resultToast.visible}
        variant={resultToast.variant}
        title={resultToast.title}
        description={resultToast.description}
        actionLabel={resultToast.actionLabel}
        onClose={closeResultToast}
        onAction={resultToast.onAction}
      />
    </div>
  )
}
