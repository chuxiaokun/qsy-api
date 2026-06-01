const { getPool } = require("./db")

const VERSION_KEY = "mini_program_version"
const DEFAULT_VERSION = "1.0.0"
const VERSION_RE = /^\d+\.\d+\.\d+$/

function formatVersionLabel(version) {
  return `版本 ${version}`
}

function normalizeVersionInput(value) {
  const v = String(value || "").trim()
  if (!VERSION_RE.test(v)) {
    throw new Error("版本号格式无效，请使用 x.y.z（如 1.2.0）")
  }
  return v
}

async function getMiniProgramVersion() {
  const pool = getPool()
  const [rows] = await pool.query(
    `SELECT setting_value, updated_at FROM app_settings WHERE setting_key = ? LIMIT 1`,
    [VERSION_KEY]
  )
  const row = rows && rows[0]
  const version =
    row && VERSION_RE.test(String(row.setting_value || "").trim())
      ? String(row.setting_value).trim()
      : DEFAULT_VERSION
  return {
    version,
    label: formatVersionLabel(version),
    updatedAt: row && row.updated_at ? new Date(row.updated_at).toISOString() : null
  }
}

async function setMiniProgramVersion(value) {
  const version = normalizeVersionInput(value)
  const pool = getPool()
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [VERSION_KEY, version]
  )
  return getMiniProgramVersion()
}

module.exports = {
  DEFAULT_VERSION,
  formatVersionLabel,
  normalizeVersionInput,
  getMiniProgramVersion,
  setMiniProgramVersion
}
