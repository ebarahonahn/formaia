-- Hace que MySQL almacene fechas/hora entregadas por el backend, sin generar
-- CURRENT_TIMESTAMP ni convertirlas según el reloj o zona horaria de MySQL.
-- Ejecutar después de 022_auth_rate_limiting.sql con un usuario administrador.

ALTER TABLE users
  MODIFY created_at DATETIME NULL,
  MODIFY updated_at DATETIME NULL;

ALTER TABLE auth_sessions
  MODIFY created_at DATETIME NULL;

ALTER TABLE auth_action_tokens
  MODIFY created_at DATETIME NULL;

ALTER TABLE user_profiles
  MODIFY updated_at DATETIME NULL;

ALTER TABLE plans
  MODIFY created_at DATETIME NULL;

ALTER TABLE plan_cycles
  MODIFY completed_at DATETIME NULL,
  MODIFY created_at DATETIME NULL;

ALTER TABLE exercise_catalog
  MODIFY created_at DATETIME NULL,
  MODIFY updated_at DATETIME NULL;

ALTER TABLE meal_catalog
  MODIFY created_at DATETIME NULL,
  MODIFY updated_at DATETIME NULL;

ALTER TABLE food_catalog
  MODIFY created_at DATETIME NULL,
  MODIFY updated_at DATETIME NULL;

ALTER TABLE ingredient_price_catalog
  MODIFY updated_at DATETIME NULL;

ALTER TABLE workout_set_logs
  MODIFY completed_at DATETIME NULL;

ALTER TABLE user_pantry_items
  MODIFY updated_at DATETIME NULL;

ALTER TABLE nutrition_daily_logs
  MODIFY created_at DATETIME NULL,
  MODIFY updated_at DATETIME NULL;

ALTER TABLE monthly_goals
  MODIFY created_at DATETIME NULL,
  MODIFY updated_at DATETIME NULL;

ALTER TABLE user_reminder_settings
  MODIFY updated_at DATETIME NULL;

ALTER TABLE progress_logs
  MODIFY created_at DATETIME NULL;

ALTER TABLE progress_photos
  MODIFY created_at DATETIME NULL;

ALTER TABLE auth_rate_limit_settings
  MODIFY updated_at DATETIME NULL;
