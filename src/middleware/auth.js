const jwt = require("jsonwebtoken")

/**
 * 后续接口（邮箱绑定、自建解析等）可挂此中间件
 * Header: Authorization: Bearer <token>
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return res.status(401).json({ code: 401, msg: "请先登录" })
  }

  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET)
    if (!payload.openid) {
      return res.status(401).json({ code: 401, msg: "无效令牌" })
    }
    req.openid = payload.openid
    next()
  } catch {
    return res.status(401).json({ code: 401, msg: "登录已过期，请重新登录" })
  }
}

module.exports = { requireAuth }
