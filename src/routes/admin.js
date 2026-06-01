const express = require("express")
const jwt = require("jsonwebtoken")
const { requireAdmin } = require("../middleware/requireAdmin")
const { listUsers, getAdminStats, withPublicAvatarUrl } = require("../users")
const { setUserVipById } = require("../entitlement")
const { getPublicBaseUrl } = require("../publicBaseUrl")
const parseRecords = require("../parseRecords")
const notifications = require("../notifications")
const { proxyVideoStream } = require("../videoProxy")

const router = express.Router()

/** POST /api/admin/login */
router.post("/login", (req, res) => {
  const username = String((req.body && req.body.username) || "").trim()
  const password = String((req.body && req.body.password) || "")
  const adminUser = process.env.ADMIN_USERNAME || "admin"
  const adminPass = process.env.ADMIN_PASSWORD

  if (!adminPass) {
    return res.status(503).json({ code: 503, msg: "未配置 ADMIN_PASSWORD" })
  }
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ code: 503, msg: "未配置 JWT_SECRET" })
  }
  if (username !== adminUser || password !== adminPass) {
    return res.status(401).json({ code: 401, msg: "用户名或密码错误" })
  }

  const token = jwt.sign({ role: "admin", username: adminUser }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  })

  return res.json({
    code: 200,
    data: { token, username: adminUser }
  })
})

router.use(requireAdmin)

/** GET /api/admin/me */
router.get("/me", (req, res) => {
  return res.json({
    code: 200,
    data: { username: req.adminUsername || "admin" }
  })
})

/** GET /api/admin/users?limit=200&offset=0 */
router.get("/users", async (req, res) => {
  try {
    const base = getPublicBaseUrl(req)
    const { users, total } = await listUsers({
      limit: req.query.limit,
      offset: req.query.offset
    })
    const mapped = users.map((u) => {
      const patched = withPublicAvatarUrl(base, { avatarUrl: u.avatarUrl })
      return { ...u, avatarUrl: patched.avatarUrl }
    })
    return res.json({ code: 200, data: { users: mapped, total } })
  } catch (err) {
    console.error("[admin/users]", err)
    return res.status(500).json({ code: 500, msg: "获取用户列表失败" })
  }
})

/** GET /api/admin/stats */
router.get("/stats", async (req, res) => {
  try {
    const stats = await getAdminStats()
    const parseStats = await parseRecords.getParseStats()
    return res.json({
      code: 200,
      data: {
        totalUsers: stats.totalUsers,
        todayNewUsers: stats.todayNewUsers,
        todayParses: parseStats.todayParses,
        successRate: parseStats.successRate,
        activePlatforms: 6
      }
    })
  } catch (err) {
    console.error("[admin/stats]", err)
    return res.status(500).json({ code: 500, msg: "获取统计失败" })
  }
})

/** GET /api/admin/parse-records/:id/video — 代理播放（绕过 CDN Referer 限制） */
router.get("/parse-records/:id/video", async (req, res) => {
  try {
    const videoUrl = await parseRecords.getVideoUrlByRecordId(req.params.id)
    if (!videoUrl) {
      return res.status(404).json({ code: 404, msg: "该记录无视频地址" })
    }
    await proxyVideoStream(videoUrl, res)
  } catch (err) {
    console.error("[admin/parse-records/video]", err)
    if (!res.headersSent) {
      res.status(500).json({ code: 500, msg: "视频代理失败" })
    }
  }
})

/** PATCH /api/admin/users/:id/vip  Body: { isVip: boolean } */
router.patch("/users/:id/vip", async (req, res) => {
  const userId = String(req.params.id || "").trim()
  if (!userId || !/^\d+$/.test(userId)) {
    return res.status(400).json({ code: 400, msg: "无效的用户 ID" })
  }
  const isVip = !!(req.body && req.body.isVip)
  try {
    const row = await setUserVipById(userId, isVip)
    const base = getPublicBaseUrl(req)
    const user = withPublicAvatarUrl(base, {
      id: String(row.id),
      publicId: row.public_id,
      nickname: row.nickname,
      openId: row.openid,
      avatarUrl: row.avatar_url || "",
      email: row.email || "",
      emailVerified: !!row.email_verified,
      isVip: !!isVip,
      vipExpireAt: isVip ? row.vip_expire_at : null,
      parseCount: 0,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at
    })
    return res.json({
      code: 200,
      data: { user },
      msg: isVip ? "已开通 VIP" : "已取消 VIP"
    })
  } catch (err) {
    const msg = err.message || "更新失败"
    const status = msg === "用户不存在" ? 404 : 500
    if (status >= 500) console.error("[admin/users/vip]", err)
    return res.status(status).json({ code: status, msg })
  }
})

/** GET /api/admin/notifications */
router.get("/notifications", async (_req, res) => {
  try {
    const items = await notifications.listAll()
    return res.json({ code: 200, data: { notifications: items } })
  } catch (err) {
    console.error("[admin/notifications]", err)
    return res.status(500).json({ code: 500, msg: "获取通知列表失败" })
  }
})

/** POST /api/admin/notifications */
router.post("/notifications", async (req, res) => {
  try {
    const item = await notifications.create(req.body || {})
    return res.json({ code: 200, data: { notification: item }, msg: "已创建" })
  } catch (err) {
    const msg = err.message || "创建失败"
    const status = /不能为空|格式无效/.test(msg) ? 400 : 500
    if (status >= 500) console.error("[admin/notifications POST]", err)
    return res.status(status).json({ code: status, msg })
  }
})

/** PUT /api/admin/notifications/:id */
router.put("/notifications/:id", async (req, res) => {
  const id = String(req.params.id || "").trim()
  if (!id || !/^\d+$/.test(id)) {
    return res.status(400).json({ code: 400, msg: "无效的通知 ID" })
  }
  try {
    const item = await notifications.update(id, req.body || {})
    return res.json({ code: 200, data: { notification: item }, msg: "已更新" })
  } catch (err) {
    const msg = err.message || "更新失败"
    const status = msg === "通知不存在" ? 404 : /不能为空|格式无效/.test(msg) ? 400 : 500
    if (status >= 500) console.error("[admin/notifications PUT]", err)
    return res.status(status).json({ code: status, msg })
  }
})

/** DELETE /api/admin/notifications/:id */
router.delete("/notifications/:id", async (req, res) => {
  const id = String(req.params.id || "").trim()
  if (!id || !/^\d+$/.test(id)) {
    return res.status(400).json({ code: 400, msg: "无效的通知 ID" })
  }
  try {
    const ok = await notifications.remove(id)
    if (!ok) return res.status(404).json({ code: 404, msg: "通知不存在" })
    return res.json({ code: 200, msg: "已删除" })
  } catch (err) {
    console.error("[admin/notifications DELETE]", err)
    return res.status(500).json({ code: 500, msg: "删除失败" })
  }
})

/** GET /api/admin/parse-records?limit=200&offset=0&q= */
router.get("/parse-records", async (req, res) => {
  try {
    const data = await parseRecords.listRecordsForAdmin({
      limit: req.query.limit,
      offset: req.query.offset,
      q: req.query.q
    })
    return res.json({ code: 200, data })
  } catch (err) {
    console.error("[admin/parse-records]", err)
    return res.status(500).json({ code: 500, msg: "获取解析记录失败" })
  }
})

module.exports = router
