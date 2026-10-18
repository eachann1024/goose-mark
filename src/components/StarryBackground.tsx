import { useEffect, useRef } from 'react'

/**
 * StarryBackground（React 版）—— 星空彩蛋
 * ==========================================================================
 * 性能设计（观感与旧版一致，逐帧成本降到 ~1/5）：
 *  1. 脏区重绘：只清「上一帧画过的那几十个小方块」，不再每帧整屏清屏。
 *     整屏 4M 像素的清屏 + 合成/栅格化是旧版最大的固定开销。
 *  2. 帧率上限 60：旧版在 240Hz 屏幕上会把 rAF 跑到 230+ 帧并做全屏重绘，
 *     现在最多 60 帧（能省则省，超出 60 帧对闪烁/流星无可察收益）。
 *  3. 动画常量全部按「每秒」计量，帧率变化不影响观感速度。
 *  4. 亮度量化成 12 个桶，每桶一次 fill：35 次 fill + 35 次 rgba 字符串
 *     解析 → 最多 12 次 fill + 1 次固定 fillStyle。
 *  5. 不可见（面板收起 / 页面隐藏）时停掉 rAF，只剩最后一帧；
 *     prefers-reduced-motion 只画一帧静态星空。
 *
 * 所有可变状态放在 ref 里，避免每帧触发 React 重渲染。
 */

/** 星星数量（与旧版一致） */
const STAR_COUNT = 35
/** 亮度分桶数量：桶越多越平滑，越多 fill 越贵 */
const LAYER_BUCKETS = 12
/** 目标帧率上限 */
const TARGET_FPS = 60
/** 脏区清屏的额外留边（星点每帧位移远小于 1px） */
const CLEAR_PAD = 2
/** 周期性整屏重绘的帧间隔（兜底防残影，约每 8 秒一次） */
const FULL_REDRAW_INTERVAL_FRAMES = TARGET_FPS * 8
/** canvas 后备缓冲的最大设备像素比（更高 dpr 的屏幕上星点也不会更锐利） */
const MAX_DPR = 2
/** 星空底色：与深色模式默认背景一致，纯色实底，不用渐变 */
const SKY_BASE_STYLE = { backgroundColor: '#090A0C' }
/** 星点颜色固定，靠 globalAlpha 控亮度，避免逐星拼 rgba 字符串 */
const STAR_FILL = 'rgb(200, 220, 255)'
/** 画布不透明：底色直接画进 canvas，避免 alpha 合成，也保证与 #090A0C 完全一致 */
const SKY_FILL = '#090A0C'
const SHOOTING_FILL_RGB = '255, 255, 255'

// ── 动画常量：旧版按 60fps 每帧步进，这里统一换算成每秒 ────────────────────
const FRAME_BASE = 60
const ROTATION_PER_SEC = 0.00001 * FRAME_BASE
const TWINKLE_SPEED_MIN = 0.005 * FRAME_BASE
const TWINKLE_SPEED_MAX = 0.025 * FRAME_BASE
const SHOOTING_PROBABILITY_PER_SEC = 0.0015 * FRAME_BASE
const SHOOTING_FADE_PER_SEC = 0.004 * FRAME_BASE
const SHOOTING_SPEED_MIN = 2 * FRAME_BASE
const SHOOTING_SPEED_MAX = 3.5 * FRAME_BASE
const STAR_BASE_OPACITY_MIN = 0.1
const STAR_BASE_OPACITY_MAX = 0.6

interface ShootingStar {
  x: number
  y: number
  length: number
  speed: number
  opacity: number
  angle: number
}

export interface StarryBackgroundProps {
  /** 暂停动画（窗口不可见等），保留最后一帧画面 */
  paused?: boolean
}

