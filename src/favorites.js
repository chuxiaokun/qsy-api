const { getPool } = require("./db")
const parseRecords = require("./parseRecords")

function normalizeImages(images) {
  return (Array.isArray(images) ? images : [])
    .map((item) => ({
      url: String((item && (item.url || item.image_url)) || "").trim(),
      live_photo_url: String(
        (item && (item.livePhotoUrl || item.live_photo_url)) || ""
      ).trim()
    }))
    .filter((item) => item.url)
}

function parseImagesColumn(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return normalizeImages(raw)
  try {
    return normalizeImages(JSON.parse(raw))
  } catch {
    return []
  }
}

function rowToClient(row) {
  const images = parseImagesColumn(row.images).map((it) => ({
    url: it.url,
    livePhotoUrl: it.live_photo_url || ""
  }))
  return {
    id: String(row.id),
    sourceUrl: row.source_url || "",
    title: row.title || "",
    videoUrl: row.video_url || "",
    images,
    platform: row.platform || "",
    createdAt: row.created_at
  }
}

async function listByOpenid(openid, { limit = 50, offset = 0, q = "" } = {}) {
  const pool = getPool()
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const safeOffset = Math.max(Number(offset) || 0, 0)
  const keyword = String(q || "").trim()
  const params = [openid]
  let where = "openid = ?"
  if (keyword) {
    where += " AND (title LIKE ? OR source_url LIKE ? OR platform LIKE ?)"
    const like = `%${keyword}%`
    params.push(like, like, like)
  }
  const [rows] = await pool.query(
    `SELECT * FROM user_favorites
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  )
  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM user_favorites WHERE ${where}`,
    params
  )
  return {
    favorites: (rows || []).map(rowToClient),
    total: Number(countRow.total) || 0
  }
}

async function create(openid, payload) {
  const sourceUrl = String(payload.sourceUrl || payload.source_url || "").trim()
  if (!sourceUrl) throw new Error("缺少来源链接")

  const title = String(payload.title || "").trim()
  const videoUrl = String(payload.videoUrl || payload.video_url || "").trim()
  const images = normalizeImages(payload.images)
  const platform = payload.platform ? String(payload.platform) : parseRecords.detectPlatform(sourceUrl)

  const pool = getPool()
  const [result] = await pool.query(
    `INSERT INTO user_favorites (openid, source_url, title, video_url, images, platform)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       video_url = VALUES(video_url),
       images = VALUES(images),
       platform = VALUES(platform)`,
    [openid, sourceUrl, title, videoUrl, JSON.stringify(images), platform]
  )

  // mysql2 在 ON DUPLICATE KEY 时 insertId 可能是 0，这里直接按 (openid, source_url) 取回
  const [rows] = await pool.query(
    "SELECT * FROM user_favorites WHERE openid = ? AND source_url = ? LIMIT 1",
    [openid, sourceUrl]
  )
  if (rows && rows.length) return rowToClient(rows[0])

  // 兜底（新插入且 insertId 有值）
  if (result.insertId) {
    const [rows2] = await pool.query("SELECT * FROM user_favorites WHERE id = ? LIMIT 1", [
      result.insertId
    ])
    if (rows2 && rows2.length) return rowToClient(rows2[0])
  }

  throw new Error("收藏失败")
}

async function removeById(openid, id) {
  const pool = getPool()
  const [result] = await pool.query("DELETE FROM user_favorites WHERE id = ? AND openid = ?", [
    id,
    openid
  ])
  return (result.affectedRows || 0) > 0
}

async function listForAdmin({ limit = 200, offset = 0, q = "" } = {}) {
  const pool = getPool()
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500)
  const safeOffset = Math.max(Number(offset) || 0, 0)
  const keyword = String(q || "").trim()
  const params = []
  let where = "1=1"
  if (keyword) {
    where += " AND (u.nickname LIKE ? OR f.title LIKE ? OR f.source_url LIKE ? OR f.platform LIKE ?)"
    const like = `%${keyword}%`
    params.push(like, like, like, like)
  }
  const [rows] = await pool.query(
    `SELECT f.*, u.id AS user_id, u.nickname, u.public_id
     FROM user_favorites f
     JOIN users u ON u.openid = f.openid
     WHERE ${where}
     ORDER BY f.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  )
  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM user_favorites f
     JOIN users u ON u.openid = f.openid
     WHERE ${where}`,
    params
  )
  return {
    favorites: (rows || []).map((row) => ({
      ...rowToClient(row),
      userId: row.user_id ? String(row.user_id) : "",
      userName: row.nickname || "用户",
      publicId: row.public_id || 0
    })),
    total: Number(countRow.total) || 0
  }
}

module.exports = {
  listByOpenid,
  create,
  removeById,
  listForAdmin
}

