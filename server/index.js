import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { nanoid } from 'nanoid'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
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

// Ensure data directory exists
fs.ensureDirSync(DATA_DIR)

const fastify = Fastify({
  logger: true
})

// Enable CORS
await fastify.register(cors, {
  origin: true
})

// Serve static files from frontend dist
// Note: We expect the frontend to be built into ../dist
if (fs.existsSync(DIST_DIR)) {
  await fastify.register(fastifyStatic, {
    root: DIST_DIR,
    prefix: '/'
  })
} else {
  console.warn('Frontend dist directory not found. Static serving disabled.')
}

// API Routes
fastify.post('/api/share', async (request, reply) => {
  try {
    const data = request.body
    
    // Basic validation
    if (!data || typeof data !== 'object') {
      return reply.code(400).send({ error: 'Invalid data' })
    }

    const id = nanoid(10)
    const filePath = path.join(DATA_DIR, `${id}.json`)
    
    await fs.writeJson(filePath, data)
    
    return { id }
  } catch (err) {
    request.log.error(err)
    return reply.code(500).send({ error: 'Internal Server Error' })
  }
})

fastify.get('/api/share/:id', async (request, reply) => {
  try {
    const { id } = request.params
    // Prevent directory traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        return reply.code(400).send({ error: 'Invalid ID' })
    }

    const filePath = path.join(DATA_DIR, `${id}.json`)
    
    if (!await fs.pathExists(filePath)) {
      return reply.code(404).send({ error: 'Not Found' })
    }
    
    const data = await fs.readJson(filePath)
    return data
  } catch (err) {
    request.log.error(err)
    return reply.code(500).send({ error: 'Internal Server Error' })
  }
})

// Fallback for SPA routing if serving static files
if (fs.existsSync(DIST_DIR)) {
  fastify.setNotFoundHandler((req, reply) => {
    if (req.raw.url.startsWith('/api')) {
       return reply.code(404).send({ error: 'API Not Found' })
    }
    return reply.sendFile('index.html')
  })
}

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3001
    await fastify.listen({ port, host: '0.0.0.0' })
    console.log(`Server listening on port ${port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
