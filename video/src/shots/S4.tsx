import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { ACCENT, INK, M, SOFT } from '../theme'
import { BigTitle } from '../parts/Type'
import { Paper } from '../parts/ui'
import { cardIn, stampSpring } from '../lib/anim'
import { CornerBrackets, DotField, HalftoneSwatch, Sparkle } from '../parts/deco'

const WIN = { left: M, top: 442, width: 888, height: 508 }
const PAD = 44

const EN = [
  'Pi is a small, self-hostable coding agent.',
  'You describe a task; it plans the steps,',
  'reads your files, runs the tools you give it,',
  'and reports back in plain language.',
  'It keeps every session on disk, so you can',
  'stop halfway and pick the thread up later,',
  'on the same machine or on a different one.',
]

const ZH = [
  '一个小巧、可自托管的编码代理。你说要做什么，',
  '它会规划步骤、读取本地文件、调用你给的工具，',
  '再用大白话把结果说清楚。所有会话都落在磁盘上，',
  '做到一半停下也没关系，回头能接着往下走，',
  '换台机器也一样。',
]

const L = 38
const MAX_SCROLL = 132
const SPEED = 0.55

export const S4: React.FC = () => {
  const frame = useCurrentFrame()
  const enter = cardIn(frame, 0, 18)
  const scroll = Math.min(MAX_SCROLL, Math.max(0, (frame - 18) * SPEED))

  return (
    <AbsoluteFill>
      <DotField drift={frame * 1.4} />
      <HalftoneSwatch left={892} top={126} progress={cardIn(frame, 20, 30)} />
      <BigTitle
        lines={[[{ t: '原文是英文' }], [{ t: '读的是中文', k: 'serif' }]]}
        top={132}
        left={M}
        size={88}
        start={2}
      />

      <Paper style={{ ...WIN, overflow: 'hidden', transform: `scale(${0.92 + enter * 0.08})` }}>

        <div style={{ position: 'absolute', left: PAD, top: -scroll, width: WIN.width - PAD * 2 }}>
          <div
            style={{
              fontFamily: '"Menlo",monospace',
              fontSize: 20,
              letterSpacing: '0.14em',
              color: INK,
              opacity: 0.45,
              marginBottom: 18,
            }}
          >
            EN
          </div>
          {EN.map((t, i) => (
            <div
              key={i}
              style={{
                fontFamily: '"Georgia",serif',
                fontSize: 27,
                lineHeight: `${L}px`,
                color: SOFT,
                whiteSpace: 'nowrap',
              }}
            >
              {t}
            </div>
          ))}

          <div
            style={{
              height: 2,
              width: 120,
              background: ACCENT,
              margin: '38px 0 30px',
              transform: `scaleX(${cardIn(frame, 26, 20)})`,
              transformOrigin: '0% 50%',
            }}
          />

          <div
            style={{
              fontFamily: '"Menlo",monospace',
              fontSize: 20,
              letterSpacing: '0.14em',
              color: ACCENT,
              opacity: 0.9,
              marginBottom: 18,
            }}
          >
            ZH
          </div>
          {ZH.map((t, i) => (
            <div
              key={i}
              style={{
                fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif',
                fontWeight: 500,
                fontSize: 28,
                lineHeight: '42px',
                color: INK,
                whiteSpace: 'nowrap',
              }}
            >
              {t}
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: 3,
            height: WIN.height,
            background: INK,
            opacity: 0.07,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: (scroll / MAX_SCROLL) * (WIN.height - 120),
            width: 3,
            height: 120,
            background: ACCENT,
            opacity: 0.55,
            zIndex: 3,
          }}
        />
        <div style={{ position: 'absolute', left: 0, top: 0, width: WIN.width, height: 20, background: '#FFFFFF', zIndex: 2 }} />
        <div style={{ position: 'absolute', left: 0, top: WIN.height - 20, width: WIN.width, height: 20, background: '#FFFFFF', zIndex: 2 }} />
      </Paper>

      <CornerBrackets left={WIN.left} top={WIN.top} width={WIN.width} height={WIN.height} progress={cardIn(frame, 14, 34)} />
      <Sparkle
        left={WIN.left + 96}
        top={WIN.top + 190}
        progress={stampSpring(frame, 74)}
        scale={0.5}
        fade={1 - cardIn(frame, 130, 22)}
      />
    </AbsoluteFill>
  )
}
