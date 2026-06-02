const jwt = require("jsonwebtoken")

/**
 * 可选登录：有 Bearer token 就解析 openid；没有就继续走匿名
 * 不会在这里返回 401（由业务路由自行决定是否必需登录）
 */
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return next()

  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET)
    if (payload && payload.openid) req.openid = payload.openid
  } catch {
    // ignore invalid token
  }
  next()
}

module.exports = { optionalAuth }

