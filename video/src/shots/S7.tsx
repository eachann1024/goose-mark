import React from 'react'
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion'
import { ACCENT } from '../theme'
import { BigTitle } from '../parts/Type'
import { Seal } from '../parts/ui'
import { cardIn, stampSpring } from '../lib/anim'
import { DotField, Sparkle, Underline } from '../parts/deco'

const LIGHT = '#FBFAF6'

export const S7: React.FC = () => {
  const frame = useCurrentFrame()
  const seal = stampSpring(frame, 74)
  const gooseIn = cardIn(frame, 0, 22)

  return (
    <AbsoluteFill style={{ background: '#11100E' }}>
      <DotField drift={frame * 1.2} color={LIGHT} opacity={0.07} />
      <Img
        src={staticFile('halftone/goose-idle-400-inv.png')}
        style={{
          position: 'absolute',
          left: 340,
          top: 112,
          width: 400,
          height: 400,
          transform: `translateY(${Math.round((1 - gooseIn) * 40)}px)`,
        }}
      />

      <BigTitle
        lines={[[{ t: '给它一段话', c: LIGHT }], [{ t: '它给你一张卡', k: 'serif', c: LIGHT }]]}
        top={560}
        align="center"
        size={96}
        start={10}
        ink={LIGHT}
      />

      <Underline left={260} top={794} width={566} progress={cardIn(frame, 96, 26)} height={3} />

      <Seal text="AI" progress={seal} left={806} top={812} size={150} color={ACCENT} ink={ACCENT} />

      <Sparkle left={862} top={430} progress={stampSpring(frame, 46)} scale={0.95} />
      <Sparkle left={210} top={806} progress={stampSpring(frame, 124)} scale={0.7} />
    </AbsoluteFill>
  )
}
