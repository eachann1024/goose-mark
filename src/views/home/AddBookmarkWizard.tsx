import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Bookmark, BookmarkLocation, Group } from '@/types/bookmark'
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
 * 沉浸式三步新建/编辑书签向导
 * --------------------------------------------------------------------------
 * 按 Anthropic 设计稿（goose-redesign）重构新建书签流程：
 *   Step 0 捕获链接 —— URL 大输入 + 粘贴
 *   Step 1 智能识别 —— 进度环 + 三阶段轨道（连接/抓取/AI 整理）+ 实时预览 + 优雅失败
 *   Step 2 确认并归类 —— 身份卡（图标/标题/简介）+ AI 推荐分类 + 多位置选择
 *
 * 业务能力 100% 复用 useBookmarkForm：
 *   - URL 写入后 hook 内部 useEffect 自动防抖抓取图标/标题/描述并设置 iconFetchPhase
 *   - askAI(true) 主动触发 AI 标题/简介预填（isGenerating）
 *   - askCategorySuggestion / applyCategorySuggestion 走真实 AI 分类推荐
 *   - handleSave 走真实 addBookmark / updateBookmark + updateBookmarkLocations
 * 设计稿里的「假倒计时」「Exa 兜底」在本项目无对应后端，已降级为：
 *   - 进度环用不确定推进（基于真实 iconFetchPhase / isGenerating 阶段），不显示假秒数
 *   - 失败兜底只提供「手动填写」「重试」——不伪造 AISearch/Exa
 */

type Step = 0 | 1 | 2

const STEPS: { k: string; label: string; icon: string }[] = [
  { k: 'capture', label: '捕获链接', icon: 'link' },
  { k: 'recognize', label: '智能识别', icon: 'loader' },
  { k: 'confirm', label: '确认并归类', icon: 'folder' },
]

