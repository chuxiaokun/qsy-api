-- 解析记录表（在已有库 qsy 中执行）

USE qsy;

CREATE TABLE IF NOT EXISTS parse_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  openid VARCHAR(64) NOT NULL,
  source_url VARCHAR(1024) NOT NULL DEFAULT '',
  title VARCHAR(512) NOT NULL DEFAULT '',
  video_url VARCHAR(1024) NOT NULL DEFAULT '',
  images JSON,
  platform VARCHAR(32) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'success',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_openid_created (openid, created_at),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
