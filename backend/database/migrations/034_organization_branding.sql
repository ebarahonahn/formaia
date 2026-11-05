-- Marca comercial del gimnasio. El logo se conserva como Base64 en MySQL.
USE formaia;

SET @has_logo_base64 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organizations' AND COLUMN_NAME = 'logo_base64'
);
SET @sql := IF(@has_logo_base64 = 0,
  'ALTER TABLE organizations ADD COLUMN logo_base64 MEDIUMTEXT NULL AFTER name',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_logo_mime_type := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organizations' AND COLUMN_NAME = 'logo_mime_type'
);
SET @sql := IF(@has_logo_mime_type = 0,
  'ALTER TABLE organizations ADD COLUMN logo_mime_type VARCHAR(30) NULL AFTER logo_base64',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
