-- Precio de referencia por presentación real. Actualiza esta tabla sin tocar código.
CREATE TABLE IF NOT EXISTS ingredient_price_catalog (
  ingredient_key VARCHAR(50) PRIMARY KEY,
  product_name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  quantity_per_purchase DECIMAL(8,3) NOT NULL,
  purchase_unit VARCHAR(40) NOT NULL,
  purchase_step DECIMAL(8,3) NOT NULL DEFAULT 1,
  price_hnl DECIMAL(10,2) NOT NULL,
  market_scope VARCHAR(120) NOT NULL,
  source_name VARCHAR(180) NOT NULL,
  source_url VARCHAR(500) NULL,
  checked_on DATE NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO ingredient_price_catalog (ingredient_key,product_name,category,quantity_per_purchase,purchase_unit,purchase_step,price_hnl,market_scope,source_name,source_url,checked_on) VALUES
('tortilla','Tortilla de maíz','Granos y básicos',1,'unidad',1,1.00,'Referencia nacional','TNH / acuerdo SDE','https://tnh.gob.hn/television/fijan-precio-de-la-tortilla-en-l-0-80-para-evitar-aumentos-al-consumidor','2026-04-17'),
('arroz','Arroz clasificado a granel','Granos y básicos',1,'lb',0.5,15.00,'Mercados San Pedro Sula','La Prensa','https://www.laprensa.hn/sanpedro/precios-alimentos-canasta-basica-2026-IF32261009','2026-10-07'),
('frijoles','Frijol rojo a granel','Granos y básicos',1,'lb',0.5,25.00,'Mercados San Pedro Sula','La Prensa','https://www.laprensa.hn/sanpedro/precios-alimentos-canasta-basica-2026-IF32261009','2026-10-07'),
('platano','Plátano maduro','Frutas y vegetales',1,'unidad',1,8.00,'Mercados San Pedro Sula','La Prensa','https://www.laprensa.hn/sanpedro/precios-alimentos-canasta-basica-2026-IF32261009','2026-10-07'),
('banano','Banano / guineo verde','Frutas y vegetales',1,'unidad',1,2.00,'Mercados San Pedro Sula','La Prensa','https://www.laprensa.hn/sanpedro/precios-alimentos-canasta-basica-2026-IF32261009','2026-10-07'),
('pollo','Pollo entero o partido','Proteínas',1,'lb',0.5,33.00,'Mercados San Pedro Sula','La Prensa','https://www.laprensa.hn/sanpedro/precios-alimentos-canasta-basica-2026-IF32261009','2026-10-07'),
('huevos','Huevos medianos','Proteínas',12,'docena',1,49.14,'Referencia de supermercado Honduras','Preciosmundi','https://preciosmundi.com/honduras/precios-supermercado','2026-07-01'),
('avena','Avena','Granos y básicos',1,'lb',1,38.00,'Estimación de mercado, editable','Referencia inicial FormaIA',NULL,'2026-10-11'),
('queso','Queso fresco','Lácteos',1,'lb',0.5,85.00,'Mercados San Pedro Sula','La Prensa','https://www.laprensa.hn/sanpedro/precios-alimentos-canasta-basica-2026-IF32261009','2026-10-07'),
('yogur','Yogur natural','Lácteos',1,'litro',1,52.00,'Estimación de supermercado, editable','Referencia inicial FormaIA',NULL,'2026-10-11'),
('papaya','Papaya','Frutas y vegetales',1,'lb',0.5,10.00,'Estimación de mercado, editable','Referencia inicial FormaIA',NULL,'2026-10-11'),
('aguacate','Aguacate','Frutas y vegetales',1,'unidad',1,18.00,'Estimación de mercado, editable','Referencia inicial FormaIA',NULL,'2026-10-11'),
('camote','Camote','Frutas y vegetales',1,'unidad',1,10.00,'Estimación de mercado, editable','Referencia inicial FormaIA',NULL,'2026-10-11'),
('yuca','Yuca','Frutas y vegetales',1,'lb',0.5,12.00,'Estimación de mercado, editable','Referencia inicial FormaIA',NULL,'2026-10-11'),
('tilapia','Tilapia','Proteínas',1,'lb',0.5,45.00,'Estimación de mercado, editable','Referencia inicial FormaIA',NULL,'2026-10-11'),
('atun','Atún en agua','Proteínas',1,'lata',1,32.00,'Estimación de supermercado, editable','Referencia inicial FormaIA',NULL,'2026-10-11')
ON DUPLICATE KEY UPDATE product_name=VALUES(product_name),category=VALUES(category),quantity_per_purchase=VALUES(quantity_per_purchase),purchase_unit=VALUES(purchase_unit),purchase_step=VALUES(purchase_step),price_hnl=VALUES(price_hnl),market_scope=VALUES(market_scope),source_name=VALUES(source_name),source_url=VALUES(source_url),checked_on=VALUES(checked_on);
