-- QR dinámicos, de corta duración y de un solo uso para el acceso físico.
-- Solo se persiste el hash del secreto; el contenido escaneado no identifica al cliente.

CREATE TABLE IF NOT EXISTS membership_qr_tokens (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_membership_qr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_membership_qr_token_hash (token_hash),
  INDEX idx_membership_qr_user_active (user_id, expires_at, used_at),
  INDEX idx_membership_qr_expiry (expires_at)
) ENGINE=InnoDB;
