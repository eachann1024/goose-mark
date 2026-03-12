<script setup lang="ts">
import draggable from 'vuedraggable'
import ResultToast from '@/components/ResultToast.vue'
import type { Group } from '@/types/bookmark'
import { TRASH_GROUP_ID } from '@/stores/bookmark'

const store = useBookmarkStore()

// 编辑状态
const editingGroupId = ref('')
const editingSubId = ref('')
const editName = ref('')
const isAddingGroup = ref(false)
const newGroupName = ref('')
const addingSubGroupId = ref('')
const newSubName = ref('')
const addGroupInput = ref<InstanceType<typeof import('@/components/ui/input').Input> | null>(null)
const addSubInput = ref<InstanceType<typeof import('@/components/ui/input').Input> | null>(null)
const groupListRef = ref<HTMLElement | null>(null)
const groupRowRefs = ref<Record<string, HTMLElement | null>>({})
const isDragging = ref(false)

// 删除确认
const showDeleteConfirm = ref(false)
const deleteTarget = ref<{ type: 'group' | 'sub'; groupId: string; subId?: string; name: string } | null>(null)
const confirmDeleteButtonRef = ref<HTMLElement | null>(null)

// 撤回 Toast
const undoToast = ref<{ visible: boolean; message: string; data: { type: 'group' | 'sub'; groupId: string; subId?: string; name: string; groups: typeof store.groups; bookmarks: typeof store.bookmarks } | null }>({ visible: false, message: '', data: null })
let undoTimer: ReturnType<typeof setTimeout> | null = null

// Result Toast
type ResultToastVariant = 'success' | 'info' | 'warning' | 'error'
type ResultToastState = {
  visible: boolean
  variant: ResultToastVariant
  title: string
  description?: string
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
}

const showResultToast = (payload: Omit<ResultToastState, 'visible'>, timeoutMs = 4500) => {
  if (resultToastTimer) clearTimeout(resultToastTimer)
  resultToast.value = { ...payload, visible: true }
  resultToastTimer = setTimeout(() => closeResultToast(), timeoutMs)
}

const editingLocked = computed(() => 
  !!editingGroupId.value || 
  !!editingSubId.value || 
  isAddingGroup.value || 
  !!addingSubGroupId.value
)

// 可拖拽的分组列表 (排除回收站)
const draggableGroups = computed({
  get: () => (Array.isArray(store.groups) ? store.groups : []).filter(g => g.id !== TRASH_GROUP_ID),
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
  
  // 如果拖到了升级区域，升级为主分组
  if (toGroupId === 'promote-zone') {
    store.promoteSubToGroup(fromGroupId, subId)
    return
  }
  
  // 如果跨分组移动
  if (toGroupId && fromGroupId !== toGroupId) {
    store.moveSubToGroup(fromGroupId, subId, toGroupId)
  }
}

// 禁止拖动分享/导入的子分组
const checkSubMove = (evt: { draggedContext: { element: { shareId?: string; sourceShareId?: string } } }) => {
  const sub = evt.draggedContext.element
  if (sub.shareId || sub.sourceShareId) {
    const msg = sub.shareId ? '分享中的分组无法移动' : '导入的分组无法移动'
    showResultToast({ variant: 'warning', title: msg }, 2000)
    return false
  }
  return true
}

// 编辑分组
const startEditGroup = (id: string, name: string) => {
  editingGroupId.value = id
  editingSubId.value = ''
  editName.value = name
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

// 添加分组
const startAddGroup = () => {
  isAddingGroup.value = true
  newGroupName.value = ''
  nextTick(() => (addGroupInput.value?.$el as HTMLInputElement)?.focus())
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
    (addSubInput.value?.$el as HTMLInputElement)?.focus()
  })
}

const confirmAddSub = () => {
  if (!newSubName.value.trim() || !addingSubGroupId.value) return
  store.addSubGroup(newSubName.value.trim(), addingSubGroupId.value)
  addingSubGroupId.value = ''
  newSubName.value = ''
}

const cancelAddSub = () => {
  setTimeout(() => {
    addingSubGroupId.value = ''
    newSubName.value = ''
  }, 100)
}

// 删除确认
const openDeleteConfirm = (type: 'group' | 'sub', groupId: string, name: string, subId?: string) => {
  deleteTarget.value = { type, groupId, subId, name }
  showDeleteConfirm.value = true
}

watch(showDeleteConfirm, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      const button = confirmDeleteButtonRef.value
      const el = button && '$el' in button ? (button as any).$el : button
      if (el && typeof el.focus === 'function') {
        el.focus()
      } else {
        const dialog = document.querySelector('[role="dialog"]')
        const confirmBtn = dialog?.querySelector('button[class*="destructive"]') as HTMLElement
        confirmBtn?.focus()
      }
    })
  }
})

