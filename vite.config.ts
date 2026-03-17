import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import path from 'node:path'

const packageGroupMatcher = (packages: string[]) => {
  const packagePatterns = packages.map((name) => new RegExp(`/${name.replace('/', '\\/')}/`))

  return (moduleId: string) => moduleId.includes('/node_modules/') && packagePatterns.some((pattern) => pattern.test(moduleId))
}

export default defineConfig({
  base: './',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  plugins: [
    vue(),
    UnoCSS(),
    codeInspectorPlugin({
      bundler: 'vite'
    }),
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
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-vue',
              test: packageGroupMatcher(['vue', 'pinia']),
              minSize: 0
            },
            {
              name: 'vendor-ui',
              test: packageGroupMatcher(['reka-ui', '@vueuse/core']),
              minSize: 0
            },
            {
              name: 'vendor-icons',
              test: packageGroupMatcher(['lucide-vue-next']),
              minSize: 0
            }
          ]
        }
      }
    },
    chunkSizeWarningLimit: 600
  }
})
