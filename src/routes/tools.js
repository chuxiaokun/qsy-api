const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const express = require("express")
const multer = require("multer")
const { spawn } = require("child_process")
const { getPublicBaseUrl } = require("../publicBaseUrl")
const { proxyMediaStream } = require("../videoProxy")

const router = express.Router()

const UPLOAD_DIR = path.join(__dirname, "../../uploads")
const TEMP_DIR = path.join(UPLOAD_DIR, "tmp")
const GIF_DIR = path.join(UPLOAD_DIR, "gifs")
const MAX_VIDEO_BYTES = 30 * 1024 * 1024

for (const dir of [UPLOAD_DIR, TEMP_DIR, GIF_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TEMP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".mp4"
    cb(null, `${Date.now()}_${crypto.randomUUID()}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_BYTES },
  fileFilter: (_req, file, cb) => {
    if ((file.mimetype || "").startsWith("video/")) {
      cb(null, true)
      return
    }
    cb(new Error("仅支持视频文件"))
  }
})

function runFfmpeg(inputPath, outputPath, { durationSec, fps }) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-ss",
      "0",
      "-t",
      String(durationSec),
      "-i",
      inputPath,
      "-vf",
      // 处理部分视频的非方形像素（SAR != 1:1），避免转 GIF 后出现上下黑边/比例异常
      `fps=${fps},scale=iw*sar:ih,setsar=1`,
      "-loop",
      "0",
      outputPath
    ]
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""
    proc.stderr.on("data", (buf) => {
      stderr += String(buf || "")
    })
    proc.on("error", (err) => reject(err))
    proc.on("close", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr || `ffmpeg exited with code ${code}`))
    })
  })
}

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function isPrivateIp(hostname) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    const parts = hostname.split(".").map((part) => Number(part))
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    )
  }
  return false
}

function isSafePublicMediaUrl(raw) {
  try {
    const url = new URL(String(raw || "").trim())
    if (!/^https?:$/i.test(url.protocol)) return false
    const hostname = url.hostname.toLowerCase()
    return (
      hostname !== "localhost" &&
      !hostname.endsWith(".localhost") &&
      !hostname.endsWith(".local") &&
      !isPrivateIp(hostname)
    )
  } catch {
    return false
  }
}

/**
 * GET /api/tools/media-download?url=<encoded media url>
 * Streams third-party media through this API domain, so wx.downloadFile only
 * needs to whitelist the API domain instead of every redirected CDN host.
 */
async function handleMediaDownload(req, res) {
  const mediaUrl = String((req.query && req.query.url) || "").trim()
  if (!isSafePublicMediaUrl(mediaUrl)) {
    return res.status(400).json({ code: 400, msg: "invalid media url" })
  }

  try {
    await proxyMediaStream(mediaUrl, res)
  } catch (err) {
    console.error("[tools/media-download]", err)
    if (!res.headersSent) {
      res.status(500).json({ code: 500, msg: "media proxy failed" })
    }
  }
}

router.get("/media-download", handleMediaDownload)
router.get("/video-download", handleMediaDownload)

/**
 * POST /api/tools/video-to-gif
 * multipart: video (file), durationSec?, fps?
 */
router.post("/video-to-gif", (req, res, next) => {
  upload.single("video")(req, res, (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE" ? "视频不能超过 30MB" : err.message || "上传失败"
      return res.status(400).json({ code: 400, msg })
    }
    next()
  })
}, async (req, res) => {
  if (!req.file || !req.file.path) {
    return res.status(400).json({ code: 400, msg: "请上传视频文件" })
  }

  const inputPath = req.file.path
  const outputFilename = `${Date.now()}_${crypto.randomUUID()}.gif`
  const outputPath = path.join(GIF_DIR, outputFilename)
  const durationSec = clampInt(req.body && req.body.durationSec, 1, 6, 3)
  const fps = clampInt(req.body && req.body.fps, 4, 12, 8)

  try {
    await runFfmpeg(inputPath, outputPath, { durationSec, fps })
    const stat = fs.statSync(outputPath)
    const urlPath = `/uploads/gifs/${outputFilename}`
    return res.json({
      code: 200,
      data: {
        gifUrl: `${getPublicBaseUrl(req)}${urlPath}`,
        path: urlPath,
        size: stat.size
      }
    })
  } catch (err) {
    console.error("[tools/video-to-gif]", {
      message: err && err.message,
      stack: err && err.stack,
      code: err && err.code,
      name: err && err.name
    })
    return res.status(500).json({
      code: 500,
      msg: "视频转 GIF 失败，请稍后重试"
    })
  } finally {
    if (fs.existsSync(inputPath)) {
      try {
        fs.unlinkSync(inputPath)
      } catch (e) {}
    }
  }
})

module.exports = router
