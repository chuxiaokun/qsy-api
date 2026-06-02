const express = require("express")
const { requireAuth } = require("../middleware/auth")
const favorites = require("../favorites")

const router = express.Router()

router.use(requireAuth)

/** GET /api/user/favorites?limit=50&offset=0&q= */
router.get("/", async (req, res) => {
  try {
    const data = await favorites.listByOpenid(req.openid, {
      limit: req.query.limit,
      offset: req.query.offset,
      q: req.query.q
    })
    return res.json({ code: 200, data })
  } catch (err) {
    console.error("[favorites/list]", err)
    return res.status(500).json({ code: 500, msg: "获取收藏失败" })
  }
})

/** POST /api/user/favorites */
router.post("/", async (req, res) => {
  try {
    const item = await favorites.create(req.openid, req.body || {})
    return res.json({ code: 200, data: { favorite: item }, msg: "已收藏" })
  } catch (err) {
    const msg = err.message || "收藏失败"
    const status = /缺少|无效/.test(msg) ? 400 : 500
    if (status >= 500) console.error("[favorites/create]", err)
    return res.status(status).json({ code: status, msg })
  }
})

/** DELETE /api/user/favorites/:id */
router.delete("/:id", async (req, res) => {
  const id = String(req.params.id || "").trim()
  if (!id || !/^\d+$/.test(id)) {
    return res.status(400).json({ code: 400, msg: "无效的收藏 ID" })
  }
  try {
    const ok = await favorites.removeById(req.openid, id)
    if (!ok) return res.status(404).json({ code: 404, msg: "收藏不存在" })
    return res.json({ code: 200, data: { ok: true } })
  } catch (err) {
    console.error("[favorites/delete]", err)
    return res.status(500).json({ code: 500, msg: "取消收藏失败" })
  }
})

module.exports = router

