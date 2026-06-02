const express = require("express")
const { optionalAuth } = require("../middleware/optionalAuth")
const feedback = require("../feedback")

const router = express.Router()

/** POST /api/feedback — 匿名可提交；若带 token 则关联用户 openid */
router.post("/", optionalAuth, async (req, res) => {
  try {
    const body = req.body || {}
    const item = await feedback.create({
      openid: req.openid || "",
      contact: body.contact,
      content: body.content,
      page: body.page,
      systemInfo: body.systemInfo || body.system_info
    })
    return res.json({ code: 200, data: { feedback: item }, msg: "已提交" })
  } catch (err) {
    const msg = err.message || "提交失败"
    const status = /请填写|过长/.test(msg) ? 400 : 500
    if (status >= 500) console.error("[feedback/create]", err)
    return res.status(status).json({ code: status, msg })
  }
})

module.exports = router

