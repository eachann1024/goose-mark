import pg from 'pg'

const { Pool } = pg

// 数据库连接池
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'GooseMarks',
  user: process.env.DB_USER || 'GooseMarks',
  password: process.env.DB_PASSWORD || '',
  max: 10, // 最大连接数
  idleTimeoutMillis: 30000
})

// 初始化数据库表
export async function initDatabase() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS shares (
        id VARCHAR(20) PRIMARY KEY,
        type VARCHAR(20) NOT NULL,
        source_id VARCHAR(100) NOT NULL,
        data JSONB NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_groups (
        id VARCHAR(20) PRIMARY KEY,
        owner_pwd VARCHAR(100),
        active BOOLEAN DEFAULT true,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_items (
        share_id VARCHAR(20) NOT NULL REFERENCES sync_groups(id) ON DELETE CASCADE,
        item_id VARCHAR(100) NOT NULL,
        item_type VARCHAR(20) NOT NULL,
        content JSONB,
        is_deleted BOOLEAN DEFAULT false,
        updated_at BIGINT NOT NULL,
        client_id VARCHAR(50),
        PRIMARY KEY (share_id, item_id)
      );

      CREATE INDEX IF NOT EXISTS idx_sync_items_pull ON sync_items (share_id, updated_at);
    `)
    console.log('✅ Database initialized')
  } finally {
    client.release()
  }
}

// 创建分享
export async function createShare(shareId, type, sourceId, data) {
  const now = Date.now()
  await pool.query(
    `INSERT INTO shares (id, type, source_id, data, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, true, $5, $6)`,
    [shareId, type, sourceId, JSON.stringify(data), now, now]
  )
  return { shareId, createdAt: now }
}

// 获取分享
export async function getShare(shareId) {
  const result = await pool.query(
    `SELECT id, type, source_id, data, active, created_at, updated_at
     FROM shares WHERE id = $1`,
    [shareId]
  )
  if (result.rows.length === 0) return null
  
  const row = result.rows[0]
  return {
    shareId: row.id,
    type: row.type,
    sourceId: row.source_id,
    data: row.data,
    active: row.active,
    createdAt: parseInt(row.created_at),
    updatedAt: parseInt(row.updated_at)
  }
}

// 更新分享数据
export async function updateShare(shareId, data) {
  const result = await pool.query(
    `UPDATE shares SET data = $1, updated_at = $2 WHERE id = $3 AND active = true`,
    [JSON.stringify(data), Date.now(), shareId]
  )
  return result.rowCount > 0
}

// 取消分享
export async function cancelShare(shareId) {
  const result = await pool.query(
    `UPDATE shares SET active = false, updated_at = $1 WHERE id = $2`,
    [Date.now(), shareId]
  )
  return result.rowCount > 0
}

// 轻量级检查分享更新（只返回 updatedAt 和 active）
export async function checkShareUpdate(shareId) {
  const result = await pool.query(
    `SELECT active, updated_at FROM shares WHERE id = $1`,
    [shareId]
  )
  if (result.rows.length === 0) return null
  
  const row = result.rows[0]
  return {
    active: row.active,
    updatedAt: parseInt(row.updated_at)
  }
}

export { pool }
