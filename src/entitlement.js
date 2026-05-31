const { getPool } = require("./db")

const VIP_PERMANENT = "2099-12-31 23:59:59"

function isVipActive(vipExpireAt) {
  if (!vipExpireAt) return false
  return new Date(vipExpireAt).getTime() > Date.now()
}

function formatVipExpireAt(vipExpireAt) {
  if (!vipExpireAt) return null
  const d = new Date(vipExpireAt)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

async function getUserIdByOpenid(openid) {
  const pool = getPool()
  const [rows] = await pool.query("SELECT id FROM users WHERE openid = ? LIMIT 1", [openid])
  if (!rows.length) return null
  return rows[0].id
}

async function hasDailyAdUnlock(userId) {
  const pool = getPool()
  const [rows] = await pool.query(
    "SELECT 1 FROM ad_daily_unlocks WHERE user_id = ? AND unlock_date = CURDATE() LIMIT 1",
    [userId]
  )
  return rows.length > 0
}

async function recordDailyAdUnlock(userId) {
  const pool = getPool()
  await pool.query(
    "INSERT IGNORE INTO ad_daily_unlocks (user_id, unlock_date) VALUES (?, CURDATE())",
    [userId]
  )
}

async function getEntitlementByOpenid(openid) {
  const pool = getPool()
  const [rows] = await pool.query(
    "SELECT id, vip_expire_at FROM users WHERE openid = ? LIMIT 1",
    [openid]
  )
  if (!rows.length) {
    throw new Error("用户不存在")
  }
  const row = rows[0]
  const isVip = isVipActive(row.vip_expire_at)
  const dailyUnlocked = isVip ? true : await hasDailyAdUnlock(row.id)
  return {
    isVip,
    vipExpireAt: formatVipExpireAt(row.vip_expire_at),
    dailyUnlocked,
    canUse: isVip || dailyUnlocked
  }
}

async function grantDailyAdUnlockByOpenid(openid) {
  const userId = await getUserIdByOpenid(openid)
  if (!userId) {
    throw new Error("用户不存在")
  }
  const ent = await getEntitlementByOpenid(openid)
  if (ent.isVip) {
    return ent
  }
  await recordDailyAdUnlock(userId)
  return getEntitlementByOpenid(openid)
}

async function setUserVipById(userId, isVip) {
  const pool = getPool()
  const vipExpireAt = isVip ? VIP_PERMANENT : null
  const [result] = await pool.query("UPDATE users SET vip_expire_at = ? WHERE id = ?", [
    vipExpireAt,
    userId
  ])
  if (!result.affectedRows) {
    throw new Error("用户不存在")
  }
  const [rows] = await pool.query(
    "SELECT id, openid, public_id, nickname, avatar_url, email, email_verified, vip_expire_at, created_at, last_login_at FROM users WHERE id = ? LIMIT 1",
    [userId]
  )
  return rows[0]
}

module.exports = {
  isVipActive,
  formatVipExpireAt,
  getEntitlementByOpenid,
  grantDailyAdUnlockByOpenid,
  setUserVipById,
  VIP_PERMANENT
}
