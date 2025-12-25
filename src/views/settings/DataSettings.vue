<script setup lang="ts">
import ResultToast from '@/components/ResultToast.vue'
import { parseHtmlBookmarks, isHtmlBookmarkFile, type ParseResult } from '@/lib/htmlBookmarkParser'
import type { Group, Bookmark } from '@/types/bookmark'
import { TRASH_GROUP_ID } from '@/stores/bookmark'

const store = useBookmarkStore()

const importing = ref(false)
const importMode = ref<'overwrite' | 'merge'>('merge')
const showImportConfirm = ref(false)
const pendingImportData = ref<{ groups: typeof store.groups; bookmarks: typeof store.bookmarks } | null>(null)
const showClearConfirm = ref(false)
const clearConfirmText = ref('')
const requiredClearText = '确认清空'
const debugOpen = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

// HTML 导入
const showHtmlImportDialog = ref(false)
const htmlParseResult = ref<ParseResult | null>(null)
const selectedHtmlFolders = ref<Set<string>>(new Set())
const htmlImporting = ref(false)

// Result Toast
type ResultToastVariant = 'success' | 'info' | 'warning' | 'error'
type ResultToastState = {
  visible: boolean
  variant: ResultToastVariant
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}
const resultToast = ref<ResultToastState>({
  visible: false,
  variant: 'info',
  title: ''
})
let resultToastTimer: ReturnType<typeof setTimeout> | null = null

const closeResultToast = () => {
  if (resultToastTimer) clearTimeout(resultToastTimer)
  resultToastTimer = null
  resultToast.value.visible = false
  resultToast.value.onAction = undefined
}

const showResultToast = (payload: Omit<ResultToastState, 'visible'>, timeoutMs = 4500) => {
  if (resultToastTimer) clearTimeout(resultToastTimer)
  resultToast.value = { ...payload, visible: true }
  resultToastTimer = setTimeout(() => closeResultToast(), timeoutMs)
}

const handleResultToastAction = () => resultToast.value.onAction?.()

const buildBackupPayload = () => ({
  version: 1,
  exportedAt: new Date().toISOString(),
  groups: store.groups,
  bookmarks: store.bookmarks
})

