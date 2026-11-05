-- Roles operativos y alcance por sucursal.
ALTER TABLE users MODIFY role ENUM('user','front_desk','branch_manager','admin') NOT NULL DEFAULT 'user';

-- No deja asignaciones activas cuando una cuenta deja de ser personal de sucursal.
UPDATE staff_branch_assignments assignment_map
INNER JOIN users user ON user.id=assignment_map.user_id
SET assignment_map.is_active=0, assignment_map.updated_at=NOW()
WHERE user.role NOT IN ('front_desk','branch_manager') AND assignment_map.is_active=1;
