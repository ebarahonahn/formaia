-- Preferencia nutricional: calorías objetivo para la generación del menú semanal.
USE formaia;

SET @has_target_calories := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_profiles'
    AND COLUMN_NAME = 'target_calories'
);
SET @sql := IF(
  @has_target_calories = 0,
  'ALTER TABLE user_profiles ADD COLUMN target_calories SMALLINT UNSIGNED NULL AFTER foods_to_avoid',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
