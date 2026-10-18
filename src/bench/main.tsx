import { createRoot } from 'react-dom/client'
import StarryBackground from '@/components/StarryBackground'
import BlackHole from '@/components/BlackHole'

const q = new URLSearchParams(location.search)
const variant = q.get('variant') ?? 'none'
const quality = (q.get('quality') ?? 'auto') as 'auto' | 'low' | 'medium' | 'high'
const rs = q.get('rs') ? Number(q.get('rs')) : undefined
const fps = q.get('fps') ? Number(q.get('fps')) : undefined

const root = createRoot(document.getElementById('root')!)

root.render(
  <div style={{ position: 'fixed', inset: 0 }}>
    {variant === 'starry' && <StarryBackground />}
    {variant === 'blackhole' && (
      <div style={{ position: 'fixed', inset: 0 }}>
        <BlackHole brightness={0.75} speed={0.9} quality={quality} resolutionScale={rs} maxFps={fps} />
      </div>
    )}
  </div>
)
