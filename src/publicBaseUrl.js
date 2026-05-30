/**
 * 头像等对外 URL 的根地址：优先 PUBLIC_BASE_URL，否则从反代头推断（需 trust proxy）
 */
function getPublicBaseUrl(req) {
  const fromEnv = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "")
  if (fromEnv) return fromEnv
  if (!req) return ""

  const protoHeader = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim()
  const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim()
  if (!host) return ""

  return `${protoHeader}://${host}`
}

module.exports = { getPublicBaseUrl }
