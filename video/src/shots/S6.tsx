import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { ACCENT, INK, M, PAPER, SOFT } from '../theme'
import { BigTitle } from '../parts/Type'
import { Check, Paper, Toggle } from '../parts/ui'
import { cardIn, EASE_FALL, stampSpring } from '../lib/anim'

const COL_W = 280
const COL_GAP = 16
const COLS = [
  { name: '设计', subs: ['灵感', '配色'] },
  { name: '开发', subs: ['工具', '配置'] },
  { name: '阅读', subs: ['稍后读', '长文'] },
]
const COL_TOP = 470
const SUB_H = 108
const SUB_GAP = 20
const SUB_TOP0 = COL_TOP + 54
const TARGET = { col: 1, sub: 0 }

const colLeft = (i: number) => M + i * (COL_W + COL_GAP)
const subTop = (i: number) => SUB_TOP0 + i * (SUB_H + SUB_GAP)

export const S6: React.FC = () => {
  const frame = useCurrentFrame()
  const fall = frame >= 54 ? EASE_FALL(Math.max(0, Math.min(1, (frame - 54) / 26))) : 0
  const settled = frame >= 80
  const squash = settled ? Math.max(0, 1 - (frame - 80) / 10) : 0
  const check = stampSpring(frame, 98)

  const tx = colLeft(TARGET.col)
  const ty = subTop(TARGET.sub)
  const slotTop = ty + 46
  const fromY = slotTop - 234

  const configRows = ['允许新建主分组', '允许新建子分组']

  return (
    <AbsoluteFill>
      <BigTitle lines={[[{ t: '位置不对' }], [{ t: '就自己新建', k: 'serif' }]]} top={132} left={M} size={86} start={2} />

      {COLS.map((col, ci) => (
        <div key={col.name} style={{ position: 'absolute', left: colLeft(ci), top: COL_TOP, width: COL_W }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif',
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: '-0.01em',
              color: INK,
              opacity: ci === TARGET.col ? 1 : 0.4,
              lineHeight: '38px',
            }}
          >
            {col.name}
          </div>
          {col.subs.map((sub, si) => {
            const isTarget = ci === TARGET.col && si === TARGET.sub
            const lit = isTarget && settled
            return (
              <Paper
                key={sub}
                style={{
                  left: 0,
                  top: 54 + si * (SUB_H + SUB_GAP),
                  width: COL_W,
                  height: SUB_H,
                  border: lit ? ACCENT : 'rgba(22,21,18,0.13)',
                  borderWidth: lit ? 1.5 : 1,
                  background: isTarget ? PAPER : 'rgba(255,255,255,0.6)',
                }}
                radius={16}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 16,
                    top: 12,
                    fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif',
                    fontSize: 22,
                    lineHeight: '28px',
                    color: isTarget ? INK : SOFT,
                    opacity: isTarget ? 1 : 0.66,
                  }}
                >
                  {sub}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    right: 16,
                    top: 14,
                    fontFamily: '"Menlo",monospace',
                    fontSize: 18,
                    letterSpacing: '0.08em',
                    color: INK,
                    opacity: 0.32,
                  }}
                >
                  {isTarget ? (settled ? '2' : '1') : '·'}
                </div>
              </Paper>
            )
          })}
        </div>
      ))}

      <div
        style={{
          position: 'absolute',
          left: tx + 12,
          top: slotTop + (1 - fall) * (fromY - slotTop),
          width: COL_W - 24,
          height: 52,
          opacity: cardIn(frame, 44, 10),
          transform: `scaleY(${1 - squash * 0.07}) scaleX(${1 + squash * 0.02})`,
          transformOrigin: '50% 100%',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 10,
            background: PAPER,
            border: `1.5px solid ${INK}`,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            paddingLeft: 12,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              border: `1.5px solid ${INK}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: '"Georgia",serif',
              fontStyle: 'italic',
              fontSize: 16,
              color: INK,
              flexShrink: 0,
            }}
          >
            π
          </div>
          <div
            style={{
              fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif',
              fontWeight: 600,
              fontSize: 17,
              color: INK,
              whiteSpace: 'nowrap',
            }}
          >
            Pi 编码代理
          </div>
        </div>
      </div>

      {frame > 88 ? <Check size={40} left={tx + COL_W - 42} top={COL_TOP - 2} progress={check} /> : null}

      <Paper
        style={{
          left: M,
          top: 806,
          width: 888,
          height: 132,
          opacity: cardIn(frame, 22, 16),
          transform: `translateY(${(1 - cardIn(frame, 22, 18)) * 24}px)`,
        }}
        radius={18}
      >
        {configRows.map((row, i) => (
          <React.Fragment key={row}>
            <div
              style={{
                position: 'absolute',
                left: 24,
                top: 22 + i * 52,
                fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif',
                fontWeight: 500,
                fontSize: 24,
                lineHeight: '40px',
                color: INK,
                opacity: 0.78,
              }}
            >
              {row}
            </div>
            <Toggle on left={888 - 24 - 74} top={21 + i * 52} />
          </React.Fragment>
        ))}
      </Paper>
    </AbsoluteFill>
  )
}
