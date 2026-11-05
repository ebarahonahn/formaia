CREATE TABLE food_catalog (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  calories_100g DECIMAL(7,2) NOT NULL,
  protein_100g DECIMAL(7,2) NOT NULL,
  carbs_100g DECIMAL(7,2) NOT NULL,
  fats_100g DECIMAL(7,2) NOT NULL,
  default_grams DECIMAL(7,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_food_catalog_active (is_active, name)
) ENGINE=InnoDB;

ALTER TABLE meal_catalog ADD COLUMN ingredient_details JSON NULL AFTER ingredients;

INSERT INTO food_catalog (id,name,calories_100g,protein_100g,carbs_100g,fats_100g,default_grams) VALUES
('avena','Avena seca',389,16.9,66.3,6.9,40),
('banano','Banano',89,1.1,22.8,0.3,118),
('huevo','Huevo entero',143,12.6,0.7,9.5,100),
('leche','Leche semidescremada',47,3.4,4.8,1.6,240),
('yogur-natural','Yogur natural',63,5.3,7.0,1.6,170),
('pollo','Pechuga de pollo cocida',165,31.0,0,3.6,120),
('arroz-cocido','Arroz blanco cocido',130,2.4,28.2,0.3,150),
('frijoles-cocidos','Frijoles cocidos',127,8.7,22.8,0.5,130),
('tortilla-maiz','Tortilla de maíz',218,5.7,44.6,2.9,55),
('queso-fresco','Queso fresco',264,18.1,3.1,20.2,40),
('aguacate','Aguacate',160,2.0,8.5,14.7,60),
('tilapia','Tilapia cocida',128,26.2,0,2.7,130),
('carne-magra','Carne de res magra cocida',217,26.1,0,11.8,120),
('platano','Plátano maduro cocido',122,1.3,31.9,0.4,100),
('papaya','Papaya',43,0.5,10.8,0.3,140),
('mani','Maní tostado',585,25.8,21.3,49.7,28),
('lentejas-cocidas','Lentejas cocidas',116,9.0,20.1,0.4,150),
('yuca-cocida','Yuca cocida',112,1.4,27.8,0.3,150),
('tomate','Tomate',18,0.9,3.9,0.2,80),
('pan-integral','Pan integral',247,13.0,41.0,4.2,60)
ON DUPLICATE KEY UPDATE name=VALUES(name),calories_100g=VALUES(calories_100g),protein_100g=VALUES(protein_100g),carbs_100g=VALUES(carbs_100g),fats_100g=VALUES(fats_100g),default_grams=VALUES(default_grams),is_active=1;
