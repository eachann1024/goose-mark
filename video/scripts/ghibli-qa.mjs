/**
 * 吉卜力版静帧 QA：抽帧 → 四角 180×180 与纯风景参考帧比对 → 6 列联系表
 * 用法：node scripts/ghibli-qa.mjs [帧号...]（缺省按 brief 第 7 节取帧）
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { bundle } from '@remotion/bundler'
import { renderStill, selectComposition } from '@remotion/renderer'

const FROM = [0, 210, 450, 690, 930, 1170, 1450, 1690, 1920]
const END = 2160
const C = 180
const OUT = path.resolve('out/ghibli-stills')
const CONTACT = path.resolve('out/ghibli-contact.png')

let frames = process.argv.slice(2).map(Number).filter(Number.isFinite)
if (!frames.length) {
  const s = new Set()
  FROM.forEach((from, i) => {
    const to = (FROM[i + 1] ?? END) - 1
    s.add(from + 20)
    s.add(Math.round((from + to) / 2))
    s.add(to - 8)
    if (i > 0) {
      s.add(from - 2)
      s.add(from + 1)
    }
  })
  s.add(END - 1)
  frames = [...s].sort((a, b) => a - b)
}

fs.mkdirSync(OUT, { recursive: true })
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts'), publicDir: path.resolve('public') })
const comp = await selectComposition({ serveUrl, id: 'GooseAIGhibli' })
const refComp = await selectComposition({ serveUrl, id: 'GooseAIGhibli', inputProps: { bare: true } })

const raw = async (file) => sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })

/** 与同帧纯风景参考比对：通道差 > 28 的像素计数 */
const corner = async (file, ref) => {
  const { data, info } = await raw(file)
  const { data: rd } = await raw(ref)
  const { width: w, height: h } = info
  const boxes = [
    ['TL', 0, 0],
    ['TR', w - C, 0],
    ['BL', 0, h - C],
    ['BR', w - C, h - C],
  ]
  const per = {}
  let total = 0
  for (const [name, x0, y0] of boxes) {
    let n = 0
    for (let y = y0; y < y0 + C; y++)
      for (let x = x0; x < x0 + C; x++) {
        const i = (y * w + x) * 3
        const d = Math.max(Math.abs(data[i] - rd[i]), Math.abs(data[i + 1] - rd[i + 1]), Math.abs(data[i + 2] - rd[i + 2]))
        if (d > 28) n++
      }
    per[name] = n
    total += n
  }
  return { per, total }
}

const results = []
for (const f of frames) {
  const file = path.join(OUT, `f${f}.png`)
  const ref = path.join(OUT, `ref${f}.png`)
  await renderStill({ composition: comp, serveUrl, output: file, frame: f, overwrite: true })
  await renderStill({ composition: refComp, serveUrl, output: ref, frame: f, overwrite: true, inputProps: { bare: true } })
  const c = await corner(file, ref)
  results.push({ f, ...c })
  console.log(`f${String(f).padStart(4)}  TL=${c.per.TL} TR=${c.per.TR} BL=${c.per.BL} BR=${c.per.BR}`)
}
const bad = results.filter((r) => r.total > 20)
console.log(bad.length ? `✗ ${bad.length} 张四角有非风景像素: ${bad.map((b) => b.f).join(',')}` : `✓ ${results.length} 张四角禁区通过`)

// 联系表：6 列，每格 360px，帧号写在格下方
const T = 360
const LAB = 34
const cols = 6
const rows = Math.ceil(frames.length / cols)
const tiles = []
for (let i = 0; i < frames.length; i++) {
  const f = frames[i]
  const img = await sharp(path.join(OUT, `f${f}.png`)).resize(T, T).png().toBuffer()
  const label = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${LAB}"><rect width="${T}" height="${LAB}" fill="#222"/><text x="10" y="25" font-family="Menlo,monospace" font-size="22" fill="#fff">${f}</text></svg>`,
  )
  const x = (i % cols) * (T + 6)
  const y = Math.floor(i / cols) * (T + LAB + 6)
  tiles.push({ input: img, left: x, top: y }, { input: label, left: x, top: y + T })
}
await sharp({ create: { width: cols * (T + 6), height: rows * (T + LAB + 6), channels: 3, background: '#111' } })
  .composite(tiles)
  .png()
  .toFile(CONTACT)
console.log(`联系表 ${CONTACT}  (${frames.length} 格)`)
