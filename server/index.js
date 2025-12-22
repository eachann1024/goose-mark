import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { nanoid } from 'nanoid'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDatabase, createShare, getShare, updateShare, cancelShare } from './db.js'

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
  logger: true
})

// Enable CORS
await fastify.register(cors, {
  origin: true
})

// Serve static files from frontend dist
if (DIST_DIR) {
  await fastify.register(fastifyStatic, {
    root: DIST_DIR,
    prefix: '/',
    wildcard: false // 禁用通配符以防干扰 API
  })
}

// API Routes

// 创建分享
fastify.post('/api/share', async (request, reply) => {
  try {
    const { type, sourceId, data } = request.body
    
    // Basic validation
    if (!type || !sourceId || !data) {
      return reply.code(400).send({ error: 'Missing required fields: type, sourceId, data' })
    }
    if (!['subGroup', 'group'].includes(type)) {
      return reply.code(400).send({ error: 'Invalid type, must be "subGroup" or "group"' })
    }

    const shareId = nanoid(10)
    const result = await createShare(shareId, type, sourceId, data)
    
    return { shareId: result.shareId }
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

// Fallback for SPA routing
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
