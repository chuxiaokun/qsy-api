USE qsy;

CREATE TABLE IF NOT EXISTS user_favorites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  openid VARCHAR(64) NOT NULL,
  source_url VARCHAR(512) NOT NULL DEFAULT '',
  title VARCHAR(512) NOT NULL DEFAULT '',
  video_url VARCHAR(1024) NOT NULL DEFAULT '',
  images JSON,
  platform VARCHAR(32) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_openid_source (openid, source_url),
  INDEX idx_openid_created (openid, created_at),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_notification_reads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  openid VARCHAR(64) NOT NULL,
  notification_id BIGINT UNSIGNED NOT NULL,
  read_at DATETIME NOT NULL,
  UNIQUE KEY uk_openid_notification (openid, notification_id),
  INDEX idx_notification (notification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_feedbacks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  openid VARCHAR(64) NOT NULL DEFAULT '',
  contact VARCHAR(128) NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  page VARCHAR(128) NOT NULL DEFAULT '',
  system_info VARCHAR(2000) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'new',
  reply TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at),
  INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

