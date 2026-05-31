const { getPool } = require("./db")

const PLATFORM_RULES = [
  { name: "抖音", re: /douyin|iesdouyin/i },
  { name: "快手", re: /kuaishou/i },
  { name: "小红书", re: /xiaohongshu|xhslink/i },
  { name: "微博", re: /weibo/i },
  { name: "B站", re: /bilibili|b23\.tv/i },
  { name: "微视", re: /weishi/i }
]

function detectPlatform(sourceUrl) {
  const url = String(sourceUrl || "")
  for (const rule of PLATFORM_RULES) {
    if (rule.re.test(url)) return rule.name
  }
  return "其他"
}

function normalizeImages(images) {
  if (!Array.isArray(images)) return []
  return images
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

function getTypeLabel(record) {
  if (record.videoUrl) return "视频"
  const count = (record.images || []).length
  if (count > 1) return `图集 ${count} 张`
  if (count === 1) return "图片"
  return "链接"
}

function formatTimeLabel(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function rowToClient(row) {
  const images = parseImagesColumn(row.images).map((item) => ({
    url: item.url,
    livePhotoUrl: item.live_photo_url || ""
  }))
  const createdAt = row.created_at
  const record = {
    id: String(row.id),
    sourceUrl: row.source_url || "",
    title: row.title || "",
    videoUrl: row.video_url || "",
    images,
    platform: row.platform || "",
    status: row.status || "success",
    createdAt
  }
  return {
    ...record,
    createdAtMs: new Date(createdAt).getTime(),
    timeLabel: formatTimeLabel(createdAt),
    typeLabel: getTypeLabel(record),
    hasLive: images.some((item) => item.livePhotoUrl),
    thumbUrl: record.videoUrl ? "" : (images[0] && images[0].url) || ""
  }
}

function rowToAdminClient(row) {
  const base = rowToClient(row)
  return {
    ...base,
    userId: row.user_id ? String(row.user_id) : "",
    userName: row.nickname || "用户",
    publicId: row.public_id || 0
  }
}

async function createRecord(openid, payload) {
  const sourceUrl = String(payload.sourceUrl || "").trim()
  if (!sourceUrl) {
    throw new Error("缺少来源链接")
  }

  const title = String(payload.title || "").trim()
  const videoUrl = String(
    payload.videoUrl || payload.video_url || payload.play_url || ""
  ).trim()
  const images = normalizeImages(payload.images)
  const platform = detectPlatform(sourceUrl)
  const pool = getPool()

  const [result] = await pool.query(
    `INSERT INTO parse_records (openid, source_url, title, video_url, images, platform, status)
     VALUES (?, ?, ?, ?, ?, ?, 'success')`,
    [openid, sourceUrl, title, videoUrl, JSON.stringify(images), platform]
  )

  const record = await getRecordById(result.insertId, openid)
  if (!record) throw new Error("保存记录失败")
  return record
}

async function getRecordById(id, openid) {
  const pool = getPool()
  const [rows] = await pool.query(
    "SELECT * FROM parse_records WHERE id = ? AND openid = ? LIMIT 1",
    [id, openid]
  )
  return rows.length ? rowToClient(rows[0]) : null
}

async function getVideoUrlByRecordId(id) {
  const pool = getPool()
  const [rows] = await pool.query(
    "SELECT video_url FROM parse_records WHERE id = ? LIMIT 1",
    [id]
  )
  if (!rows.length) return ""
  return String(rows[0].video_url || "").trim()
}

async function listRecordsByOpenid(openid, limit = 50) {
  const pool = getPool()
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const [rows] = await pool.query(
    `SELECT * FROM parse_records
     WHERE openid = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [openid, safeLimit]
  )
  return rows.map(rowToClient)
}

async function countRecordsByOpenid(openid) {
  const pool = getPool()
  const [[row]] = await pool.query(
    "SELECT COUNT(*) AS total FROM parse_records WHERE openid = ?",
    [openid]
  )
  return Number(row.total) || 0
}

async function deleteRecordById(id, openid) {
  const pool = getPool()
  const [result] = await pool.query(
    "DELETE FROM parse_records WHERE id = ? AND openid = ?",
    [id, openid]
  )
  return result.affectedRows > 0
}

async function clearRecordsByOpenid(openid) {
  const pool = getPool()
  const [result] = await pool.query("DELETE FROM parse_records WHERE openid = ?", [openid])
  return result.affectedRows || 0
}

async function listRecordsForAdmin({ limit = 200, offset = 0, q = "" } = {}) {
  const pool = getPool()
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500)
  const safeOffset = Math.max(Number(offset) || 0, 0)
  const keyword = String(q || "").trim()
  const params = []
  let where = "1=1"

  if (keyword) {
    where += " AND (u.nickname LIKE ? OR pr.title LIKE ? OR pr.source_url LIKE ? OR pr.platform LIKE ?)"
    const like = `%${keyword}%`
    params.push(like, like, like, like)
  }

  const [rows] = await pool.query(
    `SELECT pr.*, u.id AS user_id, u.nickname, u.public_id
     FROM parse_records pr
     JOIN users u ON u.openid = pr.openid
     WHERE ${where}
     ORDER BY pr.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  )

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM parse_records pr
     JOIN users u ON u.openid = pr.openid
     WHERE ${where}`,
    params
  )

  return {
    records: rows.map(rowToAdminClient),
    total: Number(countRow.total) || 0
  }
}

async function getParseStats() {
  const pool = getPool()
  const [[todayRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM parse_records WHERE DATE(created_at) = CURDATE()"
  )
  const [[totalRow]] = await pool.query("SELECT COUNT(*) AS total FROM parse_records")
  const [[successRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM parse_records WHERE status = 'success'"
  )
  const total = Number(totalRow.total) || 0
  const success = Number(successRow.total) || 0
  return {
    todayParses: Number(todayRow.total) || 0,
    totalParses: total,
    successRate: total ? Math.round((success / total) * 1000) / 10 : 0
  }
}

async function getParseCountsByOpenids(openids) {
  if (!openids.length) return {}
  const pool = getPool()
  const placeholders = openids.map(() => "?").join(",")
  const [rows] = await pool.query(
    `SELECT openid, COUNT(*) AS total
     FROM parse_records
     WHERE openid IN (${placeholders})
     GROUP BY openid`,
    openids
  )
  const map = {}
  rows.forEach((row) => {
    map[row.openid] = Number(row.total) || 0
  })
  return map
}

module.exports = {
  createRecord,
  getRecordById,
  getVideoUrlByRecordId,
  listRecordsByOpenid,
  countRecordsByOpenid,
  deleteRecordById,
  clearRecordsByOpenid,
  listRecordsForAdmin,
  getParseStats,
  getParseCountsByOpenids,
  detectPlatform
}
