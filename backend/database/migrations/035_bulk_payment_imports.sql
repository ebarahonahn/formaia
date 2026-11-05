-- Importación masiva y conciliación de transferencias, depósitos y débitos automáticos.
USE formaia;

SET @has_reference_code := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='memberships' AND COLUMN_NAME='payment_reference_code');
SET @sql := IF(@has_reference_code=0, 'ALTER TABLE memberships ADD COLUMN payment_reference_code VARCHAR(40) NULL AFTER grace_ends_on', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE memberships SET payment_reference_code=CONCAT('M-', UPPER(LEFT(REPLACE(id, '-', ''), 12))) WHERE payment_reference_code IS NULL OR payment_reference_code='';
ALTER TABLE memberships MODIFY payment_reference_code VARCHAR(40) NOT NULL;
SET @has_reference_index := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='memberships' AND INDEX_NAME='uq_membership_payment_reference');
SET @sql := IF(@has_reference_index=0, 'ALTER TABLE memberships ADD UNIQUE KEY uq_membership_payment_reference (payment_reference_code)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE payments MODIFY method ENUM('cash','bank_transfer','bank_deposit','direct_debit','card','pos','online','adjustment') NOT NULL;
SET @has_external_id := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='external_transaction_id');
SET @sql := IF(@has_external_id=0, 'ALTER TABLE payments ADD COLUMN external_transaction_id VARCHAR(120) NULL AFTER receipt_number', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_external_index := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND INDEX_NAME='uq_payment_external_transaction');
SET @sql := IF(@has_external_index=0, 'ALTER TABLE payments ADD UNIQUE KEY uq_payment_external_transaction (organization_id, external_transaction_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS payment_import_batches (
  id CHAR(36) PRIMARY KEY, organization_id CHAR(36) NOT NULL, filename VARCHAR(255) NOT NULL,
  source_method ENUM('bank_transfer','bank_deposit','direct_debit') NOT NULL, total_rows SMALLINT UNSIGNED NOT NULL,
  imported_rows SMALLINT UNSIGNED NOT NULL DEFAULT 0, unmatched_rows SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_rows SMALLINT UNSIGNED NOT NULL DEFAULT 0, invalid_rows SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  imported_by_user_id CHAR(36) NOT NULL, created_at DATETIME NOT NULL,
  CONSTRAINT fk_payment_import_batch_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payment_import_batch_user FOREIGN KEY (imported_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_payment_import_batch_organization_created (organization_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_import_rows (
  id CHAR(36) PRIMARY KEY, batch_id CHAR(36) NOT NULL, `row_number` SMALLINT UNSIGNED NOT NULL,
  external_transaction_id VARCHAR(120) NULL, reference VARCHAR(120) NULL, amount_hnl DECIMAL(10,2) NULL,
  membership_id CHAR(36) NULL, payment_id CHAR(36) NULL,
  row_status ENUM('imported','unmatched','duplicate','invalid') NOT NULL, reason VARCHAR(280) NULL,
  raw_data JSON NOT NULL, created_at DATETIME NOT NULL,
  CONSTRAINT fk_payment_import_row_batch FOREIGN KEY (batch_id) REFERENCES payment_import_batches(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_import_row_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE SET NULL,
  CONSTRAINT fk_payment_import_row_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  UNIQUE KEY uq_payment_import_row_number (batch_id, `row_number`), INDEX idx_payment_import_row_status (batch_id, row_status)
) ENGINE=InnoDB;
