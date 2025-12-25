import { pool } from './db.js'

// --- Items Operations ---

/**
 * 批量推送变更 (Transactional Upsert)
 * @param {string} shareId
 * @param {Array} items - [{ itemId, itemType, content, isDeleted, updatedAt, clientId }]
 */
export async function pushItems(shareId, items) {
  if (!items || items.length === 0) return { success: true, processed: 0 }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. 验证 SyncGroup 是否存在
    const groupRes = await client.query('SELECT id FROM sync_groups WHERE id = $1', [shareId])
    if (groupRes.rowCount === 0) {
      // 自动创建 SyncGroup (如果不存在)
      // 在实际生产中可能需要显式创建接口，这里简化为惰性创建
      const now = Date.now()
      await client.query(
        'INSERT INTO sync_groups (id, created_at, updated_at) VALUES ($1, $2, $3)',
        [shareId, now, now]
      )
    }

    let processedCount = 0

    for (const item of items) {
      // LWW Check: 只有当 incoming.updatedAt > current.updatedAt 时才写入
      // 为了效率，可以在 SQL 中直接做，或者先查后写。这里用 UPSERT + WHERE 条件
      
      const query = `
        INSERT INTO sync_items (share_id, item_id, item_type, content, is_deleted, updated_at, client_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (share_id, item_id) 
        DO UPDATE SET
          content = EXCLUDED.content,
          is_deleted = EXCLUDED.is_deleted,
          updated_at = EXCLUDED.updated_at,
          client_id = EXCLUDED.client_id
        WHERE EXCLUDED.updated_at > sync_items.updated_at
      `
      
      const res = await client.query(query, [
        shareId,
        item.itemId,
        item.itemType,
        JSON.stringify(item.content),
        item.isDeleted || false,
        item.updatedAt,
        item.clientId || 'unknown'
      ])
      
      processedCount += res.rowCount // rowCount=1 experienced update/insert, 0 means ignored (old version)
    }

    // 更新 Group 的最后活跃时间
    await client.query('UPDATE sync_groups SET updated_at = $1 WHERE id = $2', [Date.now(), shareId])

    await client.query('COMMIT')
    return { success: true, processed: processedCount }
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[SyncService] Push failed:', e)
    throw e
  } finally {
    client.release()
  }
}

/**
 * 增量拉取变更
 * @param {string} shareId 
 * @param {number} since - 时间戳 (cursor)
 */
export async function pullItems(shareId, since = 0) {
  const result = await pool.query(
    `SELECT item_id, item_type, content, is_deleted, updated_at, client_id 
     FROM sync_items 
     WHERE share_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC
     LIMIT 1000`, // 分页限制
    [shareId, since]
  )
  
  // 转换 row 格式
  const items = result.rows.map(row => ({
    itemId: row.item_id,
    itemType: row.item_type,
    content: row.content,
    isDeleted: row.is_deleted,
    updatedAt: parseInt(row.updated_at),
    clientId: row.client_id
  }))

  return {
    items,
    hasMore: items.length === 1000,
    lastUpdatedAt: items.length > 0 ? items[items.length - 1].updatedAt : since
  }
}

/**
 * 获取 SyncGroup 信息
 */
export async function getSyncGroup(shareId) {
  const res = await pool.query('SELECT * FROM sync_groups WHERE id = $1', [shareId])
  if (res.rowCount === 0) return null
  return {
    id: res.rows[0].id,
    active: res.rows[0].active,
    updatedAt: parseInt(res.rows[0].updated_at)
  }
}
