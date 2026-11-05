-- Registros diarios de comidas completadas, aislados por ciclo del plan.
USE formaia;

CREATE TABLE IF NOT EXISTS meal_completion_logs (
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
