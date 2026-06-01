-- 小程序全局配置（在已有库上执行）

USE qsy;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value VARCHAR(512) NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO app_settings (setting_key, setting_value)
VALUES ('mini_program_version', '1.0.0')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
