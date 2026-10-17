import React from 'react'
import {
  ACCENT,
  CHIP_GAP,
  CHIP_H,
  CHIP_W,
  CLOUD,
  CLOUD_SH,
  DEEP,
  FOREST,
  MEADOW,
  MONO,
  PAPER,
  PASTE_TEXT_A,
  PASTE_TEXT_B,
  SANS,
  SKY_TOP,
  STEPS,
  T_MONO,
  T_UI,
  TOAST,
  URL_TEXT,
  WIN,
  ZH_TITLE,
  a,
} from './theme'

/* ───────── 图标 ───────── */
export const Sparkles: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 3 L11.6 8.4 L17 10 L11.6 11.6 L10 17 L8.4 11.6 L3 10 L8.4 8.4 Z" fill={color} />
    <path d="M18.5 14.5 L19.3 17 L21.5 17.8 L19.3 18.6 L18.5 21 L17.7 18.6 L15.5 17.8 L17.7 17 Z" fill={color} strokeWidth={1.2} />
  </svg>
)
const SearchX: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
    <circle cx={11} cy={11} r={7} />
    <path d="M21 21 L16 16 M8.5 8.5 L13.5 13.5 M13.5 8.5 L8.5 13.5" />
  </svg>
)
export const Loader: React.FC<{ size: number; color: string; angle: number }> = ({ size, color, angle }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" style={{ transform: `rotate(${angle}deg)` }}>
    <path d="M12 3 A9 9 0 1 1 3 12" />
  </svg>
)
export const CheckMark: React.FC<{ size: number; color: string; draw: number }> = ({ size, color, draw }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5 L10 17.5 L19 7" strokeDasharray={22} strokeDashoffset={22 * (1 - draw)} />
  </svg>
)
/** 手绘风 Excalidraw 站点图标（仅调色板色） */
export const ExIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <rect x={3} y={3} width={58} height={58} rx={16} fill={DEEP} />
    <path d="M18 44 C 24 30 30 22 44 16 M 22 46 C 30 40 38 36 46 34" stroke={CLOUD} strokeWidth={4.5} strokeLinecap="round" fill="none" />
    <circle cx={46} cy={18} r={4} fill={CLOUD} />
  </svg>
)

const Fav: React.FC<{ ch: string; bg: string; fg?: string; size?: number }> = ({ ch, bg, fg = CLOUD, size = 58 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: 14,
      background: bg,
      color: fg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: SANS,
      fontWeight: 600,
      fontSize: 30,
      flexShrink: 0,
    }}
  >
    {ch}
  </div>
)

/* ───────── 窗口 ───────── */
export type HomeView = 'none' | 'usearch' | 'list' | 'grid'
export type WinState = {
  inputH: number
  homeH: number
  /** 0 占位符 / 1 粘贴文字 / 2 清空后的插件子输入框 */
  text: 0 | 1 | 2
  caret: boolean
  view: HomeView
  /** 视图切换进度（旧→新） */
  prevView?: HomeView
  viewT?: number
  cmdHover: number
  cmdSel: number
  cmdScale: number
  cmdHide: number
  newCard: number
  newHover: number
}

export const WINDOW_SHADOW = `0 18px 28px -12px ${a(DEEP, 0.26)}, 0 4px 10px ${a(DEEP, 0.1)}`

const Input: React.FC<{ s: WinState }> = ({ s }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: WIN.w, height: s.inputH, overflow: 'hidden' }}>
    <div
      style={{
        position: 'absolute',
        left: 26,
        top: 22,
        width: 60,
        height: 60,
        borderRadius: 16,
        background: DEEP,
        color: CLOUD,
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 38,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        paddingBottom: 4,
        boxSizing: 'border-box',
      }}
    >
      u
    </div>
    <div style={{ position: 'absolute', left: 110, top: 28, width: WIN.w - 140, ...T_UI, color: DEEP }}>
      {s.text === 1 ? (
        <span>
          {PASTE_TEXT_A}
          <span style={{ ...T_MONO, fontSize: 34, lineHeight: '48px' }}>{URL_TEXT}</span>
          {PASTE_TEXT_B}
        </span>
      ) : (
        <span style={{ position: 'relative' }}>
          {s.caret && <span style={{ position: 'absolute', left: -3, top: 4, width: 3, height: 40, background: DEEP }} />}
          <span style={{ color: a(DEEP, 0.5) }}>{s.text === 0 ? 'Hi, uTools' : '搜索书签'}</span>
        </span>
      )}
    </div>
  </div>
)

