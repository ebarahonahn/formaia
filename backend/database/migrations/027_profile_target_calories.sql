-- Convierte el mínimo anterior en una meta diaria explícita.
USE formaia;

SET @has_target_calories := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'target_calories'
);
SET @has_minimum_calories := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'minimum_calories'
);
SET @sql := IF(
  @has_target_calories = 0 AND @has_minimum_calories = 1,
  'ALTER TABLE user_profiles CHANGE COLUMN minimum_calories target_calories SMALLINT UNSIGNED NULL',
  IF(@has_target_calories = 0, 'ALTER TABLE user_profiles ADD COLUMN target_calories SMALLINT UNSIGNED NULL AFTER foods_to_avoid', 'SELECT 1')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
