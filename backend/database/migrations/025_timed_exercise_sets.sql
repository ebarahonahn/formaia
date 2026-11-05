-- Guarda por separado el tiempo logrado en ejercicios estáticos, por ejemplo planchas.
-- Ejecutar una vez después de 024_meal_completion_logs.sql con un usuario administrador.
USE formaia;

SET @has_duration_seconds := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'workout_set_logs'
    AND COLUMN_NAME = 'duration_seconds'
);
SET @duration_seconds_sql := IF(
  @has_duration_seconds = 0,
  'ALTER TABLE workout_set_logs ADD COLUMN duration_seconds SMALLINT UNSIGNED NULL AFTER repetitions',
  'SELECT 1'
);
PREPARE duration_seconds_statement FROM @duration_seconds_sql;
EXECUTE duration_seconds_statement;
DEALLOCATE PREPARE duration_seconds_statement;
