import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import UnoCSS from '@unocss/vite'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { debugSourcemap, debugMinify } from './vite.debug'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  base: './',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  plugins: [
    UnoCSS(),
    react()
  ],
  server: {
    port: 7001,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    // uTools 7.8.0 内核为 Chromium 108；显式锁定 JS/CSS 转译目标，避免 Vite 8 默认 Chrome 111 产物。
    target: 'chrome108',
    cssTarget: 'chrome108',
    // 禁用 modulePreload 避免 uTools 环境中的警告
    modulePreload: false,
    // sourcemap / minify 策略由 vite.debug 决定（GOOSE_DEBUG=1 调试构建带 map 且不压缩；
    // 正式构建走 'hidden'+scripts/utools-build 删除 map）。
    sourcemap: debugSourcemap,
    minify: debugMinify,
    rolldownOptions: {
      output: {
        // Vite 8 底层为 rolldown：manualChunks 静默失效，必须用 codeSplitting.groups。
        // 用正则 test + 降序 priority（高者先匹配，命中后该模块从其余组移除）；
        // 路径分隔符用 [\\/] 兼容 Windows（rolldown 官方建议，见 memory）。
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 50,
              minSize: 0
            },
            {
              // HeroUI v3 及其底层 react-aria / react-stately 全家桶。
              name: 'vendor-heroui',
              test: /[\\/]node_modules[\\/](@heroui[\\/]|@react-aria[\\/]|@react-stately[\\/]|@react-types[\\/]|react-aria|react-stately|tailwind-variants[\\/])/,
              priority: 40,
              minSize: 0
            },
            {
              // 公共依赖优先归组，避免某个供应商递归捕获它们并让其他协议一起加载。
              name: 'vendor-ai-validation',
              test: /[\\/]node_modules[\\/](zod[\\/]|@standard-schema[\\/])/,
              priority: 39,
              minSize: 0
            },
            {
              name: 'vendor-ai-shared',
              test: /[\\/]node_modules[\\/]@ai-sdk[\\/](provider|provider-utils)[\\/]/,
              priority: 38,
              minSize: 0
            },
            {
              // 运行时仍由 import('ai') 按需加载；内置 gateway 与遥测属于其依赖。
              name: 'vendor-ai-sdk',
              test: /[\\/]node_modules[\\/](ai[\\/]|@ai-sdk[\\/]gateway[\\/]|@opentelemetry[\\/])/,
              priority: 37,
              minSize: 0
            },
            {
              // 保留 execution.ts 的协议动态边界，只有选中的供应商会被拉取。
              name: 'vendor-ai-openai',
              test: /[\\/]node_modules[\\/]@ai-sdk[\\/]openai[\\/]/,
              priority: 35,
              minSize: 0
            },
            {
              name: 'vendor-ai-openai-compatible',
              test: /[\\/]node_modules[\\/]@ai-sdk[\\/]openai-compatible[\\/]/,
              priority: 35,
              minSize: 0
            },
            {
              name: 'vendor-ai-anthropic',
              test: /[\\/]node_modules[\\/]@ai-sdk[\\/]anthropic[\\/]/,
              priority: 35,
              minSize: 0
            },
            {
              name: 'vendor-icons',
              test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
              priority: 30,
              minSize: 0
            },
            {
              name: 'vendor-state',
              test: /[\\/]node_modules[\\/]zustand[\\/]/,
              priority: 25,
              minSize: 0
            },
            {
              // 兜底：其余第三方依赖统一进 vendor，便于长期缓存且避免散碎 chunk。
              name: 'vendor',
              test: /[\\/]node_modules[\\/]/,
              priority: 10,
              minSize: 0
            }
          ]
        }
      }
    },
    chunkSizeWarningLimit: 600
  }
})
