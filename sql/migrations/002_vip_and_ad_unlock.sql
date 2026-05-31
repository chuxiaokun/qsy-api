-- VIP 与每日广告解锁（在已有库上执行）

USE qsy;

ALTER TABLE users
  ADD COLUMN vip_expire_at DATETIME NULL DEFAULT NULL AFTER email_verified;

CREATE TABLE IF NOT EXISTS ad_daily_unlocks (
  user_id BIGINT UNSIGNED NOT NULL,
  unlock_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, unlock_date),
  CONSTRAINT fk_ad_unlock_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
