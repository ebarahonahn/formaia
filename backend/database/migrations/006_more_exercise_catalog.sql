-- Segunda ampliación del catálogo: 48 ejercicios distintos de los 48 iniciales.
-- Se guardan rutas/URLs de medios por separado; no se almacenan videos como Base64.
USE formaia;

INSERT INTO exercise_catalog (id,name,level,focus_tags,equipment,prescription,duration_minutes,cues,image_url,video_url) VALUES
-- Principiante: opciones de bajo equipo y técnica controlada
('p-sentadilla-pared','Sentadilla isométrica en pared','Principiante',JSON_ARRAY('squat','legs'),'Pared','3 × 20–30 s · descanso 45 s',4,JSON_ARRAY('Espalda apoyada','Rodillas alineadas'),NULL,NULL),
('p-zancada-atras-asistida','Zancada hacia atrás asistida','Principiante',JSON_ARRAY('squat','legs'),'Silla o pared','3 × 8 por lado · descanso 60 s',6,JSON_ARRAY('Paso atrás suave','Torso alto'),NULL,NULL),
('p-bisagra-pared','Bisagra de cadera a pared','Principiante',JSON_ARRAY('hinge','legs'),'Pared','3 × 10–12 · descanso 45 s',4,JSON_ARRAY('Cadera hacia atrás','Espalda neutra'),NULL,NULL),
('p-patada-gluteo','Patada de glúteo en cuadrupedia','Principiante',JSON_ARRAY('hinge','legs'),'Colchoneta','3 × 10 por lado · descanso 45 s',5,JSON_ARRAY('Cadera estable','No arquees la espalda'),NULL,NULL),
('p-abduccion-cadera','Abducción de cadera acostado','Principiante',JSON_ARRAY('legs'),'Colchoneta','3 × 12 por lado · descanso 45 s',5,JSON_ARRAY('Punta del pie al frente','Sube controlado'),NULL,NULL),
('p-press-pecho-banda','Press de pecho con banda','Principiante',JSON_ARRAY('push'),'Banda elástica','3 × 10–12 · descanso 60 s',5,JSON_ARRAY('Pecho alto','Controla regreso'),NULL,NULL),
('p-apertura-pecho-banda','Apertura de pecho con banda','Principiante',JSON_ARRAY('push'),'Banda elástica','2 × 12 · descanso 45 s',4,JSON_ARRAY('Codos suaves','No fuerces hombros'),NULL,NULL),
('p-elevacion-lateral-banda','Elevación lateral con banda','Principiante',JSON_ARRAY('push'),'Banda elástica','2 × 12 · descanso 45 s',4,JSON_ARRAY('Hombros lejos de orejas','Sube hasta el hombro'),NULL,NULL),
('p-remo-banda-sentado','Remo con banda sentado','Principiante',JSON_ARRAY('pull'),'Banda elástica','3 × 12 · descanso 60 s',5,JSON_ARRAY('Pecho abierto','Codos hacia atrás'),NULL,NULL),
('p-pull-apart-banda','Separación de banda','Principiante',JSON_ARRAY('pull'),'Banda elástica','2 × 12–15 · descanso 45 s',4,JSON_ARRAY('Brazos a la altura del pecho','No encorves cuello'),NULL,NULL),
('p-rotacion-externa-banda','Rotación externa con banda','Principiante',JSON_ARRAY('pull'),'Banda elástica','2 × 12 por lado · descanso 45 s',4,JSON_ARRAY('Codo pegado al cuerpo','Movimiento pequeño'),NULL,NULL),
('p-plancha-lateral-rodillas','Plancha lateral con rodillas','Principiante',JSON_ARRAY('core'),'Colchoneta','3 × 15–20 s por lado · descanso 45 s',4,JSON_ARRAY('Cadera elevada','Hombro sobre codo'),NULL,NULL),
('p-crunch-controlado','Crunch corto controlado','Principiante',JSON_ARRAY('core'),'Colchoneta','3 × 10–12 · descanso 45 s',4,JSON_ARRAY('Cuello relajado','Eleva solo hombros'),NULL,NULL),
('p-talon-toques','Toques de talón','Principiante',JSON_ARRAY('core'),'Colchoneta','3 × 10 por lado · descanso 45 s',4,JSON_ARRAY('Costillas abajo','Movimiento lento'),NULL,NULL),
('p-carry-maleta','Caminata con carga a un lado','Principiante',JSON_ARRAY('core','full'),'Mochila o mancuerna','3 × 20 pasos por lado · descanso 45 s',5,JSON_ARRAY('Torso alto','No te inclines'),NULL,NULL),
('p-flexion-pared','Flexión contra pared','Principiante',JSON_ARRAY('push'),'Pared','3 × 12 · descanso 45 s',4,JSON_ARRAY('Cuerpo alineado','Manos a la altura del pecho'),NULL,NULL),

