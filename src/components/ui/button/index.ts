import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { Button } from "./Button"
export type { ButtonProps } from "./Button"

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "border-input bg-muted text-foreground shadow-sm hover:bg-muted/80",
        destructive:
          "border-red-200 bg-red-50 text-red-600 shadow-sm hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/12 dark:text-red-200 dark:hover:bg-red-500/18",
        outline:
          "border-input bg-muted/35 text-foreground shadow-sm hover:bg-muted/60",
        secondary:
          "border-input bg-muted/70 text-foreground shadow-sm hover:bg-muted",
        ghost: "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        "default": "h-9 px-4 py-2",
        "xs": "h-7 rounded px-2",
        "sm": "h-8 rounded-md px-3 text-xs",
        "lg": "h-10 rounded-md px-8",
        "icon": "h-9 w-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
