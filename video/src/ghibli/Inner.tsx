import React from 'react'
import {
  ACCENT,
  CLOUD,
  CLOUD_SH,
  DEEP,
  FOREST,
  PANEL,
  PAPER,
  T_BODY,
  T_MONO,
  T_NUM,
  T_TITLE,
  TITLES,
  URL_TEXT,
  W,
  ZH_DESC,
  ZH_TITLE,
  a,
} from './theme'
import { BOUNCY, D, FLOAT, IN, INOUT, OUT, SOFT, clamp01, ease, lerp, prog } from './motion'
import { Goose } from './Goose'
import { ExIcon } from './UTools'

/* ───────── 通用 ───────── */

export const InkBox: React.FC<{
  x: number
  y: number
  w: number
  h: number
  fill: string
  stroke?: string
  sw?: number
  r?: number
  style?: React.CSSProperties
  children?: React.ReactNode
}> = ({ x, y, w, h, fill, stroke = DEEP, sw = 2.5, r = 18, style, children }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, ...style }}>
    <svg width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      <rect x={sw / 2} y={sw / 2} width={w - sw} height={h - sw} rx={r} fill={fill} stroke={stroke} strokeWidth={sw} filter="url(#wc3)" />
    </svg>
    {children}
  </div>
)

/** 自上而下展开（卷轴式），不缩放 */
const unroll = (p: number): React.CSSProperties => ({ clipPath: `inset(-12px -12px ${((1 - p) * 100).toFixed(2)}% -12px)` })

export const ShotTitle: React.FC<{ idx: number; f: number; inAt: number; outAt: number }> = ({ idx, f, inAt, outAt }) => {
  const text = TITLES[idx]
  if (!text || f < inAt || f >= outAt + 18) return null
  const pin = ease(OUT, f, inAt, D.CUT)
  const pout = ease(IN, f, outAt, 18)
  return (
    <div
      style={{
        position: 'absolute',
        left: 180,
        width: W - 360,
        top: 100,
        height: 72,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        ...T_TITLE,
        color: DEEP,
        transform: `translateY(${(1 - pin) * 22 - pout * 16}px)`,
        clipPath: `inset(-20px ${((1 - pin) * 50).toFixed(2)}% -20px ${((1 - pin) * 50).toFixed(2)}%)`,
        opacity: 1 - pout,
      }}
    >
      {text}
    </div>
  )
}

export const Panel: React.FC<{ f: number; inAt: number; outAt: number }> = ({ f, inAt, outAt }) => {
  if (f < inAt || f >= outAt + 20) return null
  const p = ease(OUT, f, inAt, D.EXPAND)
  const q = ease(IN, f, outAt, 20)
  return (
    <InkBox
      x={PANEL.x}
      y={PANEL.y}
      w={PANEL.w}
      h={PANEL.h}
      fill={PAPER}
      sw={3}
      r={26}
      style={{ ...unroll(p * (1 - q)), filter: `drop-shadow(0 18px 24px ${a(DEEP, 0.18)})` }}
    />
  )
}

/* ───────── 镜 4：识别 ───────── */
const LINES = ['周末想做个手绘风流程图，', '朋友推荐了这个，链接在这：', URL_TEXT, '听说可以多人一起画']
const SHEET = { x: 80, y: 222, w: 620, h: 300 + 120 }
const LINE_X = 120
const lineTop = (i: number) => 252 + i * 60
const LINE_W = [12 * 35, 13 * 35, 22 * 18, 9 * 35]
const RING_H = 58
const RING_W = 104

/** 圈的关键帧：沿文字滑动后圈住网址 */
const RING_KEYS: [number, number, number][] = [
  [806, LINE_X - 10, lineTop(0)],
  [826, LINE_X + LINE_W[0] - RING_W + 6, lineTop(0)],
  [836, LINE_X - 10, lineTop(1)],
  [852, LINE_X + LINE_W[1] - RING_W + 6, lineTop(1)],
  [864, LINE_X - 12, lineTop(2)],
]
const ringAt = (f: number) => {
  let [, x, y] = RING_KEYS[0]
  for (let i = 1; i < RING_KEYS.length; i++) {
    const [f0] = RING_KEYS[i - 1]
    const [f1, x1, y1] = RING_KEYS[i]
    if (f <= f0) break
    const t = INOUT(clamp01((f - f0) / (f1 - f0)))
    x = lerp(x, x1, t)
    y = lerp(y, y1, t)
  }
  const grow = SOFT(f - 864)
  return { x, y: y - 5, w: lerp(RING_W, LINE_W[2] + 24, grow) }
}

