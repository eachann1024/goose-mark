import type { ReactNode } from 'react'
import {
  RadioGroup as AriaRadioGroup,
  Radio as AriaRadio,
} from 'react-aria-components'
import { cn } from '@/lib/utils'

/**
 * RadioGroup / RadioGroupItem —— reka-ui → react-aria-components 等价重写。
 * --------------------------------------------------------------------------
 * Vue 契约：RadioGroup v-model(string) + RadioGroupItem value="..."。
 * React 等价：RadioGroup value / onValueChange；RadioGroupItem value。
 * 选中态选择器 data-[selected]（react-aria），指示点在选中时显隐。
 */
export interface RadioGroupProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  name?: string
  orientation?: 'horizontal' | 'vertical'
  className?: string
  children?: ReactNode
  'aria-label'?: string
  'aria-labelledby'?: string
}

export function RadioGroup({
  value,
  defaultValue,
  onValueChange,
  disabled,
  className,
  children,
  ...rest
}: RadioGroupProps) {
  return (
    <AriaRadioGroup
      value={value}
      defaultValue={defaultValue}
      onChange={onValueChange}
      isDisabled={disabled}
      className={cn('grid gap-2', className)}
      {...rest}
    >
      {children}
    </AriaRadioGroup>
  )
}

export interface RadioGroupItemProps {
  value: string
  disabled?: boolean
  className?: string
  id?: string
  children?: ReactNode
  'aria-label'?: string
}

export function RadioGroupItem({
  value,
  disabled,
  className,
  children,
  ...rest
}: RadioGroupItemProps) {
  return (
    <AriaRadio
      value={value}
      isDisabled={disabled}
      className={cn(
        'group peer aspect-square h-4 w-4 shrink-0 cursor-pointer rounded-full border border-input bg-background text-foreground shadow-sm outline-none transition-colors',
        'grid place-content-center',
        'focus-visible:ring-1 focus-visible:ring-ring',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        'data-[selected]:border-foreground data-[selected]:bg-foreground data-[selected]:text-background',
        className,
      )}
      {...rest}
    >
      {children ?? (
        <span className="block h-1.5 w-1.5 rounded-full bg-current opacity-0 group-data-[selected]:opacity-100" />
      )}
    </AriaRadio>
  )
}
