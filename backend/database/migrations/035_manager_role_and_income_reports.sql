-- Perfil global de Gerente: misma administración que Admin y reportes de ingresos.
ALTER TABLE users MODIFY role ENUM('user','front_desk','branch_manager','manager','admin') NOT NULL DEFAULT 'user';
