const jwt = require("jsonwebtoken")

function verifyAdminJwt(token) {
  const secret = process.env.JWT_SECRET
  if (!secret || !token) return null
  try {
    const payload = jwt.verify(token, secret)
    if (payload.role !== "admin") return null
    return payload
  } catch {
    return null
  }
}

function pickBearerToken(req) {
  const auth = req.headers.authorization || ""
  const fromAuth = auth.match(/^Bearer\s+(.+)$/i)?.[1]
  if (fromAuth) return fromAuth
  const fromCustom = req.headers["x-admin-token"]
  if (typeof fromCustom === "string" && fromCustom.trim()) return fromCustom.trim()
  return ""
}

function requireAdmin(req, res, next) {
  const headerKey = req.headers["x-admin-key"]
  const expectedKey = process.env.ADMIN_API_KEY
  const bearer = pickBearerToken(req)

  if (headerKey && expectedKey && headerKey === expectedKey) {
    req.adminUsername = "api-key"
    return next()
  }

  const payload = verifyAdminJwt(bearer)
  if (payload) {
    req.adminUsername = payload.username || "admin"
    return next()
  }

  if (!process.env.JWT_SECRET && !expectedKey) {
    return res.status(503).json({ code: 503, msg: "管理接口未配置 JWT_SECRET 或 ADMIN_API_KEY" })
  }

  return res.status(401).json({ code: 401, msg: "无权限，请先登录" })
}

module.exports = { requireAdmin, verifyAdminJwt }
