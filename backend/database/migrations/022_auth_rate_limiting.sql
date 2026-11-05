-- Rate limiting persistente para inicio de sesión. Ejecutar una vez en MySQL 8+.
-- Los valores se pueden ajustar sin reiniciar el backend.

CREATE TABLE IF NOT EXISTS auth_rate_limit_settings (
  scope ENUM('login_ip','login_email') PRIMARY KEY,
  max_attempts SMALLINT UNSIGNED NOT NULL,
  window_seconds INT UNSIGNED NOT NULL,
  cooldown_seconds INT UNSIGNED NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_auth_rate_limit_attempts CHECK (max_attempts >= 1),
  CONSTRAINT chk_auth_rate_limit_window CHECK (window_seconds >= 1),
  CONSTRAINT chk_auth_rate_limit_cooldown CHECK (cooldown_seconds >= 1)
) ENGINE=InnoDB;

INSERT INTO auth_rate_limit_settings (scope,max_attempts,window_seconds,cooldown_seconds,is_enabled) VALUES
  ('login_ip',10,900,900,1),
  ('login_email',5,900,900,1)
ON DUPLICATE KEY UPDATE scope=VALUES(scope);

-- Se almacenan hashes de IP/correo, nunca los valores originales.
CREATE TABLE IF NOT EXISTS auth_login_rate_counters (
  scope ENUM('login_ip','login_email') NOT NULL,
  subject_hash CHAR(64) NOT NULL,
  failure_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  window_started_at DATETIME(3) NOT NULL,
  locked_until DATETIME(3) NULL,
  last_attempt_at DATETIME(3) NOT NULL,
  PRIMARY KEY (scope,subject_hash),
  INDEX idx_auth_login_rate_lock (locked_until),
  CONSTRAINT chk_auth_login_rate_failures CHECK (failure_count >= 0)
) ENGINE=InnoDB;

-- Valores iniciales: 10 intentos por IP y 5 por correo; ventana y espera de 15 minutos.
-- Ejemplo de ajuste: UPDATE auth_rate_limit_settings SET max_attempts=3, cooldown_seconds=1800 WHERE scope='login_email';
