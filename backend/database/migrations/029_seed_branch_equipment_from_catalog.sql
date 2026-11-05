-- Inventario inicial por sucursal derivado del catálogo de ejercicios.
-- Requiere ejecutar antes 028_branch_equipment_catalog.sql.
-- Este script es idempotente: no duplica el equipo ya registrado sin zona.
USE formaia;

-- Tipos adicionales encontrados en exercise_catalog.equipment.
INSERT IGNORE INTO equipment_catalog (id, name, created_at, updated_at) VALUES
  ('ab-wheel', 'Rueda abdominal', NOW(), NOW()),
  ('backpack', 'Mochila de carga', NOW(), NOW()),
  ('chair', 'Silla', NOW(), NOW()),
  ('foot-anchor', 'Soporte para pies', NOW(), NOW()),
  ('generic-machine', 'Máquina de musculación', NOW(), NOW()),
  ('landmine', 'Anclaje landmine', NOW(), NOW()),
  ('parallel-bars', 'Paralelas', NOW(), NOW()),
  ('platform', 'Plataforma baja', NOW(), NOW()),
  ('sliders', 'Deslizadores', NOW(), NOW()),
  ('step', 'Escalón', NOW(), NOW()),
  ('weighted-load', 'Discos o chaleco lastrado', NOW(), NOW());

-- Solo se incluyen tipos realmente mencionados por el catálogo actual.
INSERT INTO branch_equipment (id, branch_id, equipment_id, quantity, operational_status, zone, created_at, updated_at)
SELECT UUID(), branch.id, catalog_equipment.equipment_id, 1, 'available', NULL, NOW(), NOW()
FROM branches branch
CROSS JOIN (
  SELECT DISTINCT equipment_id
  FROM (
    SELECT 'ab-wheel' AS equipment_id WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%rueda abdominal%')
    UNION ALL SELECT 'backpack' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%mochila%')
    UNION ALL SELECT 'bands' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%banda%')
    UNION ALL SELECT 'barbell' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%barra%')
    UNION ALL SELECT 'bench' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%banco%')
    UNION ALL SELECT 'cable-machine' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%polea%' OR LOWER(equipment) LIKE '%cable%')
    UNION ALL SELECT 'chair' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%silla%')
    UNION ALL SELECT 'dumbbells' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%mancuerna%')
    UNION ALL SELECT 'foot-anchor' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%soporte para pies%')
    UNION ALL SELECT 'generic-machine' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%máquina%' OR LOWER(equipment) LIKE '%maquina%')
    UNION ALL SELECT 'landmine' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%anclada%')
    UNION ALL SELECT 'leg-press' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%prensa%')
    UNION ALL SELECT 'mat' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%colchoneta%')
    UNION ALL SELECT 'parallel-bars' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%paralelas%')
    UNION ALL SELECT 'platform' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%plataforma%')
    UNION ALL SELECT 'rack' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%rack%')
    UNION ALL SELECT 'sliders' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%toallas%' OR LOWER(equipment) LIKE '%deslizadores%')
    UNION ALL SELECT 'step' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%escalón%' OR LOWER(equipment) LIKE '%escalon%')
    UNION ALL SELECT 'weighted-load' WHERE EXISTS (SELECT 1 FROM exercise_catalog WHERE LOWER(equipment) LIKE '%disco%' OR LOWER(equipment) LIKE '%chaleco%' OR LOWER(equipment) LIKE '%lastre%')
  ) AS detected_equipment
) AS catalog_equipment
WHERE branch.is_active=1
  AND NOT EXISTS (
    SELECT 1 FROM branch_equipment existing
    WHERE existing.branch_id=branch.id
      AND existing.equipment_id=catalog_equipment.equipment_id
      AND existing.zone IS NULL
  );
