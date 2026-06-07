const { Readable } = require("node:stream")

const DEFAULT_REFERER = "https://www.douyin.com/"
const MAX_REDIRECTS = 5

function refererForUrl(url) {
  try {
    const host = new URL(url).hostname
    if (/douyin|douyinvod|iesdouyin/i.test(host)) return "https://www.douyin.com/"
    if (/kuaishou|kwai/i.test(host)) return "https://www.kuaishou.com/"
    if (/xiaohongshu|xhscdn/i.test(host)) return "https://www.xiaohongshu.com/"
    if (/bilibili|bilivideo/i.test(host)) return "https://www.bilibili.com/"
    if (/weibo/i.test(host)) return "https://weibo.com/"
  } catch {
    /* ignore */
  }
  return DEFAULT_REFERER
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

function assertSafeFetchUrl(raw) {
  const url = new URL(raw)
  if (!/^https?:$/i.test(url.protocol)) {
    throw new Error("unsupported media protocol")
  }
  const host = url.hostname.toLowerCase()
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    isPrivateIp(host)
  ) {
    throw new Error("unsafe video host")
  }
}

async function fetchVideoWithRedirects(url, headers) {
  let nextUrl = url
  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    assertSafeFetchUrl(nextUrl)
    const upstream = await fetch(nextUrl, {
      headers,
      redirect: "manual"
    })

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location")
      if (!location) return upstream
      nextUrl = new URL(location, nextUrl).toString()
      continue
    }

    return upstream
  }
  throw new Error("too many video redirects")
}

/**
 * 服务端拉取第三方视频并转发，避免浏览器 Referer/CORS 导致 <video> 无法播放
 */
async function proxyMediaStream(mediaUrl, res) {
  const url = String(mediaUrl || "").trim()
  if (!/^https?:\/\//i.test(url)) {
    res.status(400).json({ code: 400, msg: "无效的视频地址" })
    return
  }

  const upstream = await fetchVideoWithRedirects(url, {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Referer: refererForUrl(url),
    Accept: "video/*,image/*,audio/*,*/*;q=0.8"
  })

  if (!upstream.ok) {
    console.error("[videoProxy] upstream", upstream.status, url.slice(0, 120))
    res.status(502).json({ code: 502, msg: `视频源返回 ${upstream.status}` })
    return
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream"
  res.setHeader("Content-Type", contentType)
  res.setHeader("Cache-Control", "private, max-age=3600")
  const contentLength = upstream.headers.get("content-length")
  if (contentLength) res.setHeader("Content-Length", contentLength)

  if (!upstream.body) {
    res.status(502).json({ code: 502, msg: "视频源无响应体" })
    return
  }

  const stream = Readable.fromWeb(upstream.body)
  stream.on("error", (err) => {
    console.error("[videoProxy] stream", err.message)
    if (!res.headersSent) res.status(502).json({ code: 502, msg: "视频流传输失败" })
    else res.end()
  })
  stream.pipe(res)
}

module.exports = {
  proxyMediaStream,
  proxyVideoStream: proxyMediaStream
}
