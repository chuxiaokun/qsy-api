-- 已有库升级：在宝塔 phpMyAdmin 或 SQL 窗口执行（USE 你的库名后运行）

CREATE TABLE IF NOT EXISTS email_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  openid VARCHAR(64) NOT NULL,
  email VARCHAR(128) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_openid_email (openid, email),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
