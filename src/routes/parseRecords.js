const express = require("express")
const { requireAuth } = require("../middleware/auth")
const parseRecords = require("../parseRecords")

const router = express.Router()

router.use(requireAuth)

/** GET /api/user/parse-records/count */
router.get("/count", async (req, res) => {
  try {
    const count = await parseRecords.countRecordsByOpenid(req.openid)
    return res.json({ code: 200, data: { count } })
  } catch (err) {
    console.error("[parse-records/count]", err)
    return res.status(500).json({ code: 500, msg: "获取解析次数失败" })
  }
})

/** GET /api/user/parse-records?limit=50 */
router.get("/", async (req, res) => {
  try {
    const records = await parseRecords.listRecordsByOpenid(req.openid, req.query.limit)
    return res.json({ code: 200, data: { records, total: records.length } })
  } catch (err) {
    console.error("[parse-records/list]", err)
    return res.status(500).json({ code: 500, msg: "获取解析记录失败" })
  }
})

/** GET /api/user/parse-records/:id */
router.get("/:id", async (req, res) => {
  try {
    const record = await parseRecords.getRecordById(req.params.id, req.openid)
    if (!record) {
      return res.status(404).json({ code: 404, msg: "记录不存在" })
    }
    return res.json({ code: 200, data: { record } })
  } catch (err) {
    console.error("[parse-records/get]", err)
    return res.status(500).json({ code: 500, msg: "获取记录失败" })
  }
})

/** POST /api/user/parse-records */
router.post("/", async (req, res) => {
  try {
    const record = await parseRecords.createRecord(req.openid, req.body || {})
    return res.json({ code: 200, data: { record } })
  } catch (err) {
    console.error("[parse-records/create]", err)
    return res.status(400).json({ code: 400, msg: err.message || "保存记录失败" })
  }
})

/** DELETE /api/user/parse-records（清空全部，须在 /:id 之前注册） */
router.delete("/", async (req, res) => {
  try {
    const deleted = await parseRecords.clearRecordsByOpenid(req.openid)
    return res.json({ code: 200, data: { deleted } })
  } catch (err) {
    console.error("[parse-records/clear]", err)
    return res.status(500).json({ code: 500, msg: "清空记录失败" })
  }
})

/** DELETE /api/user/parse-records/:id */
router.delete("/:id", async (req, res) => {
  try {
    const ok = await parseRecords.deleteRecordById(req.params.id, req.openid)
    if (!ok) {
      return res.status(404).json({ code: 404, msg: "记录不存在" })
    }
    return res.json({ code: 200, data: { ok: true } })
  } catch (err) {
    console.error("[parse-records/delete]", err)
    return res.status(500).json({ code: 500, msg: "删除记录失败" })
  }
})

module.exports = router
