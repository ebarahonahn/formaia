-- Conserva el estado de una rutina en curso tras recargar o reabrir la página.
USE formaia;

SET @has_timer_running := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workout_logs' AND COLUMN_NAME = 'timer_running'
);
SET @timer_running_sql := IF(@has_timer_running = 0,
  'ALTER TABLE workout_logs ADD COLUMN timer_running TINYINT(1) NOT NULL DEFAULT 0 AFTER duration_seconds',
  'SELECT 1'
);
PREPARE timer_running_statement FROM @timer_running_sql;
EXECUTE timer_running_statement;
DEALLOCATE PREPARE timer_running_statement;

SET @has_timer_updated_at := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workout_logs' AND COLUMN_NAME = 'timer_updated_at'
);
SET @timer_updated_at_sql := IF(@has_timer_updated_at = 0,
  'ALTER TABLE workout_logs ADD COLUMN timer_updated_at DATETIME NULL AFTER timer_running',
  'SELECT 1'
);
PREPARE timer_updated_at_statement FROM @timer_updated_at_sql;
EXECUTE timer_updated_at_statement;
DEALLOCATE PREPARE timer_updated_at_statement;
