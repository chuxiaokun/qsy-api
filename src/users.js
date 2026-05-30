const { getPool } = require("./db")

const COUNTER_ID = "user_public_id"
const PUBLIC_ID_START = 10001

function buildNickname(publicId) {
  return `用户${String(publicId).slice(-4)}`
}

async function nextPublicId(conn) {
  const [rows] = await conn.query(
    "SELECT seq FROM counters WHERE id = ? FOR UPDATE",
    [COUNTER_ID]
  )

  if (!rows.length || typeof rows[0].seq !== "number") {
    await conn.query(
      "INSERT INTO counters (id, seq) VALUES (?, ?) ON DUPLICATE KEY UPDATE seq = VALUES(seq)",
      [COUNTER_ID, PUBLIC_ID_START]
    )
    return PUBLIC_ID_START
  }

  const next = rows[0].seq + 1
  await conn.query("UPDATE counters SET seq = ? WHERE id = ?", [next, COUNTER_ID])
  return next
}

async function findOrCreateUser(openid) {
  const pool = getPool()
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    const [existing] = await conn.query(
      "SELECT id, openid, public_id, nickname, avatar_url, email, email_verified FROM users WHERE openid = ? LIMIT 1",
      [openid]
    )

    if (existing.length) {
      const row = existing[0]
      await conn.query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [row.id])
      await conn.commit()
      return row
    }

    const publicId = await nextPublicId(conn)
    const nickname = buildNickname(publicId)
    const [insert] = await conn.query(
      `INSERT INTO users (openid, public_id, nickname, avatar_url, email, email_verified)
       VALUES (?, ?, ?, '', '', 0)`,
      [openid, publicId, nickname]
    )

    await conn.commit()

    return {
      id: insert.insertId,
      openid,
      public_id: publicId,
      nickname,
      avatar_url: "",
      email: "",
      email_verified: 0
    }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

function toClientUser(row, openid) {
  return {
    id: String(row.id),
    openid,
    publicId: row.public_id,
    nickname: row.nickname || buildNickname(row.public_id),
    avatarUrl: row.avatar_url || "",
    email: row.email || "",
    emailVerified: !!row.email_verified,
    isGuest: false
  }
}

function withPublicAvatarUrl(baseUrl, user) {
  if (!user || !user.avatarUrl) return user
  const raw = String(user.avatarUrl).trim()
  if (!raw) return user

  if (/^https?:\/\//i.test(raw)) {
    const envBase = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "")
    if (envBase.startsWith("https://") && raw.startsWith("http://")) {
      return { ...user, avatarUrl: `https://${raw.slice(7)}` }
    }
    return user
  }

  const base = (baseUrl || process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "")
  if (!base) return user
  const rel = raw.startsWith("/") ? raw : `/${raw}`
  return { ...user, avatarUrl: `${base}${rel}` }
}

function maskOpenId(openid) {
  if (!openid || openid.length <= 8) return openid || ""
  return `${openid.slice(0, 4)}***${openid.slice(-4)}`
}

async function listUsers(limit = 200) {
  const pool = getPool()
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500)
  const [rows] = await pool.query(
    `SELECT id, openid, public_id, nickname, avatar_url, email, email_verified, created_at, last_login_at
     FROM users ORDER BY id DESC LIMIT ?`,
    [safeLimit]
  )
  return rows.map((row) => ({
    id: String(row.id),
    publicId: row.public_id,
    nickname: row.nickname || buildNickname(row.public_id),
    openId: maskOpenId(row.openid),
    avatarUrl: row.avatar_url || "",
    email: row.email || "",
    emailVerified: !!row.email_verified,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  }))
}

async function updateUserProfile(openid, { nickname, avatarPath }) {
  const pool = getPool()
  const [existing] = await pool.query(
    "SELECT id, openid, public_id, nickname, avatar_url, email, email_verified FROM users WHERE openid = ? LIMIT 1",
    [openid]
  )
  if (!existing.length) {
    throw new Error("用户不存在")
  }

  const row = existing[0]
  const oldAvatar = row.avatar_url || ""

  await pool.query(
    "UPDATE users SET nickname = ?, avatar_url = ?, last_login_at = NOW() WHERE openid = ?",
    [nickname, avatarPath, openid]
  )

  if (oldAvatar && oldAvatar.startsWith("/uploads/avatars/") && oldAvatar !== avatarPath) {
    const fs = require("fs")
    const path = require("path")
    const filePath = path.join(__dirname, "..", oldAvatar.replace(/^\//, ""))
    fs.unlink(filePath, () => {})
  }

  return {
    ...row,
    nickname,
    avatar_url: avatarPath
  }
}

async function getAdminStats() {
  const pool = getPool()
  const [[totalRow]] = await pool.query("SELECT COUNT(*) AS total FROM users")
  const [[todayRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM users WHERE DATE(created_at) = CURDATE()"
  )
  return {
    totalUsers: Number(totalRow.total) || 0,
    todayNewUsers: Number(todayRow.total) || 0
  }
}

module.exports = {
  findOrCreateUser,
  toClientUser,
  withPublicAvatarUrl,
  buildNickname,
  updateUserProfile,
  listUsers,
  getAdminStats
}
