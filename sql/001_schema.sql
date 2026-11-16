-- BeGet MySQL: панель → создать БД и пользователя (например mrpuffch_weapp),
-- затем выполнить этот скрипт в phpMyAdmin или scripts/setup-mysql-beget.py

CREATE TABLE IF NOT EXISTS questionnaire_submissions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  pair_code VARCHAR(12) NULL,
  pair_role ENUM('owner', 'partner') NULL,
  payload_json JSON NOT NULL,
  ip_hash CHAR(64) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at),
  INDEX idx_name (display_name),
  INDEX idx_pair_code (pair_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS couples (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invite_code VARCHAR(12) NOT NULL,
  owner_name VARCHAR(120) NULL,
  partner_name VARCHAR(120) NULL,
  owner_profile_json JSON NULL,
  partner_profile_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invite_code (invite_code),
  INDEX idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;