const handleConfirmDelete = () => {
  if (!deleteTarget.value) return
  
  const snapshot = {
    type: deleteTarget.value.type,
    groupId: deleteTarget.value.groupId,
    subId: deleteTarget.value.subId,
    name: deleteTarget.value.name,
    groups: JSON.parse(JSON.stringify(store.groups)),
    bookmarks: JSON.parse(JSON.stringify(store.bookmarks))
  }
  
  let success = false
  if (deleteTarget.value.type === 'group') {
    success = store.removeGroup(deleteTarget.value.groupId)
  } else if (deleteTarget.value.subId) {
    success = store.removeSubGroup(deleteTarget.value.groupId, deleteTarget.value.subId)
  }
  
  if (!success) {
    showResultToast({ variant: 'warning', title: '无法删除', description: '默认分组或最后一个子分组不能删除' }, 4000)
    showDeleteConfirm.value = false
    deleteTarget.value = null
    return
  }

  showDeleteConfirm.value = false
  
  if (undoTimer) clearTimeout(undoTimer)
  undoToast.value = {
    visible: true,
    message: deleteTarget.value.type === 'group' 
      ? `分组 "${snapshot.name}" 已删除` 
      : `子分组 "${snapshot.name}" 已删除`,
    data: snapshot
  }
  
  undoTimer = setTimeout(() => {
    undoToast.value.visible = false
    undoToast.value.data = null
  }, 5000)
  
  deleteTarget.value = null
}

const handleUndo = () => {
  if (!undoToast.value.data) return
  store.groups.splice(0, store.groups.length, ...undoToast.value.data.groups)
  store.bookmarks.splice(0, store.bookmarks.length, ...undoToast.value.data.bookmarks)
  store.syncAllSharedEntities()
  if (undoTimer) clearTimeout(undoTimer)
  undoToast.value = { visible: false, message: '', data: null }
}

