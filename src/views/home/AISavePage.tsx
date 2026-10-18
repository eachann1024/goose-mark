import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import confetti, { type Options } from 'canvas-confetti'
import { AnimatePresence, LayoutGroup, motion, useAnimate, useReducedMotion, type Transition } from 'motion/react'
import { iconToDisplayUrl } from '@/services/iconCache'
import { AI_SAVE_STEPS, startAISave, useAISaveSession, type AISaveStep } from '@/stores/aiSaveSession'
import type { BookmarkLocation, IconSource } from '@/types/bookmark'
import { Ico } from './icon'
import './ai-save.css'

// ---- 动效常量 ----
const EASE_MOVE = [0.22, 1, 0.36, 1] as const
const EASE_FADE = [0.4, 0, 1, 1] as const
/** 弹簧：阻尼比 ζ = damping / (2·√stiffness) ≈ 0.8，无明显回弹 */
const SPRING_SETTLE: Transition = { type: 'spring', stiffness: 380, damping: 31 }
const SPRING_CHIP: Transition = { type: 'spring', stiffness: 500, damping: 36 }
const SPRING_PIXEL: Transition = { type: 'spring', stiffness: 260, damping: 26 }
const MORPH: Transition = { duration: 0.36, ease: EASE_MOVE }
const FADE_OUT: Transition = { duration: 0.2, ease: EASE_FADE }
const LAYER_GAP = 120
const MORPH_LEAD = 0.18 // 骨架形变先行，内容随后揭示（秒）

const STEP_LABEL: Record<AISaveStep, string> = { judge: '判断', detect: '识别', fetch: '抓取', organize: '整理', save: '保存' }

type IconVariant = 'pixels' | 'iris' | 'flip' | 'shards'
const ICON_VARIANTS: IconVariant[] = ['pixels', 'iris', 'flip', 'shards']

// ---- 工具 ----
function splitUrl(url: string) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const rest = `${u.pathname === '/' ? '' : u.pathname}${u.search}`
    return { host, rest }
  } catch {
    return { host: url, rest: '' }
  }
}

function descChunks(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: 'word' }) => { segment: (t: string) => Iterable<{ segment: string }> } }).Segmenter
  const parts = Seg ? Array.from(new Seg('zh', { granularity: 'word' }).segment(text), (s) => s.segment) : text.split(/(?<=[\s，。、；,.;])/)
  const chunks: string[] = []
  let buf = ''
  for (const p of parts) {
    buf += p
    if (buf.length >= 5 || /[\s，。、；,.;！？!?]$/.test(buf)) {
      chunks.push(buf)
      buf = ''
    }
  }
  if (buf) chunks.push(buf)
  return chunks
}

