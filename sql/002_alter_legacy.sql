-- Если questionnaire_submissions уже была без pair_code (старый 001_schema.sql)

SET @has_pair := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'questionnaire_submissions'
    AND COLUMN_NAME = 'pair_code'
);

SET @sql := IF(
  @has_pair = 0,
  'ALTER TABLE questionnaire_submissions
     ADD COLUMN pair_code VARCHAR(12) NULL AFTER display_name,
     ADD COLUMN pair_role ENUM(''owner'', ''partner'') NULL AFTER pair_code,
     ADD INDEX idx_pair_code (pair_code)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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