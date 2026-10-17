/**
 * 1-bit 半调点阵生成器
 * 剪影遮罩 + 解析式明暗 → 网点圆点 → PNG（按目标像素 1:1 输出，渲染时只做整数位移）
 */
import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'

const OUT = path.resolve('public/halftone')
const VB = 420

/** 蛋形剪影（单一路径，无内部描边） */
const SIL = `M 210 42
  C 276 42 330 130 332 216
  C 334 312 278 370 210 370
  C 142 370 86 312 88 216
  C 90 130 144 42 210 42 Z`

const PAL = {
  ink: '#141414',
  paper: '#FBFAF6',
  maskInk: '#141414',
}

function gooseInk(pose, ink) {
  const eyes =
    pose === 'cheer'
      ? `<path d="M170 168 q 13 -21 28 0" fill="none" stroke="${ink}" stroke-width="11" stroke-linecap="round"/>
         <path d="M226 168 q 13 -21 28 0" fill="none" stroke="${ink}" stroke-width="11" stroke-linecap="round"/>`
      : `<circle cx="181" cy="170" r="13" fill="${ink}"/><circle cx="240" cy="170" r="13" fill="${ink}"/>`

  const bill =
    pose === 'cheer'
      ? `<path d="M184 208 L238 208 C 236 240 216 248 211 248 C 206 248 186 240 184 208 Z" fill="${ink}"/>
         <path d="M190 224 L232 224" stroke="${PAL.paper}" stroke-width="6"/>`
      : `<path d="M184 208 L238 208 C 235 236 214 243 211 243 C 208 243 187 236 184 208 Z" fill="${ink}"/>`

  const feet = `<ellipse cx="180" cy="380" rx="25" ry="11" fill="${ink}"/>
    <ellipse cx="243" cy="380" rx="25" ry="11" fill="${ink}"/>`

  const tuft = `<path d="M196 48 q -5 -24 -17 -31" fill="none" stroke="${ink}" stroke-width="10" stroke-linecap="round"/>
    <path d="M216 44 q 7 -21 19 -27" fill="none" stroke="${ink}" stroke-width="10" stroke-linecap="round"/>`

  return `${tuft}
    <path d="${SIL}" fill="none" stroke="${ink}" stroke-width="9" stroke-linejoin="round"/>
    ${feet}
    <path d="M 152 318 q 59 30 118 0" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>
    ${eyes}${bill}`
}

/** 以遮罩覆盖率 + 解析明暗算出网点 */
function builtDots(mask, w, h, pitch, { invert }) {
  const lightX = w * 0.30
  const lightY = h * 0.17
  const reach = w * 0.74
  const cols = Math.floor(w / pitch)
  const rows = Math.floor(h / pitch)
  const half = pitch / 2
  const out = []
  const ink = invert ? PAL.paper : PAL.ink

  for (let row = 0; row < rows; row++) {
    const y0 = Math.round(row * pitch)
    const y1 = Math.round(y0 + pitch)
    for (let col = 0; col < cols; col++) {
      const x0 = Math.round(col * pitch)
      const x1 = Math.round(x0 + pitch)
      let a = 0
      let n = 0
      for (let y = y0; y < y1 && y < h; y++) {
        const base = y * w
        for (let x = x0; x < x1 && x < w; x++) {
          a += mask[base + x]
          n++
        }
      }
      a = n ? a / (n * 255) : 0
      if (a < 0.06) continue

      const cx = x0 + half
      const cy = y0 + half
      const dx = (cx - lightX) / reach
      const dy = (cy - lightY) / reach
      const t = Math.min(1, Math.sqrt(dx * dx + dy * dy))
      const tone = 0.03 + 0.95 * Math.pow(t, 1.95)
      const c = tone * a
      let r = pitch * Math.sqrt(c / Math.PI)
      r = Math.round(r * 4) / 4
      if (r < 0.4) continue
      out.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}"/>`)
    }
  }
  return `<g fill="${ink}">${out.join('')}</g>`
}

async function build({ pose, size, pitch, invert, name }) {
  const scale = size / VB
  const px = Math.round(VB * scale)

  const maskRaw = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${VB} ${VB}">
        <rect width="${VB}" height="${VB}" fill="#000"/>
        <path d="${SIL}" fill="#fff"/>
      </svg>`,
    ),
  )
    .flatten({ background: '#000000' })
    .greyscale()
    .raw()
    .toBuffer()

  const dots = builtDots(new Float32Array(maskRaw), px, px, pitch, { invert })
  const ink = invert ? PAL.paper : PAL.ink
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
    ${dots}
    <g transform="scale(${scale})">${gooseInk(pose, ink)}</g>
  </svg>`

  await fs.writeFile(path.join(OUT, `${name}.svg`), svg)
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(OUT, `${name}.png`))
  console.log(`✓ ${name}  ${px}×${px}  pitch ${pitch}${invert ? '  (inverted)' : ''}`)
}

await fs.mkdir(OUT, { recursive: true })
await build({ pose: 'idle', size: 560, pitch: 4, invert: false, name: 'goose-idle-560' })
await build({ pose: 'cheer', size: 560, pitch: 4, invert: false, name: 'goose-cheer-560' })
await build({ pose: 'cheer', size: 260, pitch: 3, invert: false, name: 'goose-cheer-260' })
await build({ pose: 'idle', size: 240, pitch: 3, invert: false, name: 'goose-idle-240' })
await build({ pose: 'cheer', size: 220, pitch: 3, invert: false, name: 'goose-cheer-220' })
await build({ pose: 'idle', size: 220, pitch: 3, invert: false, name: 'goose-idle-220' })
await build({ pose: 'cheer', size: 520, pitch: 4, invert: true, name: 'goose-cheer-520-inv' })
await build({ pose: 'idle', size: 400, pitch: 4, invert: true, name: 'goose-idle-400-inv' })