const exportData = () => {
  const json = JSON.stringify(buildBackupPayload(), null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = `better-marks-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  showResultToast({ variant: 'success', title: '已导出备份文件', description: '文件已开始下载（JSON）' })
}

const triggerImport = () => {
  fileInputRef.value?.click()
}

const handleFileSelect = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  
  try {
    const text = await file.text()
    
    if (isHtmlBookmarkFile(text)) {
      const result = parseHtmlBookmarks(text)
      if (result.stats.totalBookmarks === 0) {
        showResultToast({ variant: 'error', title: '导入失败', description: '未在文件中找到有效书签' }, 6500)
        return
      }
      htmlParseResult.value = result
      selectedHtmlFolders.value = new Set() // 默认不选中任何文件夹
      showHtmlImportDialog.value = true
    } else {
      const data = JSON.parse(text)
      if (!data.groups || !Array.isArray(data.groups) || !data.bookmarks || !Array.isArray(data.bookmarks)) {
        showResultToast({ variant: 'error', title: '导入失败', description: '无效的备份文件格式' }, 6500)
        return
      }
      pendingImportData.value = { groups: data.groups, bookmarks: data.bookmarks }
      showImportConfirm.value = true
    }
  } catch {
    showResultToast({ variant: 'error', title: '导入失败', description: '文件解析失败，请确保是有效的 JSON 或浏览器导出的 HTML' }, 6500)
  } finally {
    input.value = ''
  }
}

const confirmImport = () => {
  if (!pendingImportData.value) return
  importing.value = true

  const before = {
    groups: store.groups.length,
    bookmarks: store.bookmarks.length
  }

  try {
    if (importMode.value === 'overwrite') {
      store.$patch({
        groups: pendingImportData.value.groups,
        bookmarks: pendingImportData.value.bookmarks
      })
    } else {
      const existingBookmarkIds = new Set(store.bookmarks.map(b => b.id))
      const existingGroupIds = new Set(store.groups.map(g => g.id))
      
      pendingImportData.value.bookmarks.forEach(b => {
        if (!existingBookmarkIds.has(b.id)) {
          store.bookmarks.push(b)
        }
      })
      
      pendingImportData.value.groups.forEach(g => {
        if (!existingGroupIds.has(g.id)) {
          store.groups.push(g)
        } else {
          const existingGroup = store.groups.find(eg => eg.id === g.id)
          if (existingGroup) {
            const existingSubIds = new Set(existingGroup.children.map(c => c.id))
            g.children.forEach(sub => {
              if (!existingSubIds.has(sub.id)) {
                existingGroup.children.push(sub)
              } else {
                const existingSub = existingGroup.children.find(es => es.id === sub.id)
                if (existingSub) {
                  const existingBids = new Set(existingSub.bookmarkIds)
                  sub.bookmarkIds.forEach(bid => {
                    if (!existingBids.has(bid)) {
                      existingSub.bookmarkIds.push(bid)
                    }
                  })
                }
              }
            })
          }
        }
      })
    }
    const after = {
      groups: store.groups.length,
      bookmarks: store.bookmarks.length
    }
    const addedGroups = Math.max(0, after.groups - before.groups)
    const addedBookmarks = Math.max(0, after.bookmarks - before.bookmarks)
    showResultToast(
      {
        variant: 'success',
        title: '导入完成',
        description: importMode.value === 'overwrite'
          ? `已覆盖：分组 ${after.groups} / 书签 ${after.bookmarks}`
          : `已合并：新增分组 ${addedGroups} / 新增书签 ${addedBookmarks}`
      },
      6500
    )
    // 异步触发图标获取
    store.refreshMissingIcons()
  } catch (e) {
    console.error('[Settings] import failed:', e)
    showResultToast({ variant: 'error', title: '导入失败', description: '导入过程中发生错误，请更换备份文件后重试' }, 6500)
  } finally {
    importing.value = false
    showImportConfirm.value = false
    pendingImportData.value = null
  }
}

const cancelImport = () => {
  showImportConfirm.value = false
  pendingImportData.value = null
}

// HTML 书签导入
const toggleHtmlFolder = (name: string) => {
  const next = new Set(selectedHtmlFolders.value)
  if (next.has(name)) {
    next.delete(name)
  } else {
    next.add(name)
  }
  selectedHtmlFolders.value = next
}

const selectAllHtmlFolders = () => {
  if (!htmlParseResult.value) return
  selectedHtmlFolders.value = new Set(htmlParseResult.value.folders.map(f => f.name))
}

const cancelHtmlImport = () => {
  showHtmlImportDialog.value = false
  htmlParseResult.value = null
  selectedHtmlFolders.value = new Set()
}

const confirmHtmlImport = () => {
  if (!htmlParseResult.value) return
  htmlImporting.value = true

  const before = {
    groups: store.groups.length,
    bookmarks: store.bookmarks.length
  }

  try {
    const now = Date.now()
    const uid = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto 
      ? crypto.randomUUID() 
      : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    type FlatSubGroup = { name: string; bookmarks: typeof htmlParseResult.value.folders[0]['bookmarks'] }
    
    const flattenFolder = (folder: typeof htmlParseResult.value.folders[0], pathPrefix: string): FlatSubGroup[] => {
      const result: FlatSubGroup[] = []
      const currentPath = pathPrefix ? `${pathPrefix}/${folder.name}` : folder.name
      
      if (folder.bookmarks.length > 0) {
        result.push({ name: currentPath, bookmarks: folder.bookmarks })
      }
      
      folder.children.forEach(child => {
        result.push(...flattenFolder(child, currentPath))
      })
      
      return result
    }

    htmlParseResult.value.folders
      .filter(folder => selectedHtmlFolders.value.has(folder.name))
      .forEach(folder => {
        let targetGroup = store.groups.find(g => g.name === folder.name && g.id !== TRASH_GROUP_ID)
        
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
            const newBookmarks: Bookmark[] = folder.bookmarks.map(b => ({
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
              bookmarkIds: newBookmarks.map(b => b.id),
              createdAt: now,
              updatedAt: now
            })
            store.bookmarks.push(...newBookmarks)
          }
          
          folder.children.forEach(subFolder => {
            const flatSubs = flattenFolder(subFolder, '')
            flatSubs.forEach(flatSub => {
              const subId = uid()
              const subBookmarks: Bookmark[] = flatSub.bookmarks.map(b => ({
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
                  bookmarkIds: subBookmarks.map(b => b.id),
                  createdAt: now,
                  updatedAt: now
                })
                store.bookmarks.push(...subBookmarks)
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
          
          const trashIdx = store.groups.findIndex(g => g.id === TRASH_GROUP_ID)
          if (trashIdx !== -1) {
            store.groups.splice(trashIdx, 0, newGroup)
          } else {
            store.groups.push(newGroup)
          }
        } else {
          const groupId = targetGroup.id
          
          if (folder.bookmarks.length > 0) {
            let defaultSub = targetGroup.children[0]
            if (!defaultSub) {
              const subId = uid()
              defaultSub = { id: subId, name: '未分类', bookmarkIds: [], createdAt: now, updatedAt: now }
              targetGroup.children.push(defaultSub)
            }
            
            folder.bookmarks.forEach(b => {
              const newBookmark: Bookmark = {
                id: uid(), title: b.title, url: b.url, desc: '', tags: [],
                createdAt: b.addDate || now, updatedAt: now,
                locations: [{ groupId, subGroupId: defaultSub.id }]
              }
              store.bookmarks.push(newBookmark)
              defaultSub.bookmarkIds.push(newBookmark.id)
            })
            defaultSub.updatedAt = now
          }
          
          folder.children.forEach(subFolder => {
            const flatSubs = flattenFolder(subFolder, '')
            flatSubs.forEach(flatSub => {
              let targetSub = targetGroup!.children.find(c => c.name === flatSub.name)
              if (!targetSub) {
                const subId = uid()
                targetSub = { id: subId, name: flatSub.name, bookmarkIds: [], createdAt: now, updatedAt: now }
                targetGroup!.children.push(targetSub)
              }
              
              flatSub.bookmarks.forEach(b => {
                const newBookmark: Bookmark = {
                  id: uid(), title: b.title, url: b.url, desc: '', tags: [],
                  createdAt: b.addDate || now, updatedAt: now,
                  locations: [{ groupId, subGroupId: targetSub!.id }]
                }
                store.bookmarks.push(newBookmark)
                targetSub!.bookmarkIds.push(newBookmark.id)
              })
              targetSub.updatedAt = now
            })
          })
          targetGroup.updatedAt = now
        }
      })

    const after = { groups: store.groups.length, bookmarks: store.bookmarks.length }
    const addedGroups = Math.max(0, after.groups - before.groups)
    const addedBookmarks = Math.max(0, after.bookmarks - before.bookmarks)

    showResultToast({
      variant: 'success',
      title: 'HTML 书签导入完成',
      description: `新增分组 ${addedGroups} / 新增书签 ${addedBookmarks}`
    }, 4000)
    
    // 异步触发图标获取
    store.refreshMissingIcons()

    htmlImporting.value = false
    showHtmlImportDialog.value = false
    htmlParseResult.value = null
    selectedHtmlFolders.value = new Set()
  } catch (e) {
    console.error('[Settings] HTML import failed:', e)
    showResultToast({ variant: 'error', title: '导入失败', description: '导入过程中发生错误' }, 6500)
    htmlImporting.value = false
    showHtmlImportDialog.value = false
    htmlParseResult.value = null
    selectedHtmlFolders.value = new Set()
  }
}

const copyAllData = async () => {
  const json = JSON.stringify(buildBackupPayload(), null, 2)
  if (!navigator.clipboard) {
    notify('当前环境不支持剪贴板复制')
    return
  }
  try {
    await navigator.clipboard.writeText(json)
    notify('已复制到剪贴板')
  } catch {
    notify('复制失败，请检查权限后重试')
  }
}

const clearAllBookmarks = () => {
  const snapshot = {
    groups: JSON.parse(JSON.stringify(store.groups)) as typeof store.groups,
    bookmarks: JSON.parse(JSON.stringify(store.bookmarks)) as typeof store.bookmarks
  }
  store.$patch({
    groups: [
      {
        id: 'g-default',
        name: '默认分组',
        children: [
          {
            id: 'sg-default',
            name: '未分组',
            bookmarkIds: []
          }
        ]
      },
      {
        id: TRASH_GROUP_ID,
        name: '回收站',
        children: [
          {
            id: 'sg-trash',
            name: '已删除',
            bookmarkIds: []
          }
        ]
      }
    ],
    bookmarks: [],
    search: '',
    activeGroupId: 'g-default',
    activeSubGroupId: 'sg-default'
  })
  showClearConfirm.value = false
  clearConfirmText.value = ''
  showResultToast(
    {
      variant: 'warning',
      title: '已清空全部书签',
      description: '可在短时间内撤回本次清空操作',
      actionLabel: '撤回',
      onAction: () => {
        store.groups.splice(0, store.groups.length, ...snapshot.groups)
        store.bookmarks.splice(0, store.bookmarks.length, ...snapshot.bookmarks)
        closeResultToast()
        notify('已撤回清空操作')
      }
    },
    9000
  )
}
</script>

<template>
  <div class="grid gap-6">
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="text-base">数据管理</CardTitle>
        <CardDescription>导入导出书签数据，便于备份与迁移</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex gap-3">
          <Button class="flex-1" variant="secondary" @click="exportData">
            <span class="i-mdi-export mr-2" />
            导出数据
          </Button>
          <Button class="flex-1" variant="outline" @click="triggerImport">
            <span class="i-mdi-import mr-2" />
            导入数据
          </Button>
          <input
            ref="fileInputRef"
            type="file"
            accept=".json,.html,.htm"
            class="hidden"
            @change="handleFileSelect"
          />
        </div>
         
        <p class="text-xs text-muted-foreground">
          支持导入 JSON 备份文件或浏览器导出的 HTML 书签文件（Chrome/Edge/Firefox）
        </p>
        
        <!-- Debug Tools -->
        <div class="border-t border-border pt-4 mt-4">
          <Button
            variant="ghost"
            class="w-full h-auto py-0 px-0 flex items-center justify-between text-xs text-muted-foreground mb-2 hover:text-foreground hover:bg-transparent"
            @click="debugOpen = !debugOpen"
          >
            <span>调试工具</span>
            <span
              class="i-mdi-chevron-down text-base transition-transform"
              :class="debugOpen ? 'rotate-180' : ''"
            />
          </Button>
          <div v-if="debugOpen" class="flex gap-3">
            <Button class="flex-1" variant="outline" size="sm" @click="copyAllData">
              <span class="i-mdi-content-copy mr-2" />
              复制全部数据
            </Button>
            <Button class="flex-1" variant="destructive" size="sm" @click="showClearConfirm = true">
              <span class="i-mdi-delete-forever mr-2" />
              清空所有书签
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Import Confirmation Dialog -->
    <Dialog :open="showImportConfirm" @update:open="v => !v && cancelImport()">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>确认导入</DialogTitle>
          <DialogDescription>
            将从备份文件中导入数据，请选择导入模式
          </DialogDescription>
        </DialogHeader>
        
        <div class="space-y-4 py-4">
          <div v-if="pendingImportData" class="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">分组数量</span>
              <span class="font-medium">{{ pendingImportData.groups.length }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">书签数量</span>
              <span class="font-medium">{{ pendingImportData.bookmarks.length }}</span>
            </div>
          </div>
          
          <div class="space-y-3">
            <span class="text-sm font-medium">导入模式</span>
            <RadioGroup v-model="importMode" class="grid gap-3">
              <label
                class="flex items-center gap-3 p-3 rounded-lg border transition-colors text-left cursor-pointer"
                :class="importMode === 'merge' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'"
              >
                <RadioGroupItem value="merge" />
                <div class="space-y-1">
                  <div class="font-medium text-sm">合并模式</div>
                  <div class="text-xs text-muted-foreground">保留现有数据，仅添加新的书签和分组</div>
                </div>
              </label>
              <label
                class="flex items-center gap-3 p-3 rounded-lg border transition-colors text-left cursor-pointer"
                :class="importMode === 'overwrite' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'"
              >
                <RadioGroupItem value="overwrite" />
                <div class="space-y-1">
                  <div class="font-medium text-sm">覆盖模式</div>
                  <div class="text-xs text-muted-foreground text-amber-500">清空现有数据，完全使用备份内容替换</div>
                </div>
              </label>
            </RadioGroup>
          </div>
        </div>
        
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="ghost" @click="cancelImport">取消</Button>
          <Button :disabled="importing" @click="confirmImport">
            <span v-if="importing" class="i-mdi-loading animate-spin mr-2" />
            确认导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- HTML Import Preview Dialog -->
    <Dialog :open="showHtmlImportDialog" @update:open="v => !v && cancelHtmlImport()">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <span class="i-mdi-file-code text-primary" />
            导入浏览器书签
          </DialogTitle>
          <DialogDescription>
            已解析 HTML 书签文件，请选择要导入的文件夹
          </DialogDescription>
        </DialogHeader>
        
        <div class="space-y-4 py-4" v-if="htmlParseResult">
          <div class="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">总书签数</span>
              <span class="font-medium">{{ htmlParseResult.stats.totalBookmarks }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">文件夹数</span>
              <span class="font-medium">{{ htmlParseResult.stats.totalFolders }}</span>
            </div>
          </div>
          
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">选择要导入的文件夹</span>
             
            </div>
            <div class="max-h-48 overflow-y-auto space-y-1 custom-scroll">
              <div
                v-for="folder in htmlParseResult.folders"
                :key="folder.name"
                class="flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer hover:bg-muted/50"
                :class="selectedHtmlFolders.has(folder.name) ? 'border-primary bg-primary/5' : 'border-border'"
                @click="toggleHtmlFolder(folder.name)"
              >
                <!-- 使用手动实现的 Checkbox 样式，确保在所有环境下状态同步且可靠 -->
                <div 
                  class="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary transition-colors shadow-sm"
                  :class="selectedHtmlFolders.has(folder.name) ? 'bg-primary text-primary-foreground' : 'bg-transparent'"
                >
                  <span v-if="selectedHtmlFolders.has(folder.name)" class="i-mdi-check text-[12px] font-bold" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm truncate">{{ folder.name }}</div>
                  <div class="text-xs text-muted-foreground">
                    {{ folder.bookmarks.length }} 个书签
                    <span v-if="folder.children.length">, {{ folder.children.length }} 个子文件夹</span>
                  </div>
                </div>
              </div>
              <p v-if="htmlParseResult.folders.length === 0" class="text-sm text-muted-foreground py-2 text-center">
                未找到顶级文件夹，所有书签将导入到默认分组
              </p>
            </div>
          </div>
          
          <p class="text-xs text-muted-foreground">
            文件夹将作为主分组导入，子文件夹作为子分组。同名分组将自动合并。
          </p>
        </div>
        
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="ghost" @click="cancelHtmlImport">取消</Button>
          <Button 
            :disabled="htmlImporting || selectedHtmlFolders.size === 0" 
            @click="confirmHtmlImport"
          >
            <span v-if="htmlImporting" class="i-mdi-loading animate-spin mr-2" />
            导入 {{ selectedHtmlFolders.size }} 个分组
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Clear All Confirmation Dialog -->
    <Dialog :open="showClearConfirm" @update:open="v => showClearConfirm = v">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>确认清空？</DialogTitle>
          <DialogDescription>
            此操作将删除所有书签数据，无法恢复。请输入
            <span class="font-medium text-foreground">"{{ requiredClearText }}"</span>
            确认。
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3 py-2">
          <Input
            v-model="clearConfirmText"
            placeholder="输入确认文案后才可清空"
            class="w-full"
          />
          <p class="text-xs text-muted-foreground">可手动输入或粘贴确认文案，再点击确认。</p>
        </div>
        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="ghost" @click="showClearConfirm = false">取消</Button>
          <Button
            variant="destructive"
            :disabled="clearConfirmText.trim() !== requiredClearText"
            @click="clearAllBookmarks"
          >
            确认清空
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ResultToast
      :open="resultToast.visible"
      :variant="resultToast.variant"
      :title="resultToast.title"
      :description="resultToast.description"
      :action-label="resultToast.actionLabel"
      @close="closeResultToast"
      @action="handleResultToastAction"
    />
  </div>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar {
  width: 4px;
}
.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scroll::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.3);
  border-radius: 4px;
}
.custom-scroll::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.5);
}
</style>
