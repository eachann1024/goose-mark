import React, { useEffect, useState } from 'react'
import { AbsoluteFill, Audio, continueRender, delayRender, getInputProps, staticFile, useCurrentFrame } from 'remotion'
import { CLOUD, DEEP, FREEZE, H, HAND, PAPER, TOAST, W, WIN, a } from './theme'
import { BOUNCY, CUES, FLOAT, IN, INOUT, OUT, SOFT, clamp01, ease, lerp, press, prog } from './motion'
import { Filters, FrontSlope, Grain, Landscape } from './Landscape'
import { Keycap, Pointer } from './Pointer'
import { HomeView, Toast, ToastState, UToolsWindow, WinState } from './UTools'
import { InkBox, Panel, Shot4, Shot5, Shot6, Shot7, ShotTitle } from './Inner'
import { Goose } from './Goose'
import { STAGE_TEXT } from './theme'

/* ── 关键帧（与 cues.json 对齐） ── */
const K = {
  keyOpt: CUES.keys[0],
  pop: 84,
  rise: 120,
  focus: CUES.clicks[0],
  keyV: CUES.keys[1],
  paperFly: 306,
  paste: 338,
  home: 372,
  cmdClick: CUES.clicks[1],
  enter: 572,
  morph: 580,
  chips: [CUES.clicks[2], CUES.clicks[3], CUES.clicks[4], CUES.clicks[5]],
  dive: 740,
  back: 1662,
  ready: 1650,
  saveClick: CUES.clicks[6],
  success: CUES.clicks[6] + 6,
  toastClick: CUES.clicks[7],
  grid: 1762,
  card: 1782,
  fold: 1884,
  sink: 1904,
} as const

const FULL_H = WIN.bottom - WIN.y

/* ── 相机：只推拉风景层 ── */
const camera = (f: number) => {
  let s = lerp(1, 1.12, ease(INOUT, f, 0, 209))
  s = lerp(s, 1.2, ease(INOUT, f, K.dive, 24))
  s = lerp(s, 1.12, ease(INOUT, f, K.back - 2, 24))
  s = lerp(s, 1, ease(INOUT, f, 1890, 60))
  return s
}

const winState = (f: number): WinState => {
  const entered = f >= K.enter
  const text: 0 | 1 | 2 = entered ? 2 : f >= K.paste ? 1 : 0
  let inputH = 104
  if (!entered) inputH = lerp(104, 200, SOFT(f - K.paste))
  else inputH = lerp(200, 104, ease(INOUT, f, K.enter, 24))
  let homeH = entered ? FULL_H - inputH : 480 * ease(OUT, f, K.home, 24)
  homeH *= 1 - ease(INOUT, f, K.fold, 22)
  let view: HomeView = 'usearch'
  let prevView: HomeView | undefined
  let viewT = 1
  if (f >= K.grid) {
    view = 'grid'
    prevView = 'list'
    viewT = ease(OUT, f, K.grid, 24)
  } else if (entered) {
    view = 'list'
    prevView = 'usearch'
    viewT = ease(OUT, f, K.enter, 24)
  }
  const blink = Math.floor(f / 30) % 2 === 0
  return {
    inputH,
    homeH,
    text,
    caret: text !== 1 && f >= K.pop + 20 && blink && f < K.fold,
    view,
    prevView,
    viewT,
    cmdHover: ease(OUT, f, 504, 10),
    cmdSel: f >= K.cmdClick + 6 ? Math.min(1.2, BOUNCY(f - K.cmdClick - 6)) : 0,
    cmdScale: 1 - 0.05 * press(f, K.cmdClick),
    cmdHide: f >= K.morph ? 1 : 0,
    newCard: f >= K.card ? SOFT(f - K.card) : 0,
    newHover: ease(OUT, f, 1836, 10),
  }
}