const USearch: React.FC<{ s: WinState }> = ({ s }) => (
  <>
    <div style={{ position: 'absolute', left: 0, top: 0, width: WIN.w, height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <SearchX size={60} color={a(DEEP, 0.35)} />
      <div style={{ ...T_UI, color: a(DEEP, 0.6) }}>没有找到匹配的书签</div>
    </div>
    <div style={{ position: 'absolute', left: 0, top: 220, width: WIN.w, height: 400, borderTop: `2px solid ${a(CLOUD_SH, 0.9)}`, background: a(CLOUD_SH, 0.22) }}>
      <div style={{ position: 'absolute', left: 30, top: 14, ...T_UI, fontWeight: 700, color: a(DEEP, 0.45) }}>命令</div>
      <div
        style={{
          position: 'absolute',
          left: 20,
          top: 76,
          width: WIN.w - 40,
          height: 90,
          borderRadius: 14,
          background: s.cmdSel > 0 ? a(ACCENT, 0.12 * s.cmdSel) : a(CLOUD_SH, 0.55 * s.cmdHover),
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '0 18px',
          boxSizing: 'border-box',
          transform: `scale(${s.cmdScale})`,
          opacity: 1 - s.cmdHide,
        }}
      >
        <div style={{ width: 58, height: 58, borderRadius: 14, background: s.cmdSel > 0.5 ? ACCENT : a(MEADOW, 0.3), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={34} color={s.cmdSel > 0.5 ? CLOUD : FOREST} />
        </div>
        <div style={{ ...T_UI, fontWeight: 600, color: s.cmdSel > 0.5 ? ACCENT : DEEP, flex: 1 }}>AI 创建书签</div>
        {s.cmdSel > 0.5 && <div style={{ ...T_UI, color: ACCENT, marginRight: 8 }}>↵ AI 创建</div>}
      </div>
    </div>
  </>
)

const SecHead: React.FC<{ g: string; sub: string; accent?: boolean }> = ({ g, sub, accent }) => (
  <div style={{ position: 'absolute', left: 32, top: 26, ...T_UI, display: 'flex', gap: 12 }}>
    <span style={{ fontWeight: 600, color: DEEP }}>{g}</span>
    <span style={{ color: a(DEEP, 0.4) }}>›</span>
    <span style={{ fontWeight: 600, color: accent ? ACCENT : a(DEEP, 0.55) }}>{sub}</span>
  </div>
)

const LIST = [
  { ch: 'M', bg: DEEP, t: 'MDN Web Docs', d: 'Web 开发参考文档' },
  { ch: 'R', bg: SKY_TOP, t: 'React 文档', d: '组件与 Hooks 指南' },
  { ch: 'V', bg: FOREST, t: 'Vite 指南', d: '前端构建工具文档' },
]
const ListView: React.FC = () => (
  <>
    <SecHead g="开发" sub="文档" />
    {LIST.map((it, i) => (
      <div key={it.t} style={{ position: 'absolute', left: 20, top: 92 + i * 104, width: WIN.w - 40, height: 96, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 20, padding: '0 18px', boxSizing: 'border-box', background: i === 0 ? a(CLOUD_SH, 0.35) : 'transparent' }}>
        <Fav ch={it.ch} bg={it.bg} />
        <div style={{ ...T_UI, fontWeight: 600, color: DEEP, width: 300, whiteSpace: 'nowrap' }}>{it.t}</div>
        <div style={{ ...T_UI, color: a(DEEP, 0.55), whiteSpace: 'nowrap' }}>{it.d}</div>
      </div>
    ))}
  </>
)

const GRID = [
  { ch: 't', bg: FOREST, t: 'tldraw', d: '无限画布白板' },
  { ch: 'W', bg: SKY_TOP, t: 'Whimsical', d: '思维导图白板' },
]
/** 新卡片占满首行，下方两张旧卡片 */
export const GRID_CELL = (i: number) =>
  i === 0 ? { x: 30, y: 92, w: WIN.w - 60, h: 190 } : { x: 30 + ((i - 1) % 2) * 410, y: 302, w: 390, h: 190 }
const GCard: React.FC<{ i: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ i, children, style }) => {
  const c = GRID_CELL(i)
  return (
    <div
      style={{
        position: 'absolute',
        left: c.x,
        top: c.y,
        width: c.w,
        height: c.h,
        borderRadius: 16,
        border: `2px solid ${CLOUD_SH}`,
        background: a(CLOUD_SH, 0.22),
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        padding: '0 26px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
const CardText: React.FC<{ t: string; d: string }> = ({ t, d }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, whiteSpace: 'nowrap' }}>
    <div style={{ ...T_UI, fontWeight: 600, color: DEEP }}>{t}</div>
    <div style={{ ...T_UI, color: a(DEEP, 0.6) }}>{d}</div>
  </div>
)
const GridView: React.FC<{ s: WinState }> = ({ s }) => {
  const ring = s.newCard
  return (
    <>
      <SecHead g="设计工具" sub="白板" accent />
      {GRID.map((it, k) => (
        <GCard key={it.t} i={k + 1}>
          <Fav ch={it.ch} bg={it.bg} size={64} />
          <CardText t={it.t} d={it.d} />
        </GCard>
      ))}
      {ring > 0 && (
        <GCard
          i={0}
          style={{
            borderColor: ACCENT,
            borderWidth: 3,
            background: CLOUD,
            boxShadow: `0 0 0 ${8 * ring}px ${a(ACCENT, 0.16)}`,
            transform: `translateY(${(1 - Math.min(1, ring)) * 18}px) scale(${1 + 0.015 * s.newHover})`,
            opacity: Math.min(1, ring * 2),
          }}
        >
          <ExIcon size={84} />
          <CardText t={ZH_TITLE} d="开源手绘风在线白板" />
        </GCard>
      )}
    </>
  )
}

const ViewOf: React.FC<{ v: HomeView; s: WinState }> = ({ v, s }) =>
  v === 'usearch' ? <USearch s={s} /> : v === 'list' ? <ListView /> : v === 'grid' ? <GridView s={s} /> : null

export const UToolsWindow: React.FC<{ s: WinState; style?: React.CSSProperties; width?: number }> = ({ s, style, width = WIN.w }) => {
  const t = s.viewT ?? 1
  return (
    <div
      style={{
        position: 'absolute',
        left: WIN.x + (WIN.w - width) / 2,
        top: WIN.y,
        width,
        height: s.inputH + s.homeH,
        background: CLOUD,
        borderRadius: 18,
        border: `2px solid ${a(CLOUD_SH, 0.9)}`,
        boxSizing: 'border-box',
        boxShadow: WINDOW_SHADOW,
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ position: 'absolute', left: (width - WIN.w) / 2, top: 0, width: WIN.w, height: '100%' }}>
        <Input s={s} />
        {s.homeH > 0 && (
          <div style={{ position: 'absolute', left: 0, top: s.inputH, width: WIN.w, height: s.homeH, borderTop: `2px solid ${a(CLOUD_SH, 0.9)}`, overflow: 'hidden' }}>
            {s.prevView && t < 1 && (
              <div style={{ position: 'absolute', inset: 0, opacity: 1 - t, transform: `translateX(${-40 * t}px)` }}>
                <ViewOf v={s.prevView} s={s} />
              </div>
            )}
            <div style={{ position: 'absolute', inset: 0, opacity: t, transform: `translateX(${40 * (1 - t)}px)` }}>
              <ViewOf v={s.view} s={s} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────── toast ───────── */
export type ToastState = {
  /** 屏幕矩形（用于从命令项缩成 toast 的形变） */
  rect: { x: number; y: number; w: number; h: number }
  content: number
  mode: 'loading' | 'success'
  stage: string
  active: number
  done: number
  chipPop: number[]
  spin: number
  check: number
  hover: number
  /** 第 4 个胶囊的完成态（0..1）与鼠标悬停 */
  ready: number
  chipHover: number
  opacity: number
  dy: number
}

export const Toast: React.FC<{ s: ToastState }> = ({ s }) => {
  const r = s.rect
  return (
    <div
      style={{
        position: 'absolute',
        left: r.x,
        top: r.y + s.dy,
        width: r.w,
        height: r.h,
        borderRadius: 14,
        background: s.hover > 0 ? PAPER : CLOUD,
        border: `2px solid ${s.hover > 0 ? ACCENT : a(CLOUD_SH, 1)}`,
        boxSizing: 'border-box',
        boxShadow: `0 14px 34px ${a(DEEP, 0.2)}`,
        overflow: 'hidden',
        opacity: s.opacity,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: TOAST.w, height: TOAST.h, opacity: s.content }}>
        <div
          style={{
            position: 'absolute',
            left: 20,
            top: 14,
            width: 48,
            height: 48,
            borderRadius: 12,
            background: s.mode === 'success' ? a(ACCENT, 0.14) : a(MEADOW, 0.32),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: s.mode === 'success' ? `scale(${0.7 + 0.3 * s.check})` : undefined,
          }}
        >
          {s.mode === 'success' ? <CheckMark size={36} color={ACCENT} draw={Math.min(1, s.check)} /> : s.ready > 0 ? <CheckMark size={34} color={FOREST} draw={s.ready} /> : <Loader size={32} color={FOREST} angle={s.spin} />}
        </div>
        <div style={{ position: 'absolute', left: 84, top: 14, ...T_UI, fontWeight: 600, color: DEEP, whiteSpace: 'nowrap' }}>
          {s.mode === 'success' ? (
            <>
              已保存：<span>{ZH_TITLE}</span>
            </>
          ) : (
            s.stage
          )}
        </div>
        {s.mode === 'success' ? (
          <div style={{ position: 'absolute', left: 84, top: 74, ...T_UI, color: a(DEEP, 0.6), whiteSpace: 'nowrap' }}>设计工具 / 白板 · 点击跳转</div>
        ) : (
          STEPS.map((label, i) => {
            const state = i < s.done || (i === 3 && s.ready > 0) ? 'done' : i === s.active ? 'active' : 'pending'
            const pop = s.chipPop[i] ?? 1
            const hov = i === 3 ? s.chipHover : 0
            return (
              <div
                key={label}
                style={{
                  position: 'absolute',
                  left: 24 + i * (CHIP_W + CHIP_GAP),
                  top: 72,
                  width: CHIP_W,
                  height: CHIP_H,
                  borderRadius: CHIP_H / 2,
                  boxSizing: 'border-box',
                  border:
                    hov > 0
                      ? `3px solid ${ACCENT}`
                      : state === 'active'
                        ? `3px solid ${DEEP}`
                        : state === 'done'
                          ? `2px solid ${a(MEADOW, 0)}`
                          : `2px solid ${CLOUD_SH}`,
                  background: state === 'active' ? PAPER : state === 'done' ? a(MEADOW, 0.35) : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...T_UI,
                  fontSize: 34,
                  fontWeight: state === 'pending' ? 500 : 600,
                  color: state === 'pending' ? a(DEEP, 0.5) : state === 'done' ? FOREST : DEEP,
                  transform: `scale(${pop})`,
                }}
              >
                {label}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export const MONO_FONT = MONO
