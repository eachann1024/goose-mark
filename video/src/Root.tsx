import React from 'react'
import { Composition } from 'remotion'
import { GooseAI } from './Video'
import { FPS, H, TOTAL, W } from './theme'

export const RemotionRoot: React.FC = () => (
  <Composition
    id="GooseAI"
    component={GooseAI}
    durationInFrames={TOTAL}
    fps={FPS}
    width={W}
    height={H}
  />
)