/** 窗口外观：弹出 → 上移就位 → 钻入隐藏 → 拉回 → 折叠沉入 */
const winLook = (f: number) => {
  if (f < K.pop) return null
  const rise = ease(INOUT, f, K.rise, 86)
  let width = lerp(120, WIN.w, SOFT(f - K.pop))
  let dy = (488 - WIN.y) * (1 - rise)
  let opacity = 1
  let scale = 1
  if (f >= K.dive && f < K.back + 18) {
    const o = ease(IN, f, K.dive, 18)
    const b = ease(OUT, f, K.back, 18)
    const v = f < K.back ? o : 1 - b
    if (v >= 1) return null
    opacity = 1 - v
    scale = 1 + 0.025 * v
  }
  const sink = ease(IN, f, K.sink, 24)
  if (f >= K.sink) {
    width = lerp(WIN.w, 120, sink)
    dy = 560 * sink
    opacity = 1 - clamp01((f - K.sink - 14) / 10)
    if (opacity <= 0) return null
  }
  return { width, dy, opacity, scale, rise }
}

const CMD_RECT = { x: WIN.x + 20, y: WIN.y + 200 + 220 + 76, w: WIN.w - 40, h: 90 }

const toastState = (f: number): ToastState | null => {
  if (f < K.morph) return null
  const m = ease(INOUT, f, K.morph, 24)
  const rect = {
    x: lerp(CMD_RECT.x, TOAST.x, m),
    y: lerp(CMD_RECT.y, TOAST.y, m),
    w: lerp(CMD_RECT.w, TOAST.w, m),
    h: lerp(CMD_RECT.h, TOAST.h, m),
  }
  let active = -1
  K.chips.forEach((c, i) => {
    if (f >= c) active = i
  })
  const dismiss = ease(IN, f, K.toastClick + 6, 18)
  if (dismiss >= 1) return null
  const success = f >= K.success
  return {
    rect,
    content: ease(OUT, f, K.morph + 16, 12),
    mode: success ? 'success' : 'loading',
    stage: f >= K.ready ? '分组就绪 · 点击保存' : active < 0 ? 'AI 创建书签' : STAGE_TEXT[active],
    active,
    done: Math.max(0, active),
    chipPop: K.chips.map((c, i) => 1 - 0.07 * press(f, c) - (i === 3 ? 0.07 * press(f, K.saveClick) : 0)),
    ready: f >= K.ready ? ease(OUT, f, K.ready, 14) : 0,
    chipHover: f >= K.saveClick - 8 && f < K.success ? 1 : 0,
    spin: active >= 0 ? (f - K.chips[0]) * 6 : 0,
    check: success ? BOUNCY(f - K.success) : 0,
    hover: f >= 1744 && f < K.toastClick + 6 ? 1 : 0,
    opacity: 1 - dismiss,
    dy: 40 * dismiss - 4 * press(f, K.toastClick),
  }
}

/** 键帽：自下方升起 → 按下 → 下沉离场 */
const KeyShot: React.FC<{ f: number; label: string; w: number; at: number; y: number }> = ({ f, label, w, at, y }) => {
  const inT = ease(OUT, f, at - 34, 22)
  const outT = ease(IN, f, at + 12, 16)
  if (f < at - 34 || outT >= 1) return null
  return (
    <Keycap
      label={label}
      w={w}
      p={press(f, at)}
      style={{
        position: 'absolute',
        left: (W - w) / 2,
        top: y + (1 - inT) * 50 + outT * 40,
        opacity: Math.min(inT * 1.6, 1) * (1 - outT),
      }}
    />
  )
}

/** 镜 2：纸片从下方飞入输入框 */
const PaperFly: React.FC<{ f: number }> = ({ f }) => {
  const t = INOUT(prog(f, K.paperFly, K.paste - K.paperFly))
  if (f < K.paperFly || f >= K.paste) return null
  const p0 = { x: 300, y: 1000 }
  const c = { x: 220, y: 560 }
  const p1 = { x: 560, y: 262 }
  const u = 1 - t
  const x = u * u * p0.x + 2 * u * t * c.x + t * t * p1.x
  const y = u * u * p0.y + 2 * u * t * c.y + t * t * p1.y
  const w = lerp(300, 180, t)
  const h = lerp(170, 90, t)
  return (
    <InkBox x={x - w / 2} y={y - h / 2} w={w} h={h} fill={PAPER} r={12} style={{ transform: `rotate(${(-8 * u).toFixed(2)}deg)`, filter: `drop-shadow(0 12px 18px ${a(DEEP, 0.2)})` }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ position: 'absolute', left: w * 0.12, top: h * (0.24 + i * 0.22), width: w * (i === 2 ? 0.46 : 0.76), height: h * 0.08, borderRadius: 4, background: a(DEEP, 0.45) }} />
      ))}
    </InkBox>
  )
}