export function StarryBackground({ paused = false }: StarryBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  /** 由 effect 注册：paused 变化时唤醒 / 暂停渲染循环 */
  const syncRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    syncRef.current?.()
  }, [paused])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let rafId = 0
    let cssW = 1
    let cssH = 1
    let dpr = 1

    // ── 星体状态（扁平数组，逐帧零分配）──────────────────────────────────
    const xs = new Float64Array(STAR_COUNT)
    const ys = new Float64Array(STAR_COUNT)
    const rs = new Float64Array(STAR_COUNT)
    const bases = new Float64Array(STAR_COUNT)
    const phases = new Float64Array(STAR_COUNT)
    const speeds = new Float64Array(STAR_COUNT)
    const buckets: number[][] = Array.from({ length: LAYER_BUCKETS }, () => [])

    let shootingStars: ShootingStar[] = []
    let lastFrameAt = 0
    /** 需要整屏重绘（首帧 / 尺寸变化 / 周期性兜底） */
    let fullRedraw = true
    let framesSinceFull = 0

    const getPivot = () => ({ x: cssW / 2, y: cssH * 4 })

    const initStars = () => {
      for (let i = 0; i < STAR_COUNT; i++) {
        xs[i] = Math.random() * cssW
        ys[i] = Math.random() * cssH
        rs[i] = Math.random() * 1.5 + 0.5
        bases[i] =
          Math.random() * (STAR_BASE_OPACITY_MAX - STAR_BASE_OPACITY_MIN) + STAR_BASE_OPACITY_MIN
        phases[i] = Math.random() * Math.PI * 2
        speeds[i] = Math.random() * (TWINKLE_SPEED_MAX - TWINKLE_SPEED_MIN) + TWINKLE_SPEED_MIN
      }
    }

    const createShootingStar = () => {
      const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.2
      const isTop = Math.random() > 0.5
      shootingStars.push({
        x: isTop ? Math.random() * cssW : -50,
        y: isTop ? -50 : Math.random() * (cssH / 2),
        length: Math.random() * 80 + 100,
        speed: Math.random() * (SHOOTING_SPEED_MAX - SHOOTING_SPEED_MIN) + SHOOTING_SPEED_MIN,
        opacity: 1,
        angle
      })
    }

    /**
     * 清掉上一帧画过的一小块区域（而不是整屏 clearRect）。
     * 星点每帧只挪动 ~0.1px，整屏重绘会把 4M 像素的合成/栅格化搬到每一帧；
     * 改成按星点包围盒清屏后，单帧的脏区只有几百像素。
     */
    const clearBox = (cx: number, cy: number, pad: number) => {
      ctx.fillStyle = SKY_FILL
      ctx.fillRect(cx - pad, cy - pad, pad * 2, pad * 2)
    }

    /** 绘制一帧；dt 为距上一帧的秒数（<=0 表示不推进动画，只重绘） */
    const drawFrame = (dt: number, full = false) => {
      const needFull = full || fullRedraw
      fullRedraw = false

      // ── 1) 清屏：整屏或仅旧图形包围盒 ──────────────────────────────────
      ctx.fillStyle = SKY_FILL
      if (needFull) {
        ctx.fillRect(0, 0, cssW, cssH)
      } else {
        // 星点每帧位移远小于 1px，按旧位置包围盒清即可
        for (let i = 0; i < STAR_COUNT; i++) clearBox(xs[i], ys[i], rs[i] + CLEAR_PAD)
        // 流星：整条光迹按 AABB 清
        for (let i = 0; i < shootingStars.length; i++) {
          const s = shootingStars[i]
          const px = s.x - Math.cos(s.angle) * s.length
          const py = s.y - Math.sin(s.angle) * s.length
          ctx.fillRect(
            Math.min(px, s.x) - CLEAR_PAD,
            Math.min(py, s.y) - CLEAR_PAD,
            Math.abs(s.x - px) + CLEAR_PAD * 2,
            Math.abs(s.y - py) + CLEAR_PAD * 2
          )
        }
      }

      // ── 2) 推进星点并分桶 ─────────────────────────────────────────────
      // 极慢自转（每秒固定角度，与帧率无关）
      const step = ROTATION_PER_SEC * dt
      const cos = Math.cos(step)
      const sin = Math.sin(step)
      const pivot = getPivot()

      for (let b = 0; b < LAYER_BUCKETS; b++) buckets[b].length = 0

      for (let i = 0; i < STAR_COUNT; i++) {
        if (dt > 0) {
          const dx = xs[i] - pivot.x
          const dy = ys[i] - pivot.y
          xs[i] = pivot.x + (dx * cos - dy * sin)
          ys[i] = pivot.y + (dx * sin + dy * cos)
          if (xs[i] < -50) xs[i] = cssW + 50
          if (ys[i] < -50) ys[i] = cssH + 50
          if (xs[i] > cssW + 50) xs[i] = -50
          phases[i] += speeds[i] * dt
        }
        // 亮度量化进桶（四舍五入到最近的桶，避免整体偏暗）：桶内共用一次 fill
        const opacity = Math.max(0, Math.min(1, bases[i] + Math.sin(phases[i]) * 0.3))
        buckets[Math.round(opacity * (LAYER_BUCKETS - 1))].push(i)
      }

      // ── 3) 画星：按亮度桶批量 fill ─────────────────────────────────────
      ctx.fillStyle = STAR_FILL
      for (let b = 0; b < LAYER_BUCKETS; b++) {
        const items = buckets[b]
        if (items.length === 0) continue
        ctx.globalAlpha = b / (LAYER_BUCKETS - 1)
        ctx.beginPath()
        for (let k = 0; k < items.length; k++) {
          const i = items[k]
          ctx.moveTo(xs[i] + rs[i], ys[i])
          ctx.arc(xs[i], ys[i], rs[i], 0, Math.PI * 2)
        }
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // ── 流星（低频事件；无流星时不产生任何渐变分配）───────────────────
      if (dt > 0 && Math.random() < SHOOTING_PROBABILITY_PER_SEC * dt) createShootingStar()

      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const s = shootingStars[i]
        s.x += Math.cos(s.angle) * s.speed * dt
        s.y += Math.sin(s.angle) * s.speed * dt
        s.opacity -= SHOOTING_FADE_PER_SEC * dt

        if (
          s.opacity <= 0 ||
          s.x > cssW + s.length ||
          s.y > cssH + s.length
        ) {
          shootingStars.splice(i, 1)
          continue
        }

        const tailX = s.x - Math.cos(s.angle) * s.length
        const tailY = s.y - Math.sin(s.angle) * s.length
        const gradient = ctx.createLinearGradient(s.x, s.y, tailX, tailY)
        gradient.addColorStop(0, `rgba(${SHOOTING_FILL_RGB}, ${s.opacity})`)
        gradient.addColorStop(1, `rgba(${SHOOTING_FILL_RGB}, 0)`)

        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(tailX, tailY)
        ctx.lineWidth = 1.5
        ctx.lineCap = 'round'
        ctx.strokeStyle = gradient
        ctx.stroke()
      }
    }

    const shouldRun = () => !pausedRef.current && !document.hidden && !reducedMotion

    const loop = (now: number) => {
      // 限帧：60fps 上限；-1ms 容差吸收 60/120Hz 的整数倍抖动
      if (now - lastFrameAt < 1000 / TARGET_FPS - 1) {
        rafId = shouldRun() ? requestAnimationFrame(loop) : 0
        return
      }
      const dt = lastFrameAt === 0 ? 0 : Math.min(0.1, (now - lastFrameAt) / 1000)
      lastFrameAt = now
      // 周期性整屏重绘兜底（极低频，防止残影累积）
      const periodic = ++framesSinceFull >= FULL_REDRAW_INTERVAL_FRAMES
      if (periodic) framesSinceFull = 0
      drawFrame(dt, periodic)
      rafId = shouldRun() ? requestAnimationFrame(loop) : 0
    }

    const start = () => {
      if (rafId !== 0) return
      lastFrameAt = 0
      rafId = requestAnimationFrame(loop)
    }

    const stop = () => {
      if (rafId !== 0) cancelAnimationFrame(rafId)
      rafId = 0
    }

    /** 尺寸变化：重建后备缓冲与星体；同一尺寸直接跳过（窗口拖动时高频触发） */
    const resize = () => {
      const nextCssW = Math.max(1, canvas.clientWidth || window.innerWidth)
      const nextCssH = Math.max(1, canvas.clientHeight || window.innerHeight)
      const nextDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      if (nextCssW === cssW && nextCssH === cssH && nextDpr === dpr) return
      cssW = nextCssW
      cssH = nextCssH
      dpr = nextDpr
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      initStars()
      fullRedraw = true
      drawFrame(0)
    }

    let resizeRaf = 0
    const onResize = () => {
      if (resizeRaf !== 0) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        resize()
      })
    }

    // 首帧：同步建立尺寸并立即绘制，避免出现空白/等待
    cssW = 0
    resize()
    if (shouldRun()) start()

    const onVisibility = () => {
      if (document.hidden) {
        stop()
      } else if (shouldRun()) {
        start()
      }
    }

    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    // paused prop 变化：停 / 起（保留画面）
    syncRef.current = () => {
      if (shouldRun()) start()
      else stop()
    }

    return () => {
      stop()
      if (resizeRaf !== 0) cancelAnimationFrame(resizeRaf)
      syncRef.current = null
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none" style={SKY_BASE_STYLE}>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
    </div>
  )
}

export default StarryBackground
