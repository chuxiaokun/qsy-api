const { getPool } = require("./db")

function rowToAdmin(row) {
  return {
    id: String(row.id),
    openid: row.openid || "",
    nickname: row.nickname || "",
    contact: row.contact || "",
    content: row.content || "",
    page: row.page || "",
    systemInfo: row.system_info ? String(row.system_info) : "",
    status: row.status || "new",
    reply: row.reply || "",
    createdAt: row.created_at
  }
}

async function create({ openid = "", contact = "", content = "", page = "", systemInfo = "" }) {
  const text = String(content || "").trim()
  if (!text) throw new Error("请填写反馈内容")
  if (text.length > 2000) throw new Error("反馈内容过长（最多 2000 字）")

  const pool = getPool()
  const [result] = await pool.query(
    `INSERT INTO app_feedbacks (openid, contact, content, page, system_info, status)
     VALUES (?, ?, ?, ?, ?, 'new')`,
    [
      String(openid || "").trim(),
      String(contact || "").trim().slice(0, 128),
      text,
      String(page || "").trim().slice(0, 128),
      systemInfo ? JSON.stringify(systemInfo).slice(0, 2000) : ""
    ]
  )

  const [rows] = await pool.query(
    `SELECT f.*, u.nickname
     FROM app_feedbacks f
     LEFT JOIN users u ON u.openid = f.openid
     WHERE f.id = ? LIMIT 1`,
    [result.insertId]
  )
  return rows && rows.length ? rowToAdmin(rows[0]) : null
}

async function listForAdmin({ limit = 200, offset = 0, q = "", status = "" } = {}) {
  const pool = getPool()
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500)
  const safeOffset = Math.max(Number(offset) || 0, 0)
  const keyword = String(q || "").trim()
  const st = String(status || "").trim()
  const params = []
  let where = "1=1"

  if (st) {
    where += " AND f.status = ?"
    params.push(st)
  }
  if (keyword) {
    where += " AND (u.nickname LIKE ? OR f.contact LIKE ? OR f.content LIKE ? OR f.page LIKE ?)"
    const like = `%${keyword}%`
    params.push(like, like, like, like)
  }

  const [rows] = await pool.query(
    `SELECT f.*, u.nickname
     FROM app_feedbacks f
     LEFT JOIN users u ON u.openid = f.openid
     WHERE ${where}
     ORDER BY f.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  )
  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM app_feedbacks f
     LEFT JOIN users u ON u.openid = f.openid
     WHERE ${where}`,
    params
  )

  return { feedbacks: (rows || []).map(rowToAdmin), total: Number(countRow.total) || 0 }
}

async function updateForAdmin(id, payload) {
  const fid = String(id || "").trim()
  if (!fid || !/^\d+$/.test(fid)) throw new Error("无效的反馈 ID")

  const status = payload.status !== undefined ? String(payload.status || "").trim() : undefined
  const reply = payload.reply !== undefined ? String(payload.reply || "").trim() : undefined

  const allowed = new Set(["new", "processing", "done"])
  if (status !== undefined && !allowed.has(status)) {
    throw new Error("无效的状态")
  }
  if (reply !== undefined && reply.length > 2000) {
    throw new Error("回复过长（最多 2000 字）")
  }

  const pool = getPool()
  const [rows] = await pool.query(
    `SELECT id FROM app_feedbacks WHERE id = ? LIMIT 1`,
    [fid]
  )
  if (!rows || !rows.length) throw new Error("反馈不存在")

  const sets = []
  const params = []
  if (status !== undefined) {
    sets.push("status = ?")
    params.push(status)
  }
  if (reply !== undefined) {
    sets.push("reply = ?")
    params.push(reply)
  }
  if (!sets.length) throw new Error("没有可更新的字段")

  await pool.query(`UPDATE app_feedbacks SET ${sets.join(", ")} WHERE id = ?`, [...params, fid])

  const [rows2] = await pool.query(
    `SELECT f.*, u.nickname
     FROM app_feedbacks f
     LEFT JOIN users u ON u.openid = f.openid
     WHERE f.id = ? LIMIT 1`,
    [fid]
  )
  return rows2 && rows2.length ? rowToAdmin(rows2[0]) : null
}

module.exports = {
  create,
  listForAdmin,
  updateForAdmin
}

