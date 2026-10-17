import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { INK, M, SOFT } from '../theme'
import { BigTitle, Mono } from '../parts/Type'
import { Check, Paper, Rule } from '../parts/ui'
import { cardIn, stampSpring } from '../lib/anim'

const CARD = { left: M, top: 442, width: 888, height: 480 }
const INNER = CARD.width - 72

const LONG_TITLE = ['一个可扩展、可自托管、面向长任务的编码代理，', '把模型、工具与会话串成一条可配置的流水线，', '既能本地跑，也能接进自己的流程里。']
const SHORT_TITLE = '可自托管的编码代理框架'

const LONG_DESC = [
  '它把模型、工具与会话串成一条流水线：你只描述任务，剩下的规划、读文件、',
  '调用工具、整理结果都由它自己推进。会话记录都落在本地磁盘，做到一半停下',
  '去开会，回来还能接着往下走；换台机器、换一个网络也能续上。配置是纯文本，',
  '端点、工具清单、工作目录都在里面，改完就生效，不用重启，也不用重新登录。',
  '它还允许把流水线拆开单跑：只做规划、只读文件、只跑工具，方便接已有流程。',
]
const SHORT_DESC = [
  '把模型、工具和会话串成一条可配置的流水线：描述任务即可',
  '自动规划、读文件、调工具并整理结果；会话记录落在本地，',
  '随时中断随时续上，配置是纯文本，改完即生效。',
]

const Line: React.FC<{
  text: string
  frame: number
  at: number
  lh: number
  style: React.CSSProperties
  collapse: boolean
}> = ({ text, frame, at, lh, style, collapse }) => {
  const p = collapse ? cardIn(frame, at, 14) : 0
  return (
    <div
      style={{
        ...style,
        height: lh * (1 - p),
        opacity: 1 - p,
        overflow: 'hidden',
        lineHeight: `${lh}px`,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  )
}

export const S5: React.FC = () => {
  const frame = useCurrentFrame()
  const enter = cardIn(frame, 0, 18)
  const swap = cardIn(frame, 92, 18)
  const check = stampSpring(frame, 168)

  return (
    <AbsoluteFill>
      <BigTitle lines={[[{ t: '标题不超 20 字' }], [{ t: '描述不超 150 字', k: 'serif' }]]} top={132} left={M} size={88} start={2} />

      <Paper style={{ ...CARD, transform: `scale(${0.92 + enter * 0.08})` }}>
        <Mono top={44} left={CARD.width - 138} opacity={0.36} size={22}>
          ≤ 20
        </Mono>
        <div style={{ position: 'absolute', left: 40, top: 40, width: INNER - 130 }}>
          <div style={{ opacity: 1 - swap }}>
            {LONG_TITLE.map((t, i) => (
              <Line
                key={i}
                text={t}
                frame={frame}
                at={40 + i * 8}
                lh={46}
                collapse={i > 0}
                style={{ fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif', fontWeight: 500, fontSize: 28, color: SOFT }}
              />
            ))}
          </div>
          <div style={{ position: 'absolute', left: 0, top: 0, opacity: swap, transform: `translateY(${(1 - swap) * 10}px)` }}>
            <div
              style={{
                fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif',
                fontWeight: 700,
                fontSize: 36,
                letterSpacing: '-0.02em',
                color: INK,
                lineHeight: '46px',
                whiteSpace: 'nowrap',
              }}
            >
              {SHORT_TITLE}
            </div>
          </div>
        </div>

        <Rule left={36} top={206} width={INNER} color={INK} opacity={0.14} />

        <Mono top={242} left={CARD.width - 158} opacity={0.36} size={22}>
          ≤ 150
        </Mono>
        <div style={{ position: 'absolute', left: 40, top: 236, width: INNER - 150 }}>
          <div style={{ opacity: 1 - swap }}>
            {LONG_DESC.map((t, i) => (
              <Line
                key={i}
                text={t}
                frame={frame}
                at={110 + i * 8}
                lh={32}
                collapse={i > 2}
                style={{ fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif', fontSize: 18, color: SOFT }}
              />
            ))}
          </div>
          <div style={{ position: 'absolute', left: 0, top: 0, opacity: swap, transform: `translateY(${(1 - swap) * 10}px)` }}>
            {SHORT_DESC.map((t, i) => (
              <div
                key={i}
                style={{
                  fontFamily: '"PingFang SC","Hiragino Sans GB",sans-serif',
                  fontSize: 24,
                  lineHeight: '40px',
                  color: INK,
                  whiteSpace: 'nowrap',
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>

        <Rule left={36} top={392} width={INNER} color={INK} opacity={0.14} />

        <div style={{ position: 'absolute', left: 40, top: 408, width: INNER }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              fontFamily: '"Menlo",monospace',
              fontSize: 20,
              letterSpacing: '0.08em',
              color: INK,
              opacity: 0.42,
              lineHeight: '36px',
            }}
          >
            原文 1,240 字 → 摘要 96 字
          </div>
        </div>

        {frame > 160 ? <Check size={44} left={CARD.width - 80} top={400} progress={check} /> : null}
      </Paper>
    </AbsoluteFill>
  )
}
