/**
 * 像素点阵版配乐：F 大调 · BPM 120 · F–C–Dm–B♭（每和弦 2 小节）
 * 12.5% 脉冲琶音 + 三角波贝斯 + 正弦 kick + 噪声 hi-hat，另有事件音效（帧位与镜头一致）
 * 48k / 16bit / 立体声 / 31s / 峰值 ≤ -1 dBFS，1770 帧起 90 帧淡出
 */
import fs from 'node:fs'
import path from 'node:path'

const FPS = 60
const SR = 48000
const DUR = 1860 / FPS
const N = Math.round(DUR * SR)
const L = new Float32Array(N)
const R = new Float32Array(N)
const fr = (f) => Math.round((f / FPS) * SR)
const dB = (d) => 10 ** (d / 20)

let seed = 20261017
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

const add = (i, v, pan = 0) => {
  if (i < 0 || i >= N) return
  L[i] += v * (1 - pan)
  R[i] += v * (1 + pan)
}

/** 与 src/pixel/motion.ts 一致的三次贝塞尔求值（用于定位扫描线触达网址的帧） */
const bezier = (x1, y1, x2, y2) => (x) => {
  let lo = 0
  let hi = 1
  for (let k = 0; k < 40; k++) {
    const t = (lo + hi) / 2
    const bx = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3
    if (bx < x) lo = t
    else hi = t
  }
  const t = (lo + hi) / 2
  return 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3
}
const INOUT = bezier(0.65, 0, 0.35, 1)

// 扫描线：210+30 起 60 帧，y 330→680；网址首行点顶 ≈ 446 时变 ACCENT
let SCAN_HIT = 240
for (let f = 240; f <= 300; f++) {
  const y = 330 + 350 * INOUT((f - 240) / 60)
  if (y >= 446) {
    SCAN_HIT = f
    break
  }
}

const EV = {
  blip: SCAN_HIT, // 网址变 ACCENT
  whoosh: 450, // 窗口展开
  tickStart: 744, // 粒子重组（16 个 tick 分布在 48 帧）
  thud: 1290, // 卡片落位
  click: 1470, // 开关拨动
  chord: 1710, // 落标
}

/* ───── 和弦与琶音 ───── */
const F = (n) => 440 * 2 ** ((n - 69) / 12)
// 每和弦：[根, 三, 五, 高八度根]
const CH = [
  [65, 69, 72, 77], // F
  [60, 64, 67, 72], // C
  [62, 65, 69, 74], // Dm
  [58, 62, 65, 70], // B♭
]
const BASS = [41, 48, 50, 46] // F2 C3 D3 B♭2
const PAT = [0, 1, 2, 3, 2, 1, 2, 3]
const BEAT = 30

// 琶音（八分音符 15 帧）
for (let e = 0; e * 15 < 1860; e++) {
  const f0 = e * 15
  const chord = Math.floor(f0 / 240) % 4
  const freq = F(CH[chord][PAT[e % 8]])
  const pan = e % 2 === 0 ? -0.2 : 0.2
  const n0 = fr(f0)
  const len = Math.round(0.2 * SR)
  let ph = 0
  for (let k = 0; k < len; k++) {
    const t = k / SR
    ph = (ph + freq / SR) % 1
    const env = Math.min(1, t / 0.002) * Math.exp(-t / 0.04) * (t < 0.12 ? 1 : Math.max(0, 1 - (t - 0.12) / 0.08))
    add(n0 + k, (ph < 0.125 ? 1 : -1) * env * dB(-14), pan)
  }
}

// 贝斯（四分音符，镜 2 起）
for (let b = 7; b * BEAT < 1860; b++) {
  const f0 = b * BEAT
  const chord = Math.floor(f0 / 240) % 4
  const freq = F(BASS[chord])
  const n0 = fr(f0)
  const len = Math.round(0.46 * SR)
  let ph = 0
  for (let k = 0; k < len; k++) {
    const t = k / SR
    ph = (ph + freq / SR) % 1
    const tri = 4 * Math.abs(ph - 0.5) - 1
    const env = Math.min(1, t / 0.006) * Math.exp(-t * 3.2) * Math.min(1, (0.46 - t) / 0.03)
    add(n0 + k, tri * env * dB(-12))
  }
}

// kick：1、3 拍；hi-hat：反拍（镜 2 起）
for (let f0 = 240; f0 < 1860; f0 += 60) {
  const n0 = fr(f0)
  const len = Math.round(0.14 * SR)
  let ph = 0
  for (let k = 0; k < len; k++) {
    const t = k / SR
    const freq = 45 + 105 * Math.exp(-t / 0.03)
    ph += (2 * Math.PI * freq) / SR
    const env = Math.exp(-t / 0.05) * Math.min(1, (0.12 - t) / 0.01 + 0.0001)
    add(n0 + k, Math.sin(ph) * Math.max(0, env) * 0.55)
  }
}
for (let f0 = 210 + 15; f0 < 1860; f0 += 30) {
  const n0 = fr(f0)
  const len = Math.round(0.05 * SR)
  let prev = 0
  for (let k = 0; k < len; k++) {
    const t = k / SR
    const w = rand() * 2 - 1
    const hp = w - prev
    prev = w
    add(n0 + k, hp * Math.exp(-t * 90) * 0.12, 0.1)
  }
}

