-- Base de sucursales y disponibilidad de ejercicios por sede.
USE formaia;

CREATE TABLE IF NOT EXISTS organizations (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS branches (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(40) NOT NULL,
  address VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  CONSTRAINT fk_branch_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_branch_organization_code (organization_id, code),
  INDEX idx_branch_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS equipment_catalog (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS branch_equipment (
  id CHAR(36) PRIMARY KEY,
  branch_id CHAR(36) NOT NULL,
  equipment_id VARCHAR(80) NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  operational_status ENUM('available','maintenance','unavailable') NOT NULL DEFAULT 'available',
  zone VARCHAR(100) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  CONSTRAINT fk_branch_equipment_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_branch_equipment_catalog FOREIGN KEY (equipment_id) REFERENCES equipment_catalog(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_branch_equipment (branch_id, equipment_id, zone),
  INDEX idx_branch_equipment_available (branch_id, operational_status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exercise_equipment_requirements (
  exercise_id VARCHAR(80) NOT NULL,
  equipment_id VARCHAR(80) NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (exercise_id, equipment_id),
  CONSTRAINT fk_exercise_requirement_exercise FOREIGN KEY (exercise_id) REFERENCES exercise_catalog(id) ON DELETE CASCADE,
  CONSTRAINT fk_exercise_requirement_equipment FOREIGN KEY (equipment_id) REFERENCES equipment_catalog(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS branch_exercise_availability (
  branch_id CHAR(36) NOT NULL,
  exercise_id VARCHAR(80) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  local_prescription VARCHAR(90) NULL,
  notes VARCHAR(280) NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (branch_id, exercise_id),
  CONSTRAINT fk_branch_exercise_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_branch_exercise_exercise FOREIGN KEY (exercise_id) REFERENCES exercise_catalog(id) ON DELETE CASCADE,
  INDEX idx_branch_exercise_enabled (branch_id, is_enabled)
) ENGINE=InnoDB;

-- Una sede inicial mantiene funcionando las cuentas y planes existentes.
INSERT IGNORE INTO organizations (id, name, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'FormaIA', NOW(), NOW());
INSERT IGNORE INTO branches (id, organization_id, name, code, is_active, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Sucursal principal', 'principal', 1, NOW(), NOW());
INSERT IGNORE INTO equipment_catalog (id, name, created_at, updated_at) VALUES
  ('bands', 'Bandas de resistencia', NOW(), NOW()),
  ('barbell', 'Barra olímpica', NOW(), NOW()),
  ('bench', 'Banco', NOW(), NOW()),
  ('cable-machine', 'Máquina de poleas', NOW(), NOW()),
  ('dumbbells', 'Mancuernas', NOW(), NOW()),
  ('leg-press', 'Prensa de piernas', NOW(), NOW()),
  ('mat', 'Colchoneta', NOW(), NOW()),
  ('rack', 'Rack de sentadillas', NOW(), NOW()),
  ('rowing-machine', 'Remo ergómetro', NOW(), NOW()),
  ('treadmill', 'Caminadora', NOW(), NOW());

ALTER TABLE user_profiles ADD COLUMN home_branch_id CHAR(36) NULL AFTER user_id;
ALTER TABLE user_profiles ADD CONSTRAINT fk_profile_home_branch FOREIGN KEY (home_branch_id) REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE user_profiles ADD INDEX idx_profile_home_branch (home_branch_id);
UPDATE user_profiles SET home_branch_id='00000000-0000-0000-0000-000000000002' WHERE home_branch_id IS NULL;

ALTER TABLE plans ADD COLUMN branch_id CHAR(36) NULL AFTER user_id;
ALTER TABLE plans ADD CONSTRAINT fk_plan_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE plans ADD INDEX idx_plan_branch (branch_id);

ALTER TABLE workout_logs ADD COLUMN branch_id CHAR(36) NULL AFTER user_id;
ALTER TABLE workout_logs ADD CONSTRAINT fk_workout_log_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE workout_logs ADD INDEX idx_workout_log_branch_date (branch_id, completed_on);
