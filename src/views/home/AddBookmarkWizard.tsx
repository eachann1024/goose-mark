import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BookmarkLocation } from '@/types/bookmark'
import { useBookmarkStore } from '@/stores/bookmark'
import {
  useBookmarkForm,
  useBookmarkFormStore,
  isValidUrlInput,
  URL_FETCH_DEBOUNCE_MS,
} from '@/hooks/useBookmarkForm'
import { CategoryMultiSelect } from '@/components/CategoryMultiSelect'
import { iconToDisplayUrl } from '@/services/iconCache'
import { Ico } from './icon'
import { Image } from '@/components/ui/image'
import type { HomeItem } from './viewModel'

/**
 * 新建/编辑书签表单
 * --------------------------------------------------------------------------
 * 新建不再经过独立「捕获链接 / 智能识别」页面，直接进入可编辑确认页。
 * URL 抓取、AI 生成和分类推荐都作为表单内的轻量辅助能力存在，避免流程臃肿。
 */

export default function AddBookmarkWizard({
  editItem,
  onBack,
}: {
  editItem: HomeItem | null
  onBack: (jump?: BookmarkLocation) => void
}) {
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const {
    showAdd,
    draft,
    draftLocations,
    previewIcon,
    iconLoading,
    iconFetchPhase,
    formError,
    isSaving,
    isGenerating,
    editingId,
    originalUrl,
    categorySuggestion,
    isSuggestingCategory,
    canUseAi,
    aiError,
    set,
    patchDraft,
    openAdd,
    openEdit,
    handleSave,
    runUrlFetch,
    askAI,
    requestDelete,
    askCategorySuggestion,
    applyCategorySuggestion,
    dismissCategorySuggestion,
    onTitleInput,
    onDescInput,
    isTitleDirty,
    isDescDirty,
    takeOverTitle,
    takeOverDesc,
  } = useBookmarkForm()

  const isEdit = !!editingId
  const titleFetching = iconLoading && !isTitleDirty
  const descFetching = iconLoading && !isDescDirty
  const previewIconUrl = iconToDisplayUrl(previewIcon ?? undefined) || ''
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const deleteConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearDeleteConfirmTimer = useCallback(() => {
    if (deleteConfirmTimerRef.current) {
      clearTimeout(deleteConfirmTimerRef.current)
      deleteConfirmTimerRef.current = null
    }
  }, [])

  // ---- 关闭联动：hook 保存成功后 set({ showAdd:false }) -> 触发 onBack ----
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  const wasOpenRef = useRef(false)
  const pendingJumpRef = useRef<BookmarkLocation | null>(null)
  const editItemId = editItem?.id ?? null
  useEffect(() => {
    if (showAdd) {
      wasOpenRef.current = true
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false
      onBackRef.current(pendingJumpRef.current ?? undefined)
      pendingJumpRef.current = null
    }
  }, [showAdd])

  useEffect(() => {
    return () => {
      clearDeleteConfirmTimer()
    }
  }, [clearDeleteConfirmTimer])

  useEffect(() => {
    clearDeleteConfirmTimer()
    setIsConfirmingDelete(false)
  }, [editItemId, clearDeleteConfirmTimer])

  // ---- 打开：编辑加载已有书签，新建初始化空表单 ----
  useEffect(() => {
    if (editItemId) {
      const real = bookmarks.find((b) => b.id === editItemId)
      if (real) openEdit(real)
    } else {
      openAdd()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItemId])

  const setUrl = useCallback(
    (url: string) => {
      patchDraft({ url })
    },
    [patchDraft],
  )

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) setUrl(text.trim())
    } catch {
      /* 剪贴板不可用时静默 */
    }
  }, [setUrl])

  const handleSaveClick = useCallback(async () => {
    clearDeleteConfirmTimer()
    setIsConfirmingDelete(false)
    await handleSave()
    const after = useBookmarkFormStore.getState()
    if (!after.showAdd) pendingJumpRef.current = after.draftLocations[0] ?? null
  }, [clearDeleteConfirmTimer, handleSave])

  const handleDeleteClick = useCallback(() => {
    if (!isEdit) return

    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true)
      clearDeleteConfirmTimer()
      deleteConfirmTimerRef.current = setTimeout(() => setIsConfirmingDelete(false), 3000)
      return
    }

    clearDeleteConfirmTimer()
    setIsConfirmingDelete(false)
    requestDelete()
  }, [isConfirmingDelete, clearDeleteConfirmTimer, isEdit, requestDelete])

  const handleCancel = useCallback(() => {
    clearDeleteConfirmTimer()
    setIsConfirmingDelete(false)
    set({ showAdd: false })
  }, [clearDeleteConfirmTimer, set])

  // Cmd/Ctrl + Enter 保存；普通 Enter 在输入框里保留原生编辑行为，避免刚粘贴 URL 就误保存。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (!(e.metaKey || e.ctrlKey) && (tag === 'INPUT' || tag === 'TEXTAREA')) return
      if (!isSaving && draftLocations.length > 0) {
        e.preventDefault()
        void handleSaveClick()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isSaving, draftLocations.length, handleSaveClick])

  return (
    <div className={`gm-wiz${isEdit ? ' is-edit' : ' is-new'}`}>
      <aside className="gm-rail gm-rail-compact">
        <div className="gm-rail-brand">
          <span className="gm-rail-logo">
            <Ico name="bookmark" />
          </span>
          <span className="gm-rail-name">鹅的书签</span>
        </div>

        <div className="gm-rail-panel">
          <span className="gm-rail-panel-ico">
            <Ico name={isEdit ? 'pencil' : 'plus'} />
          </span>
          <div>
            <div className="gm-rail-panel-title">{isEdit ? '编辑书签' : '新增书签'}</div>
            <div className="gm-rail-panel-sub">{isEdit ? '修改信息与归类' : '粘贴链接后直接完善信息'}</div>
          </div>
        </div>

        <button className="gm-rail-back" onClick={handleCancel} disabled={isSaving}>
          <Ico name="arrow-left" />
          返回列表
        </button>
      </aside>

      <div className="gm-wiz-main">
        <div className="gm-wiz-body">
          <ConfirmStep
            draft={draft}
            draftLocations={draftLocations}
            previewIconUrl={previewIconUrl}
            previewIcon={previewIcon}
            iconLoading={iconLoading}
            iconFetchPhase={iconFetchPhase}
            titleFetching={titleFetching}
            descFetching={descFetching}
            isGenerating={isGenerating}
            canUseAi={canUseAi}
            aiError={aiError}
            categorySuggestion={categorySuggestion}
            isSuggestingCategory={isSuggestingCategory}
            patchDraft={patchDraft}
            onTitleInput={onTitleInput}
            onDescInput={onDescInput}
            takeOverTitle={takeOverTitle}
            takeOverDesc={takeOverDesc}
            setLocations={(v: BookmarkLocation[]) => set({ draftLocations: v })}
            askAI={askAI}
            askCategorySuggestion={askCategorySuggestion}
            applyCategorySuggestion={applyCategorySuggestion}
            dismissCategorySuggestion={dismissCategorySuggestion}
            setUrl={setUrl}
            onPaste={handlePaste}
            editingId={editingId}
            originalUrl={originalUrl}
            runUrlFetch={runUrlFetch}
          />

          {formError && (
            <div className="gm-wiz-error">
              <Ico name="alert-circle" />
              {formError}
            </div>
          )}
        </div>

        <footer className="gm-wiz-foot">
          {isEdit && (
            <button className="btn btn-ghost danger" onClick={handleDeleteClick} disabled={isSaving}>
              <Ico name="trash-2" />
              {isConfirmingDelete ? '确认删除' : '删除'}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={handleCancel} disabled={isSaving}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSaveClick}
            disabled={isSaving || draftLocations.length === 0}
          >
            {isSaving ? <Ico name="loader" className="spin" /> : <Ico name="check" />}
            {isEdit ? '保存修改' : '保存书签'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function ConfirmStep({
  draft,
  draftLocations,
  previewIconUrl,
  previewIcon,
  iconLoading,
  iconFetchPhase,
  titleFetching,
  descFetching,
  isGenerating,
  canUseAi,
  aiError,
  categorySuggestion,
  isSuggestingCategory,
  patchDraft,
  onTitleInput,
  onDescInput,
  takeOverTitle,
  takeOverDesc,
  setLocations,
  askAI,
  askCategorySuggestion,
  applyCategorySuggestion,
  dismissCategorySuggestion,
  setUrl,
  onPaste,
  editingId,
  originalUrl,
  runUrlFetch,
}: {
  draft: { title: string; desc: string; url: string }
  draftLocations: BookmarkLocation[]
  previewIconUrl: string
  previewIcon: { bgColor?: string } | null
  iconLoading: boolean
  iconFetchPhase: 'idle' | 'loading' | 'success' | 'failed'
  titleFetching: boolean
  descFetching: boolean
  isGenerating: boolean
  canUseAi: boolean
  aiError: string
  categorySuggestion: {
    groupName: string
    subGroupName: string
    reason: string
    confidence: number
  } | null
  isSuggestingCategory: boolean
  patchDraft: (p: Partial<{ title: string; desc: string; url: string }>) => void
  onTitleInput: () => void
  onDescInput: (v: string) => void
  takeOverTitle: () => void
  takeOverDesc: () => void
  setLocations: (v: BookmarkLocation[]) => void
  askAI: (showNotify?: boolean) => void
  askCategorySuggestion: () => void
  applyCategorySuggestion: () => void
  dismissCategorySuggestion: () => void
  setUrl: (v: string) => void
  onPaste: () => void
  editingId: string
  originalUrl: string
  runUrlFetch: (debounceMs?: number) => void
}) {
  useEffect(() => {
    const val = draft.url
    if (!val.trim()) return
    if (!isValidUrlInput(val)) return
    if (editingId && val === originalUrl) return
    runUrlFetch(URL_FETCH_DEBOUNCE_MS)
  }, [draft.url, editingId, originalUrl, runUrlFetch])

  const isEdit = !!editingId
  const previewText = ((draft.title || draft.url) || 'ICON').trim().slice(0, 2).toUpperCase()
  const normalizedHost = useMemo(() => {
    if (!draft.url.trim()) return ''
    try {
      return new URL(/^https?:\/\//i.test(draft.url) ? draft.url : `https://${draft.url}`).host.replace(/^www\./, '')
    } catch {
      return draft.url
    }
  }, [draft.url])

  const metadataStatus = useMemo(() => {
    if (!draft.url.trim()) return '粘贴链接后自动读取标题、简介和图标'
    if (!isValidUrlInput(draft.url)) return '链接格式待确认'
    if (iconLoading) return '正在读取网页信息'
    if (isGenerating) return 'AI 正在整理标题和简介'
    if (iconFetchPhase === 'success') return '已读取网页信息'
    if (iconFetchPhase === 'failed') return '未能读取网页信息，可手动填写'
    return '链接变更后会自动读取网页信息'
  }, [draft.url, iconFetchPhase, iconLoading, isGenerating])

  const handleReadNow = useCallback(() => {
    if (!draft.url.trim() || !isValidUrlInput(draft.url)) return
    runUrlFetch()
  }, [draft.url, runUrlFetch])

  const handleAskAI = useCallback(() => {
    askAI(true)
  }, [askAI])

  return (
    <div className="gm-confirm">
      <div className="gm-confirm-head">
        <h2>{isEdit ? '编辑书签' : '新增书签'}</h2>
        <p>{isEdit ? '调整链接、说明和归类后保存' : '粘贴链接，补齐标题、简介和归类后保存'}</p>
      </div>

      <section className="gm-confirm-url">
        <div className="gm-id-label">链接 / 模板</div>
        <div className="gm-url-big">
          <Ico name="link" className="gm-url-icon" />
          <input
            className="gm-url-field"
            value={draft.url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… 或含 {query} 的搜索模板"
            spellCheck={false}
          />
          {!draft.url.trim() ? (
            <button type="button" className="gm-url-paste" onClick={onPaste} title="从剪贴板粘贴">
              <Ico name="paste" />
              粘贴
            </button>
          ) : (
            <button type="button" className="gm-url-paste" onClick={handleReadNow} disabled={iconLoading} title="重新读取网页信息">
              <Ico name={iconLoading ? 'loader' : 'refresh-cw'} className={iconLoading ? 'spin' : ''} />
              读取
            </button>
          )}
        </div>
        <div className="gm-url-meta">
          <span className={`gm-url-state${iconFetchPhase === 'failed' ? ' warn' : ''}`}>
            <Ico name={iconLoading || isGenerating ? 'loader' : iconFetchPhase === 'failed' ? 'alert-circle' : 'check-circle'} className={iconLoading || isGenerating ? 'spin' : ''} />
            {metadataStatus}
          </span>
          {/{[^}]+}/.test(draft.url) && <span>模板链接会在呼出后要求输入关键词</span>}
        </div>
      </section>

      {canUseAi && (
        <div className={`gm-assist-row${aiError ? ' has-error' : ''}`}>
          <span className="gm-assist-ico">
            <Ico name={isGenerating || isSuggestingCategory ? 'loader' : 'sparkles'} className={isGenerating || isSuggestingCategory ? 'spin' : ''} />
          </span>
          <div className="gm-assist-copy">
            <div>AI 辅助</div>
            <span>{aiError || '需要时再生成标题简介，或按现有分组推荐一个位置'}</span>
          </div>
          <button className="btn btn-ai sm" onClick={handleAskAI} disabled={isGenerating || !draft.url.trim()}>
            <Ico name={isGenerating ? 'loader' : 'wand-sparkles'} className={isGenerating ? 'spin' : ''} />
            {isGenerating ? '生成中' : '生成文案'}
          </button>
          <button className="btn btn-ghost sm" onClick={askCategorySuggestion} disabled={isSuggestingCategory || !draft.url.trim()}>
            <Ico name={isSuggestingCategory ? 'loader' : 'folder'} className={isSuggestingCategory ? 'spin' : ''} />
            {isSuggestingCategory ? '推荐中' : '推荐位置'}
          </button>
        </div>
      )}

      <div className="gm-id-card">
        <div className="gm-id-top">
          <div
            className={`gm-id-fav${iconFetchPhase === 'success' ? ' fetch-success' : iconFetchPhase === 'failed' ? ' fetch-failed' : ''}`}
            style={{ background: previewIcon?.bgColor || 'var(--surface-hover)' }}
          >
            {iconLoading ? (
              <span className="icon-countdown">
                <svg viewBox="0 0 60 60" className="icon-countdown-ring" preserveAspectRatio="none">
                  <rect className="icon-countdown-track" x="1.25" y="1.25" width="57.5" height="57.5" rx="13.75" pathLength={100} />
                  <rect className="icon-countdown-fill" x="1.25" y="1.25" width="57.5" height="57.5" rx="13.75" pathLength={100} />
                </svg>
              </span>
            ) : previewIconUrl ? (
              <Image bare src={previewIconUrl} alt="" />
            ) : (
              <span className="gm-id-fav-text">{previewText}</span>
            )}
          </div>
          <div className="gm-id-fields">
            <div className="gm-id-label">标题</div>
            <input
              className={`gm-id-input${titleFetching ? ' input-shimmer' : ''}`}
              value={draft.title}
              placeholder={titleFetching ? '正在获取标题…' : '网站标题'}
              readOnly={titleFetching}
              onPointerDown={() => {
                if (titleFetching) takeOverTitle()
              }}
              onKeyDown={(e) => {
                if (titleFetching && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) takeOverTitle()
              }}
              onChange={(e) => {
                patchDraft({ title: e.target.value })
                onTitleInput()
              }}
            />
            {normalizedHost && (
              <div className="gm-id-host">
                <Ico name="globe" />
                {normalizedHost}
              </div>
            )}
          </div>
        </div>
        <div className="gm-id-desc-block">
          <div className="gm-id-label">简介 / 笔记</div>
          <textarea
            className={`gm-id-textarea${descFetching ? ' input-shimmer' : ''}`}
            value={draft.desc}
            placeholder={descFetching ? '正在获取描述…' : '一句话描述这个网站，或写点笔记…'}
            readOnly={descFetching}
            onPointerDown={() => {
              if (descFetching) takeOverDesc()
            }}
            onKeyDown={(e) => {
              if (descFetching && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) takeOverDesc()
            }}
            onChange={(e) => onDescInput(e.target.value)}
          />
        </div>
      </div>

      <div className="gm-cat-head">
        <Ico name="folder" />
        <span className="gm-cat-title">放到哪里</span>
        <span className="gm-cat-sub">可同时放进多个分组</span>
      </div>

      {categorySuggestion && (
        <div className="gm-ai-suggest">
          <Ico name="sparkles" />
          <div className="gm-ai-suggest-meta">
            <div className="gm-ai-suggest-name">
              {categorySuggestion.groupName} / {categorySuggestion.subGroupName}
            </div>
            <div className="gm-ai-suggest-reason">{categorySuggestion.reason}</div>
          </div>
          <span className="gm-conf">{Math.round(categorySuggestion.confidence * 100)}%</span>
          <button className="btn btn-ai sm" onClick={() => applyCategorySuggestion()}>
            <Ico name="check" />
            采纳
          </button>
          <button className="gm-ai-suggest-x" onClick={dismissCategorySuggestion} title="忽略">
            <Ico name="x" />
          </button>
        </div>
      )}

      <div className="gm-cat-select form-category-select">
        <CategoryMultiSelect inline value={draftLocations} onChange={setLocations} />
      </div>
    </div>
  )
}
