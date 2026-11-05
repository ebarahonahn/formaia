-- FormaIA MySQL 8.0+ schema. Run this once with an administrative MySQL user.
CREATE DATABASE IF NOT EXISTS formaia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE formaia;

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email_verified_at DATETIME NULL,
  role ENUM('user','front_desk','branch_manager','manager','admin') NOT NULL DEFAULT 'user',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE organizations (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  logo_base64 MEDIUMTEXT NULL,
  logo_mime_type VARCHAR(30) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE branches (
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

CREATE TABLE equipment_catalog (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE branch_equipment (
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

INSERT INTO organizations (id,name,created_at,updated_at) VALUES
  ('00000000-0000-0000-0000-000000000001','FormaIA',NOW(),NOW());
INSERT INTO branches (id,organization_id,name,code,is_active,created_at,updated_at) VALUES
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Sucursal principal','principal',1,NOW(),NOW());
INSERT INTO equipment_catalog (id,name,created_at,updated_at) VALUES
  ('bands','Bandas de resistencia',NOW(),NOW()),
  ('barbell','Barra olímpica',NOW(),NOW()),
  ('bench','Banco',NOW(),NOW()),
  ('cable-machine','Máquina de poleas',NOW(),NOW()),
  ('dumbbells','Mancuernas',NOW(),NOW()),
  ('leg-press','Prensa de piernas',NOW(),NOW()),
  ('mat','Colchoneta',NOW(),NOW()),
  ('rack','Rack de sentadillas',NOW(),NOW()),
  ('rowing-machine','Remo ergómetro',NOW(),NOW()),
  ('treadmill','Caminadora',NOW(),NOW());

CREATE TABLE auth_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NULL,
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
  created_at DATETIME NULL,
  CONSTRAINT fk_auth_action_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_auth_action_lookup (purpose, token_hash, expires_at, used_at)
) ENGINE=InnoDB;

CREATE TABLE auth_rate_limit_settings (
  scope ENUM('login_ip','login_email') PRIMARY KEY,
  max_attempts SMALLINT UNSIGNED NOT NULL,
  window_seconds INT UNSIGNED NOT NULL,
  cooldown_seconds INT UNSIGNED NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NULL,
  CONSTRAINT chk_auth_rate_limit_attempts CHECK (max_attempts >= 1),
  CONSTRAINT chk_auth_rate_limit_window CHECK (window_seconds >= 1),
  CONSTRAINT chk_auth_rate_limit_cooldown CHECK (cooldown_seconds >= 1)
) ENGINE=InnoDB;

INSERT INTO auth_rate_limit_settings (scope,max_attempts,window_seconds,cooldown_seconds,is_enabled) VALUES
  ('login_ip',10,900,900,1),
  ('login_email',5,900,900,1);

CREATE TABLE auth_login_rate_counters (
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

CREATE TABLE user_profiles (
  user_id CHAR(36) PRIMARY KEY,
  home_branch_id CHAR(36) NULL,
  goal ENUM('Ganar músculo','Perder grasa','Sentirme mejor') NOT NULL,
  level ENUM('Principiante','Intermedio','Avanzado') NOT NULL,
  days_per_week TINYINT UNSIGNED NOT NULL,
  minutes_per_session TINYINT UNSIGNED NOT NULL,
  diet VARCHAR(80) NOT NULL,
  foods_to_avoid TEXT NULL,
  target_calories SMALLINT UNSIGNED NULL,
  age SMALLINT UNSIGNED NULL,
  height_cm DECIMAL(5,1) NULL,
  weight_lb DECIMAL(5,1) NULL,
  sex_for_calculation ENUM('Mujer','Hombre','Prefiero no decir') NULL,
  activity_level ENUM('Sedentaria','Ligera','Moderada','Alta') NOT NULL DEFAULT 'Moderada',
  equipment_access ENUM('Sin equipo','Bandas o mancuernas','Gimnasio completo') NOT NULL DEFAULT 'Gimnasio completo',
  limitations TEXT NULL,
  updated_at DATETIME NULL,
  CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_home_branch FOREIGN KEY (home_branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  INDEX idx_profile_home_branch (home_branch_id)
) ENGINE=InnoDB;

CREATE TABLE plans (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  branch_id CHAR(36) NULL,
  status ENUM('active','archived') NOT NULL DEFAULT 'active',
  calories SMALLINT UNSIGNED NOT NULL,
  protein_g SMALLINT UNSIGNED NOT NULL,
  carbs_g SMALLINT UNSIGNED NOT NULL,
  fats_g SMALLINT UNSIGNED NOT NULL,
  motivational_message VARCHAR(280) NOT NULL,
  adjustment JSON NULL,
  created_at DATETIME NULL,
  CONSTRAINT fk_plan_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_plan_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  INDEX idx_plans_user_status (user_id, status)
) ENGINE=InnoDB;

CREATE TABLE plan_cycles (
  id CHAR(36) PRIMARY KEY,
  plan_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  started_on DATE NOT NULL,
  completed_at TIMESTAMP NULL,
  created_at DATETIME NULL,
  CONSTRAINT fk_cycle_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_cycle_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_cycle_plan_status (plan_id, completed_at),
  INDEX idx_cycle_user_date (user_id, started_on)
) ENGINE=InnoDB;

CREATE TABLE exercise_catalog (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  level ENUM('Principiante','Intermedio','Avanzado') NOT NULL,
  focus_tags JSON NOT NULL,
  equipment VARCHAR(160) NOT NULL,
  prescription VARCHAR(90) NOT NULL,
  duration_minutes TINYINT UNSIGNED NOT NULL,
  cues JSON NOT NULL,
  image_url VARCHAR(500) NULL,
  video_url VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  INDEX idx_exercise_level_active (level, is_active)
) ENGINE=InnoDB;

CREATE TABLE exercise_equipment_requirements (
  exercise_id VARCHAR(80) NOT NULL,
  equipment_id VARCHAR(80) NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (exercise_id, equipment_id),
  CONSTRAINT fk_exercise_requirement_exercise FOREIGN KEY (exercise_id) REFERENCES exercise_catalog(id) ON DELETE CASCADE,
  CONSTRAINT fk_exercise_requirement_equipment FOREIGN KEY (equipment_id) REFERENCES equipment_catalog(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE branch_exercise_availability (
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

CREATE TABLE plan_workouts (
  id CHAR(36) PRIMARY KEY,
  plan_id CHAR(36) NOT NULL,
  sequence_no TINYINT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  subtitle VARCHAR(160) NOT NULL,
  duration_minutes TINYINT UNSIGNED NOT NULL,
  scheduled_on DATE NULL,
  exercises JSON NOT NULL,
  CONSTRAINT fk_workout_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  UNIQUE KEY uq_workout_sequence (plan_id, sequence_no),
  INDEX idx_plan_workout_schedule (scheduled_on)
) ENGINE=InnoDB;

CREATE TABLE meal_catalog (
  id VARCHAR(64) PRIMARY KEY,
  meal_type ENUM('Desayuno','Almuerzo','Merienda','Cena') NOT NULL,
  title VARCHAR(150) NOT NULL,
  description VARCHAR(280) NOT NULL,
  calories SMALLINT UNSIGNED NOT NULL,
  protein_g SMALLINT UNSIGNED NOT NULL,
  carbs_g SMALLINT UNSIGNED NOT NULL,
  fats_g SMALLINT UNSIGNED NOT NULL,
  diet_tags JSON NOT NULL,
  avoid_tags JSON NOT NULL,
  ingredients JSON NOT NULL,
  ingredient_details JSON NULL,
  steps JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  INDEX idx_catalog_type_active (meal_type, is_active)
) ENGINE=InnoDB;

CREATE TABLE food_catalog (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  calories_100g DECIMAL(7,2) NOT NULL,
  protein_100g DECIMAL(7,2) NOT NULL,
  carbs_100g DECIMAL(7,2) NOT NULL,
  fats_100g DECIMAL(7,2) NOT NULL,
  default_grams DECIMAL(7,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  INDEX idx_food_catalog_active (is_active, name)
) ENGINE=InnoDB;

CREATE TABLE ingredient_price_catalog (
  ingredient_key VARCHAR(50) PRIMARY KEY,
  product_name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  quantity_per_purchase DECIMAL(8,3) NOT NULL,
  purchase_unit VARCHAR(40) NOT NULL,
  purchase_step DECIMAL(8,3) NOT NULL DEFAULT 1,
  price_hnl DECIMAL(10,2) NOT NULL,
  market_scope VARCHAR(120) NOT NULL,
  source_name VARCHAR(180) NOT NULL,
  source_url VARCHAR(500) NULL,
  checked_on DATE NOT NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE plan_meals (
  id CHAR(36) PRIMARY KEY,
  plan_id CHAR(36) NOT NULL,
  sequence_no TINYINT UNSIGNED NOT NULL,
  meal_type VARCHAR(30) NOT NULL,
  title VARCHAR(150) NOT NULL,
  description VARCHAR(280) NOT NULL,
  calories SMALLINT UNSIGNED NOT NULL,
  recipe JSON NOT NULL,
  completed_at DATETIME NULL,
  CONSTRAINT fk_meal_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  UNIQUE KEY uq_meal_sequence (plan_id, sequence_no)
) ENGINE=InnoDB;

CREATE TABLE meal_completion_logs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  plan_id CHAR(36) NOT NULL,
  plan_meal_id CHAR(36) NOT NULL,
  cycle_id CHAR(36) NOT NULL,
  completed_on DATE NOT NULL,
  completed_at DATETIME NOT NULL,
  CONSTRAINT fk_meal_completion_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_meal_completion_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_meal_completion_plan_meal FOREIGN KEY (plan_meal_id) REFERENCES plan_meals(id) ON DELETE CASCADE,
  CONSTRAINT fk_meal_completion_cycle FOREIGN KEY (cycle_id) REFERENCES plan_cycles(id) ON DELETE CASCADE,
  UNIQUE KEY uq_meal_completion_per_day (user_id, plan_meal_id, cycle_id, completed_on),
  INDEX idx_meal_completion_cycle_week (user_id, plan_id, cycle_id, completed_on)
) ENGINE=InnoDB;

CREATE TABLE workout_logs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  branch_id CHAR(36) NULL,
  workout_id CHAR(36) NOT NULL,
  completed_on DATE NOT NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL DEFAULT NULL,
  duration_seconds INT UNSIGNED NULL,
  timer_running TINYINT(1) NOT NULL DEFAULT 0,
  timer_updated_at DATETIME NULL,
  CONSTRAINT fk_workout_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_workout_log_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_workout_log_workout FOREIGN KEY (workout_id) REFERENCES plan_workouts(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_workout_day (user_id, completed_on),
  INDEX idx_workout_logs_user_date (user_id, completed_on),
  INDEX idx_workout_log_branch_date (branch_id, completed_on)
) ENGINE=InnoDB;

CREATE TABLE workout_set_logs (
  id CHAR(36) PRIMARY KEY,
  workout_log_id CHAR(36) NOT NULL,
  exercise_index SMALLINT UNSIGNED NOT NULL,
  set_number SMALLINT UNSIGNED NOT NULL,
  weight_lb DECIMAL(6,1) NULL,
  repetitions SMALLINT UNSIGNED NULL,
  duration_seconds SMALLINT UNSIGNED NULL,
  completed_at DATETIME NULL,
  CONSTRAINT fk_set_log_workout_log FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id) ON DELETE CASCADE,
  UNIQUE KEY uq_workout_exercise_set (workout_log_id, exercise_index, set_number),
  INDEX idx_set_log_workout (workout_log_id)
) ENGINE=InnoDB;

CREATE TABLE user_pantry_items (
  user_id CHAR(36) NOT NULL,
  ingredient VARCHAR(160) NOT NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (user_id, ingredient),
  CONSTRAINT fk_pantry_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE nutrition_daily_logs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  logged_on DATE NOT NULL,
  water_glasses TINYINT UNSIGNED NOT NULL DEFAULT 0,
  adherence ENUM('Sí','Parcial','No') NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  CONSTRAINT fk_nutrition_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_nutrition_user_date (user_id, logged_on)
) ENGINE=InnoDB;

CREATE TABLE monthly_goals (
  user_id CHAR(36) NOT NULL,
  month_key CHAR(7) NOT NULL,
  sessions_target TINYINT UNSIGNED NOT NULL DEFAULT 12,
  progress_target TINYINT UNSIGNED NOT NULL DEFAULT 4,
  weight_target_lb DECIMAL(5,1) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (user_id, month_key),
  CONSTRAINT fk_monthly_goal_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_reminder_settings (
  user_id CHAR(36) PRIMARY KEY,
  workout_enabled TINYINT(1) NOT NULL DEFAULT 0,
  workout_time CHAR(5) NOT NULL DEFAULT '07:00',
  meal_enabled TINYINT(1) NOT NULL DEFAULT 0,
  meal_time CHAR(5) NOT NULL DEFAULT '12:00',
  weighin_enabled TINYINT(1) NOT NULL DEFAULT 0,
  weighin_weekday TINYINT UNSIGNED NOT NULL DEFAULT 1,
  weighin_time CHAR(5) NOT NULL DEFAULT '07:00',
  browser_enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NULL,
  CONSTRAINT fk_reminder_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE progress_logs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  logged_on DATE NOT NULL,
  weight_lb DECIMAL(5,1) NULL,
  energy ENUM('Alta','Media','Baja') NOT NULL,
  note VARCHAR(280) NOT NULL DEFAULT '',
  measurements JSON NULL,
  created_at DATETIME NULL,
  CONSTRAINT fk_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_progress_user_date (user_id, logged_on)
) ENGINE=InnoDB;

CREATE TABLE progress_photos (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  progress_log_id CHAR(36) NOT NULL,
  file_url VARCHAR(300) NOT NULL,
  created_at DATETIME NULL,
  CONSTRAINT fk_photo_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_photo_progress FOREIGN KEY (progress_log_id) REFERENCES progress_logs(id) ON DELETE CASCADE,
  INDEX idx_photo_progress (progress_log_id)
) ENGINE=InnoDB;

CREATE TABLE membership_plans (
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

CREATE TABLE membership_plan_branches (
  membership_plan_id CHAR(36) NOT NULL,
  branch_id CHAR(36) NOT NULL,
  created_at DATETIME NULL,
  PRIMARY KEY (membership_plan_id, branch_id),
  CONSTRAINT fk_membership_plan_branch_plan FOREIGN KEY (membership_plan_id) REFERENCES membership_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_membership_plan_branch_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE memberships (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  membership_plan_id CHAR(36) NOT NULL,
  status ENUM('pending','active','paused','expired','suspended','cancelled') NOT NULL DEFAULT 'pending',
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  grace_ends_on DATE NULL,
  payment_reference_code VARCHAR(40) NOT NULL,
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
  UNIQUE KEY uq_membership_payment_reference (payment_reference_code),
  INDEX idx_membership_plan_status (membership_plan_id, status, ends_on)
) ENGINE=InnoDB;

CREATE TABLE membership_branch_access (
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

CREATE TABLE staff_branch_assignments (
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

CREATE TABLE payments (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  membership_id CHAR(36) NULL,
  branch_id CHAR(36) NULL,
  amount_hnl DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'HNL',
  method ENUM('cash','bank_transfer','bank_deposit','direct_debit','card','pos','online','adjustment') NOT NULL,
  status ENUM('pending','verified','rejected','refunded','void') NOT NULL DEFAULT 'pending',
  reference VARCHAR(120) NULL,
  receipt_number VARCHAR(60) NULL,
  external_transaction_id VARCHAR(120) NULL,
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
  UNIQUE KEY uq_payment_external_transaction (organization_id, external_transaction_id),
  INDEX idx_payment_user_created (user_id, created_at),
  INDEX idx_payment_membership_status (membership_id, status),
  INDEX idx_payment_organization_status (organization_id, status, received_at)
) ENGINE=InnoDB;

CREATE TABLE payment_import_batches (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  source_method ENUM('bank_transfer','bank_deposit','direct_debit') NOT NULL,
  total_rows SMALLINT UNSIGNED NOT NULL,
  imported_rows SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  unmatched_rows SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_rows SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  invalid_rows SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  imported_by_user_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_payment_import_batch_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payment_import_batch_user FOREIGN KEY (imported_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_payment_import_batch_organization_created (organization_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE payment_import_rows (
  id CHAR(36) PRIMARY KEY,
  batch_id CHAR(36) NOT NULL,
  `row_number` SMALLINT UNSIGNED NOT NULL,
  external_transaction_id VARCHAR(120) NULL,
  reference VARCHAR(120) NULL,
  amount_hnl DECIMAL(10,2) NULL,
  membership_id CHAR(36) NULL,
  payment_id CHAR(36) NULL,
  row_status ENUM('imported','unmatched','duplicate','invalid') NOT NULL,
  reason VARCHAR(280) NULL,
  raw_data JSON NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_payment_import_row_batch FOREIGN KEY (batch_id) REFERENCES payment_import_batches(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_import_row_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE SET NULL,
  CONSTRAINT fk_payment_import_row_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  UNIQUE KEY uq_payment_import_row_number (batch_id, `row_number`),
  INDEX idx_payment_import_row_status (batch_id, row_status)
) ENGINE=InnoDB;

CREATE TABLE daily_passes (
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

CREATE TABLE access_events (
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

CREATE TABLE membership_qr_tokens (
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
