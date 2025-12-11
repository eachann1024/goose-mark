<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { useThemeStore } from '@/stores/theme'
import { probeUrl, type ProbeResult } from '@/services/siteProbe'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import FaqNotice from '@/components/FaqNotice.vue'


const store = useBookmarkStore()
const themeStore = useThemeStore()


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
const fileInputRef = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const importMode = ref<'overwrite' | 'merge'>('merge')
const showImportConfirm = ref(false)
const pendingImportData = ref<{ groups: typeof store.groups; bookmarks: typeof store.bookmarks } | null>(null)

const missingCount = computed(() =>
  store.bookmarks.filter(b => !b.icon || b.icon.type === 'text').length
)

// 导出数据
const exportData = () => {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    groups: store.groups,
    bookmarks: store.bookmarks
  }
  const json = JSON.stringify(data, null, 2)
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

// Add/Remove Logic
const startAddGroup = () => {
  isAddingGroup.value = true
  newGroupName.value = ''
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

    <!-- Category Management Card -->
    <Card>
       <CardHeader>
         <CardTitle>分类管理</CardTitle>
         <CardDescription>管理书签分组和子分组</CardDescription>
       </CardHeader>
       <CardContent class="space-y-4">
         <div class="flex flex-col gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scroll">
           <div v-for="group in store.groups.filter(g => g.id !== TRASH_GROUP_ID)" :key="group.id" class="flex flex-col gap-2 group/row border rounded-lg p-2 bg-card/50">
              <!-- Group Header -->
              <div class="flex items-center gap-2">
                <span class="i-mdi-folder-outline text-xl text-primary shrink-0" />
                
                <div v-if="editingGroupId === group.id && !editingSubId" class="flex-1 flex gap-2">
                   <Input 
                     v-model="editName" 
                     class="flex-1 h-8"
                     @keyup.enter="saveEdit"
                     auto-focus
                   />
                   <Button size="sm" class="h-8" @click="saveEdit">保存</Button>
                </div>
                <span v-else class="flex-1 text-sm font-bold text-foreground">{{ group.name }}</span>
                
                <div class="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                   <Button 
                     v-if="editingGroupId !== group.id" 
                     variant="ghost" 
                     size="icon"
                     class="h-7 w-7 text-muted-foreground hover:text-primary"
                     title="重命名"
                     @click="startEditGroup(group.id, group.name)"
                   >
                     <span class="i-mdi-rename-box text-base" />
                   </Button>
                   <Button 
                     variant="ghost" 
                     size="icon"
                     class="h-7 w-7 text-muted-foreground hover:text-primary"
                     title="添加子分类"
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
              
              <!-- Sub Groups -->
              <div class="pl-8 flex flex-col gap-1">
                 <div v-for="sub in group.children" :key="sub.id" class="flex items-center gap-3 text-sm px-3 py-1.5 rounded-md hover:bg-muted/50 transition-colors group/sub">
                    <span class="i-mdi-subdirectory-arrow-right text-muted-foreground/30 shrink-0" />
                    
                    <div v-if="editingSubId === sub.id" class="flex-1 flex gap-2">
                       <Input 
                         v-model="editName" 
                         class="flex-1 h-7 text-xs"
                         @keyup.enter="saveEdit"
                         auto-focus
                       />
                       <Button size="sm" class="h-7 px-2 text-xs" @click="saveEdit">保存</Button>
                    </div>
                    <span v-else class="flex-1 text-muted-foreground">{{ sub.name }}</span>
                    
                    <div class="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                        <Button 
                          v-if="editingSubId !== sub.id" 
                          variant="ghost"
                          size="icon"
                          class="h-6 w-6 text-muted-foreground hover:text-primary"
                          title="重命名"
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

                 <!-- Add Sub Input -->
                 <div v-if="addingSubGroupId === group.id" class="flex items-center gap-2 pl-8 mt-1 animate-in fade-in slide-in-from-left-2">
                     <span class="i-mdi-subdirectory-arrow-right text-primary shrink-0" />
                     <Input 
                        v-model="newSubName" 
                        class="flex-1 h-7 text-xs"
                        placeholder="新子分类名称..."
                        @keyup.enter="confirmAddSub"
                        @blur="cancelAddSub"
                        auto-focus
                      />
                 </div>
              </div>
           </div>
         </div>
           
         <!-- Add Group -->
         <div class="pt-0">
            <div v-if="!isAddingGroup" class="flex justify-center">
                <Button variant="outline" class="w-full border-dashed border-input hover:border-primary hover:text-primary transition-colors" @click="startAddGroup">
                  <span class="i-mdi-plus mr-2" /> 新建主分组
                </Button>
            </div>
            <div v-else class="flex gap-2 animate-in fade-in slide-in-from-top-2">
                <Input 
                  v-model="newGroupName" 
                  placeholder="输入分组名称..." 
                  class="h-9"
                  @keyup.enter="confirmAddGroup"
                  auto-focus
                />
                <Button size="sm" @click="confirmAddGroup">确定</Button>
                <Button size="sm" variant="ghost" @click="isAddingGroup = false">取消</Button>
            </div>
         </div>
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
        
        <!-- Import/Export -->
        <Card class="md:col-span-2">
           <CardHeader class="pb-3">
              <CardTitle class="text-base">数据管理</CardTitle>
              <CardDescription>导入导出书签数据，便于备份与迁移</CardDescription>
           </CardHeader>
           <CardContent>
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
              <p class="text-xs text-muted-foreground mt-2">
                导出的 JSON 文件包含所有分组和书签数据
              </p>
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
                <div class="grid gap-2">
                   <label 
                     class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                     :class="importMode === 'merge' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'"
                   >
                     <input 
                       v-model="importMode" 
                       type="radio" 
                       value="merge" 
                       class="h-4 w-4 text-primary"
                     />
                     <div>
                        <div class="font-medium text-sm">合并模式</div>
                        <div class="text-xs text-muted-foreground">保留现有数据，仅添加新的书签和分组</div>
                     </div>
                   </label>
                   <label 
                     class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                     :class="importMode === 'overwrite' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'"
                   >
                     <input 
                       v-model="importMode" 
                       type="radio" 
                       value="overwrite" 
                       class="h-4 w-4 text-primary"
                     />
                     <div>
                        <div class="font-medium text-sm">覆盖模式</div>
                        <div class="text-xs text-muted-foreground text-amber-500">清空现有数据，完全使用备份内容替换</div>
                     </div>
                   </label>
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
