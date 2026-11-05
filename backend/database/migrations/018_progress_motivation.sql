-- Metas mensuales y preferencias de recordatorios por usuario.
CREATE TABLE IF NOT EXISTS monthly_goals (
  user_id CHAR(36) NOT NULL,
  month_key CHAR(7) NOT NULL,
  sessions_target TINYINT UNSIGNED NOT NULL DEFAULT 12,
  progress_target TINYINT UNSIGNED NOT NULL DEFAULT 4,
  weight_target_lb DECIMAL(5,1) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, month_key),
  CONSTRAINT fk_monthly_goal_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_reminder_settings (
  user_id CHAR(36) PRIMARY KEY,
  workout_enabled TINYINT(1) NOT NULL DEFAULT 0,
  workout_time CHAR(5) NOT NULL DEFAULT '07:00',
  meal_enabled TINYINT(1) NOT NULL DEFAULT 0,
  meal_time CHAR(5) NOT NULL DEFAULT '12:00',
  weighin_enabled TINYINT(1) NOT NULL DEFAULT 0,
  weighin_weekday TINYINT UNSIGNED NOT NULL DEFAULT 1,
  weighin_time CHAR(5) NOT NULL DEFAULT '07:00',
  browser_enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reminder_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
