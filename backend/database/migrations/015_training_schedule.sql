-- FormaIA: fecha opcional para mover una rutina dentro del ciclo actual.
-- La rutina conserva su contenido y su historial; solo cambia su próxima fecha programada.
SET @has_scheduled_on := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plan_workouts' AND COLUMN_NAME = 'scheduled_on'
);
SET @schedule_sql := IF(@has_scheduled_on = 0,
  'ALTER TABLE plan_workouts ADD COLUMN scheduled_on DATE NULL AFTER duration_minutes, ADD INDEX idx_plan_workout_schedule (scheduled_on)',
  'SELECT 1'
);
PREPARE schedule_statement FROM @schedule_sql;
EXECUTE schedule_statement;
DEALLOCATE PREPARE schedule_statement;
