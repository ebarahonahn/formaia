-- Ciclos de ejecución de un plan: permite completar una semana y continuar el mismo plan.
USE formaia;

CREATE TABLE IF NOT EXISTS plan_cycles (
  id CHAR(36) PRIMARY KEY,
  plan_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  started_on DATE NOT NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cycle_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_cycle_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_cycle_plan_status (plan_id, completed_at),
  INDEX idx_cycle_user_date (user_id, started_on)
) ENGINE=InnoDB;

-- Da un ciclo activo a los planes que ya existían antes de esta migración.
INSERT INTO plan_cycles (id, plan_id, user_id, started_on)
SELECT UUID(), p.id, p.user_id, DATE(p.created_at)
FROM plans p
LEFT JOIN plan_cycles c ON c.plan_id = p.id
WHERE p.status = 'active' AND c.id IS NULL;
