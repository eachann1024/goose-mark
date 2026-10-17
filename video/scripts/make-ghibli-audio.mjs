/**
 * 吉卜力版配乐：F 大调 · BPM 96 · 3/4 · I–vi–IV–V 每小节一和弦
 * 八音盒主旋律（加法正弦）+ 三角波拨弦分解 + 失谐正弦长音垫 + 结尾上行琶音
 * 音效帧位读取 src/ghibli/cues.json，与画面点击/按键/飞行/成功对齐
 * 44.1k / 16bit / 立体声 / 36s / 峰值 ≤ -1 dBFS，末 2 秒淡出
 */
import fs from 'node:fs'
import path from 'node:path'

const cues = JSON.parse(fs.readFileSync(path.resolve('src/ghibli/cues.json'), 'utf8'))
const FPS = 60
const SR = 44100
const DUR = 2160 / FPS
const N = Math.round(DUR * SR)
const L = new Float32Array(N)
const R = new Float32Array(N)
const dB = (d) => 10 ** (d / 20)
const TAU = Math.PI * 2
const sec = (f) => f / FPS
const at = (s) => Math.round(s * SR)
const mtof = (m) => 440 * 2 ** ((m - 69) / 12)

let seed = 1988
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const add = (i, v, pan = 0) => {
  if (i < 0 || i >= N) return
  L[i] += v * (1 - pan) * 0.5 * 2 ** 0.5
  R[i] += v * (1 + pan) * 0.5 * 2 ** 0.5
}

const BEAT = 60 / 96
const BAR = BEAT * 3
const BARS = Math.ceil(DUR / BAR)
// I–vi–IV–V：F Dm B♭ C（根、三、五）
const CHORDS = [
  [53, 57, 60],
  [50, 53, 57],
  [46, 50, 53],
  [48, 52, 55],
]
const END_BAR = 17 // 结尾琶音小节
const chordOf = (bar) => (bar >= END_BAR ? CHORDS[0] : CHORDS[bar % 4])

/* ── 柔和长音垫：两个微失谐正弦，单极低通，-18 dB ── */
{
  const g = dB(-18)
  let lp = 0
  const ph = [0, 0, 0, 0, 0, 0]
  for (let i = 0; i < N; i++) {
    const t = i / SR
    const bar = Math.floor(t / BAR)
    const local = t - bar * BAR
    const ch = chordOf(bar)
    const notes = [ch[0], ch[2]]
    let v = 0
    notes.forEach((m, k) => {
      const f = mtof(m + 12)
      ph[k * 2] += (TAU * f * 1.0017) / SR
      ph[k * 2 + 1] += (TAU * f * 0.9983) / SR
      v += Math.sin(ph[k * 2]) + Math.sin(ph[k * 2 + 1])
    })
    // 每小节交叉：起音 0.25s，尾部 0.2s 收
    const env = Math.min(1, local / 0.25) * Math.min(1, (BAR - local) / 0.2 + 0.35)
    const intro = Math.min(1, t / 1.5)
    lp += 0.08 * (v * env - lp)
    add(i, lp * g * 0.5 * intro, Math.sin(t * 0.3) * 0.2)
  }
}

/* ── 拨弦伴奏：三角波 + 快速衰减，每小节 6 个八分音符分解 ── */
{
  const PAT = [0, 2, 1, 2, 3, 2] // 3 = 高八度根音
  for (let bar = 0; bar < BARS; bar++) {
    if (bar > END_BAR) break
    const ch = chordOf(bar)
    PAT.forEach((p, e) => {
      if (bar === END_BAR && e > 0) return
      const m = p === 3 ? ch[0] + 12 : ch[p]
      const f = mtof(m + 12)
      const n0 = at(bar * BAR + e * (BEAT / 2))
      const len = at(bar === END_BAR ? 2.2 : 0.42)
      let ph = 0
      const pan = e % 2 ? 0.28 : -0.28
      const g = dB(e === 0 ? -14 : -17)
      for (let k = 0; k < len; k++) {
        const t = k / SR
        ph = (ph + f / SR) % 1
        const tri = 4 * Math.abs(ph - 0.5) - 1
        const env = Math.min(1, t / 0.003) * Math.exp(-t / (bar === END_BAR ? 0.6 : 0.09))
        add(n0 + k, tri * env * g, pan)
      }
    })
  }
}

