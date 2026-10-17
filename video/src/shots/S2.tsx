import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { ACCENT, INK, M } from '../theme'
import { BigTitle, Mono } from '../parts/Type'
import { Rule } from '../parts/ui'
import { AccentRail, DotField, HalftoneSwatch, Sparkle, Underline } from '../parts/deco'
import { cardIn, stampSpring, textSpring } from '../lib/anim'

const ROWS = ['认得网址', '抓取网站', '译成中文', '归到分组']
const TOP = 470
const ROW_H = 120

export const S2: React.FC = () => {
  const frame = useCurrentFrame()

  return (
    <AbsoluteFill>
      <DotField drift={frame * 1.4} />
      <HalftoneSwatch left={892} top={126} progress={cardIn(frame, 20, 30)} />

      <BigTitle lines={[[{ t: '它先读懂' }], [{ t: '再替你动手', k: 'serif' }]]} top={132} left={M} size={92} start={2} />
      <Underline left={M + 6} top={352} width={470} progress={cardIn(frame, 30, 26)} height={3} />

      <AccentRail left={60} top={TOP} height={ROWS.length * ROW_H} progress={cardIn(frame, 44, 40)} />

      {ROWS.map((label, i) => {
        const p = cardIn(frame, 42 + i * 7, 18)
        const num = textSpring(frame, 46 + i * 7)
        return (
          <div
            key={label}
            style={{
              position: 'absolute',
              left: M,
              top: TOP + i * ROW_H,
              width: 888,
              height: ROW_H,
              transform: `translateX(${(1 - p) * 90}px) translateY(${(1 - p) * 12}px)`,
              opacity: Math.min(1, p * 1.4),
            }}
          >
            <Rule left={0} top={0} width={888} color={INK} opacity={0.18} />
            <Mono top={38} left={0} opacity={0.22 + 0.38 * num}>
              {String(i + 1).padStart(2, '0')}
            </Mono>
            <div
              style={{
                position: 'absolute',
                left: 100,
                top: 22,
                fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif',
                fontWeight: 700,
                fontSize: 46,
                letterSpacing: '-0.02em',
                color: INK,
                lineHeight: '64px',
              }}
            >
              {label}
            </div>
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 56,
                width: 108,
                height: 3,
                background: ACCENT,
                transform: `scaleX(${cardIn(frame, 52 + i * 7, 20)})`,
                transformOrigin: '100% 50%',
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: 116,
                top: 52,
                width: 11,
                height: 11,
                borderRadius: 6,
                background: ACCENT,
                transform: `scale(${Math.max(0, Math.min(1.1, cardIn(frame, 56 + i * 7, 14)))})`,
              }}
            />
          </div>
        )
      })}
      <Rule left={M} top={TOP + ROWS.length * ROW_H} width={888} color={INK} opacity={0.18} />

      <Sparkle left={64} top={TOP + ROWS.length * ROW_H} progress={stampSpring(frame, 150)} scale={0.62} />
    </AbsoluteFill>
  )
}
