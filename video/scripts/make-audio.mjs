/**
 * 代码生成的音效床：BPM 120 · 四小节一循环 · 全程无人声
 * 正弦主音 + 三角波贝斯 + 白噪声 hi-hat，另加 8ms 短 click 标记强调物件落位与品牌定格
 */
import fs from 'node:fs'
import path from 'node:path'

const FPS = 60
const BPM = 120
const BEAT = 60 / BPM // 0.5s
const BAR = BEAT * 4 // 2s
const LOOP_BARS = 4
const LOOP = BAR * LOOP_BARS // 8s
const TOTAL_FRAMES = 1950
const DUR = TOTAL_FRAMES / FPS // 30.5s
const SR = 48000
const N = Math.round(DUR * SR)

const out = new Float32Array(N)

const FREQ = { C3: 130.81, F2: 87.31, G2: 98.0, A2: 110.0, A3: 220.0, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99 }

/** 每小节 8 个八分音符的主音旋律（C 大调五声） */
const LEAD = [
  ['C5', 'E5', 'G5', 'E5', 'A4', 'C5', 'E5', 'D5'],
  ['A4', 'C5', 'E5', 'C5', 'G4', 'A4', 'C5', 'E4'],
  ['F2', 'A3', 'C4', 'A3', 'F2', 'A3', 'C5', 'A3'],
  ['G4', 'C5', 'D5', 'C5', 'G4', 'D5', 'E5', 'G5'],
]
const BASS = ['C3', 'A2', 'F2', 'G2']

const add = (i, v) => {
  if (i >= 0 && i < N) out[i] += v
}

let seed = 20260214
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

for (let loop = 0; loop * LOOP < DUR; loop++) {
  const loopStart = loop * LOOP

  for (let bar = 0; bar < LOOP_BARS; bar++) {
    const barStart = loopStart + bar * BAR

    // ── 正弦主音：八分音符
    for (let e = 0; e < 8; e++) {
      const f = FREQ[LEAD[bar][e]]
      const t0 = barStart + e * (BEAT / 2)
      const len = BEAT / 2
      const n0 = Math.round(t0 * SR)
      const nLen = Math.round(len * SR) + Math.round(0.12 * SR)
      for (let k = 0; k < nLen; k++) {
        const t = k / SR
        const env = Math.min(1, t / 0.012) * Math.exp(-t * 11)
        add(n0 + k, Math.sin(2 * Math.PI * f * t) * env * 0.085)
      }
    }

    // ── 三角波贝斯：半小节长音，落在拍点上
    for (let h = 0; h < 2; h++) {
      const f = FREQ[BASS[bar]]
      const t0 = barStart + h * (BAR / 2)
      const n0 = Math.round(t0 * SR)
      const nLen = Math.round(BAR / 2 * SR)
      for (let k = 0; k < nLen; k++) {
        const t = k / SR
        const p = (f * t) % 1
        const tri = 4 * Math.abs(p - 0.5) - 1
        const env = Math.min(1, t / 0.02) * Math.exp(-t * 2.4) * (1 - Math.min(1, t / (BAR / 2)))
        add(n0 + k, tri * env * 0.13)
      }
    }

    // ── 白噪声 hi-hat：八分音符，拍点略重
    for (let e = 0; e < 8; e++) {
      const t0 = barStart + e * (BEAT / 2)
      const amp = e % 2 === 0 ? 0.07 : 0.038
      const n0 = Math.round(t0 * SR)
      const nLen = Math.round(0.055 * SR)
      let prev = 0
      for (let k = 0; k < nLen; k++) {
        const t = k / SR
        const w = rand() * 2 - 1
        const hp = w - prev // 一级高通，贴耳的高频
        prev = w
        add(n0 + k, hp * Math.exp(-t * 78) * amp)
      }
    }
  }
}

/** 8ms / 1200Hz 正弦 + 指数衰减 */
const CLICKS = [
  130, // S1 网址圈定
  420, // S2 能力条落定
  896, // S3 图标·正文·描述 装齐
  1368, // S5 压缩落定
  1508, // S6 书签归位
  1694, // S7 印章
  1800, // S8 品牌定格
]
for (const frame of CLICKS) {
  const n0 = Math.round((frame / FPS) * SR)
  const nLen = Math.round(0.04 * SR)
  for (let k = 0; k < nLen; k++) {
    const t = k / SR
    const env = Math.exp(-t * 420)
    add(n0 + k, Math.sin(2 * Math.PI * 1200 * t) * env * 0.3)
  }
}

// ── 归一化（留 1.5dB 余量）后写 16bit 立体声
let peak = 0
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]))
const gain = peak > 0 ? 0.84 / peak : 1

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
  const s = Math.max(-1, Math.min(1, out[i] * gain))
  const v = Math.round(s * 32767)
  bytes.writeInt16LE(v, 44 + i * 4)
  bytes.writeInt16LE(v, 46 + i * 4)
}

const file = path.resolve('public/audio/bed.wav')
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, bytes)
console.log(`✓ ${file}  ${DUR}s  BPM ${BPM}  peak ${peak.toFixed(3)}  gain ${gain.toFixed(2)}`)
