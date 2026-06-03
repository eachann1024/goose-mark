import { useCallback, useEffect, useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import { Upload, Crop, X, Eraser, Pipette } from 'lucide-react'
import type { IconSource } from '@/types/bookmark'
import { BookmarkIcon } from '@/components/BookmarkIcon'
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/internal/Dialog'
import { getCroppedDataUrl } from '@/lib/cropImage'
import { cn } from '@/lib/utils'

/**
 * IconSelector（React 版）
 * --------------------------------------------------------------------------
 * 旧版 Vue + vue-picture-cropper → React + react-easy-crop。
 * - v-model:modelValue(IconSource) → 受控 value + onChange(IconSource | null)
 * - emit(close/confirm) → onClose / onConfirm
 * - 图片：选择/粘贴 → 裁剪弹窗（react-easy-crop）→ 确认生成 dataURL
 * - 文字：1-4 字符 + 背景色；颜色色板 + 取色器 + 清除背景
 * - 粘贴监听 window paste（排除输入框）；i-ph-* 图标改 lucide-react
 * - tab/激活样式迁移到 index.css。无埋点。
 */
export interface IconSelectorProps {
  value?: IconSource
  onChange: (value: IconSource | null) => void
  title?: string
  inline?: boolean
  onClose?: () => void
  onConfirm?: () => void
}

const COLORS = ['#000000', '#FFFFFF', '#EF4444', '#F59E0B', '#22C55E', '#0EA5E9', '#6366F1', '#F472B6']

const resolveImageSrc = (icon?: IconSource | null): string | null => {
  if (!icon) return null
  if (icon.type === 'file') return icon.path
  if (icon.type === 'remote') return icon.src
  if (icon.type === 'custom') return icon.data
  return null
}

const getInitialTab = (value?: IconSource): 'image' | 'text' => {
  if (!value) return 'text'
  if (value.type === 'text') return 'text'
  return 'image'
}

export function IconSelector({
  value,
  onChange,
  title,
  inline,
  onClose,
  onConfirm
}: IconSelectorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const colorInputRef = useRef<HTMLInputElement | null>(null)

  const [activeTab, setActiveTab] = useState<'image' | 'text'>(getInitialTab(value))
  const [imageColor, setImageColor] = useState<string | undefined>(value?.bgColor)
  const [textColor, setTextColor] = useState<string | undefined>(value?.bgColor)
  const [localColor, setLocalColor] = useState<string | undefined>(value?.bgColor)
  const [customText, setCustomText] = useState(value?.type === 'text' ? value.value || '' : '')
  const [localImageSrc, setLocalImageSrc] = useState<string | null>(resolveImageSrc(value))

  // Cropper 状态
  const [showCropper, setShowCropper] = useState(false)
  const [cropperImg, setCropperImg] = useState('')
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const croppedAreaPixelsRef = useRef<Area | null>(null)

  // 挂载后聚焦以支持粘贴快捷键
  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  const letters = (customText ? customText.slice(0, 4) : (title || '').slice(0, 4)).toUpperCase()

  const previewImageUrl = activeTab === 'text' ? null : localImageSrc
  const previewIconObject: IconSource | null =
    activeTab === 'text'
      ? { type: 'text', value: letters, bgColor: localColor }
      : previewImageUrl
        ? { type: 'remote', src: previewImageUrl, bgColor: localColor }
        : null

  const applyColor = (c: string | undefined) => {
    setLocalColor(c)
    if (activeTab === 'image') setImageColor(c)
    else setTextColor(c)
  }

  const emitFinalChange = useCallback(() => {
    if (activeTab === 'text') {
      onChange({ type: 'text', value: letters, bgColor: localColor })
    } else if (localImageSrc) {
      let iconData: IconSource
      if (localImageSrc.startsWith('data:')) {
        iconData = { type: 'custom', data: localImageSrc, bgColor: localColor }
      } else if (localImageSrc.startsWith('http')) {
        iconData = { type: 'remote', src: localImageSrc, bgColor: localColor }
      } else if (localImageSrc.startsWith('file://')) {
        iconData = { type: 'file', path: localImageSrc.replace('file://', ''), bgColor: localColor }
      } else {
        iconData = { type: 'file', path: localImageSrc, bgColor: localColor }
      }
      onChange(iconData)
    } else {
      onChange(null)
    }
  }, [activeTab, letters, localColor, localImageSrc, onChange])

  const openCropper = useCallback((imgSrc: string) => {
    setCropperImg(imgSrc)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    croppedAreaPixelsRef.current = null
    setShowCropper(true)
  }, [])

  // 粘贴图片（排除输入框）
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return

      const items = e.clipboardData?.items
      if (!items) return

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          e.stopPropagation()
          const blob = item.getAsFile()
          if (blob) {
            const reader = new FileReader()
            reader.onload = (event) => openCropper(event.target?.result as string)
            reader.readAsDataURL(blob)
          }
          break
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [openCropper])

  const clearIcon = () => {
    setLocalImageSrc(null)
    setCustomText('')
    onChange(null)
  }

  const triggerPickColor = () => colorInputRef.current?.click()

  const triggerFileSelect = () => {
    setActiveTab('image')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => openCropper(event.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleEditImage = () => {
    if (localImageSrc) openCropper(localImageSrc)
  }

  const handleCropConfirm = async () => {
    const area = croppedAreaPixelsRef.current
    if (!area) return
    const data = await getCroppedDataUrl(cropperImg, area)
    if (!data) return
    setLocalImageSrc(data)
    setActiveTab('image')
    setShowCropper(false)
  }

  // tab 切换时同步 localColor（等价旧版 watch(activeTab)）
  useEffect(() => {
    setLocalColor(activeTab === 'text' ? textColor : imageColor)
    // 仅依赖 activeTab，保持与旧版 immediate:false 一致的"切换时取对应色"语义
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // 图片确认裁剪后向上同步（替代旧版 nextTick + emitFinalChange）
  useEffect(() => {
    if (activeTab === 'image' && localImageSrc?.startsWith('data:')) {
      emitFinalChange()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localImageSrc])

  // 外部 value 变化时同步本地态（等价旧版 watch(modelValue, deep)）
  useEffect(() => {
    const nextSrc = resolveImageSrc(value)
    setLocalImageSrc((prev) => (nextSrc !== prev ? nextSrc : prev))
    if (value?.type === 'text') setCustomText(value.value || '')
    else if (value) setCustomText('')
    if (value?.bgColor) {
      setLocalColor(value.bgColor)
      setImageColor(value.bgColor)
      if (activeTab === 'text') setTextColor(value.bgColor)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const hasClearable =
    (activeTab === 'image' && !!previewImageUrl) || (activeTab === 'text' && !!customText)

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      className={cn(
        'outline-none',
        inline
          ? 'relative w-full'
          : 'relative p-6 bg-popover rounded-2xl border border-border/60 w-[420px] shadow-2xl'
      )}
    >
      {/* Tabs */}
      <div className="flex gap-3 border-b border-border/30 pb-3 mb-5">
        <button
          type="button"
          className={cn(
            'icon-selector-tab relative rounded-full h-8 px-3 text-xs transition-colors',
            activeTab === 'image' ? 'icon-selector-tab--active' : 'text-muted-foreground'
          )}
          onClick={() => setActiveTab('image')}
        >
          图片图标
        </button>
        <button
          type="button"
          className={cn(
            'icon-selector-tab relative rounded-full h-8 px-3 text-xs transition-colors',
            activeTab === 'text' ? 'icon-selector-tab--active' : 'text-muted-foreground'
          )}
          onClick={() => setActiveTab('text')}
        >
          文字图标
        </button>
      </div>

      {/* Main */}
      <div className={cn('flex gap-5 mb-5 items-start', inline && 'max-w-lg mx-auto')}>
        {/* Preview / Actions */}
        <div className="flex-1 flex justify-center">
          <div className="relative group">
            <BookmarkIcon
              icon={previewIconObject}
              fallbackText={title}
              size="custom"
              customSizeClass="w-32 h-32 rounded-xl"
              className="shadow-lg border border-border/50 bg-background"
            />

            <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              {activeTab === 'image' && (
                <>
                  <button
                    type="button"
                    title="选择图片，或直接粘贴 (Ctrl+V)"
                    className="h-8 w-8 rounded-full shadow-sm inline-flex items-center justify-center bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                    onClick={triggerFileSelect}
                  >
                    <Upload className="size-3.5" />
                  </button>
                  {previewImageUrl && (
                    <button
                      type="button"
                      title="裁剪/编辑"
                      className="h-8 w-8 rounded-full shadow-sm inline-flex items-center justify-center bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                      onClick={handleEditImage}
                    >
                      <Crop className="size-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>

            {hasClearable && (
              <button
                type="button"
                title="清除"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-md z-10 inline-flex items-center justify-center bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors dark:border-red-500/30 dark:bg-red-500/12 dark:text-red-200"
                onClick={clearIcon}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* Right config */}
        <div className="w-48 flex flex-col gap-4">
          {activeTab === 'text' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground">文字内容</label>
              <input
                value={customText}
                maxLength={4}
                placeholder="输入 1-4 个字符"
                onChange={(e) => setCustomText(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-muted/50 px-3 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground">背景颜色</label>
            <div className="grid grid-cols-4 gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    'w-8 h-8 rounded-full shadow-sm ring-1 ring-border/20 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary',
                    localColor === c && 'ring-2 ring-primary ring-offset-1'
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => applyColor(c)}
                />
              ))}
              <button
                type="button"
                title="无背景"
                className={cn(
                  'w-8 h-8 rounded-full border border-dashed border-border flex items-center justify-center hover:border-destructive hover:text-destructive text-muted-foreground transition-colors',
                  !localColor && 'border-primary text-primary'
                )}
                onClick={() => applyColor(undefined)}
              >
                <Eraser className="size-3" />
              </button>
              <button
                type="button"
                title="自定义颜色"
                className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 flex items-center justify-center text-white hover:opacity-90 transition-opacity"
                onClick={triggerPickColor}
              >
                <Pipette className="size-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer（弹窗模式） */}
      {!inline && (
        <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-border/30">
          <button
            type="button"
            className="h-8 px-3 inline-flex items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="h-8 px-3 inline-flex items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            onClick={() => {
              emitFinalChange()
              onConfirm?.()
            }}
          >
            确定
          </button>
        </div>
      )}

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={colorInputRef}
        type="color"
        className="absolute left-0 top-0 w-0 h-0 opacity-0 pointer-events-none"
        onChange={(e) => applyColor(e.target.value)}
      />

      {/* Cropper Dialog */}
      <Dialog open={showCropper} onOpenChange={setShowCropper} contentClassName="max-w-[500px]">
        <DialogHeader>
          <DialogTitle>编辑图片</DialogTitle>
        </DialogHeader>
        <div className="w-full h-[300px] mt-2 border rounded-md overflow-hidden bg-black/5 relative">
          {cropperImg && (
            <Cropper
              image={cropperImg}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, areaPixels) => {
                croppedAreaPixelsRef.current = areaPixels
              }}
            />
          )}
        </div>
        <DialogFooter className="mt-4">
          <button
            type="button"
            className="h-9 px-4 inline-flex items-center justify-center rounded-md border border-input bg-muted/35 text-sm text-foreground shadow-sm hover:bg-muted/60 transition-colors"
            onClick={() => setShowCropper(false)}
          >
            取消
          </button>
          <button
            type="button"
            className="h-9 px-4 inline-flex items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            onClick={handleCropConfirm}
          >
            确认裁剪
          </button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

export default IconSelector
