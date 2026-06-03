import type { Area } from 'react-easy-crop'

/**
 * 从原图 + react-easy-crop 输出的裁剪区域生成正方形 dataURL（PNG）。
 * 替代旧版 vue-picture-cropper 的 cropper.getDataURL()。纯 canvas，无依赖。
 */
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (err) => reject(err))
    image.crossOrigin = 'anonymous'
    image.src = url
  })

export async function getCroppedDataUrl(
  imageSrc: string,
  cropPixels: Area,
  outputSize = 256
): Promise<string | null> {
  try {
    const image = await createImage(imageSrc)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    canvas.width = outputSize
    canvas.height = outputSize

    ctx.drawImage(
      image,
      cropPixels.x,
      cropPixels.y,
      cropPixels.width,
      cropPixels.height,
      0,
      0,
      outputSize,
      outputSize
    )

    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}
