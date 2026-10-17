import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { ACCENT, INK, M, SOFT } from '../theme'
import { BigTitle, Mono } from '../parts/Type'
import { Paper } from '../parts/ui'
import { cardIn, EASE_CARD, stampSpring } from '../lib/anim'

const CARD = { left: M, top: 470, width: 888, height: 404 }

const URL = 'github.com/earendil-works/pi'

export const S1: React.FC = () => {
  const frame = useCurrentFrame()

  const rise = EASE_CARD(Math.max(0, Math.min(1, frame / 26)))
  const scale = 0.92 + 0.08 * cardIn(frame, 0, 18)
  const ring = stampSpring(frame, 152)

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
    transform: `scale(${ring})`,
    opacity: Math.min(1, ring * 3),
    transformOrigin: '50% 50%',
  }

  return (
    <AbsoluteFill>
      <BigTitle
        lines={[[{ t: '塞一段乱文' }], [{ t: '网址自己浮上来', k: 'serif' }]]}
        top={132}
        left={M}
        size={92}
        start={2}
      />

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
            {frame > 144 ? <span style={ringStyle} /> : null}
          </span>{' '}
          上面。README 写得挺克制，说是 colab 也能直接跑起来，配置就一份纯文本，改完就生效。同事说它的会话能存在本地，做到一半关了也能接上，模型还能自己换，听着像是能长期用的东西。顺手记一下，回头再细看。
        </div>
      </Paper>

      <Mono top={926} center opacity={0.4}>
        约 150 字原文 · 1 个网址
      </Mono>
    </AbsoluteFill>
  )
}
