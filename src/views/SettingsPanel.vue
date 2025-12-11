<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { useThemeStore } from '@/stores/theme'
import { useSettingsStore } from '@/stores/settings'
import { useStatsStore } from '@/stores/stats'
import { probeUrl, type ProbeResult } from '@/services/siteProbe'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import FaqNotice from '@/components/FaqNotice.vue'
import draggable from 'vuedraggable'
import type { Group } from '@/types/bookmark'


const store = useBookmarkStore()
const themeStore = useThemeStore()
const settingsStore = useSettingsStore()
const statsStore = useStatsStore()


const matching = ref(false)
const probing = ref(false)
const probeResult = ref<ProbeResult[]>([])

const editingGroupId = ref('')
const editingSubId = ref('')
const editName = ref('')
const isAddingGroup = ref(false)
const newGroupName = ref('')
const addingSubGroupId = ref('')
const newSubName = ref('')
const groupInput = ref<HTMLInputElement[] | null>(null)
const addGroupInput = ref<HTMLInputElement | null>(null)
const addSubInput = ref<HTMLInputElement | null>(null)
const groupListRef = ref<HTMLElement | null>(null)
const groupRowRefs = ref<Record<string, HTMLElement | null>>({})
const fileInputRef = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const importMode = ref<'overwrite' | 'merge'>('merge')
const showImportConfirm = ref(false)
const pendingImportData = ref<{ groups: typeof store.groups; bookmarks: typeof store.bookmarks } | null>(null)
const showClearConfirm = ref(false)
const clearConfirmText = ref('')
const requiredClearText = '确认清空'
const usageMode = ref<'day' | 'week' | 'month'>('day')
const debugOpen = ref(false)
const isDragging = ref(false)
const editingLocked = computed(() => !!editingGroupId.value || !!editingSubId.value)

// 可拖拽的分组列表 (排除回收站)
const draggableGroups = computed({
  get: () => store.groups.filter(g => g.id !== TRASH_GROUP_ID),
  set: (val: Group[]) => store.reorderGroups(val)
})

// 拖拽配置
const dragOptions = computed(() => ({
  animation: 150,
  ghostClass: 'drag-ghost',
  chosenClass: 'drag-chosen',
  dragClass: 'drag-item',
  disabled: editingLocked.value,
  handle: '.drag-handle'
}))

// 子分组拖拽结束处理
const handleSubDragEnd = (evt: { oldIndex: number; newIndex: number; from: HTMLElement; to: HTMLElement; item: HTMLElement }) => {
  const fromGroupId = evt.from.dataset.groupId
  const toGroupId = evt.to.dataset.groupId
  const subId = evt.item.dataset.subId
  
  if (!fromGroupId || !subId) return
  
  // 如果拖到了促销区域，升级为主分组
  if (toGroupId === 'promote-zone') {
    store.promoteSubToGroup(fromGroupId, subId)
    return
  }
  
  // 如果跨分组移动
  if (toGroupId && fromGroupId !== toGroupId) {
    store.moveSubToGroup(fromGroupId, subId, toGroupId)
  }
}
const gridColumnsOptions = [2, 3, 4, 5]
const groupLayoutOptions: Array<{ value: 'wrap' | 'scroll'; label: string }> = [
  { value: 'wrap', label: '换行' },
  { value: 'scroll', label: '横向滚动' }
]

type MiniUTools = { showNotification?: (body: string) => void }
const showSubInputToast = (enabled: boolean) => {
  const msg = enabled
    ? '已启用 uTools 子输入框：直接输入即可搜索，但焦点可能拦截方向键，需先切换焦点再导航。'
    : '已关闭子输入框：需使用快捷键或点击搜索进入，但不会被输入框抢占焦点。'
  const ut = (window as unknown as { utools?: MiniUTools }).utools
  try {
    if (ut?.showNotification) ut.showNotification(msg)
    else console.info(msg)
  } catch {
    console.info(msg)
  }
}

const handleGridColumnsChange = (val: string | number) => {
  const num = typeof val === 'number' ? val : Number(val)
  if (Number.isFinite(num)) {
    settingsStore.setGridColumns(num)
  }
}

const missingCount = computed(() =>
  store.bookmarks.filter(b => !b.icon || b.icon.type === 'text').length
)

