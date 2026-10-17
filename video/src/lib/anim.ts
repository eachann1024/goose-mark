import { Easing, spring } from 'remotion'
import { FPS } from '../theme'

/** 卡片 / 设备入场 */
export const EASE_CARD = Easing.bezier(0.22, 1, 0.36, 1)
/** 底色切换 */
export const EASE_BG = Easing.bezier(0.65, 0, 0.35, 1)
/** 重力砸落（加速，非线性） */
export const EASE_FALL = Easing.bezier(0.55, 0, 0.95, 0.42)

/** 文本入场：Y +40 → 0 */
export const textSpring = (frame: number, delay: number) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping: 200, stiffness: 120, mass: 0.6 } })

/** 强调物件落位：带过冲 */
export const stampSpring = (frame: number, delay: number) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping: 12, stiffness: 300, mass: 0.9 } })

/** 通用淡入 */
export const fadeIn = (frame: number, delay: number, dur = 14) =>
  Math.max(0, Math.min(1, (frame - delay) / dur))

/** 卡片入场进度 0→1（18 帧） */
export const cardIn = (frame: number, delay = 0, dur = 18) =>
  EASE_CARD(Math.max(0, Math.min(1, (frame - delay) / dur)))

/** 线性滚动位移，≤ 60px/s ⇒ ≤ 1px/帧 */
export const linearScroll = (frame: number, pxPerFrame = 1, from = 0) => (frame - from) * pxPerFrame
