-- Datos adicionales para personalizar planes. Los datos físicos son opcionales
-- para usuarios existentes, pero se solicitarán al crear o actualizar un plan.
USE formaia;

SET @has_age := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'age');
SET @sql := IF(@has_age = 0, 'ALTER TABLE user_profiles ADD COLUMN age SMALLINT UNSIGNED NULL AFTER foods_to_avoid', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_height := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'height_cm');
SET @sql := IF(@has_height = 0, 'ALTER TABLE user_profiles ADD COLUMN height_cm DECIMAL(5,1) NULL AFTER age', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_weight := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'weight_lb');
SET @sql := IF(@has_weight = 0, 'ALTER TABLE user_profiles ADD COLUMN weight_lb DECIMAL(5,1) NULL AFTER height_cm', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_sex := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'sex_for_calculation');
SET @sql := IF(@has_sex = 0, "ALTER TABLE user_profiles ADD COLUMN sex_for_calculation ENUM('Mujer','Hombre','Prefiero no decir') NULL AFTER weight_lb", 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_activity := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'activity_level');
SET @sql := IF(@has_activity = 0, "ALTER TABLE user_profiles ADD COLUMN activity_level ENUM('Sedentaria','Ligera','Moderada','Alta') NOT NULL DEFAULT 'Moderada' AFTER sex_for_calculation", 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_equipment := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'equipment_access');
SET @sql := IF(@has_equipment = 0, "ALTER TABLE user_profiles ADD COLUMN equipment_access ENUM('Sin equipo','Bandas o mancuernas','Gimnasio completo') NOT NULL DEFAULT 'Gimnasio completo' AFTER activity_level", 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_limitations := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'limitations');
SET @sql := IF(@has_limitations = 0, 'ALTER TABLE user_profiles ADD COLUMN limitations TEXT NULL AFTER equipment_access', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
