const path = require("path")
const fs = require("fs")
const express = require("express")
const multer = require("multer")
const { requireAuth } = require("../middleware/auth")
const { mailConfigured } = require("../mail")
const { createAndSendCode, verifyAndBind } = require("../emailBind")
const { updateUserProfile, toClientUser, withPublicAvatarUrl } = require("../users")
const { getPublicBaseUrl } = require("../publicBaseUrl")

const router = express.Router()

const AVATAR_DIR = path.join(__dirname, "../../uploads/avatars")
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".jpg"
    const safeExt = /^\.(jpe?g|png|gif|webp)$/i.test(ext) ? ext.toLowerCase() : ".jpg"
    cb(null, `${req.openid}_${Date.now()}${safeExt}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_AVATAR_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      cb(null, true)
      return
    }
    cb(new Error("仅支持图片文件"))
  }
})

/**
 * POST /api/user/profile
 * multipart: avatar (file), nickname (field)
 * Header: Authorization: Bearer <token>
 */
router.post("/profile", requireAuth, (req, res, next) => {
  upload.single("avatar")(req, res, (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE" ? "头像不能超过 2MB" : err.message || "上传失败"
      return res.status(400).json({ code: 400, msg })
    }
    next()
  })
}, async (req, res) => {
  const nickname = (req.body && req.body.nickname ? String(req.body.nickname) : "").trim()
  if (!nickname || nickname.length > 32) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    return res.status(400).json({ code: 400, msg: "请填写 1–32 字昵称" })
  }
  if (!req.file) {
    return res.status(400).json({ code: 400, msg: "请选择头像" })
  }

  const avatarPath = `/uploads/avatars/${req.file.filename}`

  try {
    const row = await updateUserProfile(req.openid, { nickname, avatarPath })
    const user = withPublicAvatarUrl(getPublicBaseUrl(req), toClientUser(row, req.openid))
    return res.json({ code: 200, data: { user } })
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    console.error("[user/profile]", err.message || err)
    return res.status(500).json({ code: 500, msg: err.message || "保存失败" })
  }
})

/**
 * POST /api/user/email/send-code
 * Body: { email: string }
 * Header: Authorization: Bearer <token>
 */
router.post("/email/send-code", requireAuth, async (req, res) => {
  if (!mailConfigured()) {
    return res.status(503).json({ code: 503, msg: "邮件服务未配置" })
  }

  const email = req.body && req.body.email ? String(req.body.email) : ""
  if (!email.trim()) {
    return res.status(400).json({ code: 400, msg: "请输入邮箱" })
  }

  try {
    await createAndSendCode(req.openid, email)
    return res.json({ code: 200, msg: "验证码已发送" })
  } catch (err) {
    const msg = err.message || "发送失败"
    const status = /秒后再试|已达上限|已绑定|已被/.test(msg) ? 400 : 500
    if (status >= 500) console.error("[user/email/send-code]", msg)
    return res.status(status).json({ code: status, msg })
  }
})

/**
 * POST /api/user/email/bind
 * Body: { email: string, code: string }
 * Header: Authorization: Bearer <token>
 */
router.post("/email/bind", requireAuth, async (req, res) => {
  const email = req.body && req.body.email ? String(req.body.email) : ""
  const code = req.body && req.body.code ? String(req.body.code) : ""

  if (!email.trim() || !code.trim()) {
    return res.status(400).json({ code: 400, msg: "请输入邮箱和验证码" })
  }

  try {
    const row = await verifyAndBind(req.openid, email, code)
    const user = withPublicAvatarUrl(getPublicBaseUrl(req), toClientUser(row, req.openid))
    return res.json({ code: 200, data: { user } })
  } catch (err) {
    const msg = err.message || "绑定失败"
    const status = /验证码|格式|已绑定|已被/.test(msg) ? 400 : 500
    if (status >= 500) console.error("[user/email/bind]", msg)
    return res.status(status).json({ code: status, msg })
  }
})

module.exports = router
