import React from 'react'
import { AbsoluteFill, Audio, Easing, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { H, SHOTS, TOTAL, W } from './theme'
import { S1 } from './shots/S1'
import { S2 } from './shots/S2'
import { S3 } from './shots/S3'
import { S4 } from './shots/S4'
import { S5 } from './shots/S5'
import { S6 } from './shots/S6'
import { S7 } from './shots/S7'
import { S8 } from './shots/S8'

const COMPONENTS = [S1, S2, S3, S4, S5, S6, S7, S8]
const HARD_CUT = new Set([6, 7])
const EASE_BG = Easing.bezier(0.65, 0, 0.35, 1)

/** 底色层：12 帧交叉淡化；黑场与品牌卡用硬切 */
const SceneBg: React.FC = () => {
  const frame = useCurrentFrame()
  const idx = Math.max(0, SHOTS.findIndex((s) => frame >= s.from && frame < s.from + s.len))
  const shot = SHOTS[idx]
  const local = frame - shot.from
  const prev = idx > 0 ? SHOTS[idx - 1] : null
  const fading = prev && !HARD_CUT.has(idx) && local < 12
  const overlay = fading ? 1 - EASE_BG(local / 12) : 0

  return (
    <AbsoluteFill style={{ background: shot.bg }}>
      {prev && overlay > 0 ? (
        <AbsoluteFill style={{ background: prev.bg, opacity: overlay }} />
      ) : null}
    </AbsoluteFill>
  )
}

export const GooseAI: React.FC = () => {
  return (
    <AbsoluteFill style={{ width: W, height: H, background: SHOTS[0].bg }}>
      <SceneBg />
      {SHOTS.map((s, i) => {
        const C = COMPONENTS[i]
        return (
          <Sequence key={s.id} from={s.from} durationInFrames={s.len} name={`0${i + 1}`}>
            <AbsoluteFill>
              <C />
            </AbsoluteFill>
          </Sequence>
        )
      })}
      <Sequence durationInFrames={TOTAL}>
        <Audio src={staticFile('audio/bed.wav')} />
      </Sequence>
    </AbsoluteFill>
  )
}
