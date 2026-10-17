import React from 'react'
import { Composition } from 'remotion'
import { GooseAI } from './Video'
import { FPS, H, TOTAL, W } from './theme'
import { PixelVideo } from './pixel/PixelVideo'
import { TOTAL as PIXEL_TOTAL } from './pixel/theme'

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="GooseAI"
      component={GooseAI}
      durationInFrames={TOTAL}
      fps={FPS}
      width={W}
      height={H}
    />
    <Composition id="GooseAIPixel" component={PixelVideo} durationInFrames={PIXEL_TOTAL} fps={60} width={1080} height={1080} />
  </>
)