const isValidUrlLike = (s: string) => /\./.test(s.trim()) || /{[^}]+}/.test(s)

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
  // 步骤：新建从 0 起；编辑直接落到「确认并归类」
  const [step, setStep] = useState<Step>(editItem ? 2 : 0)
  // 失败兜底：手动填写后进入 Step 2 即便没识别到也允许编辑
  const [manualFallback, setManualFallback] = useState(false)
  // 用户一旦手动「上一步」返回，就关闭自动推进，改由按钮驱动，避免被来回弹回
  const manualNavRef = useRef(false)

  const titleFetching = iconLoading && !isTitleDirty
  const descFetching = iconLoading && !isDescDirty

  // ---- 关闭联动：hook 保存成功后 set({ showAdd:false }) → 触发 onBack ----
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  const wasOpenRef = useRef(false)
  // 保存成功后要跳转到的目标分组（取首个落地位置）；取消则保持 null（原地返回不跳）
  const pendingJumpRef = useRef<BookmarkLocation | null>(null)
  useEffect(() => {
    if (showAdd) {
      wasOpenRef.current = true
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false
      onBackRef.current(pendingJumpRef.current ?? undefined)
      pendingJumpRef.current = null
    }
  }, [showAdd])

  // ---- 打开：编辑加载已有书签，新建初始化空表单 ----
  const editItemId = editItem?.id ?? null
  useEffect(() => {
    if (editItemId) {
      const real = bookmarks.find((b) => b.id === editItemId)
      if (real) openEdit(real)
      setStep(2)
    } else {
      openAdd()
      setStep(0)
      setManualFallback(false)
      manualNavRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItemId])

  // ---- 识别阶段推断（基于真实异步状态，无假倒计时）----
  // 0 连接/抓取（iconLoading）→ 1 抓取完成 → 2 AI 整理（isGenerating）→ done
  const previewIconUrl = iconToDisplayUrl(previewIcon ?? undefined)
  const fetchDone = iconFetchPhase === 'success' || iconFetchPhase === 'failed'
  const fetchFailed = iconFetchPhase === 'failed' && !draft.title && !previewIconUrl

  // 阶段索引：0=连接抓取中, 1=抓取完成待AI/已完成, 2=AI整理中
  // AI 未开启时无第 3 步：抓取完成即停在「抓取信息」步(索引 1)并标记完成,不再指向不存在的 AI 步
  const stageIndex = isGenerating
    ? 2
    : iconLoading
      ? 0
      : fetchDone
        ? (canUseAi ? 2 : 1)
        : 0
  const recogStatus: 'running' | 'done' | 'failed' =
    fetchFailed && !iconLoading && !isGenerating
      ? 'failed'
      : iconLoading || isGenerating
        ? 'running'
        : fetchDone
          ? 'done'
          : 'running'

  // 进入 Step 1 后，识别完成自动可前进；这里只控制按钮可用性
  const canConfirm = recogStatus === 'done'

  // ---- 动作 ----
  const startRecognize = useCallback(() => {
    setManualFallback(false)
    // 显式触发抓取：识别只在点「下一步 / 回车」时发起，输入阶段不再自动抓取
    runUrlFetch()
    if (canUseAi) {
      // AI 开启：进入识别步展示三阶段进度，并叠加 AI 整理（先抓取后 AI）
      setStep(1)
      window.setTimeout(() => askAI(false), 50)
    } else {
      // AI 关闭：没有可展示的识别工作，直接进确认；抓取在确认卡里边抓边填
      setStep(2)
    }
  }, [askAI, canUseAi, runUrlFetch])

  // Step 0 不再做「停顿自动前进」：抓取仍随 URL 在 hook 内自动起跑，但「往前走」只由
  // 显式动作驱动（粘贴 / 回车 / 下一步按钮），避免自动跳转打断用户选中/编辑 URL（全选等）。

  // 自动推进②：AI 识别步完成 → 自动进入「确认并归类」（失败则停在识别步给手动/重试）
  useEffect(() => {
    if (isEdit || step !== 1) return
    if (manualNavRef.current) return
    if (recogStatus !== 'done') return
    const t = window.setTimeout(() => setStep(2), 600)
    return () => window.clearTimeout(t)
  }, [step, isEdit, recogStatus])

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

  const toConfirm = useCallback(() => setStep(2), [])

  const manualFill = useCallback(() => {
    setManualFallback(true)
    setStep(2)
  }, [])

  const retry = useCallback(() => {
    // 重新发起抓取（显式触发，不再借清空/回填 URL 间接触发）
    runUrlFetch()
    if (canUseAi) window.setTimeout(() => askAI(false), 80)
  }, [runUrlFetch, askAI, canUseAi])

  const handleCancel = useCallback(() => set({ showAdd: false }), [set])
  const handleSaveClick = useCallback(async () => {
    await handleSave()
    // 保存成功 → showAdd 已置 false；记录落地分组，关闭联动里回传给 onBack 用于跳转
    const after = useBookmarkFormStore.getState()
    if (!after.showAdd) pendingJumpRef.current = after.draftLocations[0] ?? null
  }, [handleSave])
  const handleDeleteClick = useCallback(() => requestDelete(), [requestDelete])

  const goPrev = useCallback(() => {
    // 一旦手动返回，关闭自动推进，后续完全由按钮驱动
    manualNavRef.current = true
    if (step === 2 && !isEdit) {
      // AI 开启且非兜底 → 回识别步；AI 关闭或手动兜底 → 直接回捕获链接
      setStep(canUseAi && !manualFallback ? 1 : 0)
    } else if (step === 1) {
      setStep(0)
    }
  }, [step, isEdit, manualFallback, canUseAi])

  // ---- 回车推进：不必够到右下角「下一步」，整页回车即进入下一步 ----
  // Step0 校验通过→识别；Step1 识别完成→确认；Step2 满足条件→保存。
  // 简介 textarea 内的普通回车保留换行（cmd/ctrl+回车仍可在任意位置保存）；IME 组字回车忽略。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (step === 0) {
        if (isValidUrlLike(draft.url)) { e.preventDefault(); startRecognize() }
      } else if (step === 1) {
        if (canConfirm) { e.preventDefault(); toConfirm() }
      } else if (step === 2) {
        if (tag === 'TEXTAREA' && !(e.metaKey || e.ctrlKey)) return
        if (!isSaving && draftLocations.length > 0) { e.preventDefault(); void handleSaveClick() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [step, draft.url, canConfirm, isSaving, draftLocations.length, startRecognize, toConfirm, handleSaveClick])

  // AI 关闭时没有独立的识别步（抓取在确认卡里边抓边填），轨道收成两步
  const railSteps = useMemo(() => {
    if (isEdit) return STEPS.filter((s) => s.k === 'confirm')
    if (canUseAi) return STEPS
    return STEPS.filter((s) => s.k !== 'recognize')
  }, [isEdit, canUseAi])
  const railActiveIdx = isEdit ? 2 : step

  return (
    <div className="gm-wiz">
      {/* 左侧步骤轨道 */}
      <aside className="gm-rail">
        <div className="gm-rail-brand">
          <span className="gm-rail-logo">
            <Ico name="bookmark" />
          </span>
          <span className="gm-rail-name">鹅的书签</span>
        </div>
        <nav className="gm-rail-steps">
          {railSteps.map((s) => {
            const realIdx = STEPS.findIndex((x) => x.k === s.k)
            const active = realIdx === railActiveIdx
            const done = realIdx < railActiveIdx
            return (
              <div key={s.k} className={`gm-rail-step${active ? ' on' : ''}${done ? ' done' : ''}`}>
                <span className="gm-rail-dot">
                  {done ? <Ico name="check" /> : <Ico name={s.icon} />}
                </span>
                <span className="gm-rail-label">{s.label}</span>
              </div>
            )
          })}
        </nav>
        <button className="gm-rail-back" onClick={handleCancel} disabled={isSaving}>
          <Ico name="arrow-left" />
          返回列表
        </button>
      </aside>

      {/* 右侧主区 */}
      <div className="gm-wiz-main">
        <div className={`gm-wiz-body${step === 1 ? ' centered' : ''}`} key={`${isEdit ? 'edit' : 'new'}-${step}`}>
          {step === 0 && (
            <CaptureStep
              url={draft.url}
              setUrl={setUrl}
              onPaste={handlePaste}
            />
          )}
          {step === 1 && (
            <RecognizeStep
              status={recogStatus}
              stageIndex={stageIndex}
              draft={draft}
              previewIconUrl={previewIconUrl}
              previewIcon={previewIcon}
              titleFetching={titleFetching}
              descFetching={descFetching}
              canUseAi={canUseAi}
              onManual={manualFill}
              onRetry={retry}
            />
          )}
          {step === 2 && (
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
          )}

          {formError && step === 2 && (
            <div className="gm-wiz-error">
              <Ico name="alert-circle" />
              {formError}
            </div>
          )}
        </div>

        {/* 底部 footer */}
        <footer className="gm-wiz-foot">
          {isEdit && (
            <button className="btn btn-ghost danger" onClick={handleDeleteClick} disabled={isSaving}>
              <Ico name="trash-2" />
              删除
            </button>
          )}
          {!isEdit && step > 0 && (
            <button className="btn btn-ghost" onClick={goPrev} disabled={isSaving}>
              <Ico name="arrow-left" />
              上一步
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step === 0 && (
            <button
              className="btn btn-primary"
              onClick={startRecognize}
              disabled={!isValidUrlLike(draft.url)}
            >
              下一步
              <Ico name="arrow-right" />
            </button>
          )}
          {step === 1 && (
            <button className="btn btn-primary" onClick={toConfirm} disabled={!canConfirm}>
              确认并归类
              <Ico name="arrow-right" />
            </button>
          )}
          {step === 2 && (
            <>
              <button className="btn btn-ghost" onClick={handleCancel} disabled={isSaving}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveClick}
                disabled={isSaving || draftLocations.length === 0}
              >
                {isSaving ? <Ico name="loader" style={{ animation: 'spin 1s linear infinite' }} /> : <Ico name="check" />}
                {isEdit ? '保存修改' : '保存书签'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}

/* ============ Step 0: 捕获链接 ============ */
function CaptureStep({
  url,
  setUrl,
  onPaste,
}: {
  url: string
  setUrl: (v: string) => void
  onPaste: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <div className="gm-capture">
      <div className="gm-capture-head">
        <h1>添加一个书签</h1>
        <p>粘贴或输入网址，自动识别标题、图标与简介，下一步确认归类</p>
      </div>

      <div className="gm-url-big">
        <Ico name="link" className="gm-url-icon" />
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="粘贴或输入网址…"
        />
        {!url.trim() && (
          <button className="gm-url-paste" onClick={onPaste} title="从剪贴板粘贴">
            <Ico name="paste" />
            粘贴
          </button>
        )}
      </div>

      {/{[^}]+}/.test(url) && (
        <div className="gm-capture-hint">
          URL 含 {'{query}'} 可作为模板，呼出后直接输入关键词跳转
        </div>
      )}
    </div>
  )
}

/* ============ Step 1: 智能识别 ============ */
const STAGES = [
  { key: 'connect', label: '解析链接', hint: '校验地址 · 识别站点', icon: 'globe', ai: false },
  { key: 'fetch', label: '抓取信息', hint: '读取标题 · 简介 · 图标', icon: 'download', ai: false },
  { key: 'ai', label: 'AI 整理', hint: '提炼标题 · 生成简介 · 推荐分类', icon: 'sparkles', ai: true },
]

function RecognizeStep({
  status,
  stageIndex,
  draft,
  previewIconUrl,
  previewIcon,
  titleFetching,
  descFetching,
  canUseAi,
  onManual,
  onRetry,
}: {
  status: 'running' | 'done' | 'failed'
  stageIndex: number
  draft: { title: string; desc: string; url: string }
  previewIconUrl: string
  previewIcon: { bgColor?: string } | null
  titleFetching: boolean
  descFetching: boolean
  canUseAi: boolean
  onManual: () => void
  onRetry: () => void
}) {
  // AI 未开启时 AI 整理永不点亮,只展示前两步,避免“卡在不会推进的步骤”观感
  const stages = useMemo(() => (canUseAi ? STAGES : STAGES.filter((s) => !s.ai)), [canUseAi])
  const host = useMemo(() => {
    try {
      return new URL(/^https?:\/\//.test(draft.url) ? draft.url : `https://${draft.url}`).host.replace(/^www\./, '')
    } catch {
      return draft.url
    }
  }, [draft.url])

  return (
    <div className="gm-recog">
      <div className="gm-recog-grid">
        {/* 左：环 + 阶段，或失败卡片 */}
        <div className="gm-recog-left">
          {status === 'failed' ? (
            <FailureCard onManual={onManual} onRetry={onRetry} />
          ) : (
            <>
              <div className="gm-recog-ring-wrap">
                {status === 'done' ? (
                  <div className="gm-recog-ring done">
                    <Ico name="check" />
                  </div>
                ) : (
                  <div className="gm-recog-ring running">
                    <svg viewBox="0 0 132 132">
                      <defs>
                        <linearGradient id="gm-recog-grad" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0" stopColor="var(--accent)" />
                          <stop offset="1" stopColor="var(--ai)" />
                        </linearGradient>
                      </defs>
                      <circle className="gm-recog-track" cx="66" cy="66" r="57" />
                      <circle className="gm-recog-fill" cx="66" cy="66" r="57" />
                    </svg>
                    <span className="gm-recog-ring-icon">
                      <Ico name={stageIndex === 2 ? 'sparkles' : 'loader'} />
                    </span>
                  </div>
                )}
              </div>
              <div className="gm-stages">
                {stages.map((st, i) => {
                  const sDone = status === 'done' || i < stageIndex
                  const sActive = status === 'running' && i === stageIndex
                  return (
                    <div
                      key={st.key}
                      className={`gm-stage${sDone ? ' done' : ''}${sActive ? ' active' : ''}${st.ai ? ' ai' : ''}`}
                    >
                      <div className="gm-stage-mark">
                        <span className="gm-stage-node">
                          {sDone ? <Ico name="check" /> : <Ico name={st.icon} />}
                          {sActive && <span className="gm-stage-ping" />}
                        </span>
                        {i < stages.length - 1 && <span className="gm-stage-bar" />}
                      </div>
                      <div className="gm-stage-text">
                        <div className="gm-stage-title">
                          {st.label}
                          {sActive && <span className="gm-stage-status active">进行中…</span>}
                          {sDone && <span className="gm-stage-status done">完成</span>}
                        </div>
                        <div className="gm-stage-hint">{st.hint}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* 右：实时预览卡 */}
        <div className={`gm-recog-right${status === 'failed' ? ' dim' : ''}`}>
          <div className="gm-demo-cap">实时预览</div>
          <div className="gm-preview-card">
            <div className="gm-preview-id">
              <div className="gm-preview-fav" style={{ background: previewIcon?.bgColor || 'var(--surface-hover)' }}>
                {previewIconUrl ? (
                  <Image bare src={previewIconUrl} alt="" />
                ) : (
                  <span className="gm-skel-tile" />
                )}
              </div>
              <div className="gm-preview-meta">
                {draft.title && !titleFetching ? (
                  <div className="gm-preview-title">{draft.title}</div>
                ) : (
                  <span className="gm-skel" style={{ width: '58%', height: 18 }} />
                )}
                <div className="gm-preview-host">
                  <Ico name="globe" />
                  {host}
                </div>
              </div>
            </div>
            <div className="gm-preview-desc">
              {draft.desc && !descFetching ? (
                <div>{draft.desc}</div>
              ) : (
                <>
                  <span className="gm-skel ai" style={{ width: '100%', height: 11 }} />
                  <span className="gm-skel ai" style={{ width: '82%', height: 11 }} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FailureCard({ onManual, onRetry }: { onManual: () => void; onRetry: () => void }) {
  return (
    <div className="gm-fail-card">
      <div className="gm-fail-head">
        <span className="gm-fail-icon">
          <Ico name="eye" />
        </span>
        <div>
          <div className="gm-fail-title">没能识别这个站点</div>
          <div className="gm-fail-msg">站点未响应或拒绝读取页面，没有返回可用的标题与简介。可以手动填写，或重试。</div>
        </div>
      </div>
      <div className="gm-fail-acts">
        <button className="btn btn-primary" onClick={onManual}>
          <Ico name="pencil" />
          手动填写
        </button>
        <button className="btn btn-ghost" onClick={onRetry}>
          <Ico name="rotate" />
          重试
        </button>
      </div>
    </div>
  )
}

/* ============ Step 2: 确认并归类 ============ */
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
    if (typeof runUrlFetch !== 'function') return
    runUrlFetch(URL_FETCH_DEBOUNCE_MS)
  }, [draft.url, editingId, originalUrl, runUrlFetch])

  const previewText = ((draft.title || draft.url) || 'ICON').trim().slice(0, 2).toUpperCase()

  return (
    <div className="gm-confirm">
      <div className="gm-confirm-head">
        <h2>确认并归类</h2>
        <p>{canUseAi ? 'AI 已填好内容，确认无误、选好位置即可保存' : '确认信息、选好位置即可保存'}</p>
      </div>

      <section className="gm-confirm-url">
        <div className="gm-id-label">链接 / 模板</div>
        <div className="gm-url-big">
          <Ico name="link" className="gm-url-icon" />
          <input
            value={draft.url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… 或含 {query} 的搜索模板"
            spellCheck={false}
          />
          {!draft.url.trim() && (
            <button type="button" className="gm-url-paste" onClick={onPaste} title="从剪贴板粘贴">
              <Ico name="paste" />
              粘贴
            </button>
          )}
        </div>
        {/{[^}]+}/.test(draft.url) && (
          <div className="gm-capture-hint">
            URL 含 {'{query}'} 可作为模板，呼出后直接输入关键词跳转
          </div>
        )}
      </section>

      {/* 身份卡 */}
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
            <div className="gm-id-label">
              标题
              {canUseAi && (
                <button className="gm-id-ai" onClick={() => askAI(true)} disabled={isGenerating}>
                  <Ico name={isGenerating ? 'loader' : 'wand-sparkles'} className={isGenerating ? 'spin' : ''} />
                  {isGenerating ? '生成中…' : 'AI 预填'}
                </button>
              )}
            </div>
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

      {/* 归类标题行 */}
      <div className="gm-cat-head">
        <Ico name="folder" />
        <span className="gm-cat-title">放到哪里</span>
        <span className="gm-cat-sub">可同时放进多个分组</span>
        {canUseAi && (
          <button className="ai-pill" onClick={askCategorySuggestion} disabled={isSuggestingCategory}>
            <Ico name="wand-sparkles" />
            {isSuggestingCategory ? '推荐中…' : 'AI 推荐'}
          </button>
        )}
      </div>

      {/* AI 推荐分类 */}
      {categorySuggestion && (
        <div className="gm-ai-suggest">
          <div className="gm-ai-suggest-head">
            <Ico name="sparkles" />
            <span>AI 推荐分类</span>
            <span className="gm-conf">
              <span className="gm-conf-bar">
                <span className="gm-conf-fill" style={{ width: `${Math.round(categorySuggestion.confidence * 100)}%` }} />
              </span>
              {Math.round(categorySuggestion.confidence * 100)}%
            </span>
          </div>
          <div className="gm-ai-suggest-body">
            <span className="gm-ai-suggest-glyph">
              <Ico name="folder" />
            </span>
            <div className="gm-ai-suggest-meta">
              <div className="gm-ai-suggest-name">
                {categorySuggestion.groupName} / {categorySuggestion.subGroupName}
              </div>
              <div className="gm-ai-suggest-reason">{categorySuggestion.reason}</div>
            </div>
            <button className="btn btn-ai sm" onClick={() => applyCategorySuggestion()}>
              <Ico name="check" />
              采纳
            </button>
            <button className="gm-ai-suggest-x" onClick={dismissCategorySuggestion} title="忽略">
              <Ico name="x" />
            </button>
          </div>
        </div>
      )}

      {/* 多位置选择（复用真实 CategoryMultiSelect inline）；form-category-select 让 chip 套用 home.css token，避免落回原始 Tailwind 类在深色下露白条/橙块 */}
      <div className="gm-cat-select form-category-select">
        <CategoryMultiSelect inline value={draftLocations} onChange={setLocations} />
      </div>
    </div>
  )
}