// ---- 骨架 → 内容 形变槽位 ----
function Slot({
  ready,
  pending,
  width,
  height,
  reduced,
  className,
  children
}: {
  ready: boolean
  pending: boolean
  width: number | string
  height: number
  reduced: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <motion.div
      layout={!reduced}
      transition={MORPH}
      className={`ais-slot${ready ? ' is-ready' : ''}${className ? ` ${className}` : ''}`}
      style={ready ? { borderRadius: 6 } : { width, height, borderRadius: 6 }}
    >
      <AnimatePresence initial={false}>
        {!ready && (
          <motion.span
            key="skel"
            className="ais-skel"
            style={{ borderRadius: 6 }}
            initial={{ opacity: 1 }}
            animate={pending && !reduced ? { opacity: [1, 0.55, 1] } : { opacity: 1 }}
            transition={pending && !reduced ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
            exit={{ opacity: 0, transition: FADE_OUT }}
          />
        )}
      </AnimatePresence>
      {ready && (
        <motion.div layout={!reduced} transition={MORPH} className="ais-slot-body">
          {children}
        </motion.div>
      )}
    </motion.div>
  )
}

// ---- 文本揭示 ----
function UrlReveal({ url, reduced }: { url: string; reduced: boolean }) {
  const { host, rest } = splitUrl(url)
  return (
    <motion.span
      className="ais-url"
      title={url}
      initial={reduced ? { opacity: 0 } : { clipPath: 'inset(0 100% 0 0)' }}
      animate={reduced ? { opacity: 1 } : { clipPath: 'inset(0 0% 0 0)' }}
      transition={reduced ? { duration: 0.2 } : { duration: 0.4, ease: EASE_MOVE, delay: MORPH_LEAD }}
    >
      <span className="ais-url-host">{host}</span>
      {rest && <span className="ais-url-rest">{rest}</span>}
    </motion.span>
  )
}

function TitleReveal({ text, reduced }: { text: string; reduced: boolean }) {
  if (reduced) {
    return <motion.span className="ais-title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>{text}</motion.span>
  }
  const chars = Array.from(text)
  return (
    <span className="ais-title" aria-label={text}>
      {chars.map((c, i) => (
        <span key={i} className="ais-ch-mask" aria-hidden>
          <motion.span
            className="ais-ch"
            initial={{ y: '105%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            transition={{ duration: 0.36, ease: EASE_MOVE, delay: MORPH_LEAD + i * 0.018 }}
          >
            {c === ' ' ? ' ' : c}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

function DescReveal({ text, reduced }: { text: string; reduced: boolean }) {
  const chunks = useMemo(() => descChunks(text), [text])
  if (reduced) {
    return <motion.p className="ais-desc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>{text}</motion.p>
  }
  return (
    <p className="ais-desc" aria-label={text}>
      {chunks.map((c, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="ais-chunk"
          initial={{ clipPath: 'inset(0 100% 0 0)', opacity: 0.2 }}
          animate={{ clipPath: 'inset(0 0% 0 0)', opacity: 1 }}
          transition={{ duration: 0.44, ease: EASE_MOVE, delay: MORPH_LEAD + i * 0.05 }}
        >
          {c}
        </motion.span>
      ))}
    </p>
  )
}

function PathReveal({ path, reduced }: { path: { groupName: string; subGroupName: string; createdGroup: boolean; createdSub: boolean }; reduced: boolean }) {
  const chips = [
    { name: path.groupName, created: path.createdGroup, icon: true },
    { name: path.subGroupName, created: path.createdSub, icon: false }
  ]
  return (
    <div className="ais-path">
      {chips.map((chip, i) => (
        <span key={i} className="ais-path-item">
          {i > 0 && (
            <motion.span
              className="ais-path-sep"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.16, delay: reduced ? 0 : MORPH_LEAD + i * 0.14 }}
            >
              <Ico name="chevron-right" />
            </motion.span>
          )}
          <motion.span
            className={`ais-chip${chip.created ? ' is-new' : ''}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.88 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            transition={reduced ? { duration: 0.2 } : { ...SPRING_CHIP, delay: MORPH_LEAD + i * 0.14 }}
          >
            {chip.icon && <Ico name="folder" />}
            {chip.name}
          </motion.span>
        </span>
      ))}
    </div>
  )
}

// ---- 图标揭示 ----
const AVATAR = 56
const PIXEL_GRID = 7

function Monogram({ letter, bg, reduced }: { letter: string; bg?: string; reduced: boolean }) {
  const size = letter.length > 2 ? 15 : letter.length > 1 ? 19 : 24
  return (
    <span className="ais-mono" style={bg ? { background: bg } : undefined}>
      <span className="ais-mono-mask">
        <motion.span
          className="ais-mono-letter"
          style={{ fontSize: size }}
          initial={reduced ? { opacity: 0 } : { y: '110%' }}
          animate={reduced ? { opacity: 1 } : { y: '0%' }}
          transition={reduced ? { duration: 0.2 } : { duration: 0.44, ease: EASE_MOVE, delay: MORPH_LEAD }}
        >
          {letter}
        </motion.span>
      </span>
    </span>
  )
}

function PixelsReveal({ src, bg }: { src: string; bg?: string }) {
  const tiles = useMemo(() => {
    const cell = AVATAR / PIXEL_GRID
    const c = (PIXEL_GRID - 1) / 2
    return Array.from({ length: PIXEL_GRID * PIXEL_GRID }, (_, i) => {
      const col = i % PIXEL_GRID
      const row = Math.floor(i / PIXEL_GRID)
      const angle = Math.random() * Math.PI * 2
      const dist = 26 + Math.random() * 34
      return {
        col, row, cell,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        delay: MORPH_LEAD + Math.hypot(col - c, row - c) * 0.035 + Math.random() * 0.04
      }
    })
  }, [])
  return (
    <span className="ais-pixels" style={bg ? { background: bg } : undefined}>
      {tiles.map((t, i) => (
        <motion.span
          key={i}
          className="ais-pixel"
          style={{
            left: t.col * t.cell,
            top: t.row * t.cell,
            width: t.cell + 0.5,
            height: t.cell + 0.5,
            backgroundImage: `url("${src}")`,
            backgroundSize: `${AVATAR}px ${AVATAR}px`,
            backgroundPosition: `-${t.col * t.cell}px -${t.row * t.cell}px`
          }}
          initial={{ x: t.x, y: t.y, opacity: 0, scale: 0.3 }}
          animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          transition={{ ...SPRING_PIXEL, delay: t.delay, opacity: { duration: 0.2, delay: t.delay } }}
        />
      ))}
    </span>
  )
}

function IrisReveal({ src, bg }: { src: string; bg?: string }) {
  return (
    <motion.span
      className="ais-img-wrap"
      style={bg ? { background: bg } : undefined}
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(72% at 50% 50%)' }}
      transition={{ duration: 0.48, ease: EASE_MOVE, delay: MORPH_LEAD }}
    >
      <img src={src} alt="" draggable={false} />
    </motion.span>
  )
}

function FlipReveal({ src, bg, letter }: { src: string; bg?: string; letter: string }) {
  return (
    <span className="ais-flip">
      <motion.span
        className="ais-flip-inner"
        initial={{ rotateY: 0 }}
        animate={{ rotateY: 180 }}
        transition={{ duration: 0.52, ease: EASE_MOVE, delay: MORPH_LEAD + 0.12 }}
      >
        <span className="ais-flip-face ais-mono">
          <span className="ais-mono-letter" style={{ fontSize: 24 }}>{letter}</span>
        </span>
        <span className="ais-flip-face is-back ais-img-wrap" style={bg ? { background: bg } : undefined}>
          <img src={src} alt="" draggable={false} />
        </span>
      </motion.span>
    </span>
  )
}

const SHARDS = [
  { clip: 'polygon(0 0, 100% 0, 50% 50%)', x: 0, y: -22, r: -14 },
  { clip: 'polygon(100% 0, 100% 100%, 50% 50%)', x: 22, y: 0, r: 12 },
  { clip: 'polygon(100% 100%, 0 100%, 50% 50%)', x: 0, y: 22, r: -10 },
  { clip: 'polygon(0 100%, 0 0, 50% 50%)', x: -22, y: 0, r: 14 }
]

function ShardsReveal({ src, bg }: { src: string; bg?: string }) {
  return (
    <span className="ais-shards">
      {SHARDS.map((s, i) => (
        <motion.span
          key={i}
          className="ais-shard ais-img-wrap"
          style={{ clipPath: s.clip, ...(bg ? { background: bg } : null) }}
          initial={{ x: s.x, y: s.y, rotate: s.r, opacity: 0 }}
          animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          transition={{ duration: 0.44, ease: EASE_MOVE, delay: MORPH_LEAD + i * 0.06, opacity: { duration: 0.18, delay: MORPH_LEAD + i * 0.06 } }}
        >
          <img src={src} alt="" draggable={false} />
        </motion.span>
      ))}
    </span>
  )
}

function IconReveal({ src, letter, bg, variant, reduced }: { src: string | null; letter: string; bg?: string; variant: IconVariant; reduced: boolean }) {
  if (!src) return <Monogram letter={letter} bg={bg} reduced={reduced} />
  if (reduced) {
    return (
      <motion.span className="ais-img-wrap" style={bg ? { background: bg } : undefined} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
        <img src={src} alt="" draggable={false} />
      </motion.span>
    )
  }
  if (variant === 'pixels') return <PixelsReveal src={src} bg={bg} />
  if (variant === 'iris') return <IrisReveal src={src} bg={bg} />
  if (variant === 'flip') return <FlipReveal src={src} bg={bg} letter={letter} />
  return <ShardsReveal src={src} bg={bg} />
}

/** 图标就绪：数据到达且图片已加载（失败/超时则退回字标） */
function useIconSource(icon: IconSource | null | undefined) {
  const display = icon ? iconToDisplayUrl(icon) : null
  const [state, setState] = useState<{ key: string; ok: boolean } | null>(null)
  useEffect(() => {
    if (!display) return
    let alive = true
    const img = new Image()
    const finish = (ok: boolean) => { if (alive) setState((s) => (s?.key === display ? s : { key: display, ok })) }
    const timer = setTimeout(() => finish(false), 2000)
    img.onload = () => { clearTimeout(timer); finish(true) }
    img.onerror = () => { clearTimeout(timer); finish(false) }
    img.src = display
    return () => { alive = false; clearTimeout(timer) }
  }, [display])
  if (icon === undefined) return { ready: false, src: null }
  if (!display) return { ready: true, src: null }
  if (state?.key !== display) return { ready: false, src: null }
  return { ready: true, src: state.ok ? display : null }
}

// ---- 进度轨 ----
type StepState = 'done' | 'active' | 'pending' | 'failed' | 'skipped'

function ProgressRail({ states, reduced, searched }: { states: StepState[]; reduced: boolean; searched: boolean }) {
  return (
    <ol className="ais-rail">
      {AI_SAVE_STEPS.map((step, i) => {
        const st = states[i]
        return (
          <li key={step} className={`ais-step is-${st}`}>
            {i > 0 && (
              <span className="ais-track">
                <motion.span
                  className="ais-track-fill"
                  initial={false}
                  animate={{ scaleX: st === 'done' || st === 'active' || st === 'failed' ? 1 : 0 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.32, ease: EASE_MOVE }}
                />
              </span>
            )}
            <span className="ais-dot">
              {st === 'active' && !reduced && (
                <motion.span
                  className="ais-dot-ring"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 2.4, opacity: 0 }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: EASE_MOVE }}
                />
              )}
              <AnimatePresence initial={false}>
                {(st === 'done' || st === 'failed') && (
                  <motion.span
                    key={st}
                    className="ais-dot-mark"
                    initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={reduced ? { duration: 0.16 } : { duration: 0.2, ease: EASE_MOVE }}
                  >
                    <Ico name={st === 'done' ? 'check' : 'x'} />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <span className="ais-step-label">{step === 'detect' && searched ? '搜索' : STEP_LABEL[step]}</span>
          </li>
        )
      })}
    </ol>
  )
}

// ---- 会话视图（按 sessionId 重挂载，重置揭示进度） ----
const LAYER_COUNT = 5

function SessionView({ onBack, onJump }: { onBack: () => void; onJump: (loc: BookmarkLocation) => void }) {
  const reduced = !!useReducedMotion()
  const s = useAISaveSession()
  const variant = useMemo(() => ICON_VARIANTS[Math.floor(Math.random() * ICON_VARIANTS.length)], [])
  const iconSrc = useIconSource(s.icon)
  const letter = useMemo(() => {
    if (s.icon?.type === 'text') return s.icon.value
    const host = s.url ? splitUrl(s.url).host : ''
    return (host[0] || '·').toUpperCase()
  }, [s.icon, s.url])

  const finished = s.phase === 'done' || s.phase === 'exists'
  const ready = [
    !!s.url,
    iconSrc.ready,
    s.title !== null,
    s.description !== null,
    s.path !== null || (s.phase === 'exists' && s.title !== null)
  ]

  // 渐进揭示：上一层落定后才揭示下一层
  const [revealed, setRevealed] = useState(0)
  const [busy, setBusy] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])
  useEffect(() => {
    if (busy || revealed >= LAYER_COUNT || !ready[revealed]) return
    const k = revealed
    const dur = reduced ? 200 : layerDuration(k, s)
    setRevealed(k + 1)
    setBusy(true)
    timerRef.current = setTimeout(() => setBusy(false), dur + (reduced ? 60 : LAYER_GAP))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, revealed, ...ready])

  const settled = finished && revealed >= LAYER_COUNT && !busy
  const failed = s.phase === 'error'

  // 完成：卡片轻微落定
  const [cardScope, animateCard] = useAnimate<HTMLDivElement>()
  useEffect(() => {
    if (!settled || reduced || !cardScope.current) return
    animateCard(cardScope.current, { scale: [1.02, 1] }, SPRING_SETTLE)
  }, [settled, reduced, animateCard, cardScope])

  const stepIdx = AI_SAVE_STEPS.indexOf(s.step)
  const states: StepState[] = AI_SAVE_STEPS.map((_, i) => {
    if (s.phase === 'done') return 'done'
    if (s.phase === 'exists') return i < stepIdx ? 'done' : 'skipped'
    if (failed) return i < stepIdx ? 'done' : i === stepIdx ? 'failed' : 'pending'
    return i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'pending'
  })

  const heading = failed
    ? (s.rejected ? '检测不到书签' : '保存失败')
    : settled
      ? (s.phase === 'exists' ? '已在书签中' : '已保存')
      : s.step === 'judge'
        ? '正在判断'
        : s.searched && !s.url
          ? '正在搜索'
          : '正在保存'
  const pendingLayer = failed ? -1 : revealed
  const isShown = (k: number) => revealed > k

  const primaryRef = useRef<HTMLButtonElement>(null)
  const showActions = settled || failed
  useEffect(() => {
    if (showActions) primaryRef.current?.focus({ preventScroll: true })
  }, [showActions])

  return (
    <div className="ais-stage">
      {settled && s.phase === 'done' && !reduced && <SaveConfetti />}
      <div className="ais-heading-row">
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={heading}
            className="ais-heading"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.16, ease: EASE_FADE } }}
            transition={{ duration: 0.24, ease: EASE_MOVE }}
          >
            {heading}
          </motion.h1>
        </AnimatePresence>
      </div>

      <div ref={cardScope} className="ais-card-shell">
        <LayoutGroup>
          <motion.div layout={!reduced} transition={MORPH} className={`ais-card${failed ? ' is-failed' : ''}`}>
            <Slot ready={isShown(0)} pending={pendingLayer === 0} width="58%" height={14} reduced={reduced} className="ais-url-slot">
              {s.url && <UrlReveal url={s.url} reduced={reduced} />}
            </Slot>

            <div className="ais-head">
              <div className={`ais-avatar${isShown(1) ? ' is-ready' : ''}`}>
                <AnimatePresence initial={false}>
                  {!isShown(1) && (
                    <motion.span
                      key="skel"
                      className="ais-skel"
                      animate={pendingLayer === 1 && !reduced ? { opacity: [1, 0.55, 1] } : { opacity: 1 }}
                      transition={pendingLayer === 1 && !reduced ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
                      exit={{ opacity: 0, transition: FADE_OUT }}
                    />
                  )}
                </AnimatePresence>
                {isShown(1) && (
                  <IconReveal src={iconSrc.src} letter={letter} bg={s.icon?.bgColor} variant={variant} reduced={reduced} />
                )}
              </div>
              <div className="ais-text">
                <Slot ready={isShown(2)} pending={pendingLayer === 2} width="64%" height={22} reduced={reduced} className="ais-title-slot">
                  {s.title !== null && <TitleReveal text={s.title} reduced={reduced} />}
                </Slot>
                {!(isShown(3) && !s.description) && (
                  <Slot ready={isShown(3)} pending={pendingLayer === 3} width="92%" height={34} reduced={reduced} className="ais-desc-slot">
                    {s.description ? <DescReveal text={s.description} reduced={reduced} /> : null}
                  </Slot>
                )}
              </div>
            </div>

            {!(isShown(4) && !s.path) && (
              <div className="ais-foot">
                <Slot ready={isShown(4)} pending={pendingLayer === 4} width={150} height={24} reduced={reduced} className="ais-path-slot">
                  {s.path && <PathReveal path={s.path} reduced={reduced} />}
                </Slot>
              </div>
            )}
          </motion.div>
        </LayoutGroup>
      </div>

      <ProgressRail states={states} reduced={reduced} searched={s.searched} />

      <div className="ais-bottom">
        <AnimatePresence>
          {showActions && (
            <motion.div
              key={failed ? 'fail' : 'ok'}
              className="ais-actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: FADE_OUT }}
              transition={{ duration: 0.2, ease: EASE_MOVE }}
            >
              {failed && s.error && !s.rejected && <p className="ais-error">{s.error}</p>}
              <div className="ais-btns">
                {failed && !s.rejected ? (
                  <button ref={primaryRef} type="button" className="ais-btn is-primary" onClick={() => startAISave(s.input)}>
                    <Ico name="rotate-ccw" />重试
                  </button>
                ) : !failed && s.location ? (
                  <button ref={primaryRef} type="button" className="ais-btn is-primary" onClick={() => onJump(s.location!)}>
                    <Ico name="folder-open" />查看位置
                  </button>
                ) : null}
                <button ref={failed && s.rejected ? primaryRef : undefined} type="button" className={failed && s.rejected ? 'ais-btn is-primary' : 'ais-btn'} onClick={onBack}>返回</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function SaveConfetti() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const shoot = confetti.create(canvas, { resize: true, useWorker: false, disableForReducedMotion: true })
    const accent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#8c6a4f'
    const colors = [accent, '#e4d3b4', '#c9846a', '#7f9a86', '#f3eee6']
    const base: Options = {
      colors,
      gravity: 0.35,
      decay: 0.94,
      ticks: 520,
      scalar: 0.8,
      startVelocity: 14,
      shapes: ['circle', 'square'],
      origin: { x: 0.5, y: 0.36 }
    }
    void shoot({ ...base, particleCount: 42, spread: 46 })
    const timer = window.setTimeout(() => {
      void shoot({ ...base, particleCount: 24, spread: 72, startVelocity: 10, origin: { x: 0.5, y: 0.42 } })
    }, 420)
    return () => {
      window.clearTimeout(timer)
      shoot.reset()
    }
  }, [])
  return <canvas ref={ref} className="ais-confetti" aria-hidden />
}

/** 各层揭示时长（毫秒），用于串行衔接 */
function layerDuration(k: number, s: { title: string | null; description: string | null }) {
  const lead = MORPH_LEAD * 1000
  switch (k) {
    case 0: return lead + 400
    case 1: return lead + 640
    case 2: return lead + 360 + Array.from(s.title ?? '').length * 18
    case 3: return s.description ? lead + 440 + descChunks(s.description).length * 50 : 200
    default: return lead + 140 + 320
  }
}

export default function AISavePage({ onBack, onJump }: { onBack: () => void; onJump: (loc: BookmarkLocation) => void }) {
  const sessionId = useAISaveSession((st) => st.sessionId)
  return (
    <div className="ais-page">
      <button type="button" className="ais-back" aria-label="返回" onClick={onBack}>
        <Ico name="chevron-left" />
      </button>
      <SessionView key={sessionId} onBack={onBack} onJump={onJump} />
    </div>
  )
}