/* ── 八音盒主旋律：基频 + 2、3 次谐波，0.6s 指数衰减；F 五声为主的原创旋律 ── */
const PHRASE = [
  [[0, 81, 1], [1, 84, 0.5], [1.5, 81, 0.5], [2, 79, 1]],
  [[0, 77, 1.5], [1.5, 74, 0.5], [2, 77, 1]],
  [[0, 79, 1], [1, 81, 1], [2, 84, 1]],
  [[0, 86, 1.5], [1.5, 84, 0.5], [2, 79, 1]],
  [[0, 81, 0.5], [0.5, 84, 0.5], [1, 86, 1], [2, 84, 1]],
  [[0, 81, 1], [1, 77, 1], [2, 74, 1]],
  [[0, 77, 1], [1, 79, 0.5], [1.5, 81, 0.5], [2, 79, 1]],
  [[0, 77, 2], [2, 72, 1]],
]
const bell = (t0, m, g, pan = 0, decay = 0.6) => {
  const f = mtof(m)
  const n0 = at(t0)
  const len = at(decay * 5)
  for (let k = 0; k < len; k++) {
    const t = k / SR
    const env = Math.min(1, t / 0.004) * Math.exp(-t / decay)
    const v = Math.sin(TAU * f * t) + 0.32 * Math.sin(TAU * 2 * f * t) * Math.exp(-t / 0.25) + 0.14 * Math.sin(TAU * 3 * f * t) * Math.exp(-t / 0.15)
    add(n0 + k, v * env * g, pan)
  }
}
for (let bar = 1; bar < END_BAR; bar++) {
  const idx = (bar - 1) % 8
  const second = bar > 8
  for (const [b, m, d] of PHRASE[idx]) {
    bell(bar * BAR + b * BEAT, m, dB(-11), -0.08, 0.6)
    if (second && d >= 1) bell(bar * BAR + b * BEAT + 0.012, m - 12, dB(-21), 0.2, 0.5)
  }
}
// 结尾上行琶音收在 F 主和弦
;[65, 69, 72, 77, 81, 84, 89].forEach((m, i) => {
  bell(END_BAR * BAR + i * (BEAT / 3), m, dB(i === 6 ? -10 : -13), (i - 3) * 0.08, i === 6 ? 1.1 : 0.8)
})

/* ── 音效 ── */
// 鼠标点击：短木鱼声（1.2kHz 正弦，40ms 衰减）
for (const c of cues.clicks) {
  const n0 = at(sec(c))
  const len = at(0.06)
  let ph = 0
  for (let k = 0; k < len; k++) {
    const t = k / SR
    ph += (TAU * 1200 * (1 + 0.08 * Math.exp(-t / 0.004))) / SR
    add(n0 + k, Math.sin(ph) * Math.exp(-t / 0.011) * Math.min(1, t / 0.0008) * dB(-6), 0.1)
  }
}
// 键帽按下：柔和低音敲击
for (const c of cues.keys) {
  const n0 = at(sec(c))
  const len = at(0.3)
  let ph = 0
  let lp = 0
  for (let k = 0; k < len; k++) {
    const t = k / SR
    ph += (TAU * (92 + 70 * Math.exp(-t / 0.03))) / SR
    lp += 0.1 * (rand() * 2 - 1 - lp)
    add(n0 + k, (Math.sin(ph) * 0.9 + lp * 0.5 * Math.exp(-t / 0.01)) * Math.exp(-t / 0.07) * Math.min(1, t / 0.002) * dB(-4))
  }
}
// 纸片 / 卡片飞行：滤波白噪声 whoosh
for (const c of cues.whoosh) {
  const n0 = at(sec(c))
  const len = at(0.42)
  let lp1 = 0
  let lp2 = 0
  const dir = rand() > 0.5 ? 1 : -1
  for (let k = 0; k < len; k++) {
    const x = k / len
    const a1 = 0.02 + 0.22 * Math.sin(Math.PI * x) ** 2
    const w = rand() * 2 - 1
    lp1 += a1 * (w - lp1)
    lp2 += a1 * (lp1 - lp2)
    const band = lp1 - lp2 * 0.6
    const env = Math.sin(Math.PI * x) ** 2
    add(n0 + k, band * env * dB(-6), dir * (x - 0.5) * 0.6)
  }
}
// 成功勾：两音上行风铃
for (const c of cues.chime) {
  ;[[0, 89], [0.11, 96]].forEach(([d, m]) => {
    const f = mtof(m)
    const n0 = at(sec(c) + d)
    const len = at(1.6)
    for (let k = 0; k < len; k++) {
      const t = k / SR
      const v = Math.sin(TAU * f * t) + 0.4 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t / 0.2) + 0.2 * Math.sin(TAU * f * 5.4 * t) * Math.exp(-t / 0.08)
      add(n0 + k, v * Math.exp(-t / 0.45) * Math.min(1, t / 0.002) * dB(-12), m > 90 ? 0.25 : -0.25)
    }
  })
}

/* ── 淡出、归一、写 WAV ── */
const fade = at(DUR - 2)
for (let i = fade; i < N; i++) {
  const g = Math.max(0, 1 - (i - fade) / (N - fade))
  L[i] *= g * g
  R[i] *= g * g
}
let peak = 0
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
const gain = dB(-1.1) / peak
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
const file = path.resolve('public/audio/ghibli.wav')
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, bytes)
console.log(`✓ ${file}  ${DUR}s  peak ${(20 * Math.log10(peak * gain)).toFixed(2)} dBFS`)
