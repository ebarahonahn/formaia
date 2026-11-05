-- Base para membresías, cobros y control de acceso a la app y a sucursales.
-- Esta migración no crea membresías automáticamente: los cobros y la asignación
-- operativa se incorporarán en la siguiente fase.

CREATE TABLE IF NOT EXISTS membership_plans (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  duration_days SMALLINT UNSIGNED NOT NULL,
  price_hnl DECIMAL(10,2) NOT NULL,
  branch_access_policy ENUM('all_branches','selected_branches') NOT NULL DEFAULT 'all_branches',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  CONSTRAINT fk_membership_plan_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT chk_membership_plan_duration CHECK (duration_days >= 1),
  CONSTRAINT chk_membership_plan_price CHECK (price_hnl >= 0),
  UNIQUE KEY uq_membership_plan_organization_code (organization_id, code),
  INDEX idx_membership_plan_available (organization_id, is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS membership_plan_branches (
  membership_plan_id CHAR(36) NOT NULL,
  branch_id CHAR(36) NOT NULL,
  created_at DATETIME NULL,
  PRIMARY KEY (membership_plan_id, branch_id),
  CONSTRAINT fk_membership_plan_branch_plan FOREIGN KEY (membership_plan_id) REFERENCES membership_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_membership_plan_branch_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS memberships (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  membership_plan_id CHAR(36) NOT NULL,
  status ENUM('pending','active','paused','expired','suspended','cancelled') NOT NULL DEFAULT 'pending',
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  grace_ends_on DATE NULL,
  activated_at DATETIME NULL,
  suspended_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  cancellation_reason VARCHAR(280) NULL,
  created_by_user_id CHAR(36) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_plan FOREIGN KEY (membership_plan_id) REFERENCES membership_plans(id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_membership_dates CHECK (ends_on >= starts_on),
  CONSTRAINT chk_membership_grace CHECK (grace_ends_on IS NULL OR grace_ends_on >= ends_on),
  INDEX idx_membership_user_status_dates (user_id, status, starts_on, ends_on),
  INDEX idx_membership_plan_status (membership_plan_id, status, ends_on)
) ENGINE=InnoDB;

-- Permite sobrescribir el alcance de una membresía concreta, por ejemplo,
-- cuando se concede acceso a una sede adicional sin cambiar el plan.
CREATE TABLE IF NOT EXISTS membership_branch_access (
  membership_id CHAR(36) NOT NULL,
  branch_id CHAR(36) NOT NULL,
  granted_by_user_id CHAR(36) NULL,
  created_at DATETIME NULL,
  PRIMARY KEY (membership_id, branch_id),
  CONSTRAINT fk_membership_branch_access_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
  CONSTRAINT fk_membership_branch_access_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_membership_branch_access_granted_by FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_membership_branch_access_branch (branch_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_branch_assignments (
  user_id CHAR(36) NOT NULL,
  branch_id CHAR(36) NOT NULL,
  assignment_role ENUM('manager','front_desk') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  assigned_at DATETIME NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (user_id, branch_id),
  CONSTRAINT fk_staff_branch_assignment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_branch_assignment_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  INDEX idx_staff_branch_assignment_lookup (branch_id, assignment_role, is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  membership_id CHAR(36) NULL,
  branch_id CHAR(36) NULL,
  amount_hnl DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'HNL',
  method ENUM('cash','bank_transfer','card','pos','online','adjustment') NOT NULL,
  status ENUM('pending','verified','rejected','refunded','void') NOT NULL DEFAULT 'pending',
  reference VARCHAR(120) NULL,
  receipt_number VARCHAR(60) NULL,
  proof_url VARCHAR(300) NULL,
  received_at DATETIME NULL,
  verified_at DATETIME NULL,
  registered_by_user_id CHAR(36) NULL,
  verified_by_user_id CHAR(36) NULL,
  notes VARCHAR(500) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payment_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payment_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE SET NULL,
  CONSTRAINT fk_payment_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_payment_registered_by FOREIGN KEY (registered_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_payment_verified_by FOREIGN KEY (verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_payment_amount CHECK (amount_hnl >= 0),
  CONSTRAINT chk_payment_currency CHECK (currency = 'HNL'),
  UNIQUE KEY uq_payment_receipt (organization_id, receipt_number),
  INDEX idx_payment_user_created (user_id, created_at),
  INDEX idx_payment_membership_status (membership_id, status),
  INDEX idx_payment_organization_status (organization_id, status, received_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS access_events (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  membership_id CHAR(36) NULL,
  branch_id CHAR(36) NULL,
  access_scope ENUM('app','branch') NOT NULL,
  channel ENUM('app','reception','qr','api') NOT NULL,
  result ENUM('allowed','denied') NOT NULL,
  reason VARCHAR(80) NOT NULL,
  actor_user_id CHAR(36) NULL,
  device_label VARCHAR(120) NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_access_event_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_access_event_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE SET NULL,
  CONSTRAINT fk_access_event_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_access_event_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_access_event_user_created (user_id, created_at),
  INDEX idx_access_event_branch_created (branch_id, created_at),
  INDEX idx_access_event_result_created (result, created_at)
) ENGINE=InnoDB;
