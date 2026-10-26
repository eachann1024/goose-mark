import { useEffect, useRef, useState, type FormEvent } from 'react'
import { celebrate } from './celebrate'
import { GripTextarea, gripPaint } from './grip-textarea'
import { Ico } from './icon'

const endpoint = 'https://feedback-api.cooool.top/api/feedback'
const imageLimit = 20 * 1024 * 1024
const videoLimit = 200 * 1024 * 1024

export function FeedbackSheet({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const imageRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [video, setVideo] = useState<File | null>(null)
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = message.trim()
    if (text.length < 4) {
      setStatus('请至少写 4 个字')
      return
    }
    if (images.some((file) => file.size > imageLimit)) {
      setStatus('单张图片不能超过 20MB')
      return
    }
    if (video && video.size > videoLimit) {
      setStatus('视频不能超过 200MB')
      return
    }
    const body = new FormData()
    body.set('project', 'mark')
    body.set('message', text)
    body.set('contact', contact.trim())
    body.set('leave_blank', '')
    images.slice(0, 4).forEach((file) => body.append('images', file))
    if (video) body.set('video', video)
    setSending(true)
    setStatus('')
    try {
      const response = await fetch(endpoint, { method: 'POST', body })
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!response.ok || !data?.ok) {
        setStatus(data?.error || '发送失败，请稍后再试')
        return
      }
      setMessage('')
      setImages([])
      setVideo(null)
      onSuccess()
      celebrate()
      onClose()
    } catch {
      setStatus('网络不通，请稍后再试')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="help-panel" onSubmit={submit}>
        <div className="help-header">
          <span className="help-title">反馈</span>
          <button type="button" className="help-close" onClick={onClose} aria-label="关闭">
            <Ico name="x" />
          </button>
        </div>
        <div className="help-body">
          <GripTextarea
            className="gm-id-textarea"
            paint={gripPaint.accent}
            gripLabel="反馈内容"
            minHeight={110}
            placeholder="遇到的问题或想要的功能"
            value={message}
            maxLength={4000}
            onChange={(event) => setMessage(event.target.value)}
          />
          <input
            className="gm-id-input"
            placeholder="邮箱，选填"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
          />
          <div className="gm-confirm-row">
            <button type="button" className="gm-act-btn" onClick={() => imageRef.current?.click()}>
              {images.length ? `图片 ${images.length}` : '图片'}
            </button>
            <button type="button" className="gm-act-btn" onClick={() => videoRef.current?.click()}>
              {video ? video.name : '视频'}
            </button>
            <button type="submit" className="gm-act-btn primary" disabled={sending}>
              {sending ? '发送中' : '发送'}
            </button>
          </div>
          <input
            ref={imageRef}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            aria-label="图片，最多 4 张，每张 20MB"
            onChange={(event) => setImages(Array.from(event.target.files || []).slice(0, 4))}
          />
          <input
            ref={videoRef}
            hidden
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            aria-label="视频，1 个，最大 200MB"
            onChange={(event) => setVideo(event.target.files?.[0] || null)}
          />
          {status ? <div className="help-tip">{status}</div> : null}
        </div>
      </form>
    </div>
  )
}
