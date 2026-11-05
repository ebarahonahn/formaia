-- Semana 5: sesiones reales de entrenamiento y detalle por serie.
USE formaia;

SET @has_started_at := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workout_logs' AND COLUMN_NAME = 'started_at'
);
SET @started_at_sql := IF(@has_started_at = 0,
  'ALTER TABLE workout_logs ADD COLUMN started_at DATETIME NULL AFTER completed_on',
  'SELECT 1'
);
PREPARE started_at_statement FROM @started_at_sql;
EXECUTE started_at_statement;
DEALLOCATE PREPARE started_at_statement;

SET @has_duration := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workout_logs' AND COLUMN_NAME = 'duration_seconds'
);
SET @duration_sql := IF(@has_duration = 0,
  'ALTER TABLE workout_logs ADD COLUMN duration_seconds INT UNSIGNED NULL AFTER completed_at',
  'SELECT 1'
);
PREPARE duration_statement FROM @duration_sql;
EXECUTE duration_statement;
DEALLOCATE PREPARE duration_statement;

-- Las rutinas antiguas mantienen su fecha; las nuevas se completan explícitamente.
ALTER TABLE workout_logs MODIFY COLUMN completed_at DATETIME NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS workout_set_logs (
  id CHAR(36) PRIMARY KEY,
  workout_log_id CHAR(36) NOT NULL,
  exercise_index SMALLINT UNSIGNED NOT NULL,
  set_number SMALLINT UNSIGNED NOT NULL,
  weight_lb DECIMAL(6,1) NULL,
  repetitions SMALLINT UNSIGNED NULL,
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_set_log_workout_log FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id) ON DELETE CASCADE,
  UNIQUE KEY uq_workout_exercise_set (workout_log_id, exercise_index, set_number),
  INDEX idx_set_log_workout (workout_log_id)
) ENGINE=InnoDB;
