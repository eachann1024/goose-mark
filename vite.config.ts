import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import path from 'node:path'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  plugins: [
    vue(),
    UnoCSS(),
    AutoImport({
      imports: ['vue', 'pinia'],
      dts: 'src/auto-imports.d.ts'
    }),
    Components({
      dts: 'src/components.d.ts'
    })
  ]
})
