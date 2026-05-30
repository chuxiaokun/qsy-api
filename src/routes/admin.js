const express = require("express")
const jwt = require("jsonwebtoken")
const { requireAdmin } = require("../middleware/requireAdmin")
const { listUsers, getAdminStats, withPublicAvatarUrl } = require("../users")
const { getPublicBaseUrl } = require("../publicBaseUrl")

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

/** GET /api/admin/users?limit=200 */
router.get("/users", async (req, res) => {
  try {
    const base = getPublicBaseUrl(req)
    const users = (await listUsers(req.query.limit)).map((u) => {
      const patched = withPublicAvatarUrl(base, { avatarUrl: u.avatarUrl })
      return { ...u, avatarUrl: patched.avatarUrl }
    })
    return res.json({ code: 200, data: { users, total: users.length } })
  } catch (err) {
    console.error("[admin/users]", err)
    return res.status(500).json({ code: 500, msg: "获取用户列表失败" })
  }
})

/** GET /api/admin/stats */
router.get("/stats", async (req, res) => {
  try {
    const stats = await getAdminStats()
    return res.json({
      code: 200,
      data: {
        totalUsers: stats.totalUsers,
        todayNewUsers: stats.todayNewUsers,
        todayParses: 0,
        successRate: 0,
        activePlatforms: 6
      }
    })
  } catch (err) {
    console.error("[admin/stats]", err)
    return res.status(500).json({ code: 500, msg: "获取统计失败" })
  }
})

module.exports = router
