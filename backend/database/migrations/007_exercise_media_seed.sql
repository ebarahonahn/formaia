-- Primer recurso visual propio del catálogo FormaIA.
-- El archivo se sirve desde el frontend; MySQL solo almacena su ruta pública.
USE formaia;

UPDATE exercise_catalog
SET image_url = '/assets/exercises/p-sentadilla-silla-v1.png'
WHERE id = 'p-sentadilla-silla';
