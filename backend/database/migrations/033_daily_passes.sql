-- Pase diario por sucursal. El cobro se guarda en payments y el pase controla
-- únicamente el acceso físico de la fecha indicada.
CREATE TABLE IF NOT EXISTS daily_passes (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  branch_id CHAR(36) NOT NULL,
  payment_id CHAR(36) NULL,
  valid_on DATE NOT NULL,
  amount_hnl DECIMAL(10,2) NOT NULL,
  status ENUM('active','void','refunded') NOT NULL DEFAULT 'active',
  registered_by_user_id CHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_daily_pass_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_daily_pass_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_daily_pass_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_daily_pass_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  CONSTRAINT fk_daily_pass_registered_by FOREIGN KEY (registered_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_daily_pass_amount CHECK (amount_hnl > 0),
  UNIQUE KEY uq_daily_pass_user_branch_date_status (user_id, branch_id, valid_on, status),
  INDEX idx_daily_pass_branch_date (branch_id, valid_on, status),
  INDEX idx_daily_pass_user_date (user_id, valid_on, status)
) ENGINE=InnoDB;
