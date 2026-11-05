USE formaia;
SET @has_completed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plan_meals' AND COLUMN_NAME='completed_at');
SET @completed_sql := IF(@has_completed=0, 'ALTER TABLE plan_meals ADD COLUMN completed_at DATETIME NULL AFTER recipe', 'SELECT 1');
PREPARE completed_statement FROM @completed_sql; EXECUTE completed_statement; DEALLOCATE PREPARE completed_statement;
