const express = require("express")
const appSettings = require("../appSettings")

const router = express.Router()

/** GET /api/app/version — 小程序展示用版本号 */
router.get("/version", async (_req, res) => {
  try {
    const data = await appSettings.getMiniProgramVersion()
    return res.json({
      code: 200,
      data: { version: data.version, label: data.label }
    })
  } catch (err) {
    console.error("[app/version]", err)
    return res.status(500).json({ code: 500, msg: "获取版本失败" })
  }
})

module.exports = router