-- Intermedio: máquinas, mancuernas y poleas para ampliar las variantes semanales
('i-extension-rodilla','Extensión de rodilla en máquina','Intermedio',JSON_ARRAY('legs'),'Máquina','3 × 12 · descanso 60 s',6,JSON_ARRAY('Espalda apoyada','No bloquees rodillas'),NULL,NULL),
('i-abduccion-maquina','Abducción de cadera en máquina','Intermedio',JSON_ARRAY('legs'),'Máquina','3 × 12–15 · descanso 60 s',6,JSON_ARRAY('Espalda apoyada','Abre con control'),NULL,NULL),
('i-adduccion-maquina','Aducción de cadera en máquina','Intermedio',JSON_ARRAY('legs'),'Máquina','3 × 12–15 · descanso 60 s',6,JSON_ARRAY('Rango cómodo','Controla retorno'),NULL,NULL),
('i-step-up-mancuernas','Subida a banco con mancuernas','Intermedio',JSON_ARRAY('squat','legs'),'Banco y mancuernas','3 × 8 por lado · descanso 75 s',7,JSON_ARRAY('Pie completo en banco','Bajada controlada'),NULL,NULL),
('i-sentadilla-sumo','Sentadilla sumo con mancuerna','Intermedio',JSON_ARRAY('squat','legs'),'Mancuerna','3 × 10–12 · descanso 75 s',7,JSON_ARRAY('Rodillas siguen puntas','Pecho alto'),NULL,NULL),
('i-pull-through','Pull-through con cable','Intermedio',JSON_ARRAY('hinge','legs'),'Polea','3 × 12 · descanso 75 s',6,JSON_ARRAY('Cadera atrás','Aprieta glúteos arriba'),NULL,NULL),
('i-buenos-dias-banda','Buenos días con banda','Intermedio',JSON_ARRAY('hinge','legs'),'Banda elástica','3 × 12 · descanso 60 s',6,JSON_ARRAY('Bisagra de cadera','Espalda larga'),NULL,NULL),
('i-apertura-cable','Apertura de pecho en polea','Intermedio',JSON_ARRAY('push'),'Poleas','3 × 12 · descanso 60 s',6,JSON_ARRAY('Codos suaves','No arquees la espalda'),NULL,NULL),
('i-elevacion-lateral','Elevación lateral con mancuernas','Intermedio',JSON_ARRAY('push'),'Mancuernas','3 × 12 · descanso 60 s',6,JSON_ARRAY('Sube hasta hombros','Sin impulso'),NULL,NULL),
('i-extension-triceps-polea','Extensión de tríceps en polea','Intermedio',JSON_ARRAY('push'),'Polea','3 × 10–12 · descanso 60 s',6,JSON_ARRAY('Codos fijos','Controla subida'),NULL,NULL),
('i-remo-pecho-apoyado','Remo con pecho apoyado','Intermedio',JSON_ARRAY('pull'),'Banco inclinado y mancuernas','3 × 10–12 · descanso 75 s',7,JSON_ARRAY('Pecho apoyado','Codos hacia atrás'),NULL,NULL),
('i-jalon-brazos-rectos','Jalón con brazos rectos','Intermedio',JSON_ARRAY('pull'),'Polea','3 × 12 · descanso 60 s',6,JSON_ARRAY('Costillas abajo','Brazos casi rectos'),NULL,NULL),
('i-curl-martillo','Curl martillo','Intermedio',JSON_ARRAY('pull'),'Mancuernas','3 × 10–12 · descanso 60 s',6,JSON_ARRAY('Codos cerca del cuerpo','Sin balanceo'),NULL,NULL),
('i-reverse-fly-polea','Apertura inversa en polea','Intermedio',JSON_ARRAY('pull'),'Poleas','3 × 12 · descanso 60 s',6,JSON_ARRAY('Pecho alto','Controla retorno'),NULL,NULL),
('i-plancha-lateral','Plancha lateral','Intermedio',JSON_ARRAY('core'),'Colchoneta','3 × 25–35 s por lado · descanso 60 s',5,JSON_ARRAY('Cadera alta','Respira controlado'),NULL,NULL),
('i-wood-chop','Giro diagonal con cable','Intermedio',JSON_ARRAY('core'),'Polea','3 × 10 por lado · descanso 60 s',6,JSON_ARRAY('Gira con el torso','Cadera estable'),NULL,NULL),

