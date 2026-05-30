const https = require("https")

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let raw = ""
        res.on("data", (chunk) => {
          raw += chunk
        })
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw || "{}"))
          } catch (err) {
            reject(err)
          }
        })
      })
      .on("error", reject)
  })
}

/**
 * 用 wx.login 的 code 换取 openid
 * @see https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html
 */
async function code2Session(code) {
  const appid = process.env.WX_APPID
  const secret = process.env.WX_APPSECRET
  if (!appid || !secret) {
    throw new Error("未配置 WX_APPID / WX_APPSECRET")
  }

  const params = new URLSearchParams({
    appid,
    secret,
    js_code: code,
    grant_type: "authorization_code"
  })
  const url = `https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`
  const body = await getJson(url)

  if (body.errcode) {
    const err = new Error(body.errmsg || "微信登录失败")
    err.code = body.errcode
    throw err
  }
  if (!body.openid) {
    throw new Error("未获取到 openid")
  }
  return { openid: body.openid, sessionKey: body.session_key }
}

module.exports = { code2Session }