/* ───── 事件音效 ───── */
// 网址变 ACCENT：上行 3 音 blip
;[77, 81, 84].forEach((m, i) => {
  const n0 = fr(EV.blip) + Math.round(i * 0.06 * SR)
  const len = Math.round(0.09 * SR)
  const f = F(m + 12)
  let ph = 0
  for (let k = 0; k < len; k++) {
    const t = k / SR
    ph = (ph + f / SR) % 1
    add(n0 + k, (ph < 0.5 ? 1 : -1) * Math.exp(-t * 36) * Math.min(1, t / 0.002) * 0.16)
  }
})

// 窗口展开：噪声 whoosh 200ms
{
  const n0 = fr(EV.whoosh)
  const len = Math.round(0.2 * SR)
  let lp = 0
  for (let k = 0; k < len; k++) {
    const x = k / len
    const a = 0.05 + 0.5 * x * x
    lp += a * ((rand() * 2 - 1) - lp)
    const env = Math.sin(Math.PI * x) ** 1.5
    add(n0 + k, lp * env * 0.9, (x - 0.5) * 0.4)
  }
}

// 粒子重组：16 个随机高音 tick
{
  const pitches = [1568, 1760, 2093, 2349, 2637, 3136]
  for (let i = 0; i < 16; i++) {
    const f0 = EV.tickStart + Math.round(i * 3 + rand() * 2)
    const n0 = fr(f0)
    const fq = pitches[Math.floor(rand() * pitches.length)]
    const pan = rand() * 1.0 - 0.5
    const len = Math.round(0.03 * SR)
    for (let k = 0; k < len; k++) {
      const t = k / SR
      add(n0 + k, Math.sin(2 * Math.PI * fq * t) * Math.exp(-t * 130) * 0.12, pan)
    }
  }
}

// 卡片落位：低频 thud
{
  const n0 = fr(EV.thud)
  const len = Math.round(0.28 * SR)
  let ph = 0
  for (let k = 0; k < len; k++) {
    const t = k / SR
    ph += (2 * Math.PI * (42 + 40 * Math.exp(-t / 0.04))) / SR
    add(n0 + k, Math.sin(ph) * Math.exp(-t * 14) * 0.7)
  }
}

// 开关 click
{
  const n0 = fr(EV.click)
  const len = Math.round(0.03 * SR)
  for (let k = 0; k < len; k++) {
    const t = k / SR
    add(n0 + k, (Math.sin(2 * Math.PI * 2200 * t) * 0.6 + (rand() * 2 - 1) * 0.4) * Math.exp(-t * 260) * 0.35)
  }
}

// 落标：F 大三和弦琶音（上行两个八度内）
{
  const notes = [65, 69, 72, 77, 81, 84]
  notes.forEach((m, i) => {
    const n0 = fr(EV.chord) + Math.round(i * 0.07 * SR)
    const len = Math.round(0.9 * SR)
    const f = F(m)
    let ph = 0
    for (let k = 0; k < len; k++) {
      const t = k / SR
      ph = (ph + f / SR) % 1
      const tri = 4 * Math.abs(ph - 0.5) - 1
      const pulse = ph < 0.125 ? 1 : -1
      add(n0 + k, (tri * 0.7 + pulse * 0.3) * Math.exp(-t * 4.5) * Math.min(1, t / 0.003) * 0.2, (i % 2 ? 0.25 : -0.25))
    }
  })
}

/* ───── 淡出、归一、写 WAV ───── */
const fadeStart = fr(1770)
for (let i = fadeStart; i < N; i++) {
  const g = Math.max(0, 1 - (i - fadeStart) / (N - fadeStart))
  L[i] *= g
  R[i] *= g
}
let peak = 0
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
const gain = (peak > 0 ? dB(-1.2) / peak : 1)

const bytes = Buffer.alloc(44 + N * 4)
bytes.write('RIFF', 0)
bytes.writeUInt32LE(36 + N * 4, 4)
bytes.write('WAVE', 8)
bytes.write('fmt ', 12)
bytes.writeUInt32LE(16, 16)
bytes.writeUInt16LE(1, 20)
bytes.writeUInt16LE(2, 22)
bytes.writeUInt32LE(SR, 24)
bytes.writeUInt32LE(SR * 4, 28)
bytes.writeUInt16LE(4, 32)
bytes.writeUInt16LE(16, 34)
bytes.write('data', 36)
bytes.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) {
  bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain)) * 32767), 44 + i * 4)
  bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain)) * 32767), 46 + i * 4)
}
const file = path.resolve('public/audio/pixel.wav')
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, bytes)
console.log(`✓ ${file}  ${DUR}s  peak ${(20 * Math.log10(peak * gain)).toFixed(2)} dBFS  blip@${EV.blip}`)
