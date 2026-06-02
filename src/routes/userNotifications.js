const express = require("express")
const { requireAuth } = require("../middleware/auth")
const reads = require("../notificationReads")

const router = express.Router()

router.use(requireAuth)

/** GET /api/user/notifications/active — 带已读状态 */
router.get("/active", async (req, res) => {
  try {
    const data = await reads.listActiveWithRead(req.openid)
    return res.json({ code: 200, data })
  } catch (err) {
    console.error("[user/notifications/active]", err)
    return res.status(500).json({ code: 500, msg: "获取通知失败" })
  }
})

/** POST /api/user/notifications/:id/read */
router.post("/:id/read", async (req, res) => {
  try {
    await reads.markRead(req.openid, req.params.id)
    return res.json({ code: 200, data: { ok: true } })
  } catch (err) {
    const msg = err.message || "标记已读失败"
    const status = /无效/.test(msg) ? 400 : 500
    if (status >= 500) console.error("[user/notifications/read]", err)
    return res.status(status).json({ code: status, msg })
  }
})

module.exports = router

