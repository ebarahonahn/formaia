-- Guarda la explicación y reglas aplicadas a cada nuevo ciclo de plan.
USE formaia;

-- Compatible tanto con una base existente como con schema.sql actualizado.
SET @has_adjustment := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plans' AND COLUMN_NAME = 'adjustment'
);
SET @adjustment_sql := IF(
  @has_adjustment = 0,
  'ALTER TABLE plans ADD COLUMN adjustment JSON NULL AFTER motivational_message',
  'SELECT 1'
);
PREPARE adjustment_statement FROM @adjustment_sql;
EXECUTE adjustment_statement;
DEALLOCATE PREPARE adjustment_statement;