/** 镜 9：结尾标题 */
const EndTitle: React.FC<{ f: number }> = ({ f }) => {
  const p = ease(OUT, f, 1964, 30)
  if (f < 1964) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        width: W,
        top: 190,
        textAlign: 'center',
        fontFamily: HAND,
        fontWeight: 700,
        fontSize: 96,
        letterSpacing: 4,
        lineHeight: 1,
        color: DEEP,
        whiteSpace: 'nowrap',
        transform: `translateY(${(1 - p) * 24}px)`,
        clipPath: `inset(-30px ${((1 - p) * 50).toFixed(2)}% -30px ${((1 - p) * 50).toFixed(2)}%)`,
      }}
    >
      鹅的书签 · AI 创建
    </div>
  )
}

const useFonts = () => {
  const [handle] = useState(() => delayRender('ghibli fonts'))
  useEffect(() => {
    Promise.all([
      document.fonts.load('700 72px "HanziPen SC"', '鹅的书签先找到链接'),
      document.fonts.load('500 34px "PingFang SC"', '周末'),
      document.fonts.load('600 30px "PingFang SC"', '周末'),
      document.fonts.load('600 30px "Menlo"', 'https'),
      document.fonts.load('700 30px "Menlo"', 'https'),
    ])
      .catch(() => undefined)
      .then(() => continueRender(handle))
  }, [handle])
}

export const GhibliVideo: React.FC = () => {
  useFonts()
  const raw = useCurrentFrame()
  const f = Math.min(raw, FREEZE)
  /** QA：bare=true 时只渲染风景，作为四角参考 */
  const bare = Boolean((getInputProps() as { bare?: boolean }).bare)
  const cam = camera(f)
  const look = winLook(f)
  const toast = toastState(f)
  const gooseUp = FLOAT(f - 1944)
  return (
    <AbsoluteFill style={{ background: CLOUD, overflow: 'hidden' }}>
      <Filters />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam})`, transformOrigin: '540px 700px' }}>
        <Landscape t={f} />
        {!bare && f >= 1944 && (
          <Goose x={600} y={684 + (1 - gooseUp) * 230} size={220} neck={Math.sin((f - 1944) * 0.04) * 4} tilt={-6} />
        )}
        <FrontSlope t={f} />
      </div>
      {!bare && (
        <>
          {look && (
            <div
              style={{
                position: 'absolute',
                left: 540 - 330 * (look.width / WIN.w),
                top: 884 + look.dy * 0.1,
                width: 660 * (look.width / WIN.w),
                height: 40,
                borderRadius: '50%',
                background: a(DEEP, 0.14),
                filter: 'blur(14px)',
                opacity: look.opacity * look.rise,
              }}
            />
          )}
          <KeyShot f={f} label="⌥  Space" w={320} at={K.keyOpt} y={480} />
          {look && (
            <UToolsWindow
              s={winState(f)}
              width={look.width}
              style={{ transform: `translateY(${look.dy}px) scale(${look.scale})`, transformOrigin: '430px 340px', opacity: look.opacity }}
            />
          )}
          <KeyShot f={f} label="⌘  V" w={240} at={K.keyV} y={500} />
          <PaperFly f={f} />
          <Panel f={f} inAt={746} outAt={1660} />
          <ShotTitle idx={3} f={f} inAt={754} outAt={912} />
          <ShotTitle idx={4} f={f} inAt={980} outAt={1194} />
          <ShotTitle idx={5} f={f} inAt={1218} outAt={1474} />
          <ShotTitle idx={6} f={f} inAt={1498} outAt={1644} />
          <Shot4 f={f} />
          <Shot5 f={f} clickAt={K.chips[1]} />
          <Shot6 f={f} />
          <Shot7 f={f} />
          {toast && <Toast s={toast} />}
          <EndTitle f={f} />
          <Pointer f={f} visible={f >= 200 && f < 1924} />
        </>
      )}
      <Grain />
      {!bare && <Audio src={staticFile('audio/ghibli.wav')} />}
    </AbsoluteFill>
  )
}
