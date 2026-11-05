-- REINICIO CONTROLADO DE MEMBRESÍAS DE PRUEBA
--
-- Borra membresías y los pagos vinculados a ellas.
-- Conserva: usuarios, planes, sucursales, catálogo, asignaciones de personal
-- y bitácora de accesos. Al eliminar una membresía, MySQL deja el campo
-- membership_id de access_events en NULL para preservar la auditoría.
--
-- Úsalo solo para limpiar datos de pruebas. No es una migración y no debe
-- ejecutarse automáticamente al desplegar la aplicación.

-- 1) Seguridad: cambia 0 por 1 únicamente cuando hayas revisado la vista previa.
SET @confirmar_borrado = 0;

-- 2) Alcance: 'monthly' borra planes de 28 a 31 días; 'all' borra todas
-- las membresías, sin importar su duración.
SET @alcance = 'monthly';

START TRANSACTION;

CREATE TEMPORARY TABLE reset_memberships AS
SELECT membership.id
FROM memberships membership
INNER JOIN membership_plans plan ON plan.id = membership.membership_plan_id
WHERE @confirmar_borrado = 1
  AND (
    @alcance = 'all'
    OR (@alcance = 'monthly' AND plan.duration_days BETWEEN 28 AND 31)
  );

-- Vista previa: con confirmar_borrado = 0 ambas cantidades deben ser 0.
SELECT COUNT(*) AS membresias_a_borrar FROM reset_memberships;
SELECT COUNT(*) AS pagos_a_borrar
FROM payments payment
INNER JOIN reset_memberships target ON target.id = payment.membership_id;

-- Primero se eliminan los pagos para no conservar cobros de membresías eliminadas.
DELETE payment
FROM payments payment
INNER JOIN reset_memberships target ON target.id = payment.membership_id;

-- membership_branch_access se elimina automáticamente por ON DELETE CASCADE.
-- access_events se conserva y su membership_id pasa a NULL por ON DELETE SET NULL.
DELETE membership
FROM memberships membership
INNER JOIN reset_memberships target ON target.id = membership.id;

DROP TEMPORARY TABLE reset_memberships;

-- Si los conteos y el resultado son correctos, confirma la operación.
COMMIT;

-- Para cancelar antes de COMMIT, reemplaza la línea anterior por: ROLLBACK;
