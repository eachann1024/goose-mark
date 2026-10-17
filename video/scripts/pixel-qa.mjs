/**
 * 像素版静帧 QA：抽帧 → 四角 200×200 禁区亮点统计 → 联系表
 * 用法：node scripts/pixel-qa.mjs [帧号...]（缺省按 brief 第 7 节取帧）
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { bundle } from '@remotion/bundler'
import { renderStill, selectComposition } from '@remotion/renderer'

const FROM = [0, 210, 420, 660, 900, 1140, 1380, 1620]
const END = 1860
const OUT = path.resolve('out/pixel-stills')
const CONTACT = path.resolve('out/pixel-contact.png')

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
  s.add(1380 + 6)
  s.add(END - 1)
  frames = [...s].sort((a, b) => a - b)
}

fs.mkdirSync(OUT, { recursive: true })
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts'), publicDir: path.resolve('public') })
const comp = await selectComposition({ serveUrl, id: 'GooseAIPixel' })

const corner = async (file) => {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const boxes = [
    ['TL', 0, 0],
    ['TR', w - 200, 0],
    ['BL', 0, h - 200],
    ['BR', w - 200, h - 200],
  ]
  let total = 0
  const per = {}
  for (const [name, x0, y0] of boxes) {
    let n = 0
    for (let y = y0; y < y0 + 200; y++)
      for (let x = x0; x < x0 + 200; x++) {
        const i = (y * w + x) * 3
        if (Math.max(data[i], data[i + 1], data[i + 2]) > 40) n++
      }
    per[name] = n
    total += n
  }
  return { per, total }
}

const results = []
for (const f of frames) {
  const file = path.join(OUT, `f${f}.png`)
  await renderStill({ composition: comp, serveUrl, output: file, frame: f, chromiumOptions: { gl: 'angle' }, overwrite: true })
  const c = await corner(file)
  results.push({ f, ...c })
  console.log(`f${String(f).padStart(4)}  corners TL=${c.per.TL} TR=${c.per.TR} BL=${c.per.BL} BR=${c.per.BR}  sum=${c.total}`)
}
const bad = results.filter((r) => r.total > 0)
console.log(bad.length ? `✗ ${bad.length} 张帧四角有亮点: ${bad.map((b) => b.f).join(',')}` : `✓ ${results.length} 张静帧四角禁区均为 0`)

// 联系表：每格 360px，帧号只画在联系表里
const T = 360
const cols = 8
const rows = Math.ceil(frames.length / cols)
const tiles = []
for (let i = 0; i < frames.length; i++) {
  const f = frames[i]
  const buf = await sharp(path.join(OUT, `f${f}.png`)).resize(T, T).png().toBuffer()
  const label = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}"><rect x="6" y="6" width="74" height="28" fill="#000" opacity="0.75"/><text x="12" y="27" font-family="Menlo,monospace" font-size="20" fill="#0f0">${f}</text></svg>`,
  )
  const tile = await sharp(buf).composite([{ input: label }]).png().toBuffer()
  tiles.push({ input: tile, left: (i % cols) * (T + 4), top: Math.floor(i / cols) * (T + 4) })
}
await sharp({
  create: { width: cols * (T + 4), height: rows * (T + 4), channels: 3, background: '#303030' },
})
  .composite(tiles)
  .png()
  .toFile(CONTACT)
console.log(`联系表 ${CONTACT}  (${frames.length} 格)`)