/** 网址在屏幕上的矩形（镜 4 浮起 → 镜 5 地址栏） */
export const ADDR = { x: 64, y: 210, w: 450, h: 64 }
const urlChip = (f: number) => {
  const lift = ease(OUT, f, 884, 22)
  const go = ease(INOUT, f, 896, 25)
  const x0 = LINE_X - 14
  const y0 = lineTop(2) - 8 - lift * 4
  return {
    x: lerp(x0, ADDR.x, go),
    y: lerp(y0, ADDR.y, go),
    w: lerp(LINE_W[2] + 28, ADDR.w, go),
    h: lerp(58, ADDR.h, go),
    lift,
    go,
  }
}

const AddressBar: React.FC<{ x: number; y: number; w: number; h: number; shadow: number; border: number }> = ({ x, y, w, h, shadow, border }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      height: h,
      borderRadius: 14,
      background: CLOUD,
      border: `${2.5 * border}px solid ${DEEP}`,
      boxSizing: 'border-box',
      boxShadow: `0 ${10 * shadow}px ${22 * shadow}px ${a(DEEP, 0.2 * shadow)}`,
      display: 'flex',
      alignItems: 'center',
      paddingLeft: 14 + (h - 58) * 0.6,
      ...T_MONO,
      color: ACCENT,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    }}
  >
    {URL_TEXT}
  </div>
)

export const Shot4: React.FC<{ f: number }> = ({ f }) => {
  if (f < 770 || f > 930) return null
  const sheetIn = SOFT(f - 770)
  /** 纸面自上而下收起，给浮起的网址让路 */
  const exit = ease(IN, f, 888, 22)
  const gooseIn = FLOAT(f - 780)
  const ring = ringAt(f)
  const ringOn = f >= 800
  const ringAppear = ease(OUT, f, 800, 8)
  const urlAccent = f >= 878
  const chip = urlChip(f)
  const ringX = ring.x + ring.w / 2
  const look = (ringX - 120) / 460
  const tilt = -14 + Math.sin((f - 780) * 0.05) * 4
  return (
    <>
      <InkBox
        x={SHEET.x}
        y={SHEET.y + (1 - sheetIn) * 40}
        w={SHEET.w}
        h={SHEET.h}
        fill={CLOUD}
        style={exit > 0 ? { clipPath: `inset(${(exit * 100).toFixed(2)}% -12px -12px -12px)` } : unroll(sheetIn)}
      >
        {LINES.map((l, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: LINE_X - SHEET.x,
              top: lineTop(i) - SHEET.y,
              whiteSpace: 'nowrap',
              ...(i === 2 ? { ...T_MONO, lineHeight: '48px', color: urlAccent ? ACCENT : DEEP, opacity: chip.lift > 0 ? 0 : 1 } : { ...T_BODY, color: DEEP }),
            }}
          >
            {l}
          </div>
        ))}
        {chip.lift > 0 && (
          <div
            style={{
              position: 'absolute',
              left: LINE_X - SHEET.x - 14,
              top: lineTop(2) - SHEET.y - 8,
              width: LINE_W[2] + 28,
              height: 58,
              borderRadius: 14,
              border: `2.5px dashed ${CLOUD_SH}`,
              boxSizing: 'border-box',
            }}
          />
        )}
        {ringOn && f < 884 && (
          <svg
            width={ring.w}
            height={RING_H}
            style={{ position: 'absolute', left: ring.x - SHEET.x, top: ring.y - SHEET.y, overflow: 'visible', opacity: ringAppear }}
          >
            <rect x={2} y={2} width={ring.w - 4} height={RING_H - 4} rx={RING_H / 2} fill="none" stroke={ACCENT} strokeWidth={4} filter="url(#wc3)" />
          </svg>
        )}
      </InkBox>
      <Goose
        x={740 + (1 - gooseIn) * 340 + exit * 340}
        y={410}
        size={260}
        flip
        neck={8 - look * 10}
        tilt={tilt}
        style={{ opacity: f < 780 ? 0 : 1 }}
      />
      {chip.lift > 0 && (
        <AddressBar x={chip.x} y={chip.y} w={chip.w} h={chip.h} shadow={chip.lift * (1 - chip.go)} border={chip.go} />
      )}
    </>
  )
}

