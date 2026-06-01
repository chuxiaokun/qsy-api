const { getPool } = require("./db")

function rowToAdmin(row) {
  return {
    id: String(row.id),
    title: row.title || "",
    content: row.content || "",
    enabled: !!row.enabled,
    sortOrder: row.sort_order ?? 0,
    startAt: row.start_at ? new Date(row.start_at).toISOString() : null,
    endAt: row.end_at ? new Date(row.end_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  }
}

function rowToPublic(row) {
  return {
    id: String(row.id),
    title: row.title || "",
    content: row.content || ""
  }
}

function parseOptionalDate(value) {
  if (value === null || value === undefined || value === "") return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d
}

async function listAll() {
  const pool = getPool()
  const [rows] = await pool.query(
    `SELECT id, title, content, enabled, sort_order, start_at, end_at, created_at, updated_at
     FROM app_notifications
     ORDER BY sort_order ASC, id ASC`
  )
  return (rows || []).map(rowToAdmin)
}

async function listActive() {
  const pool = getPool()
  const [rows] = await pool.query(
    `SELECT id, title, content
     FROM app_notifications
     WHERE enabled = 1
       AND (start_at IS NULL OR start_at <= NOW())
       AND (end_at IS NULL OR end_at >= NOW())
     ORDER BY sort_order ASC, id ASC`
  )
  return (rows || []).map(rowToPublic)
}

async function create(payload) {
  const title = String(payload.title || "").trim()
  const content = String(payload.content || "").trim()
  if (!title) throw new Error("标题不能为空")
  if (!content) throw new Error("内容不能为空")

  const enabled = payload.enabled === undefined ? 1 : payload.enabled ? 1 : 0
  const sortOrder = Number(payload.sortOrder ?? payload.sort_order ?? 0) || 0
  const startAt = parseOptionalDate(payload.startAt ?? payload.start_at)
  const endAt = parseOptionalDate(payload.endAt ?? payload.end_at)
  if (startAt === undefined || endAt === undefined) throw new Error("时间格式无效")

  const pool = getPool()
  const [result] = await pool.query(
    `INSERT INTO app_notifications (title, content, enabled, sort_order, start_at, end_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [title, content, enabled, sortOrder, startAt, endAt]
  )
  return getById(result.insertId)
}

async function getById(id) {
  const pool = getPool()
  const [rows] = await pool.query(
    `SELECT id, title, content, enabled, sort_order, start_at, end_at, created_at, updated_at
     FROM app_notifications WHERE id = ? LIMIT 1`,
    [id]
  )
  if (!rows || !rows.length) return null
  return rowToAdmin(rows[0])
}

async function update(id, payload) {
  const existing = await getById(id)
  if (!existing) throw new Error("通知不存在")

  const title =
    payload.title !== undefined ? String(payload.title || "").trim() : existing.title
  const content =
    payload.content !== undefined ? String(payload.content || "").trim() : existing.content
  if (!title) throw new Error("标题不能为空")
  if (!content) throw new Error("内容不能为空")

  const enabled =
    payload.enabled !== undefined ? (payload.enabled ? 1 : 0) : existing.enabled ? 1 : 0
  const sortOrder =
    payload.sortOrder !== undefined || payload.sort_order !== undefined
      ? Number(payload.sortOrder ?? payload.sort_order ?? 0) || 0
      : existing.sortOrder

  let startAt = existing.startAt ? new Date(existing.startAt) : null
  let endAt = existing.endAt ? new Date(existing.endAt) : null
  if (payload.startAt !== undefined || payload.start_at !== undefined) {
    const parsed = parseOptionalDate(payload.startAt ?? payload.start_at)
    if (parsed === undefined) throw new Error("开始时间格式无效")
    startAt = parsed
  }
  if (payload.endAt !== undefined || payload.end_at !== undefined) {
    const parsed = parseOptionalDate(payload.endAt ?? payload.end_at)
    if (parsed === undefined) throw new Error("结束时间格式无效")
    endAt = parsed
  }

  const pool = getPool()
  await pool.query(
    `UPDATE app_notifications
     SET title = ?, content = ?, enabled = ?, sort_order = ?, start_at = ?, end_at = ?
     WHERE id = ?`,
    [title, content, enabled, sortOrder, startAt, endAt, id]
  )
  return getById(id)
}

async function remove(id) {
  const pool = getPool()
  const [result] = await pool.query(`DELETE FROM app_notifications WHERE id = ?`, [id])
  return (result.affectedRows || 0) > 0
}

module.exports = {
  listAll,
  listActive,
  create,
  getById,
  update,
  remove
}
