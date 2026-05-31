const { Readable } = require("node:stream")

const DEFAULT_REFERER = "https://www.douyin.com/"

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

/**
 * 服务端拉取第三方视频并转发，避免浏览器 Referer/CORS 导致 <video> 无法播放
 */
async function proxyVideoStream(videoUrl, res) {
  const url = String(videoUrl || "").trim()
  if (!/^https?:\/\//i.test(url)) {
    res.status(400).json({ code: 400, msg: "无效的视频地址" })
    return
  }

  const upstream = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Referer: refererForUrl(url),
      Accept: "video/*,*/*;q=0.8"
    },
    redirect: "follow"
  })

  if (!upstream.ok) {
    console.error("[videoProxy] upstream", upstream.status, url.slice(0, 120))
    res.status(502).json({ code: 502, msg: `视频源返回 ${upstream.status}` })
    return
  }

  const contentType = upstream.headers.get("content-type") || "video/mp4"
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

module.exports = { proxyVideoStream }
