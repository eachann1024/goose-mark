import React from 'react'
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion'
import { ACCENT, INK, M, SOFT } from '../theme'
import { BigTitle } from '../parts/Type'
import { Check, Paper, Rule } from '../parts/ui'
import { cardIn, stampSpring } from '../lib/anim'

const CARD = { left: M, top: 442, width: 648, height: 480 }
const INNER = CARD.width - 72

/** 从左向右填充：真实内容被逐段揭开 */
const Fill: React.FC<{
  frame: number
  start: number
  width: number
  children: React.ReactNode
  placeholder: React.ReactNode
  style?: React.CSSProperties
  dur?: number
}> = ({ frame, start, width, children, placeholder, style, dur = 24 }) => {
  const p = cardIn(frame, start, dur)
  const live = frame >= start && frame <= start + dur + 4
  return (
    <div style={{ position: 'absolute', ...style }}>
      {p <= 0.02 ? placeholder : null}
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }}>{children}</div>
      {live ? (
        <div
          style={{
            position: 'absolute',
            left: p * width - 1,
            top: -4,
            width: 2.5,
            height: 34,
            background: ACCENT,
            opacity: 0.85,
          }}
        />
      ) : null}
    </div>
  )
}

const Bar: React.FC<{ w: number; h?: number }> = ({ w, h = 14 }) => (
  <div style={{ width: w, height: h, borderRadius: 4, background: INK, opacity: 0.09 }} />
)

const META = [
  { k: '图标', v: '64 × 64' },
  { k: '正文', v: '2,140 字' },
  { k: '描述', v: '148 字' },
]

export const S3: React.FC = () => {
  const frame = useCurrentFrame()
  const enter = cardIn(frame, 0, 18)
  const check = stampSpring(frame, 206)

  return (
    <AbsoluteFill>
      <BigTitle lines={[[{ t: '图标、正文、描述' }], [{ t: '一次装齐', k: 'serif' }]]} top={132} left={M} size={88} start={2} />

      <Paper style={{ ...CARD, transform: `scale(${0.92 + enter * 0.08})` }}>
        <Fill
          frame={frame}
          start={24}
          width={64}
          style={{ left: 36, top: 34, width: 64, height: 64 }}
          placeholder={<Bar w={64} h={64} />}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              border: `1.5px solid ${INK}`,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: '"Georgia",serif',
              fontStyle: 'italic',
              fontSize: 34,
              color: INK,
            }}
          >
            π
          </div>
        </Fill>

        <Fill
          frame={frame}
          start={62}
          width={INNER - 96}
          style={{ left: 120, top: 50, right: 36, height: 40 }}
          placeholder={<Bar w={320} h={26} />}
        >
          <div
            style={{
              fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif',
              fontWeight: 700,
              fontSize: 30,
              letterSpacing: '-0.02em',
              color: INK,
              whiteSpace: 'nowrap',
            }}
          >
            Pi：可扩展的编码代理
          </div>
        </Fill>

        <Fill
          frame={frame}
          start={104}
          width={INNER}
          style={{ left: 36, top: 138, right: 36, height: 76 }}
          dur={32}
          placeholder={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Bar w={520} />
              <Bar w={430} />
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif', fontSize: 23, lineHeight: '34px', color: SOFT, whiteSpace: 'nowrap' }}>
              开源自托管的编码代理，把模型、工具和会话
            </div>
            <div style={{ fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif', fontSize: 23, lineHeight: '34px', color: SOFT, whiteSpace: 'nowrap' }}>
              串成一条可配置的流水线，长任务也接得住。
            </div>
          </div>
        </Fill>

        <Rule left={36} top={244} width={INNER} color={INK} opacity={0.14} />

        {META.map((row, i) => {
          const p = cardIn(frame, 150 + i * 26, 16)
          return (
            <div
              key={row.k}
              style={{
                position: 'absolute',
                left: 36,
                top: 278 + i * 52,
                width: INNER,
                height: 34,
                opacity: Math.min(1, p * 1.6),
                transform: `translateY(${(1 - p) * 12}px)`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif',
                  fontSize: 22,
                  lineHeight: '34px',
                  color: INK,
                  opacity: 0.72,
                }}
              >
                {row.k}
              </div>
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  fontFamily: '"Menlo",monospace',
                  fontSize: 20,
                  letterSpacing: '0.06em',
                  lineHeight: '34px',
                  color: INK,
                  opacity: 0.42,
                }}
              >
                {row.v}
              </div>
            </div>
          )
        })}

        {frame > 198 ? <Check size={46} left={CARD.width - 82} top={244 - 23} progress={check} /> : null}
      </Paper>

      <Img
        src={staticFile('halftone/goose-cheer-220.png')}
        style={{
          position: 'absolute',
          left: 764,
          top: 572,
          width: 220,
          height: 220,
          transform: `translateY(${Math.round((1 - cardIn(frame, 28, 22)) * 42)}px)`,
        }}
      />
    </AbsoluteFill>
  )
}
