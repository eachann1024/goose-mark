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
      imports: [
        'vue',
        'pinia',
        '@vueuse/core'
      ],
      dirs: [
        'src/composables',
        'src/stores',
        'src/lib',
        'src/services',
        'src/types'
      ],
      dts: 'src/auto-imports.d.ts'
    }),
    Components({
      dirs: ['src/components', 'src/views'],
      deep: true,
      dts: 'src/components.d.ts'
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    // 禁用 modulePreload 避免 uTools 环境中的警告
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue', 'pinia'],
          'vendor-ui': ['reka-ui', '@vueuse/core'],
          'vendor-icons': ['lucide-vue-next']
        }
      }
    },
    chunkSizeWarningLimit: 600
  }
})
