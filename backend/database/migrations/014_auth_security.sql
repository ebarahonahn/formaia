-- Seguridad de cuentas: ejecutar una sola vez en MySQL 8+.
ALTER TABLE users
  ADD COLUMN email_verified_at DATETIME NULL AFTER password_hash,
  ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user' AFTER email_verified_at,
  ADD INDEX idx_users_role (role);

CREATE TABLE auth_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NULL,
  CONSTRAINT fk_auth_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_auth_session_active (user_id, expires_at, revoked_at)
) ENGINE=InnoDB;

CREATE TABLE auth_action_tokens (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  purpose ENUM('verify_email','password_reset') NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auth_action_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_auth_action_lookup (purpose, token_hash, expires_at, used_at)
) ENGINE=InnoDB;

-- Después de crear tu propia cuenta, asígnate el rol administrador sustituyendo el correo:
-- UPDATE users SET role='admin' WHERE email='tu-correo@ejemplo.com';
