-- Registros corporales y fotos: los archivos quedan en backend/uploads; MySQL guarda solo la ruta.
USE formaia;

SET @has_measurements := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'progress_logs' AND COLUMN_NAME = 'measurements');
SET @measurements_sql := IF(@has_measurements = 0, 'ALTER TABLE progress_logs ADD COLUMN measurements JSON NULL AFTER note', 'SELECT 1');
PREPARE measurements_statement FROM @measurements_sql; EXECUTE measurements_statement; DEALLOCATE PREPARE measurements_statement;

CREATE TABLE IF NOT EXISTS progress_photos (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  progress_log_id CHAR(36) NOT NULL,
  file_url VARCHAR(300) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_photo_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_photo_progress FOREIGN KEY (progress_log_id) REFERENCES progress_logs(id) ON DELETE CASCADE,
  INDEX idx_photo_progress (progress_log_id)
) ENGINE=InnoDB;
