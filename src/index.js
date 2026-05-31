require("dotenv").config()

const path = require("path")
const express = require("express")
const loginRouter = require("./routes/login")
const adminRouter = require("./routes/admin")
const userRouter = require("./routes/user")

const app = express()
const port = Number(process.env.PORT || 3000)

app.set("trust proxy", 1)
app.use(express.json({ limit: "1mb" }))
app.use("/uploads", express.static(path.join(__dirname, "../uploads")))

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    features: ["login", "admin", "user-profile", "email-bind"],
    adminConfigured: !!process.env.ADMIN_API_KEY,
    mailConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  })
})

app.use("/api/login", loginRouter)
app.use("/api/user", userRouter)
app.use("/api/admin", adminRouter)

app.use((_req, res) => {
  res.status(404).json({ code: 404, msg: "接口不存在" })
})

app.use((err, _req, res, _next) => {
  console.error("[error]", err)
  res.status(500).json({ code: 500, msg: "服务器错误" })
})

app.listen(port, () => {
  console.log(`xiaoe-api listening on http://127.0.0.1:${port}`)
})
