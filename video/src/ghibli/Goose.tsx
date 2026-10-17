import React from 'react'
import { ACCENT, CLOUD, CLOUD_SH, DEEP, a } from './theme'

/** 圆润水滴形身体，尾尖微翘在左上 */
const BODY =
  'M 18 112 C 30 122 42 124 54 118 C 80 104 124 106 146 126 C 166 146 160 180 122 188 C 84 196 44 186 30 164 C 22 150 20 132 18 112 Z'
const NECK = 'M 132 130 C 128 104 126 84 142 58'
const HEAD = { cx: 148, cy: 52, r: 22 }
/** 小翅膀：贴在背上的叶形，只描上沿一条线 */
const WING = 'M 128 150 C 116 128 84 122 58 132 C 76 148 104 156 128 150 Z'
const WING_EDGE = 'M 128 150 C 116 128 84 122 58 132'

/** 品牌鹅：吉卜力式简洁白鹅；默认朝右。neck/tilt 为角度，beak 0..1 张嘴 */
export const Goose: React.FC<{
  x: number
  y: number
  size?: number
  flip?: boolean
  neck?: number
  tilt?: number
  beak?: number
  shadow?: string
  style?: React.CSSProperties
}> = ({ x, y, size = 200, flip, neck = 0, tilt = 0, beak = 0, shadow = a(CLOUD_SH, 0.9), style }) => {
  const S = 2.6
  const head = (outline: boolean) => (
    <g transform={`rotate(${neck} 124 124)`}>
      <path d={NECK} stroke={outline ? DEEP : CLOUD} strokeWidth={26 + (outline ? S * 2 : 0)} strokeLinecap="round" fill="none" />
      <g transform={`rotate(${tilt} ${HEAD.cx} ${HEAD.cy})`}>
        <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r + (outline ? S : 0)} fill={outline ? DEEP : CLOUD} />
        {!outline && (
          <>
            <g transform={`rotate(${beak * 22} 166 58)`}>
              <path d="M 166 57 Q 182 60 190 62 Q 180 68 166 65 Z" fill={ACCENT} stroke={DEEP} strokeWidth={2.2} strokeLinejoin="round" />
            </g>
            <path d="M 165 45 Q 184 48 194 58 Q 182 61 166 59 Z" fill={ACCENT} stroke={DEEP} strokeWidth={2.2} strokeLinejoin="round" />
            <circle cx={154} cy={46} r={3.6} fill={DEEP} />
          </>
        )}
      </g>
    </g>
  )
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      style={{ position: 'absolute', left: x, top: y, overflow: 'visible', transform: flip ? 'scaleX(-1)' : undefined, ...style }}
    >
      <ellipse cx={92} cy={192} rx={68} ry={8} fill={shadow} />
      <g filter="url(#wc3)">
        <path d={BODY} fill={DEEP} stroke={DEEP} strokeWidth={S * 2} strokeLinejoin="round" />
        {head(true)}
        <path d={BODY} fill={CLOUD} />
        <path d="M 46 172 C 70 188 116 190 146 170" stroke={a(CLOUD_SH, 0.8)} strokeWidth={8} strokeLinecap="round" fill="none" />
        <path d={WING} fill={a(CLOUD_SH, 0.55)} />
        <path d={WING_EDGE} fill="none" stroke={DEEP} strokeWidth={2.4} strokeLinecap="round" />
        {head(false)}
      </g>
    </svg>
  )
}

/** 鹅喙尖在 200 视框中的位置（neck/tilt 为 0 时） */
export const BEAK_TIP = { x: 194, y: 58 }