/* ───────── 镜 5：抓取 ───────── */
const EN_INTRO = ['Virtual', 'whiteboard for', 'hand-drawn', 'diagrams']
const EN_BODY = ['Open source.', 'Collaborative.']
const BLOCK_OFF = [0, 78, 134, 316]
const BLOCK_H = [64, 42, 168, 84]
const Block: React.FC<{ k: number }> = ({ k }) => {
  if (k === 0) return <ExIcon size={64} />
  if (k === 1) return <div style={{ ...T_MONO, fontWeight: 700, color: DEEP }}>Excalidraw</div>
  if (k === 2)
    return (
      <div style={{ ...T_MONO, color: DEEP }}>
        {EN_INTRO.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
    )
  return (
    <div style={{ ...T_MONO, fontWeight: 500, color: a(DEEP, 0.6) }}>
      {EN_BODY.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  )
}
const CARD5 = { x: ADDR.x, y: ADDR.y + ADDR.h - 4, w: ADDR.w, h: 446 }
const SRC_X = 88
const SRC_Y = 296
const COL_X = 560
const COL_Y = 230
/** 各块宽度（Menlo 30px ≈ 18px/字） */
const BW = [64, 182, 254, 254]
/** 鹅到达第 k 块的帧：叼住 6 帧 → 搬运 18 帧 → 松口 2 帧 → 回程 14 帧 */
const ARRIVE = [1004, 1044, 1084, 1124]
const GRAB = 6
const CARRY = 18
const GATHER = 1152
const SLIDE = 1162
const EN_CARD = { x: 64, y: 210, w: 340, h: 440 }
const SLIDE_DX = EN_CARD.x + 20 - COL_X
const GS = 170
/** 鹅（朝左）喙尖相对 svg 左上角的偏移 */
const BEAK_OFF = { x: (200 - 194) * (GS / 200), y: 58 * (GS / 200) }

const grabPt = (k: number, col: boolean) => ({
  x: (col ? COL_X : SRC_X) + BW[k],
  y: (col ? COL_Y : SRC_Y) + BLOCK_OFF[k] + BLOCK_H[k] / 2,
})
const arc = (p: { x: number; y: number }, q: { x: number; y: number }, t: number, lift: number) => ({
  x: lerp(p.x, q.x, t),
  y: lerp(p.y, q.y, t) - lift * Math.sin(Math.PI * t),
})

/** 鹅喙尖的轨迹：入场 → (到块 → 叼住 → 搬到列 → 松口 → 回程) × 4 */
const beakAt = (f: number) => {
  const s0 = grabPt(0, false)
  if (f < ARRIVE[0]) return arc({ x: s0.x + 60, y: s0.y + 260 }, s0, ease(OUT, f, 986, ARRIVE[0] - 986), 0)
  for (let k = 0; k < 4; k++) {
    const a0 = ARRIVE[k]
    const src = grabPt(k, false)
    const dst = grabPt(k, true)
    if (f < a0 + GRAB) return src
    if (f < a0 + GRAB + CARRY) return arc(src, dst, INOUT(prog(f, a0 + GRAB, CARRY)), 46)
    const next = ARRIVE[k + 1]
    if (next === undefined || f < a0 + GRAB + CARRY + 2) return dst
    if (f < next) return arc(dst, grabPt(k + 1, false), INOUT(prog(f, a0 + GRAB + CARRY + 2, next - a0 - GRAB - CARRY - 2)), 30)
  }
  return grabPt(3, true)
}

const blockPos = (k: number, f: number) => {
  const a0 = ARRIVE[k]
  let x = SRC_X
  let y = SRC_Y + BLOCK_OFF[k]
  let carried = false
  if (f >= a0 + 3) {
    const b = beakAt(Math.min(f, a0 + GRAB + CARRY))
    x = b.x - BW[k]
    y = b.y - BLOCK_H[k] / 2
    carried = f < a0 + GRAB + CARRY
    if (!carried) y += (1 - SOFT(f - a0 - GRAB - CARRY)) * -8
  }
  const slide = ease(INOUT, f, SLIDE, 24)
  x += SLIDE_DX * slide
  return { x, y, carried, lifted: f >= a0 + 3 }
}

export const Shot5: React.FC<{ f: number; clickAt: number }> = ({ f, clickAt }) => {
  if (f < 929 || f > 1500) return null
  const open = ease(OUT, f, clickAt + 6, D.EXPAND)
  const cardExit = ease(IN, f, 1150, 18)
  const gooseOut = ease(IN, f, 1152, 20)
  // 鹅：到块时低头叼住，搬运时闭嘴，松口时张嘴
  let neck = 0
  let beak = 1
  for (const a0 of ARRIVE) {
    neck += 12 * clamp01(1 - Math.abs(f - (a0 + 3)) / 4)
    if (f >= a0 + 3 && f < a0 + GRAB + CARRY + 2) beak = 0
  }
  const bk = beakAt(f)
  const bob = Math.sin(f * 0.5) * 2
  const gather = ease(OUT, f, GATHER, 14)
  const slide = ease(INOUT, f, SLIDE, 24)
  const enExit = ease(IN, f, 1400, 22)
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        clipPath: `inset(${PANEL.y}px ${W - PANEL.x - PANEL.w}px ${1080 - PANEL.y - PANEL.h}px ${PANEL.x}px round 26px)`,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-160 * enExit}px)`, opacity: 1 - enExit }}>
        {f < 1170 && (
          <div style={{ position: 'absolute', inset: 0, opacity: 1 - cardExit, transform: `translateY(${cardExit * 40}px)` }}>
            <InkBox x={CARD5.x} y={CARD5.y} w={CARD5.w} h={CARD5.h} fill={CLOUD} style={unroll(open)}>
              {[0, 1, 2, 3].map((k) =>
                blockPos(k, f).lifted ? (
                  <div
                    key={k}
                    style={{
                      position: 'absolute',
                      left: SRC_X - CARD5.x - 8,
                      top: SRC_Y + BLOCK_OFF[k] - CARD5.y - 6,
                      width: BW[k] + 16,
                      height: BLOCK_H[k] + 12,
                      borderRadius: 12,
                      border: `2.5px dashed ${CLOUD_SH}`,
                      boxSizing: 'border-box',
                    }}
                  />
                ) : (
                  <div key={k} style={{ position: 'absolute', left: SRC_X - CARD5.x, top: SRC_Y + BLOCK_OFF[k] - CARD5.y }}>
                    <Block k={k} />
                  </div>
                ),
              )}
            </InkBox>
            <AddressBar x={ADDR.x} y={ADDR.y} w={ADDR.w} h={ADDR.h} shadow={0} border={1} />
          </div>
        )}
        {f >= GATHER && (
          <InkBox
            x={COL_X - 20 + SLIDE_DX * slide}
            y={EN_CARD.y}
            w={EN_CARD.w}
            h={EN_CARD.h}
            fill={CLOUD}
            style={{ clipPath: `inset(${((1 - gather) * 50).toFixed(2)}% -12px ${((1 - gather) * 50).toFixed(2)}% -12px)` }}
          />
        )}
        {[0, 1, 2, 3].map((k) => {
          const p = blockPos(k, f)
          if (!p.lifted) return null
          return (
            <div
              key={k}
              style={{
                position: 'absolute',
                left: p.x,
                top: p.y,
                background: p.carried ? PAPER : 'transparent',
                borderRadius: 10,
                boxShadow: p.carried ? `0 10px 20px ${a(DEEP, 0.18)}` : 'none',
              }}
            >
              <Block k={k} />
            </div>
          )
        })}
        {f >= 986 && f < 1174 && (
          <Goose x={bk.x - BEAK_OFF.x} y={bk.y - BEAK_OFF.y + bob + gooseOut * 420} size={GS} flip neck={neck} beak={beak} />
        )}
      </div>
    </div>
  )
}

/* ───────── 镜 6：翻译精简 ───────── */
const ZH_X = 450
const ZH_W = 560
const Z6 = { title: 214, c1: 266, desc: 420, c2: 572 }
const Z7 = { card: { x: 72, y: 300, w: 600, h: 252 }, title: 324, desc: 384 }
const TYPE_T = 1220
const TYPE_D = 1262

const Counter: React.FC<{ n: number; max: number; style?: React.CSSProperties }> = ({ n, max, style }) => (
  <div style={{ position: 'absolute', left: ZH_X - 6, ...T_NUM, whiteSpace: 'nowrap', ...style }}>
    <span style={{ color: DEEP }}>{n}</span>
    <span style={{ color: ACCENT }}>/{max}</span>
  </div>
)

const Caret: React.FC<{ on: boolean }> = ({ on }) =>
  on ? <span style={{ display: 'inline-block', width: 3, height: 38, background: DEEP, verticalAlign: 'middle', marginLeft: 2 }} /> : null

/** 中文卡在镜 6→7 的位置 */
const zhMove = (f: number) => ease(INOUT, f, 1424, 26)

export const Shot6: React.FC<{ f: number }> = ({ f }) => {
  if (f < 1212 || f > 1700) return null
  const nT = Math.max(0, Math.min(ZH_TITLE.length, Math.floor((f - TYPE_T) / D.TYPE) + 1))
  const nD = Math.max(0, Math.min(ZH_DESC.length, Math.floor((f - TYPE_D) / D.TYPE) + 1))
  const blink = Math.floor(f / 16) % 2 === 0
  const m = zhMove(f)
  const cOut = ease(IN, f, 1400, 18)
  const cardIn = ease(OUT, f, 1414, 20)
  const fly = Shot7Fly(f)
  if (fly.active) return null
  const titleX = lerp(ZH_X, Z7.card.x + 24, m)
  const titleY = lerp(Z6.title, Z7.title, m)
  const descY = lerp(Z6.desc, Z7.desc, m)
  return (
    <>
      {f >= 1414 && (
        <InkBox x={titleX - 24} y={titleY - 24} w={Z7.card.w} h={descY - titleY + 192} fill={CLOUD} style={unroll(cardIn)} />
      )}
      <div style={{ position: 'absolute', left: titleX, top: titleY, ...T_BODY, fontWeight: 600, color: DEEP, whiteSpace: 'nowrap' }}>
        {ZH_TITLE.slice(0, nT)}
        <Caret on={f >= TYPE_T && nT < ZH_TITLE.length + 1 && f < TYPE_D && blink} />
      </div>
      <div style={{ position: 'absolute', left: titleX, top: descY, width: ZH_W, ...T_BODY, color: DEEP }}>
        {ZH_DESC.slice(0, nD)}
        <Caret on={f >= TYPE_D && f < 1400 && blink} />
      </div>
      {cOut < 1 && (
        <>
          <Counter n={f >= TYPE_T ? nT : 0} max={20} style={{ top: Z6.c1 + cOut * 30, opacity: 1 - cOut }} />
          <Counter n={f >= TYPE_D ? nD : 0} max={150} style={{ top: Z6.c2 + cOut * 30, opacity: 1 - cOut }} />
        </>
      )}
    </>
  )
}

/* ───────── 镜 7：归组 ───────── */
const TREE_X = 690
const ROW_H = 58
const TREE_Y = 222
const TREE = [
  { t: '设计工具', lv: 0 },
  { t: '白板', lv: 1, target: true },
  { t: '图标', lv: 1 },
  { t: '开发', lv: 0 },
  { t: '文档', lv: 1 },
  { t: '学习', lv: 0 },
  { t: '课程', lv: 1 },
]
const TREE_IN = 1498
const LINE_AT = 1530
const LINE_DUR = 48
const HIT = LINE_AT + LINE_DUR
const FLY_AT = 1596
const FLY_DUR = 36
const CHIP = { x: TREE_X + 44, y: TREE_Y + ROW_H * 2 + 3, w: 262, h: 52 }

export const Shot7Fly = (f: number) => {
  const t = INOUT(prog(f, FLY_AT, FLY_DUR))
  return { active: f >= FLY_AT, t }
}

const LINE_D = `M 672 470 C 712 600 640 650 650 540 C 660 430 630 330 ${TREE_X + 30} ${TREE_Y + ROW_H + 29}`

export const Shot7: React.FC<{ f: number }> = ({ f }) => {
  if (f < 1492 || f > 1700) return null
  const out = ease(IN, f, 1660, 20)
  const tin = ease(OUT, f, TREE_IN, D.EXPAND)
  const line = ease(INOUT, f, LINE_AT, LINE_DUR)
  const hit = f >= HIT
  const hitPop = BOUNCY(f - HIT)
  const fly = Shot7Fly(f)
  const shift = SOFT(f - (FLY_AT + 14))
  // 卡片 → 分组行
  const c0 = Z7.card
  const t = fly.t
  const u = 1 - t
  const ctrl = { x: 640, y: 180 }
  const cx = u * u * c0.x + 2 * u * t * ctrl.x + t * t * CHIP.x
  const cy = u * u * c0.y + 2 * u * t * ctrl.y + t * t * CHIP.y
  const settle = f >= FLY_AT + FLY_DUR ? (1 - SOFT(f - FLY_AT - FLY_DUR)) * 10 : 0
  const cw = lerp(c0.w, CHIP.w, t)
  const ch = lerp(c0.h, CHIP.h, t)
  const descO = 1 - clamp01((f - FLY_AT) / 10)
  const chipO = clamp01((f - FLY_AT - 14) / 10)
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: 1 - out, transform: `translateY(${out * 30}px)` }}>
      <div style={{ position: 'absolute', inset: 0, ...unroll(tin) }}>
        {TREE.map((r, i) => {
          const y = TREE_Y + i * ROW_H + (i >= 2 ? shift * ROW_H : 0)
          const isT = r.target && hit
          return (
            <div
              key={r.t}
              style={{
                position: 'absolute',
                left: TREE_X + r.lv * 44 - 10,
                top: y,
                height: ROW_H - 6,
                padding: '0 12px',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                background: isT ? a(ACCENT, 0.12) : 'transparent',
                ...T_BODY,
                fontWeight: r.lv === 0 ? 600 : 500,
                color: isT ? ACCENT : r.lv === 0 ? DEEP : a(DEEP, 0.7),
                transform: isT ? `translateX(${(1 - hitPop) * -8}px)` : undefined,
                whiteSpace: 'nowrap',
              }}
            >
              {r.lv === 1 && <span style={{ color: isT ? ACCENT : a(DEEP, 0.35), marginRight: 10 }}>›</span>}
              {r.t}
            </div>
          )
        })}
        <svg width={W} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <path d="M 694 270 L 694 330 M 694 444 L 694 446 M 694 560 L 694 562" stroke="none" />
        </svg>
      </div>
      {f >= LINE_AT && (
        <svg width={W} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
          <path d={LINE_D} fill="none" stroke={ACCENT} strokeWidth={4} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - line} opacity={fly.active ? 1 - clamp01((f - FLY_AT) / 16) : 1} />
          {hit && <circle cx={TREE_X + 30} cy={TREE_Y + ROW_H + 29} r={7 * Math.min(1.2, hitPop)} fill={ACCENT} opacity={fly.active ? 1 - clamp01((f - FLY_AT) / 16) : 1} />}
        </svg>
      )}
      {fly.active && (
        <InkBox x={cx} y={cy + settle} w={cw} h={ch} fill={CLOUD} r={lerp(18, 12, t)}>
          <div style={{ position: 'absolute', left: 24 * u + 12 * t, top: 24 * u - 2 * t + 2, ...T_BODY, fontWeight: 600, color: DEEP, whiteSpace: 'nowrap', opacity: 1 - chipO, overflow: 'hidden', width: cw - 30 }}>
            {ZH_TITLE}
          </div>
          <div style={{ position: 'absolute', left: 24, top: 84, width: ZH_W, ...T_BODY, color: DEEP, opacity: descO }}>{ZH_DESC}</div>
          <div style={{ position: 'absolute', left: 10, top: 6, display: 'flex', alignItems: 'center', gap: 12, opacity: chipO }}>
            <ExIcon size={40} />
            <span style={{ ...T_MONO, color: DEEP }}>Excalidraw</span>
          </div>
        </InkBox>
      )}
    </div>
  )
}

export const FOREST_ = FOREST
