const nodemailer = require("nodemailer")

let transporter

function mailConfigured() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  )
}

function getTransporter() {
  if (!mailConfigured()) {
    throw new Error("未配置 SMTP，请在 .env 中填写 SMTP_HOST / SMTP_USER / SMTP_PASS")
  }
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465)
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE !== "false" && port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })
  }
  return transporter
}

async function sendVerifyCode(to, code) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER
  await getTransporter().sendMail({
    from,
    to,
    subject: "【KUNKIT】邮箱验证码",
    text: `您的验证码是 ${code}，5 分钟内有效，请勿泄露给他人。`,
    html: `<p>您的验证码是 <b style="font-size:20px;letter-spacing:2px">${code}</b>，5 分钟内有效，请勿泄露给他人。</p><p style="color:#888;font-size:12px">如非本人操作，请忽略此邮件。</p>`
  })
}

module.exports = { mailConfigured, sendVerifyCode }
