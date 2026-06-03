import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus,
  Check,
  X,
  GripVertical,
  Folder,
  SquarePen,
  Pencil,
  Trash2,
  CornerDownRight,
  Share2,
  CloudDownload,
  ArrowUp
} from 'lucide-react'
import type { Group, SubGroup } from '@/types/bookmark'
import { useBookmarkStore, TRASH_GROUP_ID } from '@/stores/bookmark'
import { useCategoryEditor } from '@/hooks/useCategoryEditor'
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
import { getBookmarkMutations } from './_bookmarkActions'

const INITIAL_TOAST: ResultToastState = {
  visible: false,
  variant: 'info',
  title: ''
}

const isImeComposing = (event: KeyboardEvent) => {
  const e = event as KeyboardEvent & { keyCode?: number }
  return e.nativeEvent.isComposing || e.keyCode === 229
}

const isShared = (sub: SubGroup) =>
  !!(sub as SubGroup & { shareId?: string; sourceShareId?: string }).shareId ||
  !!(sub as SubGroup & { sourceShareId?: string }).sourceShareId

/* -------------------------- Sortable sub-group -------------------------- */

function SortableSubGroup({
  group,
  sub,
  editingSubId,
  editName,
  editingLocked,
  onEditName,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onSubmitOnEnter
}: {
  group: Group
  sub: SubGroup
  editingSubId: string
  editName: string
  editingLocked: boolean
  onEditName: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onStartEdit: (groupId: string, subId: string, name: string) => void
  onDelete: (groupId: string, subId: string, name: string) => void
  onSubmitOnEnter: (e: KeyboardEvent, submit: () => void) => void
}) {
  const shared = isShared(sub)
  const sourceShareId = (sub as SubGroup & { sourceShareId?: string })
    .sourceShareId
  const shareId = (sub as SubGroup & { shareId?: string }).shareId

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `sub:${group.id}:${sub.id}`,
      data: { type: 'sub', groupId: group.id, subId: sub.id, shared },
      disabled: editingLocked || shared
    })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  const editing = editingSubId === sub.id

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/sub flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted/50 ${
        shared ? 'border border-dashed border-input bg-muted/15' : ''
      }`}
    >
      {!shared ? (
        <span
          {...attributes}
          {...listeners}
          className={`shrink-0 text-muted-foreground/30 ${
            editingLocked
              ? 'cursor-not-allowed opacity-30'
              : 'cursor-grab active:cursor-grabbing'
          }`}
        >
          <GripVertical className="size-4" />
        </span>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <CornerDownRight className="size-4 shrink-0 text-muted-foreground/30" />

      {editing ? (
        <div className="flex flex-1 items-center gap-2">
          <Input
            value={editName}
            onChange={(e) => onEditName(e.target.value)}
            className="h-9 flex-1 text-sm"
            onKeyDown={(e) => onSubmitOnEnter(e, onSaveEdit)}
            autoFocus
          />
          <Button size="icon" className="size-9 shrink-0" onClick={onSaveEdit}>
            <Check className="size-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-9 shrink-0"
            onClick={onCancelEdit}
          >
            <X className="size-5" />
          </Button>
        </div>
      ) : (
        <span className="flex flex-1 items-center gap-1.5 text-muted-foreground">
          {sub.name}
          {shareId && (
            <Share2 className="size-3 text-muted-foreground" aria-label="我分享的" />
          )}
          {!shareId && sourceShareId && (
            <CloudDownload
              className="size-3 text-muted-foreground"
              aria-label="我导入的"
            />
          )}
        </span>
      )}

      {!editing && (
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/sub:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-foreground"
            disabled={editingLocked || !!sourceShareId}
            title={sourceShareId ? '导入的分组暂不支持重命名' : '重命名'}
            onClick={() => onStartEdit(group.id, sub.id, sub.name)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-destructive"
            title="删除子分组"
            disabled={editingLocked}
            onClick={() => onDelete(group.id, sub.id, sub.name)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

/* ---------------------------- Sortable group ---------------------------- */

function SortableGroup({
  group,
  isDraggingAny,
  ...rest
}: {
  group: Group
  isDraggingAny: boolean
  editingGroupId: string
  editingSubId: string
  editName: string
  editingLocked: boolean
  addingSubGroupId: string
  newSubName: string
  registerRow: (id: string, el: HTMLElement | null) => void
  onEditName: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onStartEditGroup: (id: string, name: string) => void
  onStartEditSub: (groupId: string, subId: string, name: string) => void
  onStartAddSub: (groupId: string) => void
  onDeleteGroup: (groupId: string, name: string) => void
  onDeleteSub: (groupId: string, subId: string, name: string) => void
  onConfirmAddSub: () => void
  onCancelAddSub: () => void
  onNewSubName: (v: string) => void
  onSubmitOnEnter: (e: KeyboardEvent, submit: () => void) => void
}) {
  const {
    editingGroupId,
    editingSubId,
    editName,
    editingLocked,
    addingSubGroupId,
    newSubName,
    registerRow,
    onEditName,
    onSaveEdit,
    onCancelEdit,
    onStartEditGroup,
    onStartEditSub,
    onStartAddSub,
    onDeleteGroup,
    onDeleteSub,
    onConfirmAddSub,
    onCancelAddSub,
    onNewSubName,
    onSubmitOnEnter
  } = rest

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: `group:${group.id}`,
      data: { type: 'group', groupId: group.id },
      disabled: editingLocked
    })
  const { setNodeRef: setDropRef } = useDroppable({
    id: `group-drop:${group.id}`,
    data: { type: 'group-droppable', groupId: group.id }
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const editingThisGroup = editingGroupId === group.id && !editingSubId

  return (
    <div
      ref={(el) => {
        setNodeRef(el)
        registerRow(group.id, el)
      }}
      style={style}
      className={`group/row flex flex-col gap-2 rounded-lg bg-muted/30 p-2 transition-all ${
        isDraggingAny ? 'ring-2 ring-border' : ''
      }`}
    >
      {/* Group Header */}
      <div className="flex items-center gap-2">
        <span
          {...attributes}
          {...listeners}
          className={`shrink-0 text-muted-foreground/50 ${
            editingLocked
              ? 'cursor-not-allowed opacity-30'
              : 'cursor-grab active:cursor-grabbing'
          }`}
        >
          <GripVertical className="size-4" />
        </span>
        <Folder className="size-5 shrink-0 text-foreground" />

        {editingThisGroup ? (
          <div className="flex flex-1 items-center gap-2">
            <Input
              value={editName}
              onChange={(e) => onEditName(e.target.value)}
              className="h-9 flex-1"
              onKeyDown={(e) => onSubmitOnEnter(e, onSaveEdit)}
              autoFocus
            />
            <Button size="icon" className="size-9 shrink-0" onClick={onSaveEdit}>
              <Check className="size-5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-9 shrink-0"
              onClick={onCancelEdit}
            >
              <X className="size-5" />
            </Button>
          </div>
        ) : (
          <span className="flex-1 text-sm font-bold text-foreground">
            {group.name}
          </span>
        )}

        {!editingThisGroup && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100">
            {editingGroupId !== group.id && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                title="重命名"
                disabled={editingLocked}
                onClick={() => onStartEditGroup(group.id, group.name)}
              >
                <SquarePen className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              title="添加子分组"
              disabled={editingLocked}
              onClick={() => onStartAddSub(group.id)}
            >
              <Plus className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              title="删除分组"
              disabled={editingLocked}
              onClick={() => onDeleteGroup(group.id, group.name)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Sub Groups */}
      <div ref={setDropRef} className="flex min-h-[20px] flex-col gap-1 pl-8">
        <SortableContext
          items={group.children.map((s) => `sub:${group.id}:${s.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {group.children.map((sub) => (
            <SortableSubGroup
              key={sub.id}
              group={group}
              sub={sub}
              editingSubId={editingSubId}
              editName={editName}
              editingLocked={editingLocked}
              onEditName={onEditName}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onStartEdit={onStartEditSub}
              onDelete={onDeleteSub}
              onSubmitOnEnter={onSubmitOnEnter}
            />
          ))}
        </SortableContext>
      </div>

      {/* Add Sub Input */}
      {addingSubGroupId === group.id && (
        <div className="mt-1 flex items-center gap-2 pl-8 animate-in fade-in slide-in-from-left-2">
          <CornerDownRight className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={newSubName}
            onChange={(e) => onNewSubName(e.target.value)}
            className="h-9 flex-1 text-sm"
            placeholder="输入子分组名称"
            onKeyDown={(e) => onSubmitOnEnter(e, onConfirmAddSub)}
            onBlur={onCancelAddSub}
            autoFocus
          />
          <Button
            size="icon"
            className="size-9 shrink-0"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onConfirmAddSub}
          >
            <Check className="size-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-9 shrink-0"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCancelAddSub}
          >
            <X className="size-5" />
          </Button>
        </div>
      )}
    </div>
  )
}

