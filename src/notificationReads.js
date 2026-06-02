const { getPool } = require("./db")

function rowToPublic(row) {
  return {
    id: String(row.id),
    title: row.title || "",
    content: row.content || "",
    read: !!row.read_at
  }
}

async function listActiveWithRead(openid) {
  const pool = getPool()
  const [rows] = await pool.query(
    `SELECT n.id, n.title, n.content, r.read_at
     FROM app_notifications n
     LEFT JOIN app_notification_reads r
       ON r.notification_id = n.id AND r.openid = ?
     WHERE n.enabled = 1
       AND (n.start_at IS NULL OR n.start_at <= NOW())
       AND (n.end_at IS NULL OR n.end_at >= NOW())
     ORDER BY n.sort_order ASC, n.id ASC`,
    [openid]
  )
  const items = (rows || []).map(rowToPublic)
  const unreadCount = items.reduce((acc, it) => acc + (it.read ? 0 : 1), 0)
  return { notifications: items, unreadCount }
}

async function markRead(openid, notificationId) {
  const pool = getPool()
  const id = String(notificationId || "").trim()
  if (!id || !/^\d+$/.test(id)) throw new Error("无效的通知 ID")
  await pool.query(
    `INSERT INTO app_notification_reads (openid, notification_id, read_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE read_at = VALUES(read_at)`,
    [openid, id]
  )
  return true
}

module.exports = {
  listActiveWithRead,
  markRead
}

