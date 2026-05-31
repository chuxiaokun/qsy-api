const { getPool } = require("./db")
const { sendVerifyCode } = require("./mail")

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_TTL_MINUTES = 5
const SEND_INTERVAL_SECONDS = 60
const DAILY_SEND_LIMIT = 20

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase()
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function getUserByOpenid(openid) {
  const pool = getPool()
  const [rows] = await pool.query(
    "SELECT id, openid, public_id, nickname, avatar_url, email, email_verified, vip_expire_at FROM users WHERE openid = ? LIMIT 1",
    [openid]
  )
  return rows[0] || null
}

async function isEmailTakenByOther(email, openid) {
  const pool = getPool()
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE email = ? AND email_verified = 1 AND openid != ? LIMIT 1",
    [email, openid]
  )
  return rows.length > 0
}

async function checkSendRateLimit(openid, email) {
  const pool = getPool()

  const [recent] = await pool.query(
    `SELECT id FROM email_codes
     WHERE openid = ? AND email = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
     LIMIT 1`,
    [openid, email, SEND_INTERVAL_SECONDS]
  )
  if (recent.length) {
    throw new Error(`请 ${SEND_INTERVAL_SECONDS} 秒后再试`)
  }

  const [[daily]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM email_codes
     WHERE openid = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    [openid]
  )
  if (Number(daily.cnt) >= DAILY_SEND_LIMIT) {
    throw new Error("今日发送次数已达上限，请明天再试")
  }
}

async function createAndSendCode(openid, rawEmail) {
  const email = normalizeEmail(rawEmail)
  if (!EMAIL_RE.test(email)) {
    throw new Error("邮箱格式不正确")
  }

  const user = await getUserByOpenid(openid)
  if (!user) {
    throw new Error("用户不存在")
  }
  if (user.email_verified && user.email) {
    throw new Error("您已绑定邮箱，如需更换请联系客服")
  }
  if (await isEmailTakenByOther(email, openid)) {
    throw new Error("该邮箱已被其他账号绑定")
  }

  await checkSendRateLimit(openid, email)

  const code = generateCode()
  const pool = getPool()
  await pool.query(
    `INSERT INTO email_codes (openid, email, code, expires_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [openid, email, code, CODE_TTL_MINUTES]
  )

  await sendVerifyCode(email, code)
  return { email }
}

async function verifyAndBind(openid, rawEmail, rawCode) {
  const email = normalizeEmail(rawEmail)
  const code = String(rawCode || "").trim()

  if (!EMAIL_RE.test(email)) {
    throw new Error("邮箱格式不正确")
  }
  if (!/^\d{6}$/.test(code)) {
    throw new Error("请输入 6 位验证码")
  }

  const user = await getUserByOpenid(openid)
  if (!user) {
    throw new Error("用户不存在")
  }
  if (user.email_verified && user.email) {
    throw new Error("您已绑定邮箱，如需更换请联系客服")
  }
  if (await isEmailTakenByOther(email, openid)) {
    throw new Error("该邮箱已被其他账号绑定")
  }

  const pool = getPool()
  const [rows] = await pool.query(
    `SELECT id FROM email_codes
     WHERE openid = ? AND email = ? AND code = ? AND used = 0 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [openid, email, code]
  )
  if (!rows.length) {
    throw new Error("验证码错误或已过期")
  }

  await pool.query("UPDATE email_codes SET used = 1 WHERE id = ?", [rows[0].id])
  await pool.query(
    "UPDATE users SET email = ?, email_verified = 1, last_login_at = NOW() WHERE openid = ?",
    [email, openid]
  )

  return {
    ...user,
    email,
    email_verified: 1
  }
}

module.exports = { createAndSendCode, verifyAndBind, normalizeEmail }