/* ---------------------------- Promote zone ----------------------------- */

function PromoteZone() {
  const { setNodeRef, isOver } = useDroppable({
    id: 'promote-zone',
    data: { type: 'promote-zone' }
  })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 border-dashed p-4 text-center text-sm text-muted-foreground transition-all ${
        isOver ? 'border-primary bg-primary/10' : 'border-input bg-muted/35'
      }`}
    >
      <ArrowUp className="mr-2 inline size-4" />
      把子分组拖到这里，可升级为主分组
    </div>
  )
}

/* ----------------------------- Main view ------------------------------- */

type UndoSnapshot = {
  type: 'group' | 'sub'
  name: string
  groups: Group[]
  bookmarks: ReturnType<typeof useBookmarkStore.getState>['bookmarks']
}

/**
 * CategoryManager：分组管理（增删改、拖拽排序/跨分组移动/升级、删除确认与撤回）。
 * 对应旧 Vue views/settings/CategoryManager.vue，功能等价；无埋点。
 * 拖拽由 vuedraggable 迁移为 @dnd-kit。
 */
export default function CategoryManager() {
  const groups = useBookmarkStore((s) => s.groups)
  const mutations = useMemo(() => getBookmarkMutations(), [])
  const pendingCategoryEditorRequest = useCategoryEditor(
    (c) => c.pendingCategoryEditorRequest
  )
  const clearCategoryEditorRequest = useCategoryEditor(
    (c) => c.clearCategoryEditorRequest
  )

  const [editingGroupId, setEditingGroupId] = useState('')
  const [editingSubId, setEditingSubId] = useState('')
  const [editName, setEditName] = useState('')
  const [isAddingGroup, setIsAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [addingSubGroupId, setAddingSubGroupId] = useState('')
  const [newSubName, setNewSubName] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'group' | 'sub'
    groupId: string
    subId?: string
    name: string
  } | null>(null)

  const [undoToast, setUndoToast] = useState<{
    visible: boolean
    message: string
    data: UndoSnapshot | null
  }>({ visible: false, message: '', data: null })
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [resultToast, setResultToast] =
    useState<ResultToastState>(INITIAL_TOAST)
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const rowRefs = useRef<Record<string, HTMLElement | null>>({})

  const draggableGroups = useMemo(
    () =>
      (Array.isArray(groups) ? groups : []).filter(
        (g) => g.id !== TRASH_GROUP_ID
      ),
    [groups]
  )

  const editingLocked =
    !!editingGroupId || !!editingSubId || isAddingGroup || !!addingSubGroupId

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  /* --------------------------- toasts ---------------------------------- */
  const closeResultToast = () => {
    if (resultTimer.current) clearTimeout(resultTimer.current)
    resultTimer.current = null
    setResultToast((prev) => ({ ...prev, visible: false }))
  }
  const showResultToast = (
    payload: Omit<ResultToastState, 'visible'>,
    timeoutMs = 4500
  ) => {
    if (resultTimer.current) clearTimeout(resultTimer.current)
    setResultToast({ ...payload, visible: true })
    resultTimer.current = setTimeout(closeResultToast, timeoutMs)
  }

  /* ---------------------------- editing -------------------------------- */
  const registerRow = (id: string, el: HTMLElement | null) => {
    rowRefs.current[id] = el
  }

  const startEditGroup = (id: string, name: string) => {
    setEditingGroupId(id)
    setEditingSubId('')
    setEditName(name)
  }
  const startEditSub = (groupId: string, subId: string, name: string) => {
    setEditingGroupId(groupId)
    setEditingSubId(subId)
    setEditName(name)
  }
  const cancelEdit = () => {
    setEditingGroupId('')
    setEditingSubId('')
    setEditName('')
  }
  const saveEdit = () => {
    if (!editName.trim()) return
    if (editingSubId) {
      mutations.updateSubGroup(editingGroupId, editingSubId, editName.trim())
    } else {
      mutations.updateGroup(editingGroupId, editName.trim())
    }
    cancelEdit()
  }

  const handleSubmitOnEnter = (event: KeyboardEvent, submit: () => void) => {
    if (event.key !== 'Enter' || isImeComposing(event)) return
    event.preventDefault()
    submit()
  }

  /* ----------------------------- add ----------------------------------- */
  const startAddGroup = () => {
    setIsAddingGroup(true)
    setNewGroupName('')
  }
  const confirmAddGroup = () => {
    if (!newGroupName.trim()) return
    mutations.addGroup(newGroupName.trim())
    setIsAddingGroup(false)
    setNewGroupName('')
  }
  const startAddSub = (groupId: string) => {
    setAddingSubGroupId(groupId)
    setNewSubName('')
    requestAnimationFrame(() => {
      rowRefs.current[groupId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    })
  }
  const confirmAddSub = () => {
    if (!newSubName.trim() || !addingSubGroupId) return
    mutations.addSubGroup(newSubName.trim(), addingSubGroupId)
    setAddingSubGroupId('')
    setNewSubName('')
  }
  const cancelAddSub = () => {
    setTimeout(() => {
      setAddingSubGroupId('')
      setNewSubName('')
    }, 100)
  }

  /* --------------------------- category editor jump -------------------- */
  useEffect(() => {
    const request = pendingCategoryEditorRequest
    if (!request?.groupId) return
    const group = draggableGroups.find((item) => item.id === request.groupId)
    if (!group) {
      clearCategoryEditorRequest(request.requestId)
      return
    }
    setIsAddingGroup(false)
    setAddingSubGroupId('')
    cancelEdit()
    requestAnimationFrame(() => {
      rowRefs.current[group.id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
      clearCategoryEditorRequest(request.requestId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCategoryEditorRequest])

  /* ------------------------------ drag --------------------------------- */
  const onDragStart = (_e: DragStartEvent) => {
    setIsDragging(true)
  }

  const onDragEnd = (event: DragEndEvent) => {
    setIsDragging(false)
    const { active, over } = event
    if (!over) return

    const activeData = active.data.current as
      | { type: 'group' | 'sub'; groupId: string; subId?: string; shared?: boolean }
      | undefined
    const overData = over.data.current as
      | {
          type: 'group' | 'sub' | 'group-droppable' | 'promote-zone'
          groupId?: string
          subId?: string
        }
      | undefined
    if (!activeData) return

    // 分组排序
    if (activeData.type === 'group') {
      if (active.id === over.id) return
      const oldIndex = draggableGroups.findIndex(
        (g) => `group:${g.id}` === active.id
      )
      const newIndex = draggableGroups.findIndex(
        (g) => `group:${g.id}` === over.id
      )
      if (oldIndex === -1 || newIndex === -1) return
      mutations.reorderGroups(arrayMove(draggableGroups, oldIndex, newIndex))
      return
    }

    // 子分组拖拽
    if (activeData.type === 'sub' && activeData.subId) {
      const fromGroupId = activeData.groupId
      const subId = activeData.subId

      // 升级为主分组
      if (overData?.type === 'promote-zone') {
        mutations.promoteSubToGroup(fromGroupId, subId)
        return
      }

      // 解析目标 group
      let toGroupId: string | undefined
      if (overData?.type === 'group-droppable') toGroupId = overData.groupId
      else if (overData?.type === 'sub') toGroupId = overData.groupId
      else if (overData?.type === 'group') toGroupId = overData.groupId
      if (!toGroupId) return

      // 同组内重排
      if (toGroupId === fromGroupId) {
        const grp = draggableGroups.find((g) => g.id === fromGroupId)
        if (!grp) return
        const oldIndex = grp.children.findIndex((s) => s.id === subId)
        const overSubId =
          overData?.type === 'sub' ? overData.subId : undefined
        const newIndex = overSubId
          ? grp.children.findIndex((s) => s.id === overSubId)
          : grp.children.length - 1
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return
        mutations.reorderSubGroups(
          fromGroupId,
          arrayMove(grp.children, oldIndex, newIndex)
        )
        return
      }

      // 跨分组移动（禁止分享/导入的子分组）
      if (activeData.shared) {
        showResultToast(
          { variant: 'warning', title: '分享/导入的分组无法移动' },
          2000
        )
        return
      }
      mutations.moveSubToGroup(fromGroupId, subId, toGroupId)
    }
  }

  /* ----------------------------- delete -------------------------------- */
  const openDeleteConfirm = (
    type: 'group' | 'sub',
    groupId: string,
    name: string,
    subId?: string
  ) => {
    setDeleteTarget({ type, groupId, subId, name })
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    const snap = useBookmarkStore.getState()
    const snapshot: UndoSnapshot = {
      type: deleteTarget.type,
      name: deleteTarget.name,
      groups: JSON.parse(JSON.stringify(snap.groups)),
      bookmarks: JSON.parse(JSON.stringify(snap.bookmarks))
    }

    let success = false
    if (deleteTarget.type === 'group') {
      success = mutations.removeGroup(deleteTarget.groupId)
    } else if (deleteTarget.subId) {
      success = mutations.removeSubGroup(deleteTarget.groupId, deleteTarget.subId)
    }

    if (!success) {
      showResultToast(
        {
          variant: 'warning',
          title: '无法删除',
          description: '默认分组或最后一个子分组不能删除'
        },
        4000
      )
      setShowDeleteConfirm(false)
      setDeleteTarget(null)
      return
    }

    setShowDeleteConfirm(false)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndoToast({
      visible: true,
      message:
        deleteTarget.type === 'group'
          ? `分组 "${snapshot.name}" 已删除`
          : `子分组 "${snapshot.name}" 已删除`,
      data: snapshot
    })
    undoTimer.current = setTimeout(() => {
      setUndoToast({ visible: false, message: '', data: null })
    }, 5000)
    setDeleteTarget(null)
  }

  const handleUndo = () => {
    if (!undoToast.data) return
    useBookmarkStore.setState({
      groups: undoToast.data.groups,
      bookmarks: undoToast.data.bookmarks
    })
    mutations.syncAllSharedEntities()
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndoToast({ visible: false, message: '', data: null })
  }

  const closeUndoToast = () => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndoToast({ visible: false, message: '', data: null })
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingsBlock
        title="分组管理"
        desc="管理分组和子分组，可拖拽调整顺序或移动位置"
      >
        {/* Add Group */}
        <div className="pb-2">
          {!isAddingGroup ? (
            <Button
              variant="outline"
              className="h-9 w-full border-dashed border-input transition-colors hover:border-foreground/20 hover:text-foreground"
              disabled={editingLocked}
              onClick={startAddGroup}
            >
              <Plus className="mr-2 size-4" /> 新建分组
            </Button>
          ) : (
            <div className="flex gap-2 animate-in fade-in slide-in-from-top-2">
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="输入分组名称"
                className="h-9 flex-1"
                onKeyDown={(e) => handleSubmitOnEnter(e, confirmAddGroup)}
                autoFocus
              />
              <Button
                size="icon"
                className="size-9 shrink-0"
                onClick={confirmAddGroup}
              >
                <Check className="size-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-9 shrink-0"
                onClick={() => setIsAddingGroup(false)}
              >
                <X className="size-5" />
              </Button>
            </div>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          {/* Promote zone */}
          {isDragging && <PromoteZone />}

          <SortableContext
            items={draggableGroups.map((g) => `group:${g.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-4">
              {draggableGroups.map((group) => (
                <SortableGroup
                  key={group.id}
                  group={group}
                  isDraggingAny={isDragging}
                  editingGroupId={editingGroupId}
                  editingSubId={editingSubId}
                  editName={editName}
                  editingLocked={editingLocked}
                  addingSubGroupId={addingSubGroupId}
                  newSubName={newSubName}
                  registerRow={registerRow}
                  onEditName={setEditName}
                  onSaveEdit={saveEdit}
                  onCancelEdit={cancelEdit}
                  onStartEditGroup={startEditGroup}
                  onStartEditSub={startEditSub}
                  onStartAddSub={startAddSub}
                  onDeleteGroup={(groupId, name) =>
                    openDeleteConfirm('group', groupId, name)
                  }
                  onDeleteSub={(groupId, subId, name) =>
                    openDeleteConfirm('sub', groupId, name, subId)
                  }
                  onConfirmAddSub={confirmAddSub}
                  onCancelAddSub={cancelAddSub}
                  onNewSubName={setNewSubName}
                  onSubmitOnEnter={handleSubmitOnEnter}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </SettingsBlock>

      {/* Delete Confirmation Dialog */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
      >
        <ModalHeader>
          <ModalTitle>确认删除？</ModalTitle>
          <ModalDescription>
            {deleteTarget?.type === 'group' ? '分组' : '子分组'} "
            {deleteTarget?.name}" 及其独有书签将被永久删除。
          </ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleConfirmDelete} autoFocus>
            确认删除
          </Button>
        </ModalFooter>
      </Modal>

      {/* Undo Toast */}
      {undoToast.visible && (
        <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4">
          <Trash2 className="size-5 text-destructive" />
          <span className="text-sm text-foreground">{undoToast.message}</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-2 h-7 px-3 text-xs"
            onClick={handleUndo}
          >
            撤回
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="ml-1 size-7"
            onClick={closeUndoToast}
            title="关闭"
          >
            <X className="size-4 text-muted-foreground" />
          </Button>
        </div>
      )}

      <ResultToast
        open={resultToast.visible}
        variant={resultToast.variant}
        title={resultToast.title}
        description={resultToast.description}
        onClose={closeResultToast}
      />
    </div>
  )
}
