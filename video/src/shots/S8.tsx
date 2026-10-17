import React from 'react'
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion'
import { INK, SANS, SERIF } from '../theme'
import { cardIn, stampSpring } from '../lib/anim'
import { DotField, HalftoneSwatch, Sparkle, Underline } from '../parts/deco'

export const S8: React.FC = () => {
  const frame = useCurrentFrame()
  const p = cardIn(frame, 0, 20)
  const q = cardIn(frame, 10, 20)

  return (
    <AbsoluteFill style={{ background: '#F9F8F3' }}>
      <DotField drift={frame * 1.2} />
      <HalftoneSwatch left={892} top={126} progress={cardIn(frame, 20, 30)} />
      <Img
        src={staticFile('halftone/goose-cheer-260.png')}
        style={{
          position: 'absolute',
          left: 410,
          top: 262,
          width: 260,
          height: 260,
          transform: `translateY(${Math.round((1 - p) * 32 + Math.sin(frame / 24) * 4)}px)`,
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 596,
          width: '100%',
          textAlign: 'center',
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 86,
          letterSpacing: '-0.03em',
          color: INK,
          transform: `translateY(${(1 - p) * 26}px)`,
          opacity: Math.min(1, p * 1.6),
        }}
      >
        鹅的书签
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 722,
          width: '100%',
          textAlign: 'center',
          fontFamily: SERIF,
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: 54,
          letterSpacing: 0,
          color: INK,
          transform: `translateY(${(1 - q) * 22}px)`,
          opacity: Math.min(1, q * 1.8),
        }}
      >
        贴个网址，就收好了
      </div>

      <Underline left={498} top={812} width={84} progress={cardIn(frame, 34, 24)} height={3} />
      <Sparkle left={762} top={600} progress={stampSpring(frame, 52)} scale={0.85} />
    </AbsoluteFill>
  )
}
