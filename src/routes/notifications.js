const express = require("express")
const notifications = require("../notifications")

const router = express.Router()

/** GET /api/notifications/active — 小程序拉取当前有效通知 */
router.get("/active", async (_req, res) => {
  try {
    const items = await notifications.listActive()
    return res.json({ code: 200, data: { notifications: items } })
  } catch (err) {
    console.error("[notifications/active]", err)
    return res.status(500).json({ code: 500, msg: "获取通知失败" })
  }
})

module.exports = router