const closeUndoToast = () => {
  if (undoTimer) clearTimeout(undoTimer)
  undoToast.value = { visible: false, message: '', data: null }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="settings-block">
      <div class="settings-block__head">
        <h3 class="settings-block__title">分组管理</h3>
        <p class="settings-block__desc">管理分组和子分组，可拖拽调整顺序或移动位置</p>
      </div>
        <!-- Add Group -->
        <div class="pb-2">
          <div v-if="!isAddingGroup">
            <Button variant="outline" class="w-full h-9 border-dashed border-input hover:border-foreground/20 hover:text-foreground transition-colors" :disabled="editingLocked" @click="startAddGroup">
              <span class="i-mdi-plus mr-2" /> 新建分组
            </Button>
          </div>
          <div v-else class="flex gap-2 animate-in fade-in slide-in-from-top-2">
            <Input 
              ref="addGroupInput"
              v-model="newGroupName" 
              placeholder="输入分组名称" 
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
        
        <!-- Promote zone -->
        <div
          v-if="isDragging"
          class="rounded-lg border-2 border-dashed border-input bg-muted/35 p-4 text-center text-sm text-muted-foreground transition-all"
          data-group-id="promote-zone"
        >
          <span class="i-mdi-arrow-up-bold mr-2" />把子分组拖到这里，可升级为主分组
        </div>
        
        <!-- Group List -->
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
              class="flex flex-col gap-2 group/row rounded-lg p-2 bg-muted/30 transition-all"
              :class="{ 'ring-2 ring-border': isDragging }"
              :ref="(el) => { groupRowRefs[group.id] = el as HTMLElement | null }"
            >
              <!-- Group Header -->
              <div class="flex items-center gap-2">
                <span 
                  class="i-mdi-drag-vertical text-muted-foreground/50 drag-handle shrink-0" 
                  :class="editingLocked ? 'cursor-not-allowed opacity-30' : 'cursor-grab active:cursor-grabbing'"
                />
                <span class="i-mdi-folder-outline text-xl text-foreground shrink-0" />
                
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
                    class="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="重命名"
                    :disabled="editingLocked"
                    @click="startEditGroup(group.id, group.name)"
                  >
                    <span class="i-mdi-rename-box text-base" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    class="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="添加子分组"
                    :disabled="editingLocked"
                    @click="startAddSub(group.id)"
                  >
                    <span class="i-mdi-plus text-base" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    class="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="删除分组"
                    :disabled="editingLocked"
                    @click="openDeleteConfirm('group', group.id, group.name)"
                  >
                    <span class="i-mdi-trash-can-outline text-base" />
                  </Button>
                </div>
              </div>
              
              <!-- Sub Groups -->
              <draggable
                :model-value="group.children"
                @update:model-value="(val: any[]) => store.reorderSubGroups(group.id, val)"
                item-key="id"
                :group="{ name: 'sub-groups', pull: true, put: true }"
                :animation="250"
                ghost-class="drag-ghost"
                chosen-class="drag-chosen"
                class="pl-8 flex flex-col gap-1 min-h-[20px]"
                :data-group-id="group.id"
                @end="handleSubDragEnd"
                :move="checkSubMove"
                :disabled="editingLocked"
              >
                <template #item="{ element: sub }">
                  <div 
                    :key="sub.id" 
                    :data-sub-id="sub.id"
                    class="flex items-center gap-3 text-sm px-3 py-1.5 rounded-md hover:bg-muted/50 transition-colors group/sub"
                    :class="{
                      'border border-dashed border-input bg-muted/15': sub.shareId || sub.sourceShareId
                    }"
                  >
                    <span 
                      v-if="!sub.shareId && !sub.sourceShareId" 
                      class="i-mdi-drag-vertical text-muted-foreground/30 shrink-0" 
                      :class="editingLocked ? 'cursor-not-allowed opacity-30' : 'cursor-grab active:cursor-grabbing'"
                    />
                    <span v-else class="w-4 shrink-0" />
                    <span class="i-mdi-subdirectory-arrow-right text-muted-foreground/30 shrink-0" />
                    
                    <div v-if="editingSubId === sub.id" class="flex-1 flex gap-2 items-center">
                      <Input 
                        v-model="editName" 
                        class="flex-1 h-9 text-sm"
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
                    <span v-else class="flex-1 text-muted-foreground flex items-center gap-1.5">
                      {{ sub.name }}
                      <span v-if="sub.shareId" class="i-mdi-share-variant text-xs text-muted-foreground" title="我分享的" />
                      <span v-else-if="sub.sourceShareId" class="i-mdi-cloud-download text-xs text-muted-foreground" title="我导入的" />
                    </span>
                    
                    <div class="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                      <Button 
                        v-if="editingSubId !== sub.id" 
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6 text-muted-foreground hover:text-foreground"
                        :disabled="editingLocked || !!sub.sourceShareId"
                        :title="sub.sourceShareId ? '导入的分组暂不支持重命名' : '重命名'"
                        @click="startEditSub(group.id, sub.id, sub.name)"
                      >
                        <span class="i-mdi-pencil text-xs" />
                      </Button>
                      <Button 
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title="删除子分组"
                        :disabled="editingLocked"
                        @click="openDeleteConfirm('sub', group.id, sub.name, sub.id)"
                      >
                        <span class="i-mdi-close text-xs" />
                      </Button>
                    </div>
                  </div>
                </template>
              </draggable>

              <!-- Add Sub Input -->
              <div v-if="addingSubGroupId === group.id" class="flex items-center gap-2 pl-8 mt-1 animate-in fade-in slide-in-from-left-2">
                <span class="i-mdi-subdirectory-arrow-right text-muted-foreground shrink-0" />
                <Input 
                  ref="addSubInput"
                  v-model="newSubName" 
                  class="flex-1 h-9 text-sm"
                  placeholder="输入子分组名称"
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
    </div>

    <!-- Delete Confirmation Dialog -->
    <Dialog :open="showDeleteConfirm" @update:open="v => { if (!v) showDeleteConfirm = false }">
      <DialogContent class="sm:max-w-md" @pointer-down-outside.prevent @interact-outside.prevent>
        <DialogHeader>
          <DialogTitle>确认删除？</DialogTitle>
          <DialogDescription>
            {{ deleteTarget?.type === 'group' ? '分组' : '子分组' }} "{{ deleteTarget?.name }}" 及其独有书签将被永久删除。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-3">
          <Button variant="ghost" @click="showDeleteConfirm = false">取消</Button>
          <Button ref="confirmDeleteButtonRef" variant="destructive" @click="handleConfirmDelete">
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Undo Toast -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 translate-y-4"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-4"
      >
        <div
          v-if="undoToast.visible"
          class="fixed bottom-4 right-4 z-[9999] flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card shadow-lg backdrop-blur-sm"
        >
          <span class="i-mdi-delete-outline text-lg text-destructive" />
          <span class="text-sm text-foreground">{{ undoToast.message }}</span>
          <Button size="sm" variant="outline" class="h-7 px-3 text-xs ml-2" @click="handleUndo">
            撤回
          </Button>
          <Button 
            variant="ghost"
            size="icon"
            class="ml-1 h-7 w-7" 
            @click="closeUndoToast"
            title="关闭"
          >
            <span class="i-mdi-close text-sm text-muted-foreground" />
          </Button>
        </div>
      </Transition>
    </Teleport>

    <ResultToast
      :open="resultToast.visible"
      :variant="resultToast.variant"
      :title="resultToast.title"
      :description="resultToast.description"
      @close="closeResultToast"
    />
  </div>
</template>

<style scoped>
.drag-ghost {
  opacity: 0.5;
  background: hsl(var(--muted));
  border: 2px dashed hsl(var(--border)) !important;
  border-radius: var(--radius-lg);
}

.drag-chosen {
  opacity: 1;
  background: hsl(var(--card));
  box-shadow: 0 8px 32px hsl(var(--foreground) / 0.08);
  border: 1px solid hsl(var(--border)) !important;
  border-radius: var(--radius-lg);
  transform: scale(1.01);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.drag-item {
  cursor: grabbing !important;
}

.drag-handle:hover {
  color: hsl(var(--foreground));
}

.drag-handle.cursor-grab[disabled="true"],
.drag-handle[disabled] {
  cursor: not-allowed !important;
  opacity: 0.3;
}
</style>
