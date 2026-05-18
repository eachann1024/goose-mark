import { defineConfig, presetUno, presetIcons, presetAttributify } from 'unocss'

export default defineConfig({
  // 与 useDark 的 .dark class 保持一致，避免系统主题覆盖手动切换结果。
  dark: 'class',
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      collections: {
        ph: () => import('@iconify-json/ph').then(i => i.icons)
      }
    })
  ],
  theme: {
    fontFamily: {
      sans: '"DM Sans", system-ui, -apple-system, sans-serif'
    },
    colors: {
      bg: 'var(--bg)',
      fg: 'var(--fg)',
      muted: 'var(--muted)',
      accent: 'var(--accent)'
    }
  },
  shortcuts: {
    'card-base': 'rounded-[var(--radius-3xl)] border border-black/5 dark:border-white/8 bg-[var(--card)]/90 dark:bg-[var(--card)]/90 backdrop-blur shadow-sm hover:shadow-lg transition-all duration-200',
    'text-secondary': 'text-muted',
    'btn-ghost': 'px-3 py-2 rounded-[var(--radius-full)] hover:bg-white/60 dark:hover:bg-white/10 transition-colors'
  }
})
