const express = require("express")
const jwt = require("jsonwebtoken")
const { code2Session } = require("../wechat")
const { findOrCreateUser, toClientUser, withPublicAvatarUrl } = require("../users")
const { getPublicBaseUrl } = require("../publicBaseUrl")

const router = express.Router()

function signToken(openid) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("未配置 JWT_SECRET")
  }
  return jwt.sign({ openid }, secret, { expiresIn: "30d" })
}

/**
 * POST /api/login
 * Body: { code: string }  // wx.login() 返回的 code
 */
router.post("/", async (req, res) => {
  const code = (req.body && req.body.code ? String(req.body.code) : "").trim()
  if (!code) {
    return res.status(400).json({ code: 400, msg: "缺少 code" })
  }

  try {
    const { openid } = await code2Session(code)
    const row = await findOrCreateUser(openid)
    const token = signToken(openid)

    const user = withPublicAvatarUrl(getPublicBaseUrl(req), toClientUser(row, openid))
    return res.json({
      code: 200,
      data: {
        token,
        user
      }
    })
  } catch (err) {
    console.error("[login]", err.message || err)
    return res.status(500).json({
      code: 500,
      msg: err.message || "登录失败"
    })
  }
})

module.exports = router
