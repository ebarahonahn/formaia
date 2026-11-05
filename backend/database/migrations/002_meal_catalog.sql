-- FormaIA: catálogo reutilizable de comidas hondureñas de precio intermedio.
-- Ejecutar una vez con un usuario administrador de MySQL, dentro de la base formaia.
USE formaia;

CREATE TABLE IF NOT EXISTS meal_catalog (
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
  steps JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_catalog_type_active (meal_type, is_active)
) ENGINE=InnoDB;

INSERT INTO meal_catalog (id,meal_type,title,description,calories,protein_g,carbs_g,fats_g,diet_tags,avoid_tags,ingredients,steps) VALUES
('des-avena-banano-huevo','Desayuno','Avena con banano y huevo','Avena cocida con banano y huevo revuelto.',440,21,58,13,JSON_ARRAY('Flexible','Alta en proteína'),JSON_ARRAY('huevo','avena'),JSON_ARRAY('Avena','Banano','Huevos','Leche o agua'),JSON_ARRAY('Cocina la avena con agua o leche.','Sirve con banano y huevos revueltos.')),
('des-baleada-huevo','Desayuno','Baleada sencilla con huevo','Tortilla de harina con frijoles, huevo y aguacate.',510,23,55,20,JSON_ARRAY('Flexible','Alta en proteína'),JSON_ARRAY('gluten','huevo'),JSON_ARRAY('Tortilla de harina','Frijoles cocidos','Huevo','Aguacate'),JSON_ARRAY('Calienta la tortilla y los frijoles.','Agrega huevo revuelto y aguacate.')),
('des-huevos-tortilla','Desayuno','Huevos con tortilla y tomate','Huevos revueltos, tortillas de maíz y tomate fresco.',420,22,42,17,JSON_ARRAY('Flexible','Alta en proteína'),JSON_ARRAY('huevo'),JSON_ARRAY('Huevos','Tortillas de maíz','Tomate','Cebolla'),JSON_ARRAY('Saltea tomate y cebolla.','Agrega los huevos y sirve con tortillas.')),
('des-avena-papaya-mani','Desayuno','Avena con papaya y maní','Avena en agua con papaya de temporada y maní.',390,13,59,13,JSON_ARRAY('Flexible','Vegetariana','Mediterránea'),JSON_ARRAY('maní','avena'),JSON_ARRAY('Avena','Papaya','Maní','Canela'),JSON_ARRAY('Cocina la avena con canela.','Añade papaya y maní al servir.')),
('des-yogur-papaya','Desayuno','Yogur natural con papaya y avena','Yogur sin azúcar con fruta y avena tostada.',380,18,52,10,JSON_ARRAY('Flexible','Vegetariana','Alta en proteína'),JSON_ARRAY('lácteos','avena'),JSON_ARRAY('Yogur natural','Papaya','Avena','Canela'),JSON_ARRAY('Coloca el yogur en un tazón.','Agrega papaya, avena y canela.')),
('des-tortilla-queso-aguacate','Desayuno','Tortillas con queso y aguacate','Tortillas de maíz con queso fresco y aguacate.',430,17,43,20,JSON_ARRAY('Flexible','Vegetariana'),JSON_ARRAY('lácteos'),JSON_ARRAY('Tortillas de maíz','Queso fresco','Aguacate','Frijoles'),JSON_ARRAY('Calienta tortillas y frijoles.','Sirve con queso fresco y aguacate.')),
('alm-pollo-arroz-frijoles','Almuerzo','Pollo con arroz y frijoles','Pollo a la plancha con arroz, frijoles y ensalada.',610,42,70,15,JSON_ARRAY('Flexible','Alta en proteína'),JSON_ARRAY('pollo'),JSON_ARRAY('Pollo','Arroz','Frijoles','Repollo','Tomate'),JSON_ARRAY('Cocina el pollo a la plancha.','Sirve con arroz, frijoles y ensalada.')),
('alm-tilapia-camote','Almuerzo','Tilapia con camote y ensalada','Tilapia a la plancha con camote horneado y vegetales.',570,39,54,18,JSON_ARRAY('Flexible','Mediterránea','Alta en proteína'),JSON_ARRAY('pescado'),JSON_ARRAY('Tilapia','Camote','Repollo','Tomate','Limón'),JSON_ARRAY('Cocina tilapia con limón.','Hornea el camote y acompaña con ensalada.')),
('alm-carne-arroz-vegetales','Almuerzo','Carne magra con arroz y vegetales','Carne molida magra con arroz y vegetales salteados.',640,40,66,22,JSON_ARRAY('Flexible','Alta en proteína'),JSON_ARRAY('res'),JSON_ARRAY('Carne molida magra','Arroz','Zanahoria','Ejotes'),JSON_ARRAY('Saltea la carne con vegetales.','Sirve con arroz cocido.')),
('alm-arroz-frijoles-queso','Almuerzo','Arroz, frijoles y queso fresco','Plato vegetariano con ensalada de repollo.',590,24,82,18,JSON_ARRAY('Flexible','Vegetariana'),JSON_ARRAY('lácteos'),JSON_ARRAY('Arroz','Frijoles','Queso fresco','Repollo','Tomate'),JSON_ARRAY('Calienta arroz y frijoles.','Sirve con queso y ensalada.')),
('alm-sopa-frijoles-huevo','Almuerzo','Sopa de frijoles con huevo','Sopa casera de frijoles con huevo, yuca y verduras.',560,26,72,15,JSON_ARRAY('Flexible','Vegetariana','Alta en proteína'),JSON_ARRAY('huevo'),JSON_ARRAY('Frijoles','Huevos','Yuca','Zanahoria','Cilantro'),JSON_ARRAY('Hierve frijoles con verduras y yuca.','Agrega huevo cocido antes de servir.')),
('alm-pollo-yuca','Almuerzo','Pollo guisado con yuca','Pollo guisado ligero con yuca cocida y ensalada.',600,41,59,19,JSON_ARRAY('Flexible','Alta en proteína'),JSON_ARRAY('pollo'),JSON_ARRAY('Pollo','Yuca','Tomate','Cebolla','Repollo'),JSON_ARRAY('Guisa pollo con tomate y cebolla.','Sirve con yuca cocida y ensalada.')),
('mer-banana-mani','Merienda','Banano con maní','Merienda práctica de banano y maní tostado.',250,7,34,11,JSON_ARRAY('Flexible','Vegetariana','Mediterránea'),JSON_ARRAY('maní'),JSON_ARRAY('Banano','Maní tostado'),JSON_ARRAY('Pela el banano.','Acompaña con una porción de maní.')),
('mer-yogur-papaya','Merienda','Yogur con papaya','Yogur natural sin azúcar con papaya fresca.',220,13,31,5,JSON_ARRAY('Flexible','Vegetariana','Alta en proteína'),JSON_ARRAY('lácteos'),JSON_ARRAY('Yogur natural','Papaya','Canela'),JSON_ARRAY('Sirve yogur en un vaso.','Añade papaya y canela.')),
('mer-elote-queso','Merienda','Elote con queso fresco','Elote cocido con una porción pequeña de queso fresco.',260,11,38,8,JSON_ARRAY('Flexible','Vegetariana'),JSON_ARRAY('lácteos'),JSON_ARRAY('Elote','Queso fresco','Limón'),JSON_ARRAY('Cocina el elote.','Añade queso desmenuzado y limón.')),
('mer-huevo-aguacate','Merienda','Huevo cocido con aguacate','Dos huevos cocidos con aguacate y tomate.',270,15,10,20,JSON_ARRAY('Flexible','Vegetariana','Alta en proteína'),JSON_ARRAY('huevo'),JSON_ARRAY('Huevos','Aguacate','Tomate'),JSON_ARRAY('Hierve los huevos.','Sirve con aguacate y tomate.')),
('mer-fruta-avena','Merienda','Fruta de temporada con avena','Mango o papaya con avena y canela.',230,6,45,4,JSON_ARRAY('Flexible','Vegetariana','Mediterránea'),JSON_ARRAY('avena'),JSON_ARRAY('Mango o papaya','Avena','Canela'),JSON_ARRAY('Corta la fruta.','Añade avena y canela.')),
('mer-tortilla-frijoles','Merienda','Tortilla con frijoles','Tortilla de maíz con frijoles cocidos y pico de gallo.',280,10,48,6,JSON_ARRAY('Flexible','Vegetariana'),JSON_ARRAY(),JSON_ARRAY('Tortillas de maíz','Frijoles','Tomate','Cebolla'),JSON_ARRAY('Calienta tortilla y frijoles.','Añade pico de gallo.')),
('cen-tortilla-huevo-frijoles','Cena','Tortillas con huevo y frijoles','Cena sencilla de huevos, frijoles, tortillas y vegetales.',590,29,61,24,JSON_ARRAY('Flexible','Vegetariana','Alta en proteína'),JSON_ARRAY('huevo'),JSON_ARRAY('Huevos','Frijoles','Tortillas de maíz','Tomate','Aguacate'),JSON_ARRAY('Prepara huevos revueltos.','Sirve con frijoles, tortillas y vegetales.')),
('cen-pollo-tostadas','Cena','Tostadas de pollo con repollo','Tostadas horneadas con pollo desmenuzado y ensalada.',530,36,54,17,JSON_ARRAY('Flexible','Alta en proteína'),JSON_ARRAY('pollo'),JSON_ARRAY('Pollo','Tortillas de maíz','Repollo','Tomate','Aguacate'),JSON_ARRAY('Hornea las tortillas hasta dorar.','Agrega pollo y ensalada de repollo.')),
('cen-atun-arroz','Cena','Atún con arroz y vegetales','Atún en agua con arroz, tomate y vegetales.',560,35,66,13,JSON_ARRAY('Flexible','Mediterránea','Alta en proteína'),JSON_ARRAY('pescado'),JSON_ARRAY('Atún en agua','Arroz','Tomate','Zanahoria','Limón'),JSON_ARRAY('Mezcla atún con tomate y limón.','Sirve con arroz y vegetales.')),
('cen-arroz-frijoles-aguacate','Cena','Arroz con frijoles y aguacate','Arroz, frijoles, aguacate y ensalada fresca.',570,20,82,17,JSON_ARRAY('Flexible','Vegetariana','Mediterránea'),JSON_ARRAY(),JSON_ARRAY('Arroz','Frijoles','Aguacate','Repollo','Tomate'),JSON_ARRAY('Calienta arroz y frijoles.','Sirve con aguacate y ensalada.')),
('cen-pollo-yuca','Cena','Pollo con yuca y ensalada','Pollo a la plancha, yuca cocida y ensalada de repollo.',580,40,54,19,JSON_ARRAY('Flexible','Alta en proteína'),JSON_ARRAY('pollo'),JSON_ARRAY('Pollo','Yuca','Repollo','Tomate','Limón'),JSON_ARRAY('Cocina el pollo a la plancha.','Sirve con yuca y ensalada.')),
('cen-omelet-vegetales','Cena','Omelet de vegetales','Omelet con verduras, frijoles y tortillas de maíz.',510,26,48,23,JSON_ARRAY('Flexible','Vegetariana','Alta en proteína'),JSON_ARRAY('huevo'),JSON_ARRAY('Huevos','Frijoles','Tortillas de maíz','Tomate','Cebolla'),JSON_ARRAY('Saltea las verduras.','Agrega huevo batido y sirve con frijoles.'))
ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), calories=VALUES(calories), protein_g=VALUES(protein_g), carbs_g=VALUES(carbs_g), fats_g=VALUES(fats_g), diet_tags=VALUES(diet_tags), avoid_tags=VALUES(avoid_tags), ingredients=VALUES(ingredients), steps=VALUES(steps), is_active=1;
