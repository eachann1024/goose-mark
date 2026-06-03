import {
  Slider as AriaSlider,
  SliderThumb,
  SliderTrack,
} from 'react-aria-components'
import { cn } from '@/lib/utils'

/**
 * Slider —— reka-ui → react-aria-components 等价重写。
 * --------------------------------------------------------------------------
 * Vue 契约：modelValue 为数组（每项一个 thumb）+ min/max/step/orientation。
 * React 等价：value / onValueChange，接受 number | number[]（单/多滑块自适应）。
 * 视觉 token 与尺寸沿用旧版：轨道 bg-muted、填充 bg-foreground/45。
 */
export interface SliderProps {
  value?: number | number[]
  defaultValue?: number | number[]
  onValueChange?: (value: number | number[]) => void
  /** 拖拽结束时回调（react-aria onChangeEnd） */
  onValueChangeEnd?: (value: number | number[]) => void
  min?: number
  max?: number
  step?: number
  orientation?: 'horizontal' | 'vertical'
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function Slider({
  value,
  defaultValue,
  onValueChange,
  onValueChangeEnd,
  min = 0,
  max = 100,
  step = 1,
  orientation = 'horizontal',
  disabled,
  className,
  ...rest
}: SliderProps) {
  // 计算 thumb 数量：受控/非受控值若为数组则多滑块，否则单滑块。
  const probe = value ?? defaultValue
  const thumbCount = Array.isArray(probe) ? probe.length : 1

  return (
    <AriaSlider
      value={value}
      defaultValue={defaultValue}
      onChange={onValueChange}
      onChangeEnd={onValueChangeEnd}
      minValue={min}
      maxValue={max}
      step={step}
      orientation={orientation}
      isDisabled={disabled}
      className={cn(
        'relative flex w-full touch-none select-none items-center',
        'data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5 data-[orientation=vertical]:flex-col',
        className,
      )}
      {...rest}
    >
      <SliderTrack className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted data-[orientation=vertical]:w-1.5">
        {({ state }) => {
          // 单滑块：填充 0 → thumb；多滑块：填充首尾两个 thumb 之间。
          const start = thumbCount > 1 ? state.getThumbPercent(0) * 100 : 0
          const end =
            thumbCount > 1
              ? state.getThumbPercent(thumbCount - 1) * 100
              : state.getThumbPercent(0) * 100
          const fillStyle =
            orientation === 'vertical'
              ? { bottom: `${start}%`, height: `${end - start}%`, width: '100%' }
              : { left: `${start}%`, width: `${end - start}%`, height: '100%' }
          return (
            <>
              <div className="absolute bg-foreground/45" style={fillStyle} />
              {Array.from({ length: thumbCount }, (_, i) => (
                <SliderThumb
                  key={i}
                  index={i}
                  className="block h-4 w-4 rounded-full border border-input bg-background shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                />
              ))}
            </>
          )
        }}
      </SliderTrack>
    </AriaSlider>
  )
}
