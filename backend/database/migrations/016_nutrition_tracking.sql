-- FormaIA: despensa y seguimiento diario de hidratación/adherencia.
CREATE TABLE IF NOT EXISTS user_pantry_items (
  user_id CHAR(36) NOT NULL,
  ingredient VARCHAR(160) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, ingredient),
  CONSTRAINT fk_pantry_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS nutrition_daily_logs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  logged_on DATE NOT NULL,
  water_glasses TINYINT UNSIGNED NOT NULL DEFAULT 0,
  adherence ENUM('Sí','Parcial','No') NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_nutrition_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_nutrition_user_date (user_id, logged_on)
) ENGINE=InnoDB;
