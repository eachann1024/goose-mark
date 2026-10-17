import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { ACCENT, INK, M, SOFT } from '../theme'
import { BigTitle, Mono } from '../parts/Type'
import { Paper } from '../parts/ui'
import { CornerBrackets, DotField, HalftoneSwatch, Underline } from '../parts/deco'
import { cardIn, EASE_BG, EASE_CARD, stampSpring } from '../lib/anim'

const CARD = { left: M, top: 470, width: 888, height: 404 }

const URL = 'github.com/earendil-works/pi'

const SWEEP_START = 58
const SWEEP_DUR = 272
const SWEEP_TRAVEL = CARD.height - 16

export const S1: React.FC = () => {
  const frame = useCurrentFrame()

  const rise = EASE_CARD(Math.max(0, Math.min(1, frame / 30)))
  const scale = 0.92 + 0.08 * cardIn(frame, 0, 18)
  const ring = stampSpring(frame, 90)
  const pulse = frame > 236 ? Math.sin(Math.max(0, frame - 236) / 9) * Math.max(0, 1 - (frame - 236) / 40) : 0

  const sweepP = Math.max(0, Math.min(1, (frame - SWEEP_START) / SWEEP_DUR))
  const sweepOn = frame >= SWEEP_START && frame <= SWEEP_START + SWEEP_DUR
  const sweepY = CARD.top + 8 + EASE_BG(sweepP) * SWEEP_TRAVEL

  const urlStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-block',
    color: INK,
    fontWeight: 600,
  }

  const ringStyle: React.CSSProperties = {
    position: 'absolute',
    inset: -11,
    border: `2.5px solid ${ACCENT}`,
    borderRadius: 10,
    transform: `scale(${ring * (1 + pulse * 0.03)})`,
    opacity: Math.min(1, ring * 3),
    transformOrigin: '50% 50%',
  }

  return (
    <AbsoluteFill>
      <DotField drift={frame * 1.4} />
      <HalftoneSwatch left={892} top={126} progress={cardIn(frame, 24, 30)} />

      <BigTitle
        lines={[[{ t: '塞一段乱文' }], [{ t: '网址自己浮上来', k: 'serif' }]]}
        top={132}
        left={M}
        size={92}
        start={2}
      />
      <Underline left={M + 6} top={352} width={600} progress={cardIn(frame, 34, 26)} height={3} />

      <Paper
        style={{
          ...CARD,
          top: CARD.top + (1 - rise) * 150,
          transform: `scale(${scale})`,
          transformOrigin: '50% 50%',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 44,
            top: 40,
            width: CARD.width - 88,
            fontSize: 30,
            lineHeight: '54px',
            color: SOFT,
            letterSpacing: '0.01em',
          }}
        >
          上周翻到一个项目，看着还挺对味的，大概是在{' '}
          <span style={urlStyle}>
            {URL}
            {frame > 84 ? <span style={ringStyle} /> : null}
          </span>{' '}
          上面。README 写得挺克制，说是 colab 也能直接跑起来，配置就一份纯文本，改完就生效。同事说它的会话能存在本地，做到一半关了也能接上，模型还能自己换，听着像是能长期用的东西。顺手记一下，回头再细看。
        </div>

        {sweepOn ? (
          <>
            <div
              style={{
                position: 'absolute',
                left: 16,
                top: sweepY - CARD.top - 1,
                width: CARD.width - 32,
                height: 2,
                background: ACCENT,
                opacity: 0.34,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 16,
                top: sweepY - CARD.top - 6,
                width: 11,
                height: 11,
                borderRadius: 6,
                background: ACCENT,
              }}
            />
          </>
        ) : null}
      </Paper>

      <CornerBrackets
        left={CARD.left}
        top={CARD.top + (1 - rise) * 150}
        width={CARD.width}
        height={CARD.height}
        progress={cardIn(frame, 40, 34)}
      />

      <Mono top={926} center opacity={0.42 * cardIn(frame, 292, 20)}>
        约 150 字原文 · 1 个网址
      </Mono>

    </AbsoluteFill>
  )
}
