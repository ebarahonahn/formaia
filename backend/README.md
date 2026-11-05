# FormaIA API (Node.js + MySQL)

Backend propio para usuarios, perfiles, planes, rutinas, alimentación y progreso.

## Inicio local

1. Copia `.env.example` como `.env` y define las credenciales de MySQL y un `TOKEN_SECRET` largo.
2. Ejecuta `backend/database/schema.sql` y después todas las migraciones de `backend/database/migrations/` en orden numérico (actualmente hasta `035_bulk_payment_imports.sql`) en MySQL 8.0+ con un usuario administrador.
3. Desde `backend/`, ejecuta `npm install` y luego `npm run dev`.
4. Sirve el frontend por HTTP (por ejemplo, puerto 5500) y configura `WEB_ORIGIN` con esa URL.
5. En `backend-client-config.js`, usa la URL de esta API. Para desarrollo local ya apunta a `http://localhost:3000`.

El navegador conserva únicamente una caché de sesión temporal; MySQL es el almacenamiento persistente de usuarios, planes, entrenamientos y avances.

## Endpoints

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`
- `POST /api/auth/password-reset/request`, `POST /api/auth/password-reset/confirm`
- `GET /api/me`, `GET /api/me/access?branchId=:id`, `POST /api/me/access/qr`, `PUT /api/me/profile`
- `GET|POST /api/admin/membership-plans`, `PUT /api/admin/membership-plans/:id`
- `GET|POST /api/admin/memberships`, `PUT /api/admin/memberships/:id/status`
- `GET|POST /api/admin/payments`, `PUT /api/admin/payments/:id/status`
- `GET|POST /api/admin/payment-imports` (importación CSV de pagos bancarios)
- `POST /api/admin/access/verify`, `POST /api/admin/access/qr/verify`, `GET /api/admin/access-events`
- `GET /api/branches`
- `GET /api/organization`, `GET|PUT /api/admin/organization`
- `POST /api/plans/generate`, `GET /api/plans/active`
- `POST /api/plans/weekly-review`
- `POST /api/plans/active/continue`
- `POST /api/workouts/:id/start`, `POST /api/workouts/:id/sets`, `POST /api/workouts/:id/complete`
- `GET /api/progress`, `POST /api/progress`

Los endpoints protegidos reciben `Authorization: Bearer <token>`.

## Base de membresías y accesos

La migración `030_membership_access_foundation.sql` incorpora los planes de membresía, sus vigencias, pagos, permisos de sucursal, asignaciones de personal y una bitácora de accesos. Un único motor valida estado, pago, vigencia, gracia y cobertura de sucursal para toda decisión. `GET /api/me/access` consulta la decisión para la app; añadiendo `branchId` valida una sucursal activa y autorizada. La migración `031_membership_qr_access.sql` añade QR personales, dinámicos y de un solo uso: la app los obtiene con `POST /api/me/access/qr` y Recepción los verifica con `POST /api/admin/access/qr/verify`. El QR no incluye datos personales y su secreto se almacena solamente como hash. `POST /api/admin/access/verify` mantiene la validación manual; `GET /api/admin/access-events` permite consultar la bitácora. La pantalla **Administración → Recepción** permite ejecutar ambas validaciones y revisar los últimos intentos. La API exige una membresía activa y, para planes con costo, un último pago `verified` para iniciar sesión y para cada ruta de miembros; un pago pendiente, rechazado, reembolsado o anulado no permite ver ni ejecutar rutinas. Las cuentas administradoras conservan acceso para poder gestionar cobros y membresías.

La migración `035_bulk_payment_imports.sql` añade un código único de pago a cada membresía y permite conciliar lotes CSV de transferencias, depósitos y débitos automáticos. Desde **Administración → Membresías → Importar pagos bancarios**, el administrador carga hasta 500 filas con `externalId` y `amountHnl`; la membresía se identifica por `paymentCode`, `membershipId` o `email`. Las transacciones repetidas se bloquean por su ID externo, las filas no conciliadas quedan auditadas para revisión y cada pago conciliado activa una membresía pendiente.

## Sucursales y equipo

La migración `028_branch_equipment_catalog.sql` crea una organización y sucursal principal para conservar la compatibilidad con las cuentas actuales. El catálogo de ejercicios continúa siendo canónico; cada sucursal define su inventario en `branch_equipment` y puede activar, desactivar o ajustar ejercicios mediante `branch_exercise_availability`.

`029_seed_branch_equipment_from_catalog.sql` registra en cada sucursal activa una unidad inicial de cada tipo de equipo detectado en el catálogo de ejercicios. Revísalo después en **Administración → Sucursales → Equipo** para ajustar cantidades, zonas y estados a la realidad de cada sede.

Las rutas de administración permiten crear sucursales, registrar equipo, definir requisitos de equipo para un ejercicio y configurar la disponibilidad por sede. Los nuevos planes se generan con la sucursal principal del perfil y guardan ese contexto tanto en `plans` como en `workout_logs`.

## Marca comercial

La migración `034_organization_branding.sql` añade `logo_base64` y `logo_mime_type` a `organizations`. Desde **Administración → Marca**, una cuenta con rol `admin` puede cambiar el nombre comercial y cargar un logo PNG, JPG o WebP de hasta 3 MB. El contenido Base64 del logo queda en MySQL; la API pública devuelve un `data:` URL seguro para el encabezado de la aplicación.

## Registro de entrenamiento

Al iniciar una rutina se crea una sesión en `workout_logs`; no cuenta para la racha hasta que se finaliza. Cada serie guardada registra peso en libras y repeticiones en `workout_set_logs`. Al finalizar, el frontend envía los segundos activos del temporizador y el servidor guarda `duration_seconds` junto con la hora de finalización.

## Generación con IA

`POST /api/plans/generate` ya no depende de IA. Las rutinas, la alimentación, calorías, macros y recetas se seleccionan desde catálogos MySQL.

`POST /api/plans/weekly-review` crea una nueva combinación desde el catálogo de ejercicios y archiva la versión anterior.

## Catálogo de ejercicios

`database/migrations/005_exercise_catalog.sql` incorpora 48 ejercicios iniciales y `006_more_exercise_catalog.sql` añade 48 variantes sin duplicados directos: 32 para principiante e intermedio y 16 para avanzado. Cada registro incluye patrón de movimiento, equipo, prescripción y pautas de ejecución. La tabla también ofrece `image_url` y `video_url`; guarde rutas o URLs de archivos WebP/MP4, nunca videos Base64 dentro de MySQL.

## Ajuste semanal del plan

`008_plan_adjustments.sql` añade la explicación del ajuste aplicado a cada plan. La revisión semanal toma en cuenta sesiones completadas, racha, energía, las dos medidas de peso más recientes y las notas. Una buena adherencia con energía suficiente añade como máximo una serie; baja energía, poca adherencia o una nota de malestar reduce una serie y aumenta el descanso. FormaIA no aumenta cargas automáticamente.

## Catálogo de comidas

Las comidas y recetas no se generan con IA. Se seleccionan de `meal_catalog`, una tabla MySQL con ingredientes habituales de Honduras y precio intermedio. El catálogo inicial está en `database/migrations/002_meal_catalog.sql` y se amplía con `003_more_meal_catalog.sql`; contiene opciones para desayuno, almuerzo, merienda y cena. Cada nuevo plan guarda una selección de 28 comidas (cuatro por día durante siete días), respetando la dieta y los alimentos evitados cuando existan alternativas en el catálogo.

Para ampliar el menú, agrega o edita filas de `meal_catalog` con MySQL Workbench. Cada receta debe conservar sus etiquetas de dieta, alimentos a evitar, ingredientes y pasos en JSON.

## Progreso y motivación

Después de ejecutar `018_progress_motivation.sql`, la pantalla **Progreso** muestra tendencias de peso, medidas, volumen levantado y constancia. También permite definir metas mensuales y recordatorios de rutina, comida o peso. Los avisos del navegador se entregan mientras FormaIA está abierta; el navegador solicita permiso de forma explícita.

## Ciclos de entrenamiento

Cada plan inicia un ciclo nuevo. FormaIA asigna días fijos de entrenamiento: lunes, miércoles y viernes para 3 días; lunes, martes, jueves y sábado para 4; lunes, martes, miércoles, viernes y sábado para 5. Los demás son días de descanso. Al completar todas las sesiones, el ciclo queda marcado como completado y la persona puede revisar las rutinas con IA o continuar el mismo plan en un nuevo ciclo, sin llamar a la IA.

## Correo y seguridad

Configura SMTP en `backend/.env` con una contraseña de aplicación de Gmail (no la contraseña normal de la cuenta). Nunca copies ese secreto en JavaScript del navegador, en Git ni en capturas. La migración `014_auth_security.sql` añade verificación de correo, enlaces de restablecimiento de 30 minutos y sesiones revocables de siete días. La migración `032_staff_roles_and_branch_permissions.sql` habilita los roles `user`, `front_desk`, `branch_manager` y `admin`.

### Roles operativos

- `admin`: gestión global de usuarios, planes, membresías, pagos, sucursales y catálogos.
- `branch_manager`: operación de sus sedes asignadas; puede validar accesos, registrar cobros, y actualizar equipo y ejercicios locales.
- `front_desk`: valida accesos QR o manuales y registra cobros solo en sus sedes asignadas.
- `user`: cliente; usa su plan, membresía y QR personal.

Desde **Administración → Usuarios**, el administrador asigna el rol y, para recepción o gerencia, al menos una sucursal. El servidor comprueba esa asignación en cada acceso, cobro y operación local; cambiar el menú en el navegador no da permisos adicionales.

### Pase diario

En **Administración → Recepción**, el personal puede registrar un pase diario. El valor sugerido es L 100, pero puede ajustarse antes de cobrar. El pase queda ligado al cliente, a la sucursal y a la fecha; habilita solo el ingreso físico de ese día. Al anularlo, también se anula su cobro y se revoca el acceso.

## Seguridad a completar antes de producción

- Servir solo por HTTPS y restringir `WEB_ORIGIN` al dominio real.
- Considerar mover el token a cookies `HttpOnly` para reducir exposición ante XSS.
- Añadir límites de intentos en acceso, recuperación de contraseña, auditoría y validación de payloads.
- Sustituir el generador determinista de planes por un servicio de IA protegido en servidor.
