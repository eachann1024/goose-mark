import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import fastifyRateLimit from '@fastify/rate-limit'
import { nanoid } from 'nanoid'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDatabase, createShare, getShare, updateShare, cancelShare, checkShareUpdate } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 兼容本地和容器环境的路径查找
const potentialDistPaths = [
  path.join(__dirname, '..', 'dist'), // 本地/默认
  path.join(__dirname, 'dist'),        // 容器内可能平级
  path.join(process.cwd(), 'dist'),    // 运行目录下
  path.join(process.cwd(), '..', 'dist'),
  '/app/dist',                         // Docker 常见挂载点
  '/app/server/dist'
]

const DIST_DIR = potentialDistPaths.find(p => fs.existsSync(p))

if (DIST_DIR) {
  console.log('>>> Found frontend dist at:', DIST_DIR)
} else {
  console.error('>>> CRITICAL: Frontend dist directory not found in any of these paths:', potentialDistPaths)
}

const fastify = Fastify({
  logger: true,
  bodyLimit: 5 * 1024 * 1024 // 5MB limit for JSON body
})

// Enable CORS
await fastify.register(cors, {
  origin: true
})

// Rate Limiting
await fastify.register(fastifyRateLimit, {
  global: true,
  max: 300,            // Global limit: 300 requests
  timeWindow: '1 minute', // per 1 minute
  errorResponseBuilder: (request, context) => {
    return { 
      error: 'Too Many Requests', 
      message: `You have exceeded the rate limit. Please try again in ${context.after}.` 
    }
  }
})

// Serve static files from frontend dist
if (DIST_DIR) {
  await fastify.register(fastifyStatic, {
    root: DIST_DIR,
    prefix: '/',
    wildcard: false // 禁用通配符以防干扰 API
  })
  
  // 处理分享路径下的资源请求 (如 /s/assets/... -> /assets/...)
  fastify.get('/s/assets/*', async (req, reply) => {
    const assetPath = req.params['*']
    return reply.sendFile(`assets/${assetPath}`)
  })
}

// API Routes

// 创建分享 (Strict rate limit: 10 per 5 minutes)
fastify.post('/api/share', {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '5 minutes'
    }
  }
}, async (request, reply) => {
  try {
    const { type, sourceId, data } = request.body
    
    // Basic validation
    if (!type || !sourceId || !data) {
      return reply.code(400).send({ error: 'Missing required fields: type, sourceId, data' })
    }
    if (!['subGroup', 'group', 'snapshot'].includes(type) && type !== 'snapshot') {
      // NOTE: allowing 'snapshot' type which is used in frontend but wasn't validated here before? 
      // The frontend sends type='subGroup' | 'group' | 'snapshot'. Previous code only checked subGroup/group.
      // Wait, let's double check if I should allow 'snapshot'. The implementation plan says "snapshot" is used.
      // ShareManagePanel uses 'subGroup'. SettingsPanel uses 'snapshot' (sourceId='full').
      // So I must allow 'snapshot'.
      
      // Let's stick to original list if possible so I don't break logic, but I see I need to support 'snapshot'.
      // Previous code: if (!['subGroup', 'group'].includes(type))
      // UseShare.ts uses 'snapshot'.
      // So I will expand this validation.
    }
    
    if (!['subGroup', 'group', 'snapshot'].includes(type)) {
       return reply.code(400).send({ error: 'Invalid type' })
    }

    const shareId = nanoid(10)
    const result = await createShare(shareId, type, sourceId, data)
    
    return { shareId: result.shareId }
  } catch (err) {
    request.log.error(err)
    return reply.code(500).send({ error: 'Internal Server Error' })
  }
})

// 轻量级检查分享更新（只返回 updatedAt 和 active）
fastify.get('/api/share/:id/check', async (request, reply) => {
  try {
    const { id } = request.params
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return reply.code(400).send({ error: 'Invalid ID' })
    }

    const checkData = await checkShareUpdate(id)
    
    if (!checkData) {
      return reply.code(404).send({ error: 'Not Found' })
    }
    
    if (!checkData.active) {
      return reply.code(410).send({ error: 'Share has been canceled', canceled: true })
    }
    
    return { updatedAt: checkData.updatedAt, active: checkData.active }
  } catch (err) {
    request.log.error(err)
    return reply.code(500).send({ error: 'Internal Server Error' })
  }
})

// 获取分享
fastify.get('/api/share/:id', async (request, reply) => {
  try {
    const { id } = request.params
    // Prevent directory traversal/SQL injection (though param query is safe)
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return reply.code(400).send({ error: 'Invalid ID' })
    }

    const shareData = await getShare(id)
    
    if (!shareData) {
      return reply.code(404).send({ error: 'Not Found' })
    }
    
    // 检查是否已取消分享
    if (!shareData.active) {
      return reply.code(410).send({ error: 'Share has been canceled', canceled: true })
    }
    
    return shareData
  } catch (err) {
    request.log.error(err)
    return reply.code(500).send({ error: 'Internal Server Error' })
  }
})

// 更新分享数据
fastify.put('/api/share/:id', async (request, reply) => {
  try {
    const { id } = request.params
    const { data } = request.body
    
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return reply.code(400).send({ error: 'Invalid ID' })
    }
    if (!data) {
      return reply.code(400).send({ error: 'Missing data field' })
    }

    const existing = await getShare(id)
    
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found' })
    }
    
    if (!existing.active) {
      return reply.code(410).send({ error: 'Share has been canceled' })
    }
    
    await updateShare(id, data)
    
    return { success: true, updatedAt: Date.now() }
  } catch (err) {
    request.log.error(err)
    return reply.code(500).send({ error: 'Internal Server Error' })
  }
})

// 取消分享
fastify.delete('/api/share/:id', async (request, reply) => {
  try {
    const { id } = request.params
    
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return reply.code(400).send({ error: 'Invalid ID' })
    }

    const existing = await getShare(id)
    
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found' })
    }
    
    await cancelShare(id)
    
    return { success: true }
  } catch (err) {
    request.log.error(err)
    return reply.code(500).send({ error: 'Internal Server Error' })
  }
})

// 分享页面路由 - 返回 index.html 让前端处理
fastify.get('/s/:shareId', async (req, reply) => {
  if (DIST_DIR && fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    return reply.sendFile('index.html')
  }
  return reply.code(404).send({ error: 'Not Found' })
})

// Fallback for SPA routing
fastify.setNotFoundHandler((req, reply) => {
  if (req.raw.url.startsWith('/api')) {
    return reply.code(404).send({ error: 'API Not Found' })
  }
  if (DIST_DIR && fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    return reply.sendFile('index.html')
  }
  return reply.code(404).send({ error: 'Not Found' })
})

// Start server
const start = async () => {
  try {
    // Initialize Database
    await initDatabase()
    
    const port = process.env.PORT || 3001
    await fastify.listen({ port, host: '0.0.0.0' })
    console.log(`Server listening on port ${port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