const toIsoWeekKey = (ts: string) => {
  const date = new Date(ts)
  const day = date.getUTCDay() || 7
  const isoThursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + (4 - day)))
  const yearStart = new Date(Date.UTC(isoThursday.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((isoThursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${isoThursday.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`
}

const aggregateUsage = (mode: 'day' | 'week' | 'month') => {
  const map = new Map<string, { total: number; open: number; add: number }>()
  const formatKey = (ts: string) => {
    if (mode === 'week') return toIsoWeekKey(ts)
    if (mode === 'month') return ts.slice(0, 7)
    return ts.slice(0, 10)
  }
  statsStore.usageEvents.forEach(ev => {
    const key = formatKey(ev.timestamp)
    const row = map.get(key) ?? { total: 0, open: 0, add: 0 }
    row.total += 1
    if (ev.type === 'open') row.open += 1
    if (ev.type === 'add') row.add += 1
    map.set(key, row)
  })
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, val]) => ({ key, ...val }))
}

const usageRows = computed(() => {
  const limit = usageMode.value === 'day' ? 14 : usageMode.value === 'week' ? 12 : 12
  return aggregateUsage(usageMode.value)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limit)
})

const usageAverage = computed(() => {
  const week = aggregateUsage('week')
  const month = aggregateUsage('month')
  const avg = (arr: { total: number; open: number; add: number }[], key: 'total' | 'open' | 'add') =>
    arr.length ? arr.reduce((sum, item) => sum + item[key], 0) / arr.length : 0
  return {
    week: {
      total: avg(week, 'total'),
      open: avg(week, 'open'),
      add: avg(week, 'add')
    },
    month: {
      total: avg(month, 'total'),
      open: avg(month, 'open'),
      add: avg(month, 'add')
    }
  }
})

const usageTotals = computed(() => {
  let open = 0
  let add = 0
  statsStore.usageEvents.forEach(ev => {
    if (ev.type === 'open') open += 1
    if (ev.type === 'add') add += 1
  })
  return { open, add }
})

const buildBackupPayload = () => ({
  version: 1,
  exportedAt: new Date().toISOString(),
  groups: store.groups,
  bookmarks: store.bookmarks
})

// 导出数据
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
}

// 触发文件选择
const triggerImport = () => {
  fileInputRef.value?.click()
}

// 处理文件选择
const handleFileSelect = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    
    // 验证数据结构
    if (!data.groups || !Array.isArray(data.groups) || !data.bookmarks || !Array.isArray(data.bookmarks)) {
      alert('无效的备份文件格式')
      return
    }
    
    pendingImportData.value = { groups: data.groups, bookmarks: data.bookmarks }
    showImportConfirm.value = true
  } catch {
    alert('文件解析失败，请确保是有效的 JSON 文件')
  } finally {
    input.value = ''
  }
}

// 确认导入
const confirmImport = () => {
  if (!pendingImportData.value) return
  importing.value = true
  
  try {
    if (importMode.value === 'overwrite') {
      // 覆盖模式：直接替换
      store.$patch({
        groups: pendingImportData.value.groups,
        bookmarks: pendingImportData.value.bookmarks
      })
    } else {
      // 合并模式：追加不重复的数据
      const existingBookmarkIds = new Set(store.bookmarks.map(b => b.id))
      const existingGroupIds = new Set(store.groups.map(g => g.id))
      
      // 合并书签
      pendingImportData.value.bookmarks.forEach(b => {
        if (!existingBookmarkIds.has(b.id)) {
          store.bookmarks.push(b)
        }
      })
      
      // 合并分组
      pendingImportData.value.groups.forEach(g => {
        if (!existingGroupIds.has(g.id)) {
          store.groups.push(g)
        } else {
          // 合并子分组
          const existingGroup = store.groups.find(eg => eg.id === g.id)
          if (existingGroup) {
            const existingSubIds = new Set(existingGroup.children.map(c => c.id))
            g.children.forEach(sub => {
              if (!existingSubIds.has(sub.id)) {
                existingGroup.children.push(sub)
              } else {
                // 合并书签 ID
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

const copyAllData = async () => {
  const json = JSON.stringify(buildBackupPayload(), null, 2)
  if (!navigator.clipboard) return alert('当前环境不支持剪贴板复制')
  try {
    await navigator.clipboard.writeText(json)
  } catch {
    alert('复制失败，请检查权限后重试')
  }
}

const clearAllBookmarks = () => {
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
}

const matchMissing = async () => {
  if (matching.value) return
  matching.value = true
  await store.refreshMissingIcons()
  matching.value = false
}

const checkInvalid = async () => {
  if (probing.value) return
  probing.value = true
  probeResult.value = []
  const all = store.bookmarks
  for (const bookmark of all) {
    const res = await probeUrl(bookmark.url, 3000)
    probeResult.value.push(res)
  }
  probing.value = false
}

const startEditGroup = (id: string, name: string) => {
  editingGroupId.value = id
  editingSubId.value = ''
  editName.value = name
  nextTick(() => {
     // Focus logic if needed
  })
}

const startEditSub = (groupId: string, subId: string, name: string) => {
  editingGroupId.value = groupId
  editingSubId.value = subId
  editName.value = name
}

const saveEdit = () => {
  if (!editName.value.trim()) return
  if (editingSubId.value) {
    store.updateSubGroup(editingGroupId.value, editingSubId.value, editName.value.trim())
  } else {
    store.updateGroup(editingGroupId.value, editName.value.trim())
  }
  editingGroupId.value = ''
  editingSubId.value = ''
  editName.value = ''
}

const cancelEdit = () => {
  editingGroupId.value = ''
  editingSubId.value = ''
  editName.value = ''
}

// Add/Remove Logic
const startAddGroup = () => {
  isAddingGroup.value = true
  newGroupName.value = ''
  nextTick(() => addGroupInput.value?.focus())
}

const confirmAddGroup = () => {
  if (!newGroupName.value.trim()) return
  store.addGroup(newGroupName.value.trim())
  isAddingGroup.value = false
  newGroupName.value = ''
}

const startAddSub = (groupId: string) => {
  addingSubGroupId.value = groupId
  newSubName.value = ''
  nextTick(() => {
    const row = groupRowRefs.value[groupId]
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (groupListRef.value) {
      groupListRef.value.scrollTop = groupListRef.value.scrollHeight
    }
    addSubInput.value?.focus()
  })
}

const confirmAddSub = () => {
  if (!newSubName.value.trim() || !addingSubGroupId.value) return
  store.addSubGroup(newSubName.value.trim(), addingSubGroupId.value)
  addingSubGroupId.value = ''
  newSubName.value = ''
}

const cancelAddSub = () => {
  // Delay slightly to allow enter key to trigger confirm first if that was the cause of blur
  setTimeout(() => {
    addingSubGroupId.value = ''
    newSubName.value = ''
  }, 100)
}


</script>

<template>
  <div class="grid gap-6">
    <!-- Theme Selection Card -->
    <Card>
       <CardHeader>
         <CardTitle>主题风格</CardTitle>
         <CardDescription>选择应用的主题色系</CardDescription>
       </CardHeader>
       <CardContent>
          <div class="flex gap-6">
            <!-- Monochrome (Default) -->
            <div 
              class="flex flex-col items-center gap-2 cursor-pointer group"
              @click="themeStore.setTheme('default')"
            >
               <div 
                 class="w-16 h-16 rounded-full border-2 flex overflow-hidden transition-all"
                 :class="themeStore.currentTheme === 'default' ? 'border-primary ring-2 ring-primary/20 scale-105' : 'border-border group-hover:border-primary/50'"
               >
                  <div class="w-1/2 h-full bg-zinc-900"></div>
                  <div class="w-1/2 h-full bg-white"></div>
               </div>
               <span 
                 class="text-sm font-medium transition-colors"
                 :class="themeStore.currentTheme === 'default' ? 'text-primary' : 'text-muted-foreground'"
               >默认黑白</span>
            </div>

            <!-- Coffee -->
            <div 
              class="flex flex-col items-center gap-2 cursor-pointer group"
              @click="themeStore.setTheme('coffee')"
            >
               <div 
                 class="w-16 h-16 rounded-full border-2 flex overflow-hidden transition-all"
                 :class="themeStore.currentTheme === 'coffee' ? 'border-primary ring-2 ring-primary/20 scale-105' : 'border-border group-hover:border-primary/50'"
               >
                  <div class="w-1/2 h-full bg-[#392623]"></div>
                  <div class="w-1/2 h-full bg-[#FEE9DF]"></div>
               </div>
               <span 
                 class="text-sm font-medium transition-colors"
                 :class="themeStore.currentTheme === 'coffee' ? 'text-primary' : 'text-muted-foreground'"
               >醇香拿铁</span>
            </div>
          </div>
       </CardContent>
    </Card>

    <!-- Layout Card -->
    <Card>
      <CardHeader>
        <CardTitle>布局</CardTitle>
        <CardDescription>设置主界面每行卡片数量（2-5）</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex items-center gap-3 max-w-xs">
          <label class="text-sm text-muted-foreground shrink-0">每行数量</label>
          <Input
            type="number"
            min="2"
            max="5"
            step="1"
            class="h-9"
            :value="settingsStore.gridColumns"
            @input="handleGridColumnsChange(($event.target as HTMLInputElement).value)"
          />
          <div class="flex gap-2">
            <Button
              v-for="opt in gridColumnsOptions"
              :key="opt"
              size="sm"
              :variant="settingsStore.gridColumns === opt ? 'default' : 'outline'"
              class="h-8 px-3"
              @click="settingsStore.setGridColumns(opt)"
            >
              {{ opt }}
            </Button>
          </div>
        </div>

        <div class="flex items-center gap-3 max-w-md mt-4">
          <label class="text-sm text-muted-foreground shrink-0">主分类展示</label>
          <div class="flex gap-2">
            <Button
              v-for="opt in groupLayoutOptions"
              :key="opt.value"
              size="sm"
              :variant="settingsStore.groupTabsLayout === opt.value ? 'default' : 'outline'"
              class="h-8 px-3"
              @click="settingsStore.setGroupTabsLayout(opt.value)"
            >
              {{ opt.label }}
            </Button>
          </div>
        </div>
        <p class="text-xs text-muted-foreground mt-2">默认换行显示，分类过多时可切换为横向滚动。</p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>搜索体验</CardTitle>
        <CardDescription>控制搜索界面的自动退出行为</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex flex-col gap-2 max-w-md">
          <div class="flex items-center gap-3">
            <label class="text-sm text-muted-foreground shrink-0">自动退出（分钟）</label>
            <Input
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              class="h-9 w-20"
              placeholder="5"
              :value="settingsStore.searchAutoExitMinutes"
              @change="settingsStore.setSearchAutoExitMinutes(Number(($event.target as HTMLInputElement).value))"
            />
          </div>
          <p class="text-xs text-muted-foreground">设为 0 表示不自动关闭。</p>
        </div>

        <!-- "显示 uTools 子输入框" 功能已隐藏，默认关闭 -->
      </CardContent>
    </Card>

    <!-- AI Settings Card -->
    <Card>
       <CardHeader>
         <CardTitle>AI 功能</CardTitle>
         <CardDescription>配置 AI 智能辅助功能（需在 uTools 中开启 AI）</CardDescription>
       </CardHeader>
       <CardContent>
          <label class="flex items-center justify-between cursor-pointer">
            <div class="space-y-0.5">
              <div class="text-sm font-medium">自动生成标题和描述</div>
              <div class="text-xs text-muted-foreground">新建书签时自动调用 AI 优化标题并生成描述</div>
            </div>
            <button 
              type="button"
              role="switch"
              :aria-checked="settingsStore.autoGenerateAI"
              class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              :class="settingsStore.autoGenerateAI ? 'bg-primary' : 'bg-input'"
              @click="settingsStore.setAutoGenerateAI(!settingsStore.autoGenerateAI)"
            >
              <span 
                class="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform"
                :class="settingsStore.autoGenerateAI ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
          </label>
       </CardContent>
    </Card>

    <!-- Category Management Card -->
    <Card>
       <CardHeader>
         <CardTitle>分类管理</CardTitle>
         <CardDescription>管理书签分组和子分组，拖拽可调整排序或移动分类</CardDescription>
       </CardHeader>
       <CardContent class="space-y-4">
         <!-- Add Group (移到最前面) -->
         <div class="pb-2">
           <div v-if="!isAddingGroup">
               <Button variant="outline" class="w-full h-9 border-dashed border-input hover:border-primary hover:text-primary transition-colors" :disabled="editingLocked" @click="startAddGroup">
                  <span class="i-mdi-plus mr-2" /> 新建主分组
                </Button>
            </div>
            <div v-else class="flex gap-2 animate-in fade-in slide-in-from-top-2">
                <Input 
                  ref="addGroupInput"
                  v-model="newGroupName" 
                  placeholder="输入分组名称..." 
                  class="flex-1 h-9"
                  @keyup.enter="confirmAddGroup"
                  autofocus
                />
                <Button size="icon" class="h-9 w-9 shrink-0" @click="confirmAddGroup">
                  <span class="i-mdi-check text-lg" />
                </Button>
                <Button size="icon" variant="ghost" class="h-9 w-9 shrink-0" @click="isAddingGroup = false">
                  <span class="i-mdi-close text-lg" />
                </Button>
            </div>
         </div>
         
         <!-- 升级为主分组的放置区域 -->
         <div
           v-if="isDragging"
           class="border-2 border-dashed border-primary/50 rounded-lg p-4 text-center text-sm text-primary/70 bg-primary/5 transition-all"
           data-group-id="promote-zone"
         >
           <span class="i-mdi-arrow-up-bold mr-2" />拖拽子分类到此处升级为主分组
         </div>
         
         <!-- 分组列表 (移除滚动条限制) -->
         <draggable
           v-model="draggableGroups"
           item-key="id"
           v-bind="dragOptions"
           class="flex flex-col gap-4"
           ref="groupListRef"
           @start="isDragging = true"
           @end="isDragging = false"
         >
           <template #item="{ element: group }">
             <div
               class="flex flex-col gap-2 group/row border rounded-lg p-2 bg-card/50 transition-all"
               :class="{ 'ring-2 ring-primary/30': isDragging }"
               :ref="(el) => { groupRowRefs[group.id] = el as HTMLElement | null }"
             >
               <!-- Group Header -->
               <div class="flex items-center gap-2">
                 <span class="i-mdi-drag-vertical text-muted-foreground/50 cursor-grab active:cursor-grabbing drag-handle shrink-0" />
                 <span class="i-mdi-folder-outline text-xl text-primary shrink-0" />
                 
                 <div v-if="editingGroupId === group.id && !editingSubId" class="flex-1 flex gap-2 items-center">
                    <Input 
                      v-model="editName" 
                      class="flex-1 h-9"
                      @keyup.enter="saveEdit"
                      autofocus
                    />
                    <Button size="icon" class="h-9 w-9 shrink-0" @click="saveEdit">
                      <span class="i-mdi-check text-lg" />
                    </Button>
                    <Button size="icon" variant="ghost" class="h-9 w-9 shrink-0" @click="cancelEdit">
                      <span class="i-mdi-close text-lg" />
                    </Button>
                 </div>
                 <span v-else class="flex-1 text-sm font-bold text-foreground">{{ group.name }}</span>
                 
                 <div
                   class="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity"
                   v-if="!(editingGroupId === group.id && !editingSubId)"
                 >
                    <Button 
                      v-if="editingGroupId !== group.id" 
                      variant="ghost" 
                      size="icon"
                      class="h-7 w-7 text-muted-foreground hover:text-primary"
                      title="重命名"
                      :disabled="editingLocked"
                      @click="startEditGroup(group.id, group.name)"
                    >
                      <span class="i-mdi-rename-box text-base" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      class="h-7 w-7 text-muted-foreground hover:text-primary"
                      title="添加子分类"
                      :disabled="editingLocked"
                      @click="startAddSub(group.id)"
                    >
                      <span class="i-mdi-plus text-base" />
                    </Button>
                    <Popover>
                      <PopoverTrigger as-child>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          class="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="删除分组"
                          :disabled="editingLocked"
                        >
                          <span class="i-mdi-trash-can-outline text-base" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent class="w-64 p-3" align="end">
                         <div class="space-y-2">
                            <h4 class="font-medium leading-none text-sm">确认删除？</h4>
                            <p class="text-xs text-muted-foreground">
                              分组 "{{ group.name }}" 及其独有的书签将被永久删除。
                            </p>
                            <div class="flex justify-end gap-2 pt-1">
                              <Button size="sm" variant="destructive" class="h-7 px-3 text-xs" @click="store.removeGroup(group.id)">
                                确认删除
                              </Button>
                            </div>
                         </div>
                      </PopoverContent>
                    </Popover>
                 </div>
               </div>
               
               <!-- Sub Groups with drag -->
               <draggable
                 :model-value="group.children"
                 @update:model-value="(val) => store.reorderSubGroups(group.id, val)"
                 item-key="id"
                 :group="{ name: 'sub-groups', pull: true, put: true }"
                 :animation="250"
                 ghost-class="drag-ghost"
                 chosen-class="drag-chosen"
                 class="pl-8 flex flex-col gap-1 min-h-[20px]"
                 :data-group-id="group.id"
                 @end="handleSubDragEnd"
               >
                 <template #item="{ element: sub }">
                   <div 
                     :key="sub.id" 
                     :data-sub-id="sub.id"
                     class="flex items-center gap-3 text-sm px-3 py-1.5 rounded-md hover:bg-muted/50 transition-colors group/sub"
                   >
                      <span class="i-mdi-drag-vertical text-muted-foreground/30 cursor-grab active:cursor-grabbing shrink-0" />
                      <span class="i-mdi-subdirectory-arrow-right text-muted-foreground/30 shrink-0" />
                      
                      <div v-if="editingSubId === sub.id" class="flex-1 flex gap-2 items-center">
                         <Input 
                           v-model="editName" 
                           class="flex-1 h-9 text-sm"
                           :maxlength="8"
                           @keyup.enter="saveEdit"
                           autofocus
                         />
                         <Button size="icon" class="h-9 w-9 shrink-0" @click="saveEdit">
                           <span class="i-mdi-check text-lg" />
                         </Button>
                         <Button size="icon" variant="ghost" class="h-9 w-9 shrink-0" @click="cancelEdit">
                           <span class="i-mdi-close text-lg" />
                         </Button>
                      </div>
                      <span v-else class="flex-1 text-muted-foreground">{{ sub.name }}</span>
                      
                      <div class="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                          <Button 
                            v-if="editingSubId !== sub.id" 
                            variant="ghost"
                            size="icon"
                            class="h-6 w-6 text-muted-foreground hover:text-primary"
                            title="重命名"
                           :disabled="editingLocked"
                            @click="startEditSub(group.id, sub.id, sub.name)"
                          >
                            <span class="i-mdi-pencil text-xs" />
                          </Button>
                          <Popover>
                             <PopoverTrigger as-child>
                                <Button 
                                   variant="ghost"
                                   size="icon"
                                   class="h-6 w-6 text-muted-foreground hover:text-destructive"
                                   title="删除子分类"
                                  :disabled="editingLocked"
                                >
                                   <span class="i-mdi-close text-xs" />
                                </Button>
                             </PopoverTrigger>
                             <PopoverContent class="w-64 p-3" align="end">
                                <div class="space-y-2">
                                   <h4 class="font-medium leading-none text-sm">确认删除？</h4>
                                   <p class="text-xs text-muted-foreground">
                                     子分类 "{{ sub.name }}" 及其独有的书签将被永久删除。
                                   </p>
                                   <div class="flex justify-end gap-2 pt-1">
                                     <Button size="sm" variant="destructive" class="h-7 px-3 text-xs" @click="store.removeSubGroup(group.id, sub.id)">
                                       确认删除
                                     </Button>
                                   </div>
                                </div>
                             </PopoverContent>
                          </Popover>
                      </div>
                   </div>
                 </template>
               </draggable>

               <!-- Add Sub Input -->
               <div v-if="addingSubGroupId === group.id" class="flex items-center gap-2 pl-8 mt-1 animate-in fade-in slide-in-from-left-2">
                   <span class="i-mdi-subdirectory-arrow-right text-primary shrink-0" />
                   <Input 
                     ref="addSubInput"
                     v-model="newSubName" 
                     class="flex-1 h-9 text-sm"
                     :maxlength="8"
                     placeholder="输入子分组名称..."
                     @keyup.enter="confirmAddSub"
                     @blur="cancelAddSub"
                     autofocus
                   />
                   <Button size="icon" class="h-9 w-9 shrink-0" @click="confirmAddSub" @mousedown.prevent>
                     <span class="i-mdi-check text-lg" />
                   </Button>
                   <Button size="icon" variant="ghost" class="h-9 w-9 shrink-0" @click="addingSubGroupId = ''" @mousedown.prevent>
                     <span class="i-mdi-close text-lg" />
                   </Button>
               </div>
             </div>
           </template>
         </draggable>
       </CardContent>
    </Card>

   <FaqNotice
     class="mb-2"
     title="常见问题"
     description="当一个分组下只有 1 个子分组时，为了保持界面简洁，侧边栏将不会显示该子分组。"
   />
           
    <!-- Tools Card -->
    <div class="grid md:grid-cols-2 gap-6">
       <!-- Icon Match -->
       <Card>
          <CardHeader class="pb-3">
             <CardTitle class="text-base">图标匹配</CardTitle>
             <CardDescription>缺失图标: <span class="text-primary font-bold">{{ missingCount }}</span> 条</CardDescription>
          </CardHeader>
          <CardContent>
             <Button class="w-full" variant="secondary" :disabled="matching" @click="matchMissing">
               <span v-if="matching" class="i-mdi-loading animate-spin mr-2" />
               {{ matching ? '匹配中...' : '匹配缺失图标' }}
             </Button>
          </CardContent>
       </Card>
       
       <!-- Probe -->
       <Card>
          <CardHeader class="pb-3">
             <CardTitle class="text-base">无效地址分析</CardTitle>
             <CardDescription>通过 HEAD/GET 检测链接有效性</CardDescription>
          </CardHeader>
          <CardContent>
             <Button class="w-full" variant="outline" :disabled="probing" @click="checkInvalid">
               <span v-if="probing" class="i-mdi-loading animate-spin mr-2" />
               {{ probing ? '检测中...' : '开始检测' }}
             </Button>
           </CardContent>
        </Card>
        
        <!-- Usage Stats -->
        <Card class="md:col-span-2">
          <CardHeader class="pb-3">
            <div class="flex items-center justify-between">
              <div>
                <CardTitle class="text-base">使用统计</CardTitle>
                <CardDescription>按日/按周/按月查看插件使用与新增书签次数</CardDescription>
              </div>
              <div class="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  :class="usageMode === 'day' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'"
                  @click="usageMode = 'day'"
                >
                  按日
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  :class="usageMode === 'week' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'"
                  @click="usageMode = 'week'"
                >
                  按周
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  :class="usageMode === 'month' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'"
                  @click="usageMode = 'month'"
                >
                  按月
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div class="rounded-lg border border-border bg-muted/30 p-3">
                <p class="text-xs text-muted-foreground">启动次数</p>
                <p class="text-lg font-semibold">{{ usageTotals.open }}</p>
              </div>
              <div class="rounded-lg border border-border bg-muted/30 p-3">
                <p class="text-xs text-muted-foreground">新增书签</p>
                <p class="text-lg font-semibold">{{ usageTotals.add }}</p>
              </div>
              <div class="rounded-lg border border-border bg-muted/30 p-3">
                <p class="text-xs text-muted-foreground">分组数量</p>
                <p class="text-lg font-semibold">{{ store.groups.length }}</p>
              </div>
              <div class="rounded-lg border border-border bg-muted/30 p-3">
                <p class="text-xs text-muted-foreground">书签总数</p>
                <p class="text-lg font-semibold">{{ store.bookmarks.length }}</p>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div class="rounded-lg border border-border bg-muted/20 p-3 flex items-center justify-between">
                <div>
                  <p class="text-xs text-muted-foreground">周均</p>
                  <p class="text-[11px] text-muted-foreground">按 ISO 周聚合</p>
                </div>
                <div class="flex gap-3 text-sm font-semibold">
                  <span class="px-2 py-1 rounded bg-primary/10 text-primary">启动 {{ usageAverage.week.open.toFixed(1) }}</span>
                  <span class="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500">新增 {{ usageAverage.week.add.toFixed(1) }}</span>
                </div>
              </div>
              <div class="rounded-lg border border-border bg-muted/20 p-3 flex items-center justify-between">
                <div>
                  <p class="text-xs text-muted-foreground">月均</p>
                  <p class="text-[11px] text-muted-foreground">按自然月聚合</p>
                </div>
                <div class="flex gap-3 text-sm font-semibold">
                  <span class="px-2 py-1 rounded bg-primary/10 text-primary">启动 {{ usageAverage.month.open.toFixed(1) }}</span>
                  <span class="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500">新增 {{ usageAverage.month.add.toFixed(1) }}</span>
                </div>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto custom-scroll">
              <div
                v-for="row in usageRows"
                :key="row.key"
                class="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2"
              >
                <div class="flex flex-col">
                  <span class="text-sm font-medium text-foreground">{{ row.key }}</span>
                  <span class="text-xs text-muted-foreground">总计 {{ row.total }} 次</span>
                </div>
                <div class="flex items-center gap-3 text-xs text-muted-foreground">
                  <span class="px-2 py-1 rounded bg-primary/10 text-primary font-medium">启动 {{ row.open }}</span>
                  <span class="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 font-medium">新增 {{ row.add }}</span>
                </div>
              </div>
              <p v-if="usageRows.length === 0" class="text-sm text-muted-foreground">暂无统计数据</p>
            </div>
          </CardContent>
        </Card>

        <!-- Import/Export -->
        <Card class="md:col-span-2">
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
                   accept=".json"
                   class="hidden"
                   @change="handleFileSelect"
                 />
              </div>
              <p class="text-xs text-muted-foreground">
                导出的 JSON 文件包含所有分组和书签数据
              </p>
              
              <!-- Debug Tools -->
              <div class="border-t border-border pt-4 mt-4">
                 <button
                   type="button"
                   class="w-full flex items-center justify-between text-xs text-muted-foreground mb-2 hover:text-foreground transition-colors"
                   @click="debugOpen = !debugOpen"
                 >
                   <span>调试工具</span>
                   <span
                     class="i-mdi-chevron-down text-base transition-transform"
                     :class="debugOpen ? 'rotate-180' : ''"
                   />
                 </button>
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
     </div>

    <!-- Probe Results -->
    <Card v-if="probeResult.length" class="animate-in fade-in slide-in-from-bottom-4">
       <CardHeader>
          <CardTitle>检测结果</CardTitle>
       </CardHeader>
       <CardContent>
          <div class="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto custom-scroll">
            <div v-for="item in probeResult" :key="item.url" class="rounded-md px-3 py-2 bg-muted/30 flex items-center justify-between border border-border/50">
               <span class="truncate text-sm text-foreground/80 flex-1 mr-4" :title="item.url">{{ item.url }}</span>
               <div class="flex items-center gap-3 shrink-0">
                  <span class="text-xs text-muted-foreground font-mono">{{ Math.round(item.elapsed) }}ms</span>
                  <span
                    :class="[
                      item.ok ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20',
                      'text-[10px] font-bold px-2 py-0.5 rounded border'
                    ]"
                  >
                    {{ item.ok ? 'OK' : 'FAIL' }}
                  </span>
               </div>
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
                <div class="grid gap-3">
                   <button 
                     type="button"
                     class="flex items-center gap-3 p-3 rounded-lg border transition-colors text-left"
                     :class="importMode === 'merge' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'"
                     @click="importMode = 'merge'"
                   >
                     <span class="i-mdi-checkbox-blank-circle-outline text-primary" :class="importMode === 'merge' ? 'i-mdi-radiobox-marked' : ''" />
                     <div class="space-y-1">
                        <div class="font-medium text-sm">合并模式</div>
                        <div class="text-xs text-muted-foreground">保留现有数据，仅添加新的书签和分组</div>
                     </div>
                   </button>
                   <button 
                     type="button"
                     class="flex items-center gap-3 p-3 rounded-lg border transition-colors text-left"
                     :class="importMode === 'overwrite' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'"
                     @click="importMode = 'overwrite'"
                   >
                     <span class="i-mdi-checkbox-blank-circle-outline text-primary" :class="importMode === 'overwrite' ? 'i-mdi-radiobox-marked' : ''" />
                     <div class="space-y-1">
                        <div class="font-medium text-sm">覆盖模式</div>
                        <div class="text-xs text-muted-foreground text-amber-500">清空现有数据，完全使用备份内容替换</div>
                     </div>
                   </button>
                </div>
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

    <!-- Clear All Confirmation Dialog -->
    <Dialog :open="showClearConfirm" @update:open="v => showClearConfirm = v">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>确认清空？</DialogTitle>
          <DialogDescription>
            此操作将删除所有书签数据，无法恢复。请输入
            <span class="font-medium text-foreground">“{{ requiredClearText }}”</span>
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

/* 拖拽动效样式 */
.drag-ghost {
  opacity: 0.5;
  background: hsl(var(--primary) / 0.1);
  border: 2px dashed hsl(var(--primary) / 0.5) !important;
  border-radius: 8px;
}

.drag-chosen {
  opacity: 1;
  background: hsl(var(--card));
  box-shadow: 0 8px 32px hsl(var(--primary) / 0.15);
  border: 1px solid hsl(var(--primary) / 0.3) !important;
  border-radius: 8px;
  transform: scale(1.01);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.drag-item {
  cursor: grabbing !important;
}

/* 拖拽手柄 hover */
.drag-handle:hover {
  color: hsl(var(--primary));
}
</style>