-- Avanzado: variantes compuestas y unilaterales con mayor demanda técnica
('a-zancada-frontal-barra','Zancada frontal con barra','Avanzado',JSON_ARRAY('squat','legs'),'Barra y rack','4 × 6 por lado · descanso 120 s',8,JSON_ARRAY('Torso vertical','Rodilla estable'),NULL,NULL),
('a-hack-squat','Sentadilla hack en máquina','Avanzado',JSON_ARRAY('squat','legs'),'Máquina','4 × 8–10 · descanso 120 s',8,JSON_ARRAY('Espalda apoyada','Controla profundidad'),NULL,NULL),
('a-prensa-unilateral','Prensa de pierna unilateral','Avanzado',JSON_ARRAY('legs'),'Prensa de piernas','4 × 8 por lado · descanso 90 s',8,JSON_ARRAY('Cadera apoyada','No bloquees rodilla'),NULL,NULL),
('a-nordic-curl','Curl nórdico asistido','Avanzado',JSON_ARRAY('hinge','legs'),'Soporte para pies','3 × 5–8 · descanso 120 s',8,JSON_ARRAY('Cadera extendida','Controla bajada'),NULL,NULL),
('a-peso-muerto-deficit','Peso muerto desde déficit','Avanzado',JSON_ARRAY('hinge','legs'),'Barra y plataforma baja','3 × 5 · descanso 150 s',9,JSON_ARRAY('Barra cerca','Espalda neutra'),NULL,NULL),
('a-pull-through-pesado','Pull-through pesado en polea','Avanzado',JSON_ARRAY('hinge','legs'),'Polea','4 × 8–10 · descanso 90 s',7,JSON_ARRAY('Bisagra marcada','No hiperextiendas'),NULL,NULL),
('a-press-inclinado-barra','Press inclinado con barra','Avanzado',JSON_ARRAY('push'),'Banco inclinado y barra','4 × 6–8 · descanso 120 s',8,JSON_ARRAY('Escápulas firmes','Barra controlada'),NULL,NULL),
('a-landmine-press','Press landmine a una mano','Avanzado',JSON_ARRAY('push'),'Barra anclada','3 × 8 por lado · descanso 90 s',7,JSON_ARRAY('Costillas abajo','Empuja en diagonal'),NULL,NULL),
('a-flexion-lastra','Flexión lastrada','Avanzado',JSON_ARRAY('push'),'Disco o chaleco','4 × 8–10 · descanso 90 s',7,JSON_ARRAY('Cuerpo en línea','Controla el pecho'),NULL,NULL),
('a-dominada-supina-lastre','Dominada supina con lastre','Avanzado',JSON_ARRAY('pull'),'Barra y lastre','4 × 5–6 · descanso 120 s',8,JSON_ARRAY('Pecho hacia barra','Sin balanceo'),NULL,NULL),
('a-remo-t','Remo en T','Avanzado',JSON_ARRAY('pull'),'Máquina o barra T','4 × 8 · descanso 90 s',8,JSON_ARRAY('Torso firme','Codos atrás'),NULL,NULL),
('a-meadows-row','Remo Meadows','Avanzado',JSON_ARRAY('pull'),'Barra anclada','3 × 8 por lado · descanso 90 s',7,JSON_ARRAY('Cadera estable','Tira hacia cadera'),NULL,NULL),
('a-pullover-polea','Pullover en polea','Avanzado',JSON_ARRAY('pull'),'Polea','3 × 10–12 · descanso 75 s',7,JSON_ARRAY('Costillas abajo','Sin impulso'),NULL,NULL),
('a-plank-saw','Plancha serrucho','Avanzado',JSON_ARRAY('core'),'Toallas o deslizadores','3 × 10–12 · descanso 60 s',6,JSON_ARRAY('Cadera firme','Desliza lento'),NULL,NULL),
('a-rotacion-colgado','Rotación de rodillas colgado','Avanzado',JSON_ARRAY('core'),'Barra','3 × 8 por lado · descanso 75 s',6,JSON_ARRAY('Sin balanceo','Controla giro'),NULL,NULL),
('a-plancha-lateral-pierna','Plancha lateral con elevación de pierna','Avanzado',JSON_ARRAY('core'),'Colchoneta','3 × 8 por lado · descanso 60 s',6,JSON_ARRAY('Cadera elevada','Pierna controlada'),NULL,NULL)
ON DUPLICATE KEY UPDATE name=VALUES(name), level=VALUES(level), focus_tags=VALUES(focus_tags), equipment=VALUES(equipment), prescription=VALUES(prescription), duration_minutes=VALUES(duration_minutes), cues=VALUES(cues), image_url=VALUES(image_url), video_url=VALUES(video_url), is_active=1;
