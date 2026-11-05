import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { promisify } from 'node:util';
import mysql from 'mysql2/promise';
import QRCode from 'qrcode';
import { buildWeeklyMenu, nutritionFromMenu } from './services/weekly-menu-service.js';
import { buildCatalogWorkouts } from './services/catalog-workout-service.js';
import { basePlanAdjustment, deriveWeeklyAdjustment } from './services/plan-adjustment-service.js';
import { localEquivalences, recipeSubstitutions, shoppingList } from './services/meal-planner-service.js';
import { emailEnabled, sendPasswordResetEmail, sendVerificationEmail } from './services/email-service.js';
import { membershipAccessDecision } from './services/membership-access-service.js';

// Lightweight .env loader so the API does not require another runtime dependency.
try {
  const source = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
} catch { /* .env is optional; missing values are reported below. */ }

const scrypt = promisify(crypto.scrypt);
const env = name => process.env[name];
const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD', 'TOKEN_SECRET'];
for (const key of required) if (!env(key)) throw new Error(`Missing required environment variable: ${key}. Create backend/.env from backend/.env.example and set its values.`);

const pool = mysql.createPool({ host: env('MYSQL_HOST'), port: Number(env('MYSQL_PORT') || 3306), database: env('MYSQL_DATABASE'), user: env('MYSQL_USER'), password: env('MYSQL_PASSWORD'), waitForConnections: true, connectionLimit: 10, timezone: 'Z', dateStrings: true });
const sqlPreview = statement => String(statement || '').replace(/\s+/g, ' ').trim().slice(0, 700);
const rawPoolExecute = pool.execute.bind(pool);
pool.execute = async (...args) => {
  try {
    return await rawPoolExecute(...args);
  } catch (error) {
    console.error(`[FormaIA API] MySQL execute failed | ${error.code || error.name} | sql=${sqlPreview(args[0])}`);
    throw error;
  }
};
const logDatabaseConnection = async () => {
  try {
    const [rows] = await pool.query('SELECT DATABASE() AS database_name, COUNT(*) AS user_count, SUM(is_active=1) AS active_user_count FROM users');
    const result = rows[0] || {};
    console.log(`[FormaIA API] MySQL connected | host=${env('MYSQL_HOST')}:${env('MYSQL_PORT') || 3306} | database=${result.database_name || env('MYSQL_DATABASE')} | users=${Number(result.user_count || 0)} | active_users=${Number(result.active_user_count || 0)}`);
  } catch (error) {
    console.error(`[FormaIA API] MySQL startup check failed | host=${env('MYSQL_HOST')}:${env('MYSQL_PORT') || 3306} | database=${env('MYSQL_DATABASE')} | ${error.code || error.name}: ${error.message}`);
  }
};
const origin = env('WEB_ORIGIN') || 'http://localhost:5500';
const send = (res, status, data, extraHeaders = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', ...extraHeaders }); res.end(JSON.stringify(data)); };
const uid = () => crypto.randomUUID();
const twoDigits = value => String(value).padStart(2, '0');
// These values come from the Node.js host clock, never from MySQL's clock or time zone.
const serverDate = (value = new Date()) => `${value.getFullYear()}-${twoDigits(value.getMonth() + 1)}-${twoDigits(value.getDate())}`;
const serverDateTime = (value = new Date()) => `${serverDate(value)} ${twoDigits(value.getHours())}:${twoDigits(value.getMinutes())}:${twoDigits(value.getSeconds())}`;
const serverDateTimeAfter = minutes => serverDateTime(new Date(Date.now() + minutes * 60000));
const serverDateDaysAgo = days => { const value = new Date(); value.setDate(value.getDate() - days); return serverDate(value); };
const base64 = value => Buffer.from(value).toString('base64url');
const tokenHash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const qrAccessToken = () => crypto.randomBytes(32).toString('base64url');
const actionToken = () => crypto.randomBytes(32).toString('base64url');
const sign = payload => { const body = base64(JSON.stringify(payload)); const signature = crypto.createHmac('sha256', env('TOKEN_SECRET')).update(body).digest('base64url'); return `${body}.${signature}`; };
const verify = token => { const [body, signature] = (token || '').split('.'); const expected = crypto.createHmac('sha256', env('TOKEN_SECRET')).update(body || '').digest('base64url'); if (!body || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw Error('Invalid token'); const payload = JSON.parse(Buffer.from(body, 'base64url').toString()); if (payload.exp < Date.now()) throw Error('Expired token'); return payload; };
const passwordHash = async password => { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`; };
const passwordValid = async (password, stored) => { const [salt, hash] = stored.split(':'); return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(await scrypt(password, salt, 64))); };
const strongPassword = password => typeof password === 'string' && password.length >= 8 && /\d/.test(password) && /[^A-Za-z0-9\s]/.test(password);
const body = async req => { let raw = ''; for await (const part of req) { raw += part; if (raw.length > 18_000_000) throw Error('Archivo demasiado grande. Máximo 12 MB.'); } try { return raw ? JSON.parse(raw) : {}; } catch { throw Error('Invalid JSON'); } };
const savePhoto = input => { const match = String(input || '').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/); if (!match) throw Error('La foto debe ser PNG, JPG o WebP.'); const bytes = Buffer.from(match[2], 'base64'); if (!bytes.length || bytes.length > 4_000_000) throw Error('La foto debe pesar menos de 4 MB.'); const extension = match[1] === 'jpeg' ? 'jpg' : match[1]; const filename = `${uid()}.${extension}`; const folder = new URL('../uploads/', import.meta.url); const destination = new URL(`../uploads/${filename}`, import.meta.url); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(destination, bytes); const persisted = fs.existsSync(destination) && fs.statSync(destination).size === bytes.length; if (!persisted) throw Error('No fue posible verificar la foto en el almacenamiento local.'); return { fileUrl: `/uploads/${filename}`, size: bytes.length }; };
const organizationLogo = input => {
  if (input == null || input === '') return null;
  const match = String(input).match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length % 4) throw inputError('El logo debe ser una imagen PNG, JPG o WebP válida.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 3_000_000 || bytes.toString('base64') !== match[2]) throw inputError('El logo debe pesar menos de 3 MB.');
  return { mimeType: `image/${match[1]}`, base64: match[2] };
};
const publicOrganization = organization => organization ? {
  id: organization.id,
  name: organization.name,
  logoDataUrl: organization.logo_base64 && organization.logo_mime_type ? `data:${organization.logo_mime_type};base64,${organization.logo_base64}` : null
} : null;
const saveExerciseMedia = (input, kind) => { const match = String(input || '').match(kind === 'image' ? /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/ : /^data:video\/(mp4|webm);base64,([A-Za-z0-9+/=]+)$/); if (!match) throw Error(kind === 'image' ? 'Selecciona una imagen PNG, JPG o WebP.' : 'Selecciona un video MP4 o WebM.'); const bytes = Buffer.from(match[2], 'base64'); if (!bytes.length || bytes.length > 12_000_000) throw Error('El archivo debe pesar menos de 12 MB.'); const extension = match[1] === 'jpeg' ? 'jpg' : match[1]; const filename = `${uid()}.${extension}`; const folder = new URL('../uploads/exercises/', import.meta.url); const destination = new URL(`../uploads/exercises/${filename}`, import.meta.url); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(destination, bytes); const persisted = fs.existsSync(destination) && fs.statSync(destination).size === bytes.length; if (!persisted) throw Error('No fue posible verificar el archivo en el almacenamiento local.'); return { fileUrl: `/uploads/exercises/${filename}`, size: bytes.length, kind }; };
const jsonValue = value => Buffer.isBuffer(value) ? JSON.parse(value.toString('utf8')) : typeof value === 'string' ? JSON.parse(value) : value || {};
const mealWeekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const mealDay = meal => {
  const recipe = jsonValue(meal?.recipe);
  const day = String(recipe?.day || String(meal?.title || '').split(':')[0]).trim();
  return mealWeekdays.includes(day) ? day : null;
};
const startOfWeek = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
};
const dateForMealThisWeek = (meal, value = new Date()) => {
  const day = mealDay(meal);
  if (!day) return null;
  const date = startOfWeek(value);
  date.setDate(date.getDate() + mealWeekdays.indexOf(day));
  return serverDate(date);
};
const sessionLifetimeMs = 7 * 86400000;
const appUrl = path => new URL(path, origin).toString();
const issueActionToken = async (userId, purpose, minutes) => { const token = actionToken(); const now = serverDateTime(); await pool.execute('UPDATE auth_action_tokens SET used_at=? WHERE user_id=? AND purpose=? AND used_at IS NULL', [now, userId, purpose]); await pool.execute('INSERT INTO auth_action_tokens (id,user_id,purpose,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)', [uid(), userId, purpose, tokenHash(token), serverDateTimeAfter(minutes), now]); return token; };
const createSession = async user => { const sessionId = uid(); const expiresAt = new Date(Date.now() + sessionLifetimeMs); const now = serverDateTime(); const token = sign({ sub: user.id, sid: sessionId, role: user.role || 'user', exp: expiresAt.getTime() }); await pool.execute('INSERT INTO auth_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)', [sessionId, user.id, tokenHash(token), serverDateTime(expiresAt), now, now]); return token; };
const auth = async req => { const header = req.headers.authorization || ''; if (!header.startsWith('Bearer ')) throw Error('Authentication required'); const token = header.slice(7); const payload = verify(token); if (!payload.sid) throw Error('Authentication required'); const now = serverDateTime(); const [sessions] = await pool.execute('SELECT s.id FROM auth_sessions s INNER JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.is_active=1', [payload.sid, payload.sub, tokenHash(token), now]); if (!sessions[0]) throw Error('Authentication required'); await pool.execute('UPDATE auth_sessions SET last_seen_at=? WHERE id=?', [now, payload.sid]); return payload; };
  // Los gerentes comparten el panel administrativo, pero los reportes financieros
  // permanecen como una capacidad exclusiva de ese perfil.
  // `branch_manager` ya existía en instalaciones anteriores con el nombre visible
  // de Gerente. Se conserva su identificador, pero recibe el nuevo alcance global.
  const managementRoles = new Set(['admin', 'manager', 'branch_manager']);
  const reportRoles = new Set(['manager', 'branch_manager']);
  const requireAdmin = async session => { const [users] = await pool.execute('SELECT role FROM users WHERE id=?', [session.sub]); if (!managementRoles.has(users[0]?.role)) { const error = Error('Se requiere rol de administrador o gerente.'); error.status = 403; throw error; } };
  const requireManager = async session => { const [users] = await pool.execute('SELECT role FROM users WHERE id=?', [session.sub]); if (!reportRoles.has(users[0]?.role)) { const error = Error('El módulo de reportes está disponible solo para gerencia.'); error.status = 403; throw error; } };
const staffRoles = new Set(['front_desk', 'branch_manager']);
  const validRoles = new Set(['user', 'front_desk', 'branch_manager', 'manager', 'admin']);
const roleForSession = async session => { const [users] = await pool.execute('SELECT role FROM users WHERE id=? AND is_active=1 LIMIT 1', [session.sub]); return users[0]?.role || null; };
const branchIdsForStaff = async userId => { const [items] = await pool.execute('SELECT branch_id FROM staff_branch_assignments WHERE user_id=? AND is_active=1', [userId]); return items.map(item => item.branch_id); };
const requireBranchOperator = async (session, branchId, allowedRoles = staffRoles) => {
  const role = await roleForSession(session);
    if (managementRoles.has(role)) return { role, branchIds: null };
  if (!allowedRoles.has(role)) { const error = Error('Tu rol no puede operar accesos de sucursal.'); error.status = 403; throw error; }
  const [assignments] = await pool.execute('SELECT branch_id FROM staff_branch_assignments WHERE user_id=? AND branch_id=? AND is_active=1 LIMIT 1', [session.sub, branchId]);
  if (!assignments[0]) { const error = Error('No tienes permiso para operar esta sucursal.'); error.status = 403; throw error; }
  return { role, branchIds: [branchId] };
};
const requireOperationsRole = async session => {
  const role = await roleForSession(session);
    if (managementRoles.has(role)) return { role, branchIds: null };
  if (!staffRoles.has(role)) { const error = Error('Tu rol no puede acceder a la operación de sucursal.'); error.status = 403; throw error; }
  const branchIds = await branchIdsForStaff(session.sub);
  if (!branchIds.length) { const error = Error('No tienes una sucursal asignada.'); error.status = 403; throw error; }
  return { role, branchIds };
};
const defaultBranchId = '00000000-0000-0000-0000-000000000002';
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, createdAt: user.created_at, role: user.role || 'user', active: user.is_active !== 0, emailVerified: Boolean(user.email_verified_at) });
const inputError = message => { const error = Error(message); error.status = 422; return error; };
const staffBranchIds = input => Array.isArray(input) ? [...new Set(input.map(id => String(id || '').trim()).filter(Boolean))].slice(0, 30) : [];
const replaceStaffAssignments = async (connection, userId, role, branchIds) => {
  await connection.execute('DELETE FROM staff_branch_assignments WHERE user_id=?', [userId]);
  if (!staffRoles.has(role)) return;
  if (!branchIds.length) throw inputError('Asigna al menos una sucursal al personal operativo.');
  const placeholders = branchIds.map(() => '?').join(',');
  const [branches] = await connection.execute(`SELECT id FROM branches WHERE is_active=1 AND id IN (${placeholders})`, branchIds);
  if (branches.length !== branchIds.length) throw inputError('Incluiste una sucursal inexistente o inactiva.');
  const now = serverDateTime();
  const assignmentRole = role === 'branch_manager' ? 'manager' : 'front_desk';
  await connection.execute(`INSERT INTO staff_branch_assignments (user_id,branch_id,assignment_role,is_active,assigned_at,updated_at) VALUES ${branchIds.map(() => '(?,?,?,?,?,?)').join(',')}`, branchIds.flatMap(branchId => [userId, branchId, assignmentRole, 1, now, now]));
};
const dateInput = value => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(date.getTime()) || serverDate(date) !== normalized ? null : normalized;
};
const dateAfterDays = (start, days) => { const date = new Date(`${start}T12:00:00`); date.setDate(date.getDate() + days); return serverDate(date); };
const membershipPlanPayload = input => {
  const name = String(input.name || '').trim().slice(0, 120);
  const code = String(input.code || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const description = String(input.description || '').trim().slice(0, 500) || null;
  const durationDays = Number(input.durationDays);
  const priceHnl = Number(input.priceHnl);
  const branchAccessPolicy = String(input.branchAccessPolicy || 'all_branches');
  const branchIds = Array.isArray(input.branchIds) ? [...new Set(input.branchIds.map(id => String(id || '').trim()).filter(Boolean))].slice(0, 50) : [];
  if (name.length < 2 || !code || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650 || !Number.isFinite(priceHnl) || priceHnl < 0 || priceHnl > 1000000 || !['all_branches', 'selected_branches'].includes(branchAccessPolicy) || typeof input.isActive !== 'boolean') throw inputError('Completa los datos válidos del plan de membresía.');
  if (branchAccessPolicy === 'selected_branches' && !branchIds.length) throw inputError('Selecciona al menos una sucursal para este plan.');
  return { name, code, description, durationDays, priceHnl: Math.round(priceHnl * 100) / 100, branchAccessPolicy, branchIds: branchAccessPolicy === 'selected_branches' ? branchIds : [], isActive: input.isActive };
};
const membershipPayload = input => {
  const userId = String(input.userId || '').trim();
  const membershipPlanId = String(input.membershipPlanId || '').trim();
  const startsOn = dateInput(input.startsOn);
  const graceDays = input.graceDays === '' || input.graceDays == null ? 0 : Number(input.graceDays);
  const status = String(input.status || 'pending');
  if (!userId || !membershipPlanId || !startsOn || !Number.isInteger(graceDays) || graceDays < 0 || graceDays > 31 || !['pending', 'active', 'paused', 'suspended', 'cancelled'].includes(status)) throw inputError('Completa los datos válidos de la membresía.');
  return { userId, membershipPlanId, startsOn, graceDays, status };
};
const paymentPayload = input => {
  const membershipId = String(input.membershipId || '').trim();
  const amountHnl = Number(input.amountHnl);
  const method = String(input.method || 'cash');
  const status = String(input.status || 'verified');
  const branchId = String(input.branchId || '').trim() || null;
  const reference = String(input.reference || '').trim().slice(0, 120) || null;
  const receiptNumber = String(input.receiptNumber || '').trim().slice(0, 60) || null;
  const notes = String(input.notes || '').trim().slice(0, 500) || null;
  if (!membershipId || !Number.isFinite(amountHnl) || amountHnl <= 0 || amountHnl > 1000000 || !['cash', 'bank_transfer', 'card', 'pos', 'online', 'adjustment'].includes(method) || !['pending', 'verified'].includes(status)) throw inputError('Completa los datos válidos del pago.');
  return { membershipId, amountHnl: Math.round(amountHnl * 100) / 100, method, status, branchId, reference, receiptNumber, notes };
};
const paymentImportPayload = input => {
  const filename = String(input.filename || 'pagos.csv').trim().slice(0, 255) || 'pagos.csv';
  const sourceMethod = String(input.sourceMethod || 'bank_transfer');
  const rows = Array.isArray(input.rows) ? input.rows.slice(0, 500) : [];
  if (!['bank_transfer', 'bank_deposit', 'direct_debit'].includes(sourceMethod) || !rows.length) throw inputError('Selecciona un origen y un archivo CSV con al menos una fila.');
  return { filename, sourceMethod, rows };
};
const paymentReferenceCode = membershipId => `M-${String(membershipId).replace(/-/g, '').slice(0, 12).toUpperCase()}`;
const importedPaymentRow = raw => {
  const text = value => String(value ?? '').trim();
  const rawAmount = text(raw.amountHnl ?? raw.amount ?? raw.monto);
  const amountText = rawAmount.includes(',') && rawAmount.includes('.') ? (rawAmount.lastIndexOf(',') > rawAmount.lastIndexOf('.') ? rawAmount.replace(/\./g, '').replace(',', '.') : rawAmount.replace(/,/g, '')) : rawAmount.replace(',', '.');
  const amountHnl = Number(amountText);
  const receivedOn = dateInput(text(raw.receivedOn ?? raw.received_at ?? raw.date ?? raw.fecha));
  return {
    externalId: text(raw.externalId ?? raw.external_id ?? raw.transactionId ?? raw.transaction_id ?? raw.idTransaccion ?? raw.id_transaccion).slice(0, 120),
    membershipId: text(raw.membershipId ?? raw.membership_id).slice(0, 36),
    paymentCode: text(raw.paymentCode ?? raw.payment_reference_code ?? raw.codigoPago ?? raw.codigo_pago).toUpperCase().slice(0, 40),
    email: text(raw.email ?? raw.correo).toLowerCase().slice(0, 255),
    reference: text(raw.reference ?? raw.referencia).slice(0, 120) || null,
    receiptNumber: text(raw.receiptNumber ?? raw.receipt_number ?? raw.recibo).slice(0, 60) || null,
    notes: text(raw.notes ?? raw.notas).slice(0, 500) || null,
    amountHnl: Number.isFinite(amountHnl) ? Math.round(amountHnl * 100) / 100 : null,
    receivedAt: receivedOn ? `${receivedOn} 12:00:00` : serverDateTime(),
    rawData: raw && typeof raw === 'object' ? raw : {}
  };
};
const dailyPassPayload = input => {
  const userId = String(input.userId || '').trim();
  const branchId = String(input.branchId || '').trim();
  const amountHnl = input.amountHnl === '' || input.amountHnl == null ? 100 : Number(input.amountHnl);
  const method = String(input.method || 'cash');
  const reference = String(input.reference || '').trim().slice(0, 120) || null;
  const receiptNumber = String(input.receiptNumber || '').trim().slice(0, 60) || null;
  const notes = String(input.notes || '').trim().slice(0, 500) || null;
  if (!userId || !branchId || !Number.isFinite(amountHnl) || amountHnl <= 0 || amountHnl > 1000000 || !['cash', 'bank_transfer', 'card', 'pos', 'online', 'adjustment'].includes(method)) throw inputError('Completa los datos válidos del pase diario.');
  return { userId, branchId, amountHnl: Math.round(amountHnl * 100) / 100, method, reference, receiptNumber, notes };
};
const paymentStatusPayload = input => {
  const status = String(input.status || '');
  if (!['verified', 'rejected', 'void'].includes(status)) throw inputError('El estado de pago no es válido.');
  return status;
};
const qrAccessTokenValue = value => {
  const match = String(value || '').trim().match(/^formaia-access-v1:([A-Za-z0-9_-]{30,})$/);
  return match?.[1] || null;
};
const publicMembership = membership => membership ? {
  id: membership.id,
  planId: membership.planId,
  planName: membership.planName,
  priceHnl: Number(membership.priceHnl || 0),
  status: membership.status,
  startsOn: membership.startsOn,
  endsOn: membership.endsOn,
  graceEndsOn: membership.graceEndsOn,
  branchAccessPolicy: membership.branchAccessPolicy
} : null;
const publicDailyPass = dailyPass => dailyPass ? { id: dailyPass.id, validOn: String(dailyPass.valid_on || dailyPass.validOn).slice(0, 10), amountHnl: Number(dailyPass.amount_hnl || dailyPass.amountHnl || 0), status: dailyPass.status } : null;

const membershipAccessForUser = async (userId, requestedBranchId = null) => {
  const today = serverDate();
  const branchId = String(requestedBranchId || '').trim() || null;
  let branch = null;

  if (branchId) {
    const [branches] = await pool.execute('SELECT id,name,organization_id FROM branches WHERE id=? AND is_active=1 LIMIT 1', [branchId]);
    branch = branches[0] || null;
    if (!branch) return { scope: 'branch', branch: null, allowed: false, reason: 'branch_unavailable', isGracePeriod: false, membership: null };
  }

  let rows;
  try {
    [rows] = await pool.execute(`SELECT m.id,plan.organization_id,m.membership_plan_id,m.status,m.starts_on,m.ends_on,m.grace_ends_on,
      plan.name AS plan_name,plan.price_hnl,plan.branch_access_policy,
      (SELECT payment.status FROM payments payment WHERE payment.membership_id=m.id ORDER BY payment.created_at DESC,payment.id DESC LIMIT 1) AS latest_payment_status
      FROM memberships m INNER JOIN membership_plans plan ON plan.id=m.membership_plan_id
      WHERE m.user_id=? ORDER BY m.ends_on DESC,m.created_at DESC LIMIT 20`, [userId]);
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      const configuration = Error('Falta configurar membresías. Ejecuta backend/database/migrations/030_membership_access_foundation.sql en MySQL.');
      configuration.status = 503;
      throw configuration;
    }
    throw error;
  }

  const memberships = rows.map(row => ({
    id: row.id,
    organizationId: row.organization_id,
    planId: row.membership_plan_id,
    planName: row.plan_name,
    priceHnl: Number(row.price_hnl || 0),
    status: row.status,
    startsOn: String(row.starts_on).slice(0, 10),
    endsOn: String(row.ends_on).slice(0, 10),
    graceEndsOn: row.grace_ends_on ? String(row.grace_ends_on).slice(0, 10) : null,
    requiresPayment: Number(row.price_hnl) > 0,
    latestPaymentStatus: row.latest_payment_status,
    branchAccessPolicy: row.branch_access_policy
  }));
  const validMemberships = memberships.filter(membership => membershipAccessDecision({ membership, today }).allowed);

  if (!branchId) {
    const decision = membershipAccessDecision({ membership: validMemberships[0] || memberships[0] || null, today });
    return { scope: 'app', allowed: decision.allowed, reason: decision.reason, isGracePeriod: decision.isGracePeriod, membership: publicMembership(decision.membership) };
  }

  const matchingOrganization = validMemberships.filter(membership => membership.organizationId === branch.organization_id);
  const grants = new Set();
  if (matchingOrganization.length) {
    const placeholders = matchingOrganization.map(() => '?').join(',');
    const [rowsWithAccess] = await pool.execute(`SELECT membership_id FROM membership_branch_access WHERE branch_id=? AND membership_id IN (${placeholders})
      UNION
      SELECT membership.id AS membership_id FROM memberships membership
      INNER JOIN membership_plan_branches plan_branch ON plan_branch.membership_plan_id=membership.membership_plan_id
      WHERE plan_branch.branch_id=? AND membership.id IN (${placeholders})`, [branchId, ...matchingOrganization.map(membership => membership.id), branchId, ...matchingOrganization.map(membership => membership.id)]);
    for (const row of rowsWithAccess) grants.add(row.membership_id);
  }

  for (const membership of matchingOrganization) {
    const decision = membershipAccessDecision({ membership, today, scope: 'branch', hasBranchAccess: grants.has(membership.id) });
    if (decision.allowed) return { scope: 'branch', branch: { id: branch.id, name: branch.name }, allowed: true, reason: decision.reason, isGracePeriod: decision.isGracePeriod, membership: publicMembership(decision.membership) };
  }

  try {
    const [dailyPasses] = await pool.execute(`SELECT daily_pass.id,daily_pass.valid_on,daily_pass.amount_hnl,daily_pass.status
      FROM daily_passes daily_pass INNER JOIN payments payment ON payment.id=daily_pass.payment_id
      WHERE daily_pass.user_id=? AND daily_pass.branch_id=? AND daily_pass.valid_on=? AND daily_pass.status='active' AND payment.status='verified'
      LIMIT 1`, [userId, branchId, today]);
    if (dailyPasses[0]) return { scope: 'branch', branch: { id: branch.id, name: branch.name }, allowed: true, reason: 'daily_pass_active', isGracePeriod: false, membership: null, dailyPass: publicDailyPass(dailyPasses[0]) };
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
  }

  if (validMemberships.length && !matchingOrganization.length) {
    return { scope: 'branch', branch: { id: branch.id, name: branch.name }, allowed: false, reason: 'branch_not_allowed', isGracePeriod: false, membership: publicMembership(validMemberships[0]) };
  }

  const fallbackMembership = matchingOrganization[0] || validMemberships[0] || memberships[0] || null;
  const decision = membershipAccessDecision({ membership: fallbackMembership, today, scope: 'branch', hasBranchAccess: grants.has(fallbackMembership?.id) });
  return { scope: 'branch', branch: { id: branch.id, name: branch.name }, allowed: decision.allowed, reason: decision.reason, isGracePeriod: decision.isGracePeriod, membership: publicMembership(decision.membership) };
};

const recordAccessEvent = async ({ userId, access, channel, actorUserId = null, deviceLabel = null }) => {
  const validChannels = new Set(['app', 'reception', 'qr', 'api']);
  const scope = access.scope === 'branch' ? 'branch' : 'app';
  const label = String(deviceLabel || '').trim().slice(0, 120) || null;
  await pool.execute(`INSERT INTO access_events (id,user_id,membership_id,branch_id,access_scope,channel,result,reason,actor_user_id,device_label,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    uid(), userId, access.membership?.id || null, access.branch?.id || null, scope,
    validChannels.has(channel) ? channel : 'api', access.allowed ? 'allowed' : 'denied',
    String(access.reason || 'membership_required').slice(0, 80), actorUserId, label, serverDateTime()
  ]);
};

const issueMembershipQr = async userId => {
  const token = qrAccessToken();
  const now = serverDateTime();
  const expiresAt = serverDateTime(new Date(Date.now() + 60_000));
  try {
    await pool.execute('UPDATE membership_qr_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL AND expires_at>?', [now, userId, now]);
    await pool.execute('INSERT INTO membership_qr_tokens (id,user_id,token_hash,expires_at,used_at,created_at) VALUES (?,?,?,?,NULL,?)', [uid(), userId, tokenHash(token), expiresAt, now]);
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      const configuration = Error('Falta configurar los QR de acceso. Ejecuta backend/database/migrations/031_membership_qr_access.sql en MySQL.');
      configuration.status = 503;
      throw configuration;
    }
    throw error;
  }
  const value = `formaia-access-v1:${token}`;
  return { expiresAt, refreshAfterSeconds: 45, imageDataUrl: await QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 1, width: 360, color: { dark: '#143d34', light: '#fffdf8' } }) };
};

const branchAccessError = access => {
  const error = Error(membershipAccessMessage(access.reason));
  error.status = 403;
  error.code = 'BRANCH_ACCESS_DENIED';
  return error;
};

const membershipAccessMessage = reason => ({
  membership_required: 'Necesitas una membresía activa para acceder a FormaIA.',
  membership_not_active: 'Tu membresía está pendiente de activación. Verifica el pago pendiente para acceder a tus rutinas.',
  payment_required: 'Necesitas un pago verificado para activar tu membresía.',
  payment_pending: 'Tu pago está pendiente de verificación. Podrás acceder cuando administración lo apruebe.',
  payment_rejected: 'El último pago fue rechazado. Contacta a administración para regularizar tu membresía.',
  payment_refunded: 'El último pago fue reembolsado. Contacta a administración para regularizar tu membresía.',
  payment_void: 'El último pago fue anulado. Contacta a administración para regularizar tu membresía.',
  branch_unavailable: 'La sucursal seleccionada no está disponible.',
  branch_not_allowed: 'Tu membresía no incluye acceso a esta sucursal.',
  membership_not_started: 'Tu membresía todavía no ha iniciado.',
  membership_expired: 'Tu membresía venció. Regulariza tu pago para continuar usando FormaIA.',
  membership_dates_invalid: 'No pudimos validar la vigencia de tu membresía. Contacta a administración.'
}[reason] || 'No tienes una membresía válida para acceder a FormaIA.');

const requireMembershipAccess = async session => {
  const [users] = await pool.execute('SELECT role FROM users WHERE id=? LIMIT 1', [session.sub]);
  if (users[0]?.role && users[0].role !== 'user') return null;
  const access = await membershipAccessForUser(session.sub);
  if (access.allowed) return access;
  const error = Error(membershipAccessMessage(access.reason));
  error.status = 403;
  error.code = 'MEMBERSHIP_ACCESS_DENIED';
  throw error;
};

const loginRateLimitScopes = ['login_ip', 'login_email'];
const fallbackLoginRateLimits = {
  login_ip: { maxAttempts: 10, windowSeconds: 900, cooldownSeconds: 900, enabled: true },
  login_email: { maxAttempts: 5, windowSeconds: 900, cooldownSeconds: 900, enabled: true }
};
const clientIp = req => {
  const forwarded = env('TRUST_PROXY') === 'true' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  const address = forwarded || req.socket.remoteAddress || 'unknown';
  return String(address).replace(/^::ffff:/, '').slice(0, 45) || 'unknown';
};
const rateLimitError = message => { const error = Error(message); error.status = 503; return error; };
const readLoginRateLimits = async () => {
  let rows;
  try {
    [rows] = await pool.execute('SELECT scope,max_attempts,window_seconds,cooldown_seconds,is_enabled FROM auth_rate_limit_settings WHERE scope IN (?,?)', loginRateLimitScopes);
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') throw rateLimitError('Falta configurar el rate limiting. Ejecuta backend/database/migrations/022_auth_rate_limiting.sql en MySQL.');
    throw error;
  }
  const rules = { ...fallbackLoginRateLimits };
  for (const row of rows) rules[row.scope] = {
    maxAttempts: Math.max(1, Number(row.max_attempts) || fallbackLoginRateLimits[row.scope]?.maxAttempts || 5),
    windowSeconds: Math.max(1, Number(row.window_seconds) || fallbackLoginRateLimits[row.scope]?.windowSeconds || 900),
    cooldownSeconds: Math.max(1, Number(row.cooldown_seconds) || fallbackLoginRateLimits[row.scope]?.cooldownSeconds || 900),
    enabled: Boolean(row.is_enabled)
  };
  return rules;
};
const loginRateSubjects = (req, email) => ({
  login_ip: tokenHash(clientIp(req)),
  login_email: tokenHash(String(email || '').trim().toLowerCase())
});
const formatRetryAfter = seconds => seconds >= 60 ? `${Math.ceil(seconds / 60)} minuto${Math.ceil(seconds / 60) === 1 ? '' : 's'}` : `${seconds} segundos`;
const checkLoginRateLimit = async (subjects, rules) => {
  const now = Date.now();
  let retryAfterSeconds = 0;
  for (const scope of loginRateLimitScopes) {
    const rule = rules[scope];
    if (!rule?.enabled) continue;
    const [rows] = await pool.execute('SELECT failure_count,window_started_at,locked_until FROM auth_login_rate_counters WHERE scope=? AND subject_hash=? LIMIT 1', [scope, subjects[scope]]);
    const counter = rows[0];
    if (!counter) continue;
    const lockedUntil = counter.locked_until ? new Date(counter.locked_until).getTime() : 0;
    if (lockedUntil > now) retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((lockedUntil - now) / 1000));
    else if (lockedUntil || new Date(counter.window_started_at).getTime() + rule.windowSeconds * 1000 <= now) await pool.execute('DELETE FROM auth_login_rate_counters WHERE scope=? AND subject_hash=?', [scope, subjects[scope]]);
  }
  return retryAfterSeconds;
};
const registerFailedLogin = async (subjects, rules) => {
  const connection = await pool.getConnection();
  let retryAfterSeconds = 0;
  try {
    await connection.beginTransaction();
    const now = new Date();
    for (const scope of loginRateLimitScopes) {
      const rule = rules[scope];
      if (!rule?.enabled) continue;
      const [rows] = await connection.execute('SELECT failure_count,window_started_at,locked_until FROM auth_login_rate_counters WHERE scope=? AND subject_hash=? FOR UPDATE', [scope, subjects[scope]]);
      const counter = rows[0];
      const windowExpired = !counter || new Date(counter.window_started_at).getTime() + rule.windowSeconds * 1000 <= now.getTime();
      const failures = (windowExpired ? 0 : Number(counter.failure_count)) + 1;
      const lockedUntil = failures >= rule.maxAttempts ? new Date(now.getTime() + rule.cooldownSeconds * 1000) : null;
      if (counter) await connection.execute('UPDATE auth_login_rate_counters SET failure_count=?,window_started_at=?,locked_until=?,last_attempt_at=? WHERE scope=? AND subject_hash=?', [failures, windowExpired ? serverDateTime(now) : counter.window_started_at, lockedUntil ? serverDateTime(lockedUntil) : null, serverDateTime(now), scope, subjects[scope]]);
      else await connection.execute('INSERT INTO auth_login_rate_counters (scope,subject_hash,failure_count,window_started_at,locked_until,last_attempt_at) VALUES (?,?,?,?,?,?)', [scope, subjects[scope], failures, serverDateTime(now), lockedUntil ? serverDateTime(lockedUntil) : null, serverDateTime(now)]);
      if (lockedUntil) retryAfterSeconds = Math.max(retryAfterSeconds, rule.cooldownSeconds);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return retryAfterSeconds;
};
const clearFailedLogins = async subjects => Promise.all(loginRateLimitScopes.map(scope => pool.execute('DELETE FROM auth_login_rate_counters WHERE scope=? AND subject_hash=?', [scope, subjects[scope]])));

async function activePlan(userId) {
  const [plans] = await pool.execute(`SELECT p.*, b.name AS branch_name
    FROM plans p LEFT JOIN branches b ON b.id=p.branch_id
    WHERE p.user_id=? AND p.status='active' ORDER BY p.created_at DESC LIMIT 1`, [userId]);
  if (!plans[0]) return null; const item = plans[0];
  const [workouts] = await pool.execute('SELECT * FROM plan_workouts WHERE plan_id=? ORDER BY sequence_no', [item.id]);
  const [meals] = await pool.execute('SELECT * FROM plan_meals WHERE plan_id=? ORDER BY sequence_no', [item.id]);
  const [cycles] = await pool.execute('SELECT * FROM plan_cycles WHERE plan_id=? ORDER BY created_at DESC LIMIT 1', [item.id]);
  const cycle = cycles[0] || null;
  const [cycleCount] = cycle ? await pool.execute('SELECT COUNT(DISTINCT wl.workout_id) AS completed_count FROM workout_logs wl INNER JOIN plan_workouts pw ON pw.id=wl.workout_id WHERE wl.user_id=? AND pw.plan_id=? AND wl.completed_on>=? AND wl.completed_at IS NOT NULL', [userId, item.id, cycle.started_on]) : [[{ completed_count: 0 }]];
  const weekStart = serverDate(startOfWeek());
  const weekEndDate = startOfWeek(); weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEnd = serverDate(weekEndDate);
  const [mealLogs] = cycle ? await pool.execute('SELECT plan_meal_id,completed_on,completed_at FROM meal_completion_logs WHERE user_id=? AND plan_id=? AND cycle_id=? AND completed_on BETWEEN ? AND ?', [userId, item.id, cycle.id, weekStart, weekEnd]) : [[]];
  const completedMeals = new Map(mealLogs.map(log => [`${log.plan_meal_id}:${dateOnly(log.completed_on)}`, log]));
  const readJson = value => Buffer.isBuffer(value) ? JSON.parse(value.toString('utf8')) : typeof value === 'string' ? JSON.parse(value) : value;
  const today = serverDate();
  return { id: item.id, branchId: item.branch_id, branchName: item.branch_name || null, calories: item.calories, protein: item.protein_g, carbs: item.carbs_g, fats: item.fats_g, message: item.motivational_message, adjustment: readJson(item.adjustment), cycle: cycle ? { id: cycle.id, startedOn: cycle.started_on, completedAt: cycle.completed_at, completedCount: Number(cycleCount[0].completed_count) } : null, workouts: workouts.map(w => ({ ...w, scheduledOn: w.scheduled_on ? dateOnly(w.scheduled_on) : null, exercises: readJson(w.exercises) })), meals: meals.map(m => { const recipe = readJson(m.recipe); const scheduledOn = dateForMealThisWeek({ ...m, recipe }); const completion = scheduledOn ? completedMeals.get(`${m.id}:${scheduledOn}`) : null; return { ...m, recipe: { ...recipe, substitutions: recipeSubstitutions(recipe) }, scheduled_on: scheduledOn, completed_at: completion?.completed_at || null, completed_on: completion ? dateOnly(completion.completed_on) : null, is_today: scheduledOn === today }; }) };
}

const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : new Date(value).toISOString().slice(0, 10);
async function weeklyContext(userId, currentPlan) {
  const sevenDaysAgo = serverDateDaysAgo(6);
  const [workouts] = await pool.execute('SELECT completed_on FROM workout_logs WHERE user_id=? AND completed_on >= ? AND completed_at IS NOT NULL ORDER BY completed_on', [userId, sevenDaysAgo]);
  const [progress] = await pool.execute('SELECT logged_on, weight_lb, energy, note FROM progress_logs WHERE user_id=? AND logged_on >= ? ORDER BY logged_on DESC LIMIT 3', [userId, sevenDaysAgo]);
  const completedDates = workouts.map(item => dateOnly(item.completed_on));
  const dates = new Set(completedDates); let streak = 0; let cursor = new Date();
  if (!dates.has(dateOnly(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dates.has(dateOnly(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return { completed_sessions_last_7_days: completedDates.length, target_sessions: currentPlan.workouts.length, completed_dates: completedDates, current_streak_days: streak, recent_progress: progress.map(item => ({ date: dateOnly(item.logged_on), weight_lb: item.weight_lb, energy: item.energy, note: item.note })), current_plan: { calories: currentPlan.calories, protein_g: currentPlan.protein, carbs_g: currentPlan.carbs, fats_g: currentPlan.fats } };
}

const currentMonthKey = () => serverDate().slice(0, 7);
const asBoolean = value => value === true || value === 1 || value === '1';
const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
const textList = (value, maximum = 20) => (Array.isArray(value) ? value : String(value || '').split(/[\n,]/)).map(item => String(item).trim()).filter(Boolean).slice(0, maximum);
const allowedDietTags = new Set(['Flexible', 'Vegetariana', 'Mediterránea', 'Alta en proteína']);
const catalogMeal = input => {
  const mealType = String(input.mealType || '').trim();
  const title = String(input.title || '').trim().slice(0, 150);
  const description = String(input.description || '').trim().slice(0, 280);
  const calories = safeInteger(input.calories, 1, 2500);
  const proteinValue = safeDecimal(input.proteinG, 0, 500);
  const carbsValue = safeDecimal(input.carbsG, 0, 500);
  const fatsValue = safeDecimal(input.fatsG, 0, 300);
  const protein = proteinValue === null ? null : Math.round(proteinValue);
  const carbs = carbsValue === null ? null : Math.round(carbsValue);
  const fats = fatsValue === null ? null : Math.round(fatsValue);
  const dietTags = textList(input.dietTags);
  const avoidTags = textList(input.avoidTags);
  const ingredients = textList(input.ingredients, 40);
  const ingredientDetails = (Array.isArray(input.ingredientDetails) ? input.ingredientDetails : []).map(item => ({ foodId: String(item?.foodId || '').trim().slice(0, 64), grams: safeInteger(item?.grams, 1, 5000) })).filter(item => item.foodId && item.grams !== null).slice(0, 30);
  const steps = textList(input.steps, 20);
  if (!['Desayuno', 'Almuerzo', 'Merienda', 'Cena'].includes(mealType) || !title || !description || calories === null || protein === null || carbs === null || fats === null || !dietTags.length || dietTags.some(tag => !allowedDietTags.has(tag)) || !ingredients.length || !steps.length) { const error = Error('Completa los datos de la comida y selecciona al menos un estilo de alimentación válido.'); error.status = 422; throw error; }
  return { mealType, title, description, calories, protein, carbs, fats, dietTags, avoidTags, ingredients, ingredientDetails, steps, isActive: input.isActive !== false };
};

async function progressInsights(userId) {
  const month = currentMonthKey();
  const recentWeekStart = serverDateDaysAgo(6);
  const ninetyDaysAgo = serverDateDaysAgo(89);
  const twelveWeeksAgo = serverDateDaysAgo(83);
  const [[profileRows], [weights], [volumes], [consistency], [weekly], [energy], [nutrition], [allTime], [goalRows], [reminderRows]] = await Promise.all([
    pool.execute('SELECT days_per_week FROM user_profiles WHERE user_id=? LIMIT 1', [userId]),
    pool.execute('SELECT logged_on,weight_lb,measurements FROM progress_logs WHERE user_id=? AND logged_on>=? ORDER BY logged_on ASC', [userId, ninetyDaysAgo]),
    pool.execute('SELECT wl.completed_on AS logged_on,ROUND(COALESCE(SUM(COALESCE(sl.weight_lb,0)*COALESCE(sl.repetitions,0)),0),1) AS volume_lb FROM workout_logs wl LEFT JOIN workout_set_logs sl ON sl.workout_log_id=wl.id WHERE wl.user_id=? AND wl.completed_at IS NOT NULL AND wl.completed_on>=? GROUP BY wl.completed_on ORDER BY wl.completed_on ASC', [userId, ninetyDaysAgo]),
    pool.execute('SELECT DATE_SUB(completed_on, INTERVAL WEEKDAY(completed_on) DAY) AS week_start,COUNT(*) AS sessions FROM workout_logs WHERE user_id=? AND completed_at IS NOT NULL AND completed_on>=? GROUP BY DATE_SUB(completed_on, INTERVAL WEEKDAY(completed_on) DAY) ORDER BY week_start ASC', [userId, twelveWeeksAgo]),
    pool.execute('SELECT COUNT(*) AS sessions,COALESCE(SUM(duration_seconds),0) AS duration_seconds FROM workout_logs WHERE user_id=? AND completed_at IS NOT NULL AND completed_on>=?', [userId, recentWeekStart]),
    pool.execute('SELECT energy,COUNT(*) AS total FROM progress_logs WHERE user_id=? AND logged_on>=? GROUP BY energy', [userId, recentWeekStart]),
    pool.execute('SELECT adherence,COUNT(*) AS total FROM nutrition_daily_logs WHERE user_id=? AND logged_on>=? GROUP BY adherence', [userId, recentWeekStart]),
    pool.execute('SELECT (SELECT COUNT(*) FROM workout_logs WHERE user_id=? AND completed_at IS NOT NULL) AS sessions,(SELECT COUNT(*) FROM progress_logs WHERE user_id=?) AS progress_entries,(SELECT COALESCE(SUM(COALESCE(sl.weight_lb,0)*COALESCE(sl.repetitions,0)),0) FROM workout_logs wl LEFT JOIN workout_set_logs sl ON sl.workout_log_id=wl.id WHERE wl.user_id=? AND wl.completed_at IS NOT NULL) AS volume_lb', [userId, userId, userId]),
    pool.execute('SELECT * FROM monthly_goals WHERE user_id=? AND month_key=? LIMIT 1', [userId, month]),
    pool.execute('SELECT * FROM user_reminder_settings WHERE user_id=? LIMIT 1', [userId])
  ]);
  const defaultSessions = Math.max(4, Number(profileRows[0]?.days_per_week || 3) * 4);
  const goal = goalRows[0] || { month_key: month, sessions_target: defaultSessions, progress_target: 4, weight_target_lb: null };
  const reminder = reminderRows[0] || { workout_enabled: 0, workout_time: '07:00', meal_enabled: 0, meal_time: '12:00', weighin_enabled: 0, weighin_weekday: 1, weighin_time: '07:00', browser_enabled: 0 };
  const monthlySessions = Number((await pool.execute('SELECT COUNT(*) AS total FROM workout_logs WHERE user_id=? AND completed_at IS NOT NULL AND DATE_FORMAT(completed_on,"%Y-%m")=?', [userId, month]))[0][0].total);
  const monthlyProgress = Number((await pool.execute('SELECT COUNT(*) AS total FROM progress_logs WHERE user_id=? AND DATE_FORMAT(logged_on,"%Y-%m")=?', [userId, month]))[0][0].total);
  const energyCounts = Object.fromEntries(energy.map(item => [item.energy, Number(item.total)]));
  const averageEnergy = energyCounts.Alta ? 'Alta' : energyCounts.Media ? 'Media' : energyCounts.Baja ? 'Baja' : 'Sin registros';
  const nutritionCounts = Object.fromEntries(nutrition.map(item => [item.adherence || 'Sin respuesta', Number(item.total)]));
  const total = allTime[0] || {};
  const achievements = [
    { id: 'first-session', title: 'Primer paso', detail: 'Completaste tu primera sesión.', unlocked: Number(total.sessions) >= 1 },
    { id: 'steady', title: 'Constancia', detail: 'Acumulaste 8 sesiones.', unlocked: Number(total.sessions) >= 8 },
    { id: 'strong', title: 'Fuerza en marcha', detail: 'Moviste 1,000 lb en total.', unlocked: Number(total.volume_lb) >= 1000 },
    { id: 'aware', title: 'Seguimiento consciente', detail: 'Registraste 4 avances.', unlocked: Number(total.progress_entries) >= 4 }
  ];
  const recommendation = Number(weekly[0]?.sessions || 0) < Math.max(2, Math.ceil(defaultSessions / 4))
    ? 'Prioriza dos sesiones realistas esta semana; la regularidad vale más que la perfección.'
    : averageEnergy === 'Baja'
      ? 'Tu constancia va bien. Considera recuperar mejor: sueño, hidratación y una carga sostenible.'
      : 'Vas construyendo una buena semana. Mantén tus horarios y registra cómo te sientes.';
  return {
    weights: weights.map(item => ({ date: dateOnly(item.logged_on), weightLb: item.weight_lb == null ? null : Number(item.weight_lb), measurements: item.measurements ? jsonValue(item.measurements) : {} })),
    volume: volumes.map(item => ({ date: dateOnly(item.logged_on), volumeLb: Number(item.volume_lb) })),
    consistency: consistency.map(item => ({ weekStart: dateOnly(item.week_start), sessions: Number(item.sessions) })),
    weekly: { sessions: Number(weekly[0]?.sessions || 0), durationMinutes: Math.round(Number(weekly[0]?.duration_seconds || 0) / 60), energy: averageEnergy, nutrition: nutritionCounts, recommendation },
    monthly: { month, sessions: monthlySessions, progressEntries: monthlyProgress, goal: { sessionsTarget: Number(goal.sessions_target), progressTarget: Number(goal.progress_target), weightTargetLb: goal.weight_target_lb == null ? null : Number(goal.weight_target_lb) } },
    achievements,
    reminders: { workoutEnabled: Boolean(reminder.workout_enabled), workoutTime: reminder.workout_time, mealEnabled: Boolean(reminder.meal_enabled), mealTime: reminder.meal_time, weighinEnabled: Boolean(reminder.weighin_enabled), weighinWeekday: Number(reminder.weighin_weekday), weighinTime: reminder.weighin_time, browserEnabled: Boolean(reminder.browser_enabled) }
  };
}
async function storePlan(userId, profile, generated, branchId = null) {
  const connection = await pool.getConnection(); let planId;
  try {
    await connection.beginTransaction();
    const now = serverDateTime();
    const today = serverDate();
    await connection.execute("UPDATE plans SET status='archived' WHERE user_id=? AND status='active'", [userId]);
    planId = uid();
    await connection.execute('INSERT INTO plans (id,user_id,branch_id,calories,protein_g,carbs_g,fats_g,motivational_message,adjustment,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [planId, userId, branchId, ...generated.macros, JSON.stringify(generated.adjustment || null), now]);
    await connection.execute('INSERT INTO plan_cycles (id,plan_id,user_id,started_on,created_at) VALUES (?,?,?,?,?)', [uid(), planId, userId, today, now]);
    const workoutRows = generated.workouts.map((workout, index) => [uid(), planId, index + 1, workout[0], workout[1], profile.minutes_per_session, JSON.stringify(workout[2])]);
    if (workoutRows.length) await connection.execute(`INSERT INTO plan_workouts (id,plan_id,sequence_no,title,subtitle,duration_minutes,exercises) VALUES ${workoutRows.map(() => '(?,?,?,?,?,?,?)').join(',')}`, workoutRows.flat());
    const mealRows = generated.meals.map((meal, index) => [uid(), planId, index + 1, meal[0], meal[1], meal[2], meal[3], JSON.stringify(meal[4])]);
    if (mealRows.length) await connection.execute(`INSERT INTO plan_meals (id,plan_id,sequence_no,meal_type,title,description,calories,recipe) VALUES ${mealRows.map(() => '(?,?,?,?,?,?,?,?)').join(',')}`, mealRows.flat());
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  return planId;
}

async function replacePlanNutrition(userId, planId, generated) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const now = serverDateTime();
    const [calories, protein, carbs, fats, message] = generated.macros;
    await connection.execute("UPDATE plans SET calories=?,protein_g=?,carbs_g=?,fats_g=?,motivational_message=?,adjustment=? WHERE id=? AND user_id=? AND status='active'", [calories, protein, carbs, fats, message, JSON.stringify(generated.adjustment || null), planId, userId]);
    for (const [index, meal] of generated.meals.entries()) {
      await connection.execute('UPDATE plan_meals SET meal_type=?,title=?,description=?,calories=?,recipe=? WHERE plan_id=? AND sequence_no=?', [meal[0], meal[1], meal[2], meal[3], JSON.stringify(meal[4]), planId, index + 1]);
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

async function catalogWeeklyMeals(profile, variation = '') {
  const [catalog] = await pool.execute('SELECT id, meal_type, title, description, calories, protein_g, carbs_g, fats_g, diet_tags, avoid_tags, ingredients, steps FROM meal_catalog WHERE is_active=1');
  if (!catalog.length) throw Error('El catálogo de comidas está vacío. Ejecuta backend/database/migrations/002_meal_catalog.sql en MySQL.');
  return buildWeeklyMenu(catalog, profile, variation);
}

async function catalogWorkouts(profile, branchId, variation = 0, adjustment = null) {
  const [catalog] = await pool.execute(`SELECT e.*, COALESCE(availability.local_prescription, e.prescription) AS prescription
    FROM exercise_catalog e
    LEFT JOIN branch_exercise_availability availability ON availability.branch_id=? AND availability.exercise_id=e.id
    WHERE e.is_active=1
      AND (availability.is_enabled IS NULL OR availability.is_enabled=1)
      AND NOT EXISTS (
        SELECT 1
        FROM exercise_equipment_requirements requirement
        LEFT JOIN branch_equipment inventory ON inventory.branch_id=?
          AND inventory.equipment_id=requirement.equipment_id
          AND inventory.operational_status='available'
          AND inventory.quantity > 0
        WHERE requirement.exercise_id=e.id AND requirement.is_required=1 AND inventory.id IS NULL
      )`, [branchId, branchId]);
  return buildCatalogWorkouts(catalog, profile, variation, adjustment);
}

async function activeBranchId(userId, requestedBranchId = null) {
  const candidate = String(requestedBranchId || '').trim();
  let branchId;
  if (candidate) {
    const [branches] = await pool.execute('SELECT id FROM branches WHERE id=? AND is_active=1 LIMIT 1', [candidate]);
    if (branches[0]) branchId = branches[0].id;
    else {
      const error = Error('La sucursal seleccionada no está disponible.'); error.status = 422; throw error;
    }
  }
  if (!branchId) {
    const [profiles] = await pool.execute(`SELECT b.id FROM user_profiles p
      INNER JOIN branches b ON b.id=p.home_branch_id AND b.is_active=1
      WHERE p.user_id=? LIMIT 1`, [userId]);
    if (profiles[0]) branchId = profiles[0].id;
  }
  if (!branchId) {
    const [branches] = await pool.execute('SELECT id FROM branches WHERE is_active=1 ORDER BY created_at,id LIMIT 1');
    branchId = branches[0]?.id || defaultBranchId;
  }
  const access = await membershipAccessForUser(userId, branchId);
  if (!access.allowed) throw branchAccessError(access);
  return branchId;
}

const safeInteger = (value, minimum, maximum) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
};
const safeDecimal = (value, minimum, maximum) => { const number = Number(value); return Number.isFinite(number) && number >= minimum && number <= maximum ? Math.round(number * 100) / 100 : null; };
const catalogFood = input => {
  const name = String(input.name || '').trim().slice(0, 150);
  const calories = safeDecimal(input.calories100g, 0, 1000);
  const protein = safeDecimal(input.protein100g, 0, 100);
  const carbs = safeDecimal(input.carbs100g, 0, 100);
  const fats = safeDecimal(input.fats100g, 0, 100);
  const defaultGrams = safeDecimal(input.defaultGrams, 1, 5000);
  if (!name || calories === null || protein === null || carbs === null || fats === null || defaultGrams === null) { const error = Error('Completa nombre, valores por 100 g y porción sugerida con datos válidos.'); error.status = 422; throw error; }
  return { name, calories, protein, carbs, fats, defaultGrams, isActive: input.isActive !== false };
};
const catalogExercise = input => {
  const name = String(input.name || '').trim().slice(0, 150);
  const level = String(input.level || '');
  const focusTags = Array.isArray(input.focusTags) ? [...new Set(input.focusTags.map(value => String(value || '').trim()).filter(Boolean))] : [];
  const equipment = String(input.equipment || '').trim().slice(0, 160);
  const prescription = String(input.prescription || '').trim().slice(0, 90);
  const durationMinutes = safeInteger(input.durationMinutes, 1, 90);
  const cues = Array.isArray(input.cues) ? [...new Set(input.cues.map(value => String(value || '').trim().slice(0, 180)).filter(Boolean))].slice(0, 8) : [];
  const mediaUrl = value => { const url = String(value || '').trim().slice(0, 500); return !url || /^(?:https?:\/\/|\/[A-Za-z0-9_./-]+$)/.test(url) ? url || null : null; };
  const imageUrl = mediaUrl(input.imageUrl);
  const videoUrl = mediaUrl(input.videoUrl);
  const validFocuses = ['squat', 'hinge', 'legs', 'push', 'pull', 'core'];
  if (!name || !['Principiante', 'Intermedio', 'Avanzado'].includes(level) || !focusTags.length || focusTags.some(tag => !validFocuses.includes(tag)) || !equipment || !prescription || durationMinutes === null || !cues.length || (String(input.imageUrl || '').trim() && !imageUrl) || (String(input.videoUrl || '').trim() && !videoUrl)) { const error = Error('Completa nombre, nivel, enfoque, equipo, pauta, duración y al menos una indicación válida. Las rutas de medios deben iniciar con / o http(s).'); error.status = 422; throw error; }
  return { name, level, focusTags, equipment, prescription, durationMinutes, cues, imageUrl, videoUrl, isActive: input.isActive !== false };
};
const setPayload = input => {
  const exerciseIndex = safeInteger(input.exerciseIndex, 0, 30);
  const setNumber = safeInteger(input.setNumber, 1, 20);
  const repetitions = input.repetitions === '' || input.repetitions == null ? null : safeInteger(input.repetitions, 1, 200);
  const weight = input.weightLb === '' || input.weightLb == null ? null : Number(input.weightLb);
  const durationSeconds = input.durationSeconds === '' || input.durationSeconds == null ? null : safeInteger(input.durationSeconds, 1, 3600);
  if (exerciseIndex === null || setNumber === null || repetitions === null && input.repetitions != null && input.repetitions !== '' || durationSeconds === null && input.durationSeconds != null && input.durationSeconds !== '' || weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 2000) || (repetitions === null && weight === null && durationSeconds === null)) throw Error('Datos de serie inválidos.');
  return { exerciseIndex, setNumber, repetitions, durationSeconds, weight: weight === null ? null : Math.round(weight * 10) / 10 };
};
const saveSetLog = async (workoutLogId, input) => {
  const set = setPayload(input);
  const now = serverDateTime();
  await pool.execute('INSERT INTO workout_set_logs (id,workout_log_id,exercise_index,set_number,weight_lb,repetitions,duration_seconds,completed_at) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE weight_lb=VALUES(weight_lb), repetitions=VALUES(repetitions), duration_seconds=VALUES(duration_seconds), completed_at=VALUES(completed_at)', [uid(), workoutLogId, set.exerciseIndex, set.setNumber, set.weight, set.repetitions, set.durationSeconds, now]);
  return set;
};
const plannedSetsForExercise = exercise => {
  const prescription = Array.isArray(exercise) ? exercise[1] : exercise?.prescription || exercise?.sets || '';
  const match = String(prescription).match(/(\d+)\s*(?:×|x|series|bloques)/i);
  return Math.max(1, Number(match?.[1] || 1));
};
const missingWorkoutSets = async (workoutLogId, exercises) => {
  const [rows] = await pool.execute('SELECT exercise_index,set_number FROM workout_set_logs WHERE workout_log_id=? AND completed_at IS NOT NULL AND (weight_lb IS NOT NULL OR repetitions IS NOT NULL OR duration_seconds IS NOT NULL)', [workoutLogId]);
  const completed = new Set(rows.map(row => `${Number(row.exercise_index)}:${Number(row.set_number)}`));
  return (Array.isArray(exercises) ? exercises : []).flatMap((exercise, exerciseIndex) => {
    const name = String(Array.isArray(exercise) ? exercise[0] : exercise?.name || `Ejercicio ${exerciseIndex + 1}`);
    return Array.from({ length: plannedSetsForExercise(exercise) }, (_, offset) => offset + 1)
      .filter(setNumber => !completed.has(`${exerciseIndex}:${setNumber}`))
      .map(setNumber => ({ name, setNumber }));
  });
};
const elapsedInLog = log => {
  const saved = Number(log?.duration_seconds || 0);
  const updatedAt = log?.timer_updated_at ? new Date(log.timer_updated_at).getTime() : 0;
  const live = log?.timer_running && updatedAt ? Math.max(0, Math.floor((Date.now() - updatedAt) / 1000)) : 0;
  return Math.min(21600, Math.max(0, Number(log?.elapsed_seconds ?? saved + live)));
};
const workoutLogWithElapsed = async id => {
  const [rows] = await pool.execute('SELECT wl.* FROM workout_logs wl WHERE wl.id=?', [id]);
  const log = rows[0];
  return log ? { ...log, elapsed_seconds: elapsedInLog(log) } : null;
};
const exerciseLabel = (raw, index) => {
  const exercises = raw ? jsonValue(raw) : [];
  const item = Array.isArray(exercises) ? exercises[index] : Object.values(exercises || {})[index];
  if (Array.isArray(item)) return String(item[0] || `Ejercicio ${Number(index) + 1}`);
  if (item && typeof item === 'object') return String(item.name || item.title || `Ejercicio ${Number(index) + 1}`);
  return `Ejercicio ${Number(index) + 1}`;
};
const exerciseHistory = async userId => {
  const [rows] = await pool.execute(`SELECT DATE_FORMAT(wl.completed_on, '%Y-%m-%d') AS completed_on, pw.title AS workout_title, pw.exercises, wsl.exercise_index, wsl.set_number, wsl.weight_lb, wsl.repetitions
    FROM workout_set_logs wsl
    INNER JOIN workout_logs wl ON wl.id=wsl.workout_log_id
    INNER JOIN plan_workouts pw ON pw.id=wl.workout_id
    WHERE wl.user_id=? AND wl.completed_at IS NOT NULL AND wl.completed_on >= ?
    ORDER BY wl.completed_on ASC, wl.id ASC, wsl.exercise_index ASC, wsl.set_number ASC`, [userId, serverDateDaysAgo(90)]);
  const grouped = new Map();
  for (const row of rows) {
    const date = String(row.completed_on);
    const exercise = exerciseLabel(row.exercises, row.exercise_index);
    const key = `${date}|${exercise}`;
    const entry = grouped.get(key) || { date, exercise, workoutTitle: row.workout_title, volumeLb: 0, maxWeightLb: null, totalReps: 0, completedSets: 0 };
    const weight = Number(row.weight_lb);
    const reps = Number(row.repetitions);
    if (Number.isFinite(reps) && reps > 0) entry.totalReps += reps;
    if (Number.isFinite(weight) && weight >= 0) entry.maxWeightLb = entry.maxWeightLb === null ? weight : Math.max(entry.maxWeightLb, weight);
    if (Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0) entry.volumeLb += weight * reps;
    entry.completedSets += 1;
    grouped.set(key, entry);
  }
  return [...grouped.values()].map(item => ({ ...item, volumeLb: Math.round(item.volumeLb * 10) / 10 }));
};
const personalRecords = async userId => {
  const [rows] = await pool.execute(`SELECT wl.id AS workout_log_id, pw.exercises, wsl.exercise_index, wsl.weight_lb, wsl.repetitions
    FROM workout_set_logs wsl
    INNER JOIN workout_logs wl ON wl.id=wsl.workout_log_id
    INNER JOIN plan_workouts pw ON pw.id=wl.workout_id
    WHERE wl.user_id=? AND wl.completed_at IS NOT NULL
    ORDER BY wl.completed_on ASC, wl.id ASC, wsl.exercise_index ASC, wsl.set_number ASC`, [userId]);
  const records = new Map(); const sessionVolumes = new Map();
  for (const row of rows) {
    const exercise = exerciseLabel(row.exercises, row.exercise_index);
    const item = records.get(exercise) || { exercise, maxWeightLb: null, maxRepetitions: null, maxVolumeLb: 0 };
    const weight = Number(row.weight_lb); const reps = Number(row.repetitions);
    if (Number.isFinite(weight) && weight >= 0) item.maxWeightLb = item.maxWeightLb === null ? weight : Math.max(item.maxWeightLb, weight);
    if (Number.isFinite(reps) && reps > 0) item.maxRepetitions = item.maxRepetitions === null ? reps : Math.max(item.maxRepetitions, reps);
    if (Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0) { const key = `${row.workout_log_id}|${exercise}`; sessionVolumes.set(key, (sessionVolumes.get(key) || 0) + weight * reps); }
    records.set(exercise, item);
  }
  for (const [key, volume] of sessionVolumes) { const exercise = key.split('|').slice(1).join('|'); const item = records.get(exercise); if (item) item.maxVolumeLb = Math.max(item.maxVolumeLb, volume); }
  return [...records.values()].map(item => ({ ...item, maxVolumeLb: Math.round(item.maxVolumeLb * 10) / 10 }));
};
const catalogExerciseTuple = item => [item.name, item.prescription, `${item.duration_minutes} min`, { cues: jsonValue(item.cues), imageUrl: item.image_url, videoUrl: item.video_url, progression: 'Sustitución del catálogo' }];
const normalizedText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const compatibleEquipment = (item, access) => {
  const equipment = normalizedText(item.equipment);
  if (access === 'Sin equipo') return /sin equipo|silla|pared|colchoneta/.test(equipment);
  if (access === 'Bandas o mancuernas') return !/maquina|barra olimpica|rack|polea/.test(equipment);
  return true;
};
const injuryUnsafe = (item, limitations) => {
  const wording = `${normalizedText(item.name)} ${normalizedText(item.focus_tags)}`;
  const issue = normalizedText(limitations);
  if (/rodilla|knee/.test(issue) && /sentadilla|zancada|salto|step|prensa/.test(wording)) return true;
  if (/hombro|shoulder/.test(issue) && /press|flexion|fondos|elevacion/.test(wording)) return true;
  if (/espalda|lumbar|columna/.test(issue) && /peso muerto|remo pendlay|good morning/.test(wording)) return true;
  return false;
};

const routes = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`); const path = url.pathname; const method = req.method;
  if (method === 'OPTIONS') return send(res, 204, {});
  if (method === 'GET' && path === '/api/organization') {
    const [organizations] = await pool.execute('SELECT id,name,logo_base64,logo_mime_type FROM organizations ORDER BY created_at,id LIMIT 1');
    return send(res, 200, { organization: publicOrganization(organizations[0]) });
  }
  if (method === 'GET' && /^\/uploads\/[a-f0-9-]+\.(png|jpg|webp)$/.test(path)) { const filename = path.split('/').pop(); const file = new URL(`../uploads/${filename}`, import.meta.url); if (!fs.existsSync(file)) return send(res, 404, { error: 'Imagen no encontrada.' }); const type = filename.endsWith('.png') ? 'image/png' : filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg'; res.writeHead(200, { 'Content-Type': type, 'Access-Control-Allow-Origin': origin }); return res.end(fs.readFileSync(file)); }
  if (method === 'GET' && /^\/uploads\/exercises\/[a-f0-9-]+\.(png|jpg|webp|mp4|webm)$/.test(path)) { const filename = path.split('/').pop(); const file = new URL(`../uploads/exercises/${filename}`, import.meta.url); if (!fs.existsSync(file)) return send(res, 404, { error: 'Archivo no encontrado.' }); const type = filename.endsWith('.png') ? 'image/png' : filename.endsWith('.webp') ? 'image/webp' : filename.endsWith('.mp4') ? 'video/mp4' : filename.endsWith('.webm') ? 'video/webm' : 'image/jpeg'; res.writeHead(200, { 'Content-Type': type, 'Content-Length': fs.statSync(file).size, 'Access-Control-Allow-Origin': origin }); return res.end(fs.readFileSync(file)); }
  if (method === 'GET' && path === '/health') return send(res, 200, { ok: true, version: 'auth-security-v1', aiRequired: false, emailConfigured: emailEnabled() });
  if (method === 'POST' && path === '/api/auth/register') { const input = await body(req); if (!input.name?.trim() || !/^\S+@\S+\.\S+$/.test(input.email || '') || !strongPassword(String(input.password || ''))) return send(res, 422, { error: 'Usa una contraseña de al menos 8 caracteres que incluya un número y un carácter especial.' }); const user = { id: uid(), name: input.name.trim(), email: input.email.trim().toLowerCase(), password: await passwordHash(input.password), role: 'user', email_verified_at: null }; const now = serverDateTime(); try { await pool.execute('INSERT INTO users (id,name,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)', [user.id, user.name, user.email, user.password, now, now]); } catch (error) { if (error.code === 'ER_DUP_ENTRY') return send(res, 409, { error: 'Ese correo ya tiene una cuenta.' }); throw error; } let verificationSent = false; try { const token = await issueActionToken(user.id, 'verify_email', 1440); verificationSent = await sendVerificationEmail({ email: user.email, name: user.name, url: appUrl(`?verify=${encodeURIComponent(token)}`) }); } catch (error) { console.error(`[FormaIA API] No se pudo enviar verificación: ${error.message}`); } return send(res, 201, { token: await createSession(user), user: publicUser(user), verificationSent }); }
  if (method === 'POST' && path === '/api/auth/login') {
    const input = await body(req);
    const email = String(input.email || '').trim().toLowerCase();
    const rules = await readLoginRateLimits();
    const subjects = loginRateSubjects(req, email);
    const blockedFor = await checkLoginRateLimit(subjects, rules);
    if (blockedFor) return send(res, 429, { error: `Demasiados intentos de inicio de sesión. Inténtalo nuevamente en ${formatRetryAfter(blockedFor)}.` }, { 'Retry-After': String(blockedFor) });
    const [rows] = await pool.execute('SELECT * FROM users WHERE email=? LIMIT 1', [email]);
    const user = rows[0];
    if (!user || !user.is_active || !(await passwordValid(String(input.password || ''), user.password_hash))) {
      const lockedFor = await registerFailedLogin(subjects, rules);
      if (lockedFor) return send(res, 429, { error: `Demasiados intentos de inicio de sesión. Inténtalo nuevamente en ${formatRetryAfter(lockedFor)}.` }, { 'Retry-After': String(lockedFor) });
      return send(res, 401, { error: 'Correo o contraseña incorrectos.' });
    }
    await clearFailedLogins(subjects);
    // Do not issue a usable session to members whose payment has not activated
    // their membership. Server-side route protection below also covers tokens
    // issued before a membership was paused or expired.
    await requireMembershipAccess({ sub: user.id });
    return send(res, 200, { token: await createSession(user), user: publicUser(user) });
  }
  if (method === 'POST' && path === '/api/auth/verify-email') { const input = await body(req); const digest = tokenHash(input.token || ''); const now = serverDateTime(); const [tokens] = await pool.execute("SELECT * FROM auth_action_tokens WHERE purpose='verify_email' AND token_hash=? AND used_at IS NULL AND expires_at>? LIMIT 1", [digest, now]); if (!tokens[0]) return send(res, 422, { error: 'El enlace de verificación es inválido o venció.' }); await pool.execute('UPDATE users SET email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE id=?', [now, now, tokens[0].user_id]); await pool.execute('UPDATE auth_action_tokens SET used_at=? WHERE id=?', [now, tokens[0].id]); return send(res, 200, { ok: true }); }
  if (method === 'POST' && path === '/api/auth/password-reset/request') { const input = await body(req); const [users] = await pool.execute('SELECT * FROM users WHERE email=? LIMIT 1', [String(input.email || '').trim().toLowerCase()]); const user = users[0]; if (user) try { const token = await issueActionToken(user.id, 'password_reset', 30); await sendPasswordResetEmail({ email: user.email, name: user.name, url: appUrl(`?reset=${encodeURIComponent(token)}`) }); } catch (error) { console.error(`[FormaIA API] No se pudo enviar recuperación: ${error.message}`); } return send(res, 200, { ok: true, message: 'Si el correo existe, recibirás instrucciones para restablecer tu contraseña.' }); }
  if (method === 'POST' && path === '/api/auth/password-reset/confirm') { const input = await body(req); if (!strongPassword(String(input.password || ''))) return send(res, 422, { error: 'La contraseña debe tener al menos 8 caracteres, un número y un carácter especial.' }); const digest = tokenHash(input.token || ''); const now = serverDateTime(); const [tokens] = await pool.execute("SELECT * FROM auth_action_tokens WHERE purpose='password_reset' AND token_hash=? AND used_at IS NULL AND expires_at>? LIMIT 1", [digest, now]); if (!tokens[0]) return send(res, 422, { error: 'El enlace de recuperación es inválido o venció.' }); await pool.execute('UPDATE users SET password_hash=?,updated_at=? WHERE id=?', [await passwordHash(input.password), now, tokens[0].user_id]); await pool.execute('UPDATE auth_action_tokens SET used_at=? WHERE id=?', [now, tokens[0].id]); await pool.execute('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', [now, tokens[0].user_id]); return send(res, 200, { ok: true }); }
  const session = await auth(req);
  if (method === 'POST' && path === '/api/auth/logout') { await pool.execute('UPDATE auth_sessions SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL', [serverDateTime(), session.sid, session.sub]); return send(res, 200, { ok: true }); }
  if (method === 'POST' && path === '/api/auth/resend-verification') { const [users] = await pool.execute('SELECT * FROM users WHERE id=?', [session.sub]); const user = users[0]; if (!user || user.email_verified_at) return send(res, 200, { ok: true, alreadyVerified: true }); const token = await issueActionToken(user.id, 'verify_email', 1440); const sent = await sendVerificationEmail({ email: user.email, name: user.name, url: appUrl(`?verify=${encodeURIComponent(token)}`) }); return send(res, 200, { ok: true, sent }); }
  // Access is enforced for every member endpoint, rather than trusting the UI
  // to hide routines. This also invalidates an already-open session when an
  // administrator changes the membership to pending, paused, or expired.
  if (path !== '/api/me/access') await requireMembershipAccess(session);
  if (method === 'GET' && path === '/api/auth/session') return send(res, 200, { ok: true });
  if (method === 'GET' && path === '/api/admin/organization') {
    await requireAdmin(session);
    const [organizations] = await pool.execute('SELECT id,name,logo_base64,logo_mime_type FROM organizations ORDER BY created_at,id LIMIT 1');
    return send(res, 200, { organization: publicOrganization(organizations[0]) });
  }
  if (method === 'PUT' && path === '/api/admin/organization') {
    await requireAdmin(session);
    const input = await body(req);
    const name = String(input.name || '').trim().slice(0, 150);
    if (name.length < 2) return send(res, 422, { error: 'Indica el nombre comercial del gimnasio.' });
    const [organizations] = await pool.execute('SELECT id,name,logo_base64,logo_mime_type FROM organizations ORDER BY created_at,id LIMIT 1');
    const organization = organizations[0];
    if (!organization) return send(res, 422, { error: 'No existe una organización para actualizar.' });
    const logo = input.logoDataUrl === undefined ? undefined : organizationLogo(input.logoDataUrl);
    await pool.execute('UPDATE organizations SET name=?,logo_base64=?,logo_mime_type=?,updated_at=? WHERE id=?', [name, logo === undefined ? organization.logo_base64 : logo?.base64 || null, logo === undefined ? organization.logo_mime_type : logo?.mimeType || null, serverDateTime(), organization.id]);
    return send(res, 200, { organization: { id: organization.id, name, logoDataUrl: logo === undefined ? publicOrganization(organization).logoDataUrl : logo ? `data:${logo.mimeType};base64,${logo.base64}` : null } });
  }
  if (method === 'GET' && path === '/api/admin/users') { await requireAdmin(session); const [[users], [assignments]] = await Promise.all([pool.execute('SELECT id,name,email,role,is_active,email_verified_at,created_at FROM users ORDER BY created_at DESC LIMIT 100'), pool.execute('SELECT user_id,branch_id FROM staff_branch_assignments WHERE is_active=1')]); const branchesByUser = new Map(); for (const assignment of assignments) branchesByUser.set(assignment.user_id, [...(branchesByUser.get(assignment.user_id) || []), assignment.branch_id]); return send(res, 200, { items: users.map(user => ({ ...publicUser(user), branchIds: branchesByUser.get(user.id) || [] })) }); }
  if (method === 'POST' && path === '/api/admin/users') {
    await requireAdmin(session);
    const input = await body(req);
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');
    const role = String(input.role || 'user');
    const branchIds = staffBranchIds(input.branchIds);
    if (name.length < 2 || name.length > 120 || !/^\S+@\S+\.\S+$/.test(email) || !strongPassword(password) || !validRoles.has(role) || typeof input.isActive !== 'boolean') return send(res, 422, { error: 'Completa los datos y el rol con valores válidos.' });
    const id = uid();
    const now = serverDateTime();
    const connection = await pool.getConnection();
    try { await connection.beginTransaction(); await connection.execute('INSERT INTO users (id,name,email,password_hash,role,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', [id, name, email, await passwordHash(password), role, input.isActive ? 1 : 0, now, now]); await replaceStaffAssignments(connection, id, role, branchIds); await connection.commit(); }
    catch (error) { await connection.rollback(); if (error.code === 'ER_DUP_ENTRY') return send(res, 409, { error: 'Ese correo ya tiene una cuenta.' }); throw error; } finally { connection.release(); }
    const [users] = await pool.execute('SELECT id,name,email,role,is_active,email_verified_at,created_at FROM users WHERE id=?', [id]);
    return send(res, 201, { item: publicUser(users[0]) });
  }
  if (method === 'PUT' && /^\/api\/admin\/users\/[^/]+$/.test(path)) {
    await requireAdmin(session);
    const userId = decodeURIComponent(path.split('/').pop());
    const input = await body(req);
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const role = String(input.role || '');
    const password = String(input.password || '');
    const branchIds = staffBranchIds(input.branchIds);
    if (name.length < 2 || name.length > 120 || !/^\S+@\S+\.\S+$/.test(email) || !validRoles.has(role) || typeof input.isActive !== 'boolean' || (password && !strongPassword(password))) return send(res, 422, { error: 'Completa los datos y el rol con valores válidos.' });
    const [existing] = await pool.execute('SELECT id FROM users WHERE id=? LIMIT 1', [userId]);
    if (!existing[0]) return send(res, 404, { error: 'No encontramos ese usuario.' });
    if (userId === session.sub && (!managementRoles.has(role) || !input.isActive)) return send(res, 422, { error: 'No puedes retirarte tu propio acceso de gestión ni inactivar tu cuenta.' });
    const now = serverDateTime();
    const connection = await pool.getConnection();
    try { await connection.beginTransaction(); if (password) await connection.execute('UPDATE users SET name=?,email=?,role=?,is_active=?,password_hash=?,updated_at=? WHERE id=?', [name, email, role, input.isActive ? 1 : 0, await passwordHash(password), now, userId]); else await connection.execute('UPDATE users SET name=?,email=?,role=?,is_active=?,updated_at=? WHERE id=?', [name, email, role, input.isActive ? 1 : 0, now, userId]); await replaceStaffAssignments(connection, userId, role, branchIds); await connection.commit(); } catch (error) { await connection.rollback(); if (error.code === 'ER_DUP_ENTRY') return send(res, 409, { error: 'Ese correo ya tiene una cuenta.' }); throw error; } finally { connection.release(); }
    if (password || !input.isActive) await pool.execute('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', [now, userId]);
    const [users] = await pool.execute('SELECT id,name,email,role,is_active,email_verified_at,created_at FROM users WHERE id=?', [userId]);
    return send(res, 200, { item: publicUser(users[0]) });
  }
  if (method === 'PUT' && /^\/api\/admin\/users\/[^/]+\/role$/.test(path)) { await requireAdmin(session); const userId = path.split('/')[4]; const input = await body(req); const role = String(input.role || ''); if (!validRoles.has(role)) return send(res, 422, { error: 'Rol inválido.' }); if (userId === session.sub && !managementRoles.has(role)) return send(res, 422, { error: 'No puedes retirarte tu propio acceso de gestión.' }); await pool.execute('UPDATE users SET role=?,updated_at=? WHERE id=?', [role, serverDateTime(), userId]); if (!staffRoles.has(role)) await pool.execute('UPDATE staff_branch_assignments SET is_active=0,updated_at=? WHERE user_id=?', [serverDateTime(), userId]); return send(res, 200, { ok: true }); }
  if (method === 'PUT' && /^\/api\/admin\/users\/[^/]+\/status$/.test(path)) { await requireAdmin(session); const userId = path.split('/')[4]; const input = await body(req); if (typeof input.isActive !== 'boolean') return send(res, 422, { error: 'Estado de usuario inválido.' }); if (userId === session.sub && !input.isActive) return send(res, 422, { error: 'No puedes inactivar tu propia cuenta.' }); const now = serverDateTime(); await pool.execute('UPDATE users SET is_active=?,updated_at=? WHERE id=?', [input.isActive ? 1 : 0, now, userId]); if (!input.isActive) await pool.execute('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', [now, userId]); return send(res, 200, { ok: true }); }
  if (method === 'GET' && path === '/api/admin/branches') { const operation = await requireOperationsRole(session); let items; if (managementRoles.has(operation.role)) [items] = await pool.execute('SELECT b.id,b.name,b.code,b.address,b.is_active,b.created_at,o.name AS organization_name FROM branches b INNER JOIN organizations o ON o.id=b.organization_id ORDER BY o.name,b.name'); else { const placeholders = operation.branchIds.map(() => '?').join(','); [items] = await pool.execute(`SELECT b.id,b.name,b.code,b.address,b.is_active,b.created_at,o.name AS organization_name FROM branches b INNER JOIN organizations o ON o.id=b.organization_id WHERE b.id IN (${placeholders}) ORDER BY o.name,b.name`, operation.branchIds); } return send(res, 200, { items }); }
  if (method === 'POST' && path === '/api/admin/branches') { await requireAdmin(session); const input = await body(req); const name = String(input.name || '').trim().slice(0, 150); const code = String(input.code || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40); const address = String(input.address || '').trim().slice(0, 255) || null; const isActive = input.isActive !== false; if (!name || !code) return send(res, 422, { error: 'Indica un nombre y código válido para la sucursal.' }); const [organizations] = await pool.execute('SELECT id,name FROM organizations ORDER BY created_at,id LIMIT 1'); if (!organizations[0]) return send(res, 422, { error: 'No existe una organización para crear la sucursal.' }); const now = serverDateTime(); const id = uid(); try { await pool.execute('INSERT INTO branches (id,organization_id,name,code,address,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', [id, organizations[0].id, name, code, address, isActive ? 1 : 0, now, now]); } catch (error) { if (error.code === 'ER_DUP_ENTRY') return send(res, 409, { error: 'Ya existe una sucursal con ese código.' }); throw error; } return send(res, 201, { item: { id, name, code, address, is_active: isActive ? 1 : 0, organization_name: organizations[0].name } }); }
  if (method === 'PUT' && /^\/api\/admin\/branches\/[^/]+$/.test(path)) { await requireAdmin(session); const branchId = path.split('/')[4]; const input = await body(req); const name = String(input.name || '').trim().slice(0, 150); const code = String(input.code || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40); const address = String(input.address || '').trim().slice(0, 255) || null; if (!name || !code || typeof input.isActive !== 'boolean') return send(res, 422, { error: 'Completa nombre, código y estado de la sucursal.' }); if (!input.isActive) { const [active] = await pool.execute('SELECT COUNT(*) AS total FROM branches WHERE is_active=1 AND id<>?', [branchId]); if (!Number(active[0]?.total)) return send(res, 422, { error: 'Debe permanecer al menos una sucursal activa.' }); } try { const [result] = await pool.execute('UPDATE branches SET name=?,code=?,address=?,is_active=?,updated_at=? WHERE id=?', [name, code, address, input.isActive ? 1 : 0, serverDateTime(), branchId]); if (!result.affectedRows) return send(res, 404, { error: 'No encontramos esa sucursal.' }); } catch (error) { if (error.code === 'ER_DUP_ENTRY') return send(res, 409, { error: 'Ya existe una sucursal con ese código.' }); throw error; } return send(res, 200, { item: { id: branchId, name, code, address, is_active: input.isActive ? 1 : 0 } }); }
  if (method === 'GET' && path === '/api/admin/equipment') { await requireOperationsRole(session); const [items] = await pool.execute('SELECT id,name FROM equipment_catalog ORDER BY name'); return send(res, 200, { items }); }
  if (method === 'GET' && /^\/api\/admin\/branches\/[^/]+\/equipment$/.test(path)) { const branchId = path.split('/')[4]; await requireBranchOperator(session, branchId, new Set(['branch_manager'])); const [items] = await pool.execute(`SELECT be.id,be.equipment_id,ec.name,be.quantity,be.operational_status,be.zone,be.updated_at
    FROM branch_equipment be INNER JOIN equipment_catalog ec ON ec.id=be.equipment_id WHERE be.branch_id=? ORDER BY ec.name,be.zone`, [branchId]); return send(res, 200, { items }); }
  if (method === 'POST' && /^\/api\/admin\/branches\/[^/]+\/equipment$/.test(path)) { const branchId = path.split('/')[4]; await requireBranchOperator(session, branchId, new Set(['branch_manager'])); const input = await body(req); const equipmentId = String(input.equipmentId || '').trim(); const quantity = safeInteger(input.quantity, 1, 1000); const status = String(input.operationalStatus || 'available'); const zone = String(input.zone || '').trim().slice(0, 100) || null; if (!equipmentId || quantity === null || !['available','maintenance','unavailable'].includes(status)) return send(res, 422, { error: 'Los datos del equipo no son válidos.' }); const now = serverDateTime(); const id = uid(); try { await pool.execute('INSERT INTO branch_equipment (id,branch_id,equipment_id,quantity,operational_status,zone,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', [id, branchId, equipmentId, quantity, status, zone, now, now]); } catch (error) { if (error.code === 'ER_DUP_ENTRY') return send(res, 409, { error: 'Ese equipo ya está registrado en esta zona.' }); throw error; } return send(res, 201, { item: { id, equipmentId, quantity, operationalStatus: status, zone } }); }
  if (method === 'PUT' && /^\/api\/admin\/branches\/[^/]+\/equipment\/[^/]+$/.test(path)) { const [, , , , branchId, , recordId] = path.split('/'); await requireBranchOperator(session, branchId, new Set(['branch_manager'])); const input = await body(req); const equipmentId = String(input.equipmentId || '').trim(); const quantity = safeInteger(input.quantity, 1, 1000); const status = String(input.operationalStatus || 'available'); const zone = String(input.zone || '').trim().slice(0, 100) || null; if (!equipmentId || quantity === null || !['available','maintenance','unavailable'].includes(status)) return send(res, 422, { error: 'Los datos del equipo no son válidos.' }); try { const [result] = await pool.execute('UPDATE branch_equipment SET equipment_id=?,quantity=?,operational_status=?,zone=?,updated_at=? WHERE id=? AND branch_id=?', [equipmentId, quantity, status, zone, serverDateTime(), recordId, branchId]); if (!result.affectedRows) return send(res, 404, { error: 'No encontramos ese equipo en esta sucursal.' }); } catch (error) { if (error.code === 'ER_DUP_ENTRY') return send(res, 409, { error: 'Ese equipo ya está registrado en esta zona.' }); throw error; } return send(res, 200, { item: { id: recordId, equipmentId, quantity, operationalStatus: status, zone } }); }
  if (method === 'GET' && /^\/api\/admin\/branches\/[^/]+\/exercises$/.test(path)) { const branchId = path.split('/')[4]; await requireBranchOperator(session, branchId, new Set(['branch_manager'])); const [items] = await pool.execute(`SELECT e.id,e.name,e.level,e.equipment,e.is_active,
    COALESCE(a.is_enabled,1) AS is_enabled,a.local_prescription,a.notes
    FROM exercise_catalog e LEFT JOIN branch_exercise_availability a ON a.branch_id=? AND a.exercise_id=e.id
    ORDER BY e.level,e.name`, [branchId]); return send(res, 200, { items }); }
  if (method === 'PUT' && /^\/api\/admin\/branches\/[^/]+\/exercises\/[^/]+$/.test(path)) { const [, , , , branchId, , exerciseId] = path.split('/'); await requireBranchOperator(session, branchId, new Set(['branch_manager'])); const input = await body(req); if (typeof input.isEnabled !== 'boolean') return send(res, 422, { error: 'Indica si el ejercicio está disponible.' }); const prescription = String(input.localPrescription || '').trim().slice(0, 90) || null; const notes = String(input.notes || '').trim().slice(0, 280) || null; await pool.execute('INSERT INTO branch_exercise_availability (branch_id,exercise_id,is_enabled,local_prescription,notes,updated_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE is_enabled=VALUES(is_enabled),local_prescription=VALUES(local_prescription),notes=VALUES(notes),updated_at=VALUES(updated_at)', [branchId, exerciseId, input.isEnabled ? 1 : 0, prescription, notes, serverDateTime()]); return send(res, 200, { ok: true }); }
  if (method === 'GET' && path === '/api/operations/members') { const operation = await requireOperationsRole(session); const [items] = await pool.execute("SELECT id,name,email,role,is_active,email_verified_at,created_at FROM users WHERE is_active=1 AND role='user' ORDER BY name LIMIT 200"); return send(res, 200, { items: items.map(publicUser) }); }
  if (method === 'GET' && path === '/api/admin/daily-passes') {
    const operation = await requireOperationsRole(session); const validOn = dateInput(url.searchParams.get('date')) || serverDate();
    const scope = managementRoles.has(operation.role) ? { where: '1=1', values: [] } : { where: `daily_pass.branch_id IN (${operation.branchIds.map(() => '?').join(',')})`, values: operation.branchIds };
    const [items] = await pool.execute(`SELECT daily_pass.id,daily_pass.user_id,daily_pass.branch_id,daily_pass.valid_on,daily_pass.amount_hnl,daily_pass.status,daily_pass.created_at,user.name AS user_name,user.email AS user_email,branch.name AS branch_name,payment.method,payment.receipt_number,payment.reference
      FROM daily_passes daily_pass INNER JOIN users user ON user.id=daily_pass.user_id INNER JOIN branches branch ON branch.id=daily_pass.branch_id LEFT JOIN payments payment ON payment.id=daily_pass.payment_id
      WHERE daily_pass.valid_on=? AND ${scope.where} ORDER BY daily_pass.created_at DESC`, [validOn, ...scope.values]);
    return send(res, 200, { validOn, items });
  }
  if (method === 'POST' && path === '/api/admin/daily-passes') {
    const dailyPass = dailyPassPayload(await body(req)); await requireBranchOperator(session, dailyPass.branchId);
    const now = serverDateTime(); const validOn = serverDate(); const connection = await pool.getConnection(); let item;
    try {
      await connection.beginTransaction();
      const [users] = await connection.execute("SELECT id,name,email FROM users WHERE id=? AND role='user' AND is_active=1 FOR UPDATE", [dailyPass.userId]);
      if (!users[0]) throw inputError('Selecciona un cliente activo.');
      const [branches] = await connection.execute('SELECT id,name,organization_id FROM branches WHERE id=? AND is_active=1 FOR UPDATE', [dailyPass.branchId]);
      const branch = branches[0]; if (!branch) throw inputError('Selecciona una sucursal activa.');
      const passId = uid(); const paymentId = uid();
      await connection.execute('INSERT INTO daily_passes (id,user_id,organization_id,branch_id,payment_id,valid_on,amount_hnl,status,registered_by_user_id,created_at,updated_at) VALUES (?,?,?,?,NULL,?,?,"active",?,?,?)', [passId, dailyPass.userId, branch.organization_id, branch.id, validOn, dailyPass.amountHnl, session.sub, now, now]);
      await connection.execute('INSERT INTO payments (id,user_id,organization_id,membership_id,branch_id,amount_hnl,method,status,reference,receipt_number,received_at,verified_at,registered_by_user_id,verified_by_user_id,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [paymentId, dailyPass.userId, branch.organization_id, null, branch.id, dailyPass.amountHnl, dailyPass.method, 'verified', dailyPass.reference, dailyPass.receiptNumber, now, now, session.sub, session.sub, dailyPass.notes, now, now]);
      await connection.execute('UPDATE daily_passes SET payment_id=?,updated_at=? WHERE id=?', [paymentId, now, passId]);
      item = { id: passId, user_id: dailyPass.userId, user_name: users[0].name, user_email: users[0].email, branch_id: branch.id, branch_name: branch.name, valid_on: validOn, amount_hnl: dailyPass.amountHnl, status: 'active', method: dailyPass.method, receipt_number: dailyPass.receiptNumber, reference: dailyPass.reference, created_at: now };
      await connection.commit();
    } catch (error) { await connection.rollback(); if (error.code === 'ER_DUP_ENTRY') { const conflict = Error('Este cliente ya tiene un pase diario activo para esta sucursal hoy.'); conflict.status = 409; throw conflict; } throw error; } finally { connection.release(); }
    return send(res, 201, { item });
  }
  if (method === 'PUT' && /^\/api\/admin\/daily-passes\/[^/]+\/void$/.test(path)) {
    const passId = decodeURIComponent(path.split('/')[4]); const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [passes] = await connection.execute('SELECT id,branch_id,payment_id,status FROM daily_passes WHERE id=? FOR UPDATE', [passId]);
      const dailyPass = passes[0];
      if (!dailyPass) { const error = Error('No encontramos ese pase diario.'); error.status = 404; throw error; }
      await requireBranchOperator(session, dailyPass.branch_id);
      if (dailyPass.status !== 'active') { const error = Error('Ese pase ya fue anulado.'); error.status = 409; throw error; }
      const now = serverDateTime();
      await connection.execute("UPDATE daily_passes SET status='void',updated_at=? WHERE id=?", [now, passId]);
      if (dailyPass.payment_id) await connection.execute("UPDATE payments SET status='void',updated_at=? WHERE id=?", [now, dailyPass.payment_id]);
      await connection.commit(); return send(res, 200, { ok: true, status: 'void' });
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
  if (method === 'POST' && path === '/api/admin/access/qr/verify') {
    const input = await body(req);
    const branchId = String(input.branchId || '').trim();
    const token = qrAccessTokenValue(input.qrValue);
    if (!branchId || !token) throw inputError('El código QR no es válido.');
    await requireBranchOperator(session, branchId);
    const connection = await pool.getConnection();
    let userId, access;
    try {
      await connection.beginTransaction();
      const [tokens] = await connection.execute('SELECT id,user_id,expires_at,used_at FROM membership_qr_tokens WHERE token_hash=? FOR UPDATE', [tokenHash(token)]);
      const qr = tokens[0];
      if (!qr) { const error = Error('El código QR no es válido o ya no existe.'); error.status = 422; throw error; }
      userId = qr.user_id;
      access = await membershipAccessForUser(userId, branchId);
      const expired = String(qr.expires_at) <= serverDateTime();
      if (expired || qr.used_at) access = { ...access, allowed: false, reason: expired ? 'qr_expired' : 'qr_already_used' };
      await connection.execute('UPDATE membership_qr_tokens SET used_at=COALESCE(used_at,?) WHERE id=?', [serverDateTime(), qr.id]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    await recordAccessEvent({ userId, access, channel: 'qr', actorUserId: session.sub, deviceLabel: input.deviceLabel });
    const [customers] = await pool.execute('SELECT id,name,email FROM users WHERE id=? LIMIT 1', [userId]);
    return send(res, 200, { ...access, customer: customers[0] || null });
  }
  if (method === 'POST' && path === '/api/admin/access/verify') {
    const input = await body(req);
    const userId = String(input.userId || '').trim();
    const branchId = String(input.branchId || '').trim();
    const channel = ['reception', 'qr'].includes(input.channel) ? input.channel : 'reception';
    if (!userId || !branchId) throw inputError('Indica el cliente y la sucursal para validar el acceso.');
    await requireBranchOperator(session, branchId);
    const [users] = await pool.execute('SELECT id,name,email FROM users WHERE id=? AND is_active=1 LIMIT 1', [userId]);
    if (!users[0]) return send(res, 404, { error: 'No encontramos una cuenta activa para este cliente.' });
    const access = await membershipAccessForUser(userId, branchId);
    await recordAccessEvent({ userId, access, channel, actorUserId: session.sub, deviceLabel: input.deviceLabel });
    return send(res, 200, { ...access, customer: users[0] });
  }
  if (method === 'GET' && path === '/api/admin/access-events') {
    const operation = await requireOperationsRole(session);
    const limit = safeInteger(url.searchParams.get('limit'), 1, 200) || 50;
    const branchId = String(url.searchParams.get('branchId') || '').trim();
    if (!managementRoles.has(operation.role) && branchId && !operation.branchIds.includes(branchId)) { const error = Error('No tienes permiso para consultar esa sucursal.'); error.status = 403; throw error; }
    const scope = managementRoles.has(operation.role) ? { where: '(?=\'\' OR event.branch_id=?)', values: [branchId, branchId] } : { where: `event.branch_id IN (${operation.branchIds.map(() => '?').join(',')})${branchId ? ' AND event.branch_id=?' : ''}`, values: [...operation.branchIds, ...(branchId ? [branchId] : [])] };
    const [items] = await pool.execute(`SELECT event.id,event.access_scope,event.channel,event.result,event.reason,event.device_label,event.created_at,
      user.id AS user_id,user.name AS user_name,user.email AS user_email,branch.id AS branch_id,branch.name AS branch_name,
      membership.id AS membership_id,plan.name AS plan_name,actor.name AS actor_name
      FROM access_events event
      INNER JOIN users user ON user.id=event.user_id
      LEFT JOIN branches branch ON branch.id=event.branch_id
      LEFT JOIN memberships membership ON membership.id=event.membership_id
      LEFT JOIN membership_plans plan ON plan.id=membership.membership_plan_id
      LEFT JOIN users actor ON actor.id=event.actor_user_id
      WHERE ${scope.where} ORDER BY event.created_at DESC,event.id DESC LIMIT ?`, [...scope.values, limit]);
    return send(res, 200, { items });
  }
  if (method === 'GET' && path === '/api/admin/membership-plans') {
    await requireAdmin(session);
    const [[organizations], [plans], [planBranches]] = await Promise.all([
      pool.execute('SELECT id,name FROM organizations ORDER BY created_at,id LIMIT 1'),
      pool.execute('SELECT id,organization_id,code,name,description,duration_days,price_hnl,branch_access_policy,is_active,created_at,updated_at FROM membership_plans ORDER BY is_active DESC,name'),
      pool.execute('SELECT membership_plan_id,branch_id FROM membership_plan_branches')
    ]);
    const branchesByPlan = new Map();
    for (const branch of planBranches) branchesByPlan.set(branch.membership_plan_id, [...(branchesByPlan.get(branch.membership_plan_id) || []), branch.branch_id]);
    return send(res, 200, { organization: organizations[0] || null, items: plans.map(plan => ({ ...plan, durationDays: Number(plan.duration_days), priceHnl: Number(plan.price_hnl), branchIds: branchesByPlan.get(plan.id) || [] })) });
  }
  if (method === 'POST' && path === '/api/admin/membership-plans') {
    await requireAdmin(session);
    const plan = membershipPlanPayload(await body(req));
    const [organizations] = await pool.execute('SELECT id FROM organizations ORDER BY created_at,id LIMIT 1');
    if (!organizations[0]) throw inputError('No existe una organización para crear el plan.');
    if (plan.branchIds.length) {
      const placeholders = plan.branchIds.map(() => '?').join(',');
      const [branches] = await pool.execute(`SELECT id FROM branches WHERE organization_id=? AND is_active=1 AND id IN (${placeholders})`, [organizations[0].id, ...plan.branchIds]);
      if (branches.length !== plan.branchIds.length) throw inputError('Incluiste una sucursal inexistente o inactiva.');
    }
    const connection = await pool.getConnection(); const id = uid(); const now = serverDateTime();
    try {
      await connection.beginTransaction();
      await connection.execute('INSERT INTO membership_plans (id,organization_id,code,name,description,duration_days,price_hnl,branch_access_policy,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [id, organizations[0].id, plan.code, plan.name, plan.description, plan.durationDays, plan.priceHnl, plan.branchAccessPolicy, plan.isActive ? 1 : 0, now, now]);
      if (plan.branchIds.length) await connection.execute(`INSERT INTO membership_plan_branches (membership_plan_id,branch_id,created_at) VALUES ${plan.branchIds.map(() => '(?,?,?)').join(',')}`, plan.branchIds.flatMap(branchId => [id, branchId, now]));
      await connection.commit();
    } catch (error) { await connection.rollback(); if (error.code === 'ER_DUP_ENTRY') { const conflict = Error('Ya existe un plan con ese código.'); conflict.status = 409; throw conflict; } throw error; } finally { connection.release(); }
    return send(res, 201, { item: { id, organization_id: organizations[0].id, code: plan.code, name: plan.name, description: plan.description, duration_days: plan.durationDays, price_hnl: plan.priceHnl, branch_access_policy: plan.branchAccessPolicy, is_active: plan.isActive ? 1 : 0, branchIds: plan.branchIds } });
  }
  if (method === 'PUT' && /^\/api\/admin\/membership-plans\/[^/]+$/.test(path)) {
    await requireAdmin(session);
    const planId = decodeURIComponent(path.split('/').pop()); const plan = membershipPlanPayload(await body(req));
    const [existing] = await pool.execute('SELECT id,organization_id FROM membership_plans WHERE id=? LIMIT 1', [planId]);
    if (!existing[0]) return send(res, 404, { error: 'No encontramos ese plan de membresía.' });
    if (plan.branchIds.length) {
      const placeholders = plan.branchIds.map(() => '?').join(',');
      const [branches] = await pool.execute(`SELECT id FROM branches WHERE organization_id=? AND is_active=1 AND id IN (${placeholders})`, [existing[0].organization_id, ...plan.branchIds]);
      if (branches.length !== plan.branchIds.length) throw inputError('Incluiste una sucursal inexistente o inactiva.');
    }
    const connection = await pool.getConnection(); const now = serverDateTime();
    try {
      await connection.beginTransaction();
      await connection.execute('UPDATE membership_plans SET code=?,name=?,description=?,duration_days=?,price_hnl=?,branch_access_policy=?,is_active=?,updated_at=? WHERE id=?', [plan.code, plan.name, plan.description, plan.durationDays, plan.priceHnl, plan.branchAccessPolicy, plan.isActive ? 1 : 0, now, planId]);
      await connection.execute('DELETE FROM membership_plan_branches WHERE membership_plan_id=?', [planId]);
      if (plan.branchIds.length) await connection.execute(`INSERT INTO membership_plan_branches (membership_plan_id,branch_id,created_at) VALUES ${plan.branchIds.map(() => '(?,?,?)').join(',')}`, plan.branchIds.flatMap(branchId => [planId, branchId, now]));
      await connection.commit();
    } catch (error) { await connection.rollback(); if (error.code === 'ER_DUP_ENTRY') { const conflict = Error('Ya existe un plan con ese código.'); conflict.status = 409; throw conflict; } throw error; } finally { connection.release(); }
    return send(res, 200, { item: { id: planId, organization_id: existing[0].organization_id, code: plan.code, name: plan.name, description: plan.description, duration_days: plan.durationDays, price_hnl: plan.priceHnl, branch_access_policy: plan.branchAccessPolicy, is_active: plan.isActive ? 1 : 0, branchIds: plan.branchIds } });
  }
  if (method === 'GET' && path === '/api/admin/memberships') {
    await requireAdmin(session);
    const [[items], [accessRows]] = await Promise.all([
      pool.execute(`SELECT m.id,m.user_id,m.membership_plan_id,m.status,m.starts_on,m.ends_on,m.grace_ends_on,m.payment_reference_code,m.created_at,u.name AS user_name,u.email AS user_email,plan.name AS plan_name,plan.price_hnl AS plan_price_hnl,plan.branch_access_policy
        FROM memberships m INNER JOIN users u ON u.id=m.user_id INNER JOIN membership_plans plan ON plan.id=m.membership_plan_id
        ORDER BY m.ends_on DESC,m.created_at DESC LIMIT 150`),
      pool.execute(`SELECT membership.id AS membership_id,branch.id AS branch_id,branch.name AS branch_name
        FROM memberships membership INNER JOIN membership_plan_branches mapping ON mapping.membership_plan_id=membership.membership_plan_id INNER JOIN branches branch ON branch.id=mapping.branch_id
        UNION SELECT membership_id,branch.id AS branch_id,branch.name FROM membership_branch_access access_map INNER JOIN branches branch ON branch.id=access_map.branch_id`)
    ]);
    const branchesByMembership = new Map();
    for (const access of accessRows) branchesByMembership.set(access.membership_id, [...(branchesByMembership.get(access.membership_id) || []), { id: access.branch_id, name: access.branch_name }]);
    return send(res, 200, { items: items.map(item => { const branches = branchesByMembership.get(item.id) || []; return { ...item, allowedBranches: branches.map(branch => branch.name), allowedBranchIds: branches.map(branch => branch.id) }; }) });
  }
  if (method === 'POST' && path === '/api/admin/memberships') {
    await requireAdmin(session);
    const membership = membershipPayload(await body(req)); const now = serverDateTime();
    const connection = await pool.getConnection(); let item;
    try {
      await connection.beginTransaction();
      const [users] = await connection.execute('SELECT id FROM users WHERE id=? AND is_active=1 FOR UPDATE', [membership.userId]);
      if (!users[0]) throw inputError('Selecciona una cuenta activa.');
      const [plans] = await connection.execute('SELECT id,duration_days FROM membership_plans WHERE id=? AND is_active=1 FOR UPDATE', [membership.membershipPlanId]);
      if (!plans[0]) throw inputError('Selecciona un plan activo.');
      const endsOn = dateAfterDays(membership.startsOn, Number(plans[0].duration_days) - 1);
      const graceEndsOn = membership.graceDays ? dateAfterDays(endsOn, membership.graceDays) : null;
      const id = uid();
      await connection.execute('INSERT INTO memberships (id,user_id,membership_plan_id,status,starts_on,ends_on,grace_ends_on,payment_reference_code,activated_at,suspended_at,cancelled_at,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, membership.userId, membership.membershipPlanId, membership.status, membership.startsOn, endsOn, graceEndsOn, paymentReferenceCode(id), membership.status === 'active' ? now : null, membership.status === 'suspended' ? now : null, membership.status === 'cancelled' ? now : null, session.sub, now, now]);
      const [rows] = await connection.execute(`SELECT m.id,m.user_id,m.membership_plan_id,m.status,m.starts_on,m.ends_on,m.grace_ends_on,m.payment_reference_code,m.created_at,u.name AS user_name,u.email AS user_email,plan.name AS plan_name,plan.branch_access_policy FROM memberships m INNER JOIN users u ON u.id=m.user_id INNER JOIN membership_plans plan ON plan.id=m.membership_plan_id WHERE m.id=?`, [id]);
      item = rows[0]; await connection.commit();
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    return send(res, 201, { item: { ...item, allowedBranches: [] } });
  }
  if (method === 'PUT' && /^\/api\/admin\/memberships\/[^/]+\/status$/.test(path)) {
    await requireAdmin(session);
    const membershipId = path.split('/')[4]; const input = await body(req); const status = String(input.status || ''); const reason = String(input.cancellationReason || '').trim().slice(0, 280) || null;
    if (!['active', 'paused', 'suspended', 'cancelled'].includes(status)) throw inputError('Estado de membresía inválido.');
    const now = serverDateTime();
    const [result] = await pool.execute('UPDATE memberships SET status=?,activated_at=CASE WHEN ?="active" THEN COALESCE(activated_at,?) ELSE activated_at END,suspended_at=CASE WHEN ?="suspended" THEN ? ELSE suspended_at END,cancelled_at=CASE WHEN ?="cancelled" THEN ? ELSE cancelled_at END,cancellation_reason=CASE WHEN ?="cancelled" THEN ? ELSE cancellation_reason END,updated_at=? WHERE id=?', [status, status, now, status, now, status, now, status, reason, now, membershipId]);
    if (!result.affectedRows) return send(res, 404, { error: 'No encontramos esa membresía.' });
    return send(res, 200, { ok: true, status });
  }
  if (method === 'GET' && path === '/api/admin/payments') {
    const operation = await requireOperationsRole(session);
    const scope = managementRoles.has(operation.role) ? { where: '1=1', values: [] } : { where: `payment.branch_id IN (${operation.branchIds.map(() => '?').join(',')})`, values: operation.branchIds };
    const [items] = await pool.execute(`SELECT payment.id,payment.membership_id,payment.amount_hnl,payment.currency,payment.method,payment.status,payment.reference,payment.receipt_number,payment.received_at,payment.verified_at,payment.notes,payment.created_at,
      user.name AS user_name,user.email AS user_email,plan.name AS plan_name,branch.name AS branch_name
      FROM payments payment INNER JOIN users user ON user.id=payment.user_id LEFT JOIN memberships membership ON membership.id=payment.membership_id LEFT JOIN membership_plans plan ON plan.id=membership.membership_plan_id LEFT JOIN branches branch ON branch.id=payment.branch_id
      WHERE ${scope.where} ORDER BY payment.created_at DESC LIMIT 150`, scope.values);
    return send(res, 200, { items });
  }
  if (method === 'GET' && path === '/api/admin/payment-imports') {
    await requireAdmin(session);
    const [items] = await pool.execute(`SELECT batch.id,batch.filename,batch.source_method,batch.total_rows,batch.imported_rows,batch.unmatched_rows,batch.duplicate_rows,batch.invalid_rows,batch.created_at,user.name AS imported_by_name
      FROM payment_import_batches batch INNER JOIN users user ON user.id=batch.imported_by_user_id ORDER BY batch.created_at DESC LIMIT 20`);
    return send(res, 200, { items });
  }
  if (method === 'POST' && path === '/api/admin/payments/imports') {
    await requireAdmin(session);
    const input = paymentImportPayload(await body(req));
    const [organizations] = await pool.execute('SELECT id FROM organizations ORDER BY created_at,id LIMIT 1');
    const organization = organizations[0];
    if (!organization) throw inputError('No existe una organización para registrar la importación.');
    const now = serverDateTime();
    const batchId = uid();
    const totals = { imported: 0, unmatched: 0, duplicate: 0, invalid: 0 };
    const items = [];
    const importedExternalIds = new Set();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('INSERT INTO payment_import_batches (id,organization_id,filename,source_method,total_rows,imported_rows,unmatched_rows,duplicate_rows,invalid_rows,imported_by_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [batchId, organization.id, input.filename, input.sourceMethod, input.rows.length, 0, 0, 0, 0, session.sub, now]);
      for (let index = 0; index < input.rows.length; index++) {
        const row = importedPaymentRow(input.rows[index]);
        let status = 'invalid'; let reason = null; let membershipId = null; let paymentId = null;
        if (!row.externalId || !row.amountHnl || row.amountHnl <= 0 || row.amountHnl > 1000000) {
          reason = 'Falta un ID externo válido o un monto mayor que cero.';
        } else if (importedExternalIds.has(row.externalId)) {
          status = 'duplicate'; reason = 'El ID externo se repite dentro de este archivo.';
        } else {
          importedExternalIds.add(row.externalId);
          const [existingPayments] = await connection.execute('SELECT id FROM payments WHERE organization_id=? AND external_transaction_id=? LIMIT 1', [organization.id, row.externalId]);
          if (existingPayments[0]) { status = 'duplicate'; reason = 'La transacción externa ya había sido importada.'; }
          else {
            const lookups = [
              row.membershipId ? ['membership.id=?', [row.membershipId]] : null,
              (row.paymentCode || /^M-[A-Z0-9]+$/i.test(row.reference || '')) ? ['membership.payment_reference_code=?', [row.paymentCode || String(row.reference).toUpperCase()]] : null,
              row.email ? ['user.email=?', [row.email]] : null
            ].filter(Boolean);
            let matches = [];
            for (const [where, values] of lookups) {
              const [found] = await connection.execute(`SELECT membership.id,membership.user_id,membership.status,plan.organization_id
                FROM memberships membership INNER JOIN users user ON user.id=membership.user_id INNER JOIN membership_plans plan ON plan.id=membership.membership_plan_id
                WHERE ${where} AND plan.organization_id=? ORDER BY membership.status='pending' DESC,membership.ends_on DESC LIMIT 2 FOR UPDATE`, [...values, organization.id]);
              if (found.length) { matches = found; break; }
            }
            if (matches.length !== 1) { status = 'unmatched'; reason = matches.length > 1 ? 'Hay más de una membresía que coincide; revisa el código de pago.' : 'No se encontró una membresía por ID, código de pago o correo.'; }
            else {
              const membership = matches[0]; membershipId = membership.id; paymentId = uid();
              try {
                await connection.execute('INSERT INTO payments (id,user_id,organization_id,membership_id,branch_id,amount_hnl,method,status,reference,receipt_number,external_transaction_id,received_at,verified_at,registered_by_user_id,verified_by_user_id,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [paymentId, membership.user_id, organization.id, membership.id, null, row.amountHnl, input.sourceMethod, 'verified', row.reference || row.paymentCode || null, row.receiptNumber, row.externalId, row.receivedAt, now, session.sub, session.sub, row.notes, now, now]);
                if (membership.status === 'pending') await connection.execute("UPDATE memberships SET status='active',activated_at=COALESCE(activated_at,?),updated_at=? WHERE id=?", [now, now, membership.id]);
                status = 'imported'; reason = 'Pago conciliado y verificado automáticamente.';
              } catch (error) {
                if (error.code === 'ER_DUP_ENTRY') { status = 'duplicate'; reason = 'La referencia, recibo o transacción ya existe.'; paymentId = null; }
                else throw error;
              }
            }
          }
        }
        totals[status]++;
        await connection.execute('INSERT INTO payment_import_rows (id,batch_id,`row_number`,external_transaction_id,reference,amount_hnl,membership_id,payment_id,row_status,reason,raw_data,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [uid(), batchId, index + 2, row.externalId || null, row.reference, row.amountHnl, membershipId, paymentId, status, reason, JSON.stringify(row.rawData), now]);
        items.push({ rowNumber: index + 2, externalId: row.externalId, amountHnl: row.amountHnl, membershipId, status, reason });
      }
      await connection.execute('UPDATE payment_import_batches SET imported_rows=?,unmatched_rows=?,duplicate_rows=?,invalid_rows=? WHERE id=?', [totals.imported, totals.unmatched, totals.duplicate, totals.invalid, batchId]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    return send(res, 201, { batch: { id: batchId, filename: input.filename, sourceMethod: input.sourceMethod, totalRows: input.rows.length, ...totals }, items });
  }
  if (method === 'GET' && path === '/api/manager/reports/income') {
    await requireManager(session);
    const suppliedFrom = String(url.searchParams.get('from') || '');
    const suppliedTo = String(url.searchParams.get('to') || '');
    const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).valueOf());
    const from = suppliedFrom || serverDateDaysAgo(29);
    const to = suppliedTo || serverDate();
    if (!isDate(from) || !isDate(to) || from > to) return send(res, 422, { error: 'Selecciona un rango de fechas válido.' });
    const rangeStart = new Date(`${from}T12:00:00`);
    const rangeEnd = new Date(`${to}T12:00:00`);
    if ((rangeEnd - rangeStart) / 86400000 > 366) return send(res, 422, { error: 'El rango máximo para reportes es de 366 días.' });
    const start = `${from} 00:00:00`;
    const end = `${to} 23:59:59`;
    const [[[summary]], [daily], [byMethod], [byBranch]] = await Promise.all([
      pool.execute(`SELECT COALESCE(SUM(amount_hnl),0) AS total_hnl,COUNT(*) AS transactions,COUNT(DISTINCT user_id) AS customers FROM payments WHERE status='verified' AND COALESCE(verified_at,updated_at,received_at,created_at) BETWEEN ? AND ?`, [start, end]),
      pool.execute(`SELECT DATE(COALESCE(verified_at,updated_at,received_at,created_at)) AS date,COALESCE(SUM(amount_hnl),0) AS total_hnl,COUNT(*) AS transactions FROM payments WHERE status='verified' AND COALESCE(verified_at,updated_at,received_at,created_at) BETWEEN ? AND ? GROUP BY DATE(COALESCE(verified_at,updated_at,received_at,created_at)) ORDER BY date`, [start, end]),
      pool.execute(`SELECT method,COALESCE(SUM(amount_hnl),0) AS total_hnl,COUNT(*) AS transactions FROM payments WHERE status='verified' AND COALESCE(verified_at,updated_at,received_at,created_at) BETWEEN ? AND ? GROUP BY method ORDER BY total_hnl DESC`, [start, end]),
      pool.execute(`SELECT COALESCE(branch.name,'Sin sucursal') AS branch_name,COALESCE(SUM(payment.amount_hnl),0) AS total_hnl,COUNT(*) AS transactions FROM payments payment LEFT JOIN branches branch ON branch.id=payment.branch_id WHERE payment.status='verified' AND COALESCE(payment.verified_at,payment.updated_at,payment.received_at,payment.created_at) BETWEEN ? AND ? GROUP BY payment.branch_id,branch.name ORDER BY total_hnl DESC`, [start, end])
    ]);
    return send(res, 200, { range: { from, to }, summary: { totalHnl: Number(summary.total_hnl || 0), transactions: Number(summary.transactions || 0), customers: Number(summary.customers || 0) }, daily: daily.map(item => ({ date: item.date, totalHnl: Number(item.total_hnl || 0), transactions: Number(item.transactions || 0) })), byMethod: byMethod.map(item => ({ method: item.method, totalHnl: Number(item.total_hnl || 0), transactions: Number(item.transactions || 0) })), byBranch: byBranch.map(item => ({ branchName: item.branch_name, totalHnl: Number(item.total_hnl || 0), transactions: Number(item.transactions || 0) })) });
  }
  if (method === 'PUT' && /^\/api\/admin\/payments\/[^/]+\/status$/.test(path)) {
    const paymentId = decodeURIComponent(path.split('/')[4]);
    const status = paymentStatusPayload(await body(req));
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [payments] = await connection.execute(`SELECT payment.id,payment.status,payment.membership_id,payment.branch_id,membership.status AS membership_status
        FROM payments payment LEFT JOIN memberships membership ON membership.id=payment.membership_id
        WHERE payment.id=? FOR UPDATE`, [paymentId]);
      const payment = payments[0];
      if (!payment) { const error = Error('No encontramos ese pago.'); error.status = 404; throw error; }
      if (!payment.branch_id) { const role = await roleForSession(session); if (!managementRoles.has(role)) { const error = Error('Solo administración o gerencia puede resolver pagos sin sucursal.'); error.status = 403; throw error; } } else await requireBranchOperator(session, payment.branch_id);
      if (payment.status !== 'pending') { const error = Error('Solo puedes resolver pagos que estén pendientes.'); error.status = 409; throw error; }
      const now = serverDateTime();
      await connection.execute('UPDATE payments SET status=?,received_at=CASE WHEN ?="verified" THEN COALESCE(received_at,?) ELSE received_at END,verified_at=CASE WHEN ?="verified" THEN ? ELSE verified_at END,verified_by_user_id=CASE WHEN ?="verified" THEN ? ELSE verified_by_user_id END,updated_at=? WHERE id=?', [status, status, now, status, now, status, session.sub, now, paymentId]);
      const membershipActivated = status === 'verified' && payment.membership_id && payment.membership_status === 'pending';
      if (membershipActivated) await connection.execute("UPDATE memberships SET status='active',activated_at=COALESCE(activated_at,?),updated_at=? WHERE id=?", [now, now, payment.membership_id]);
      await connection.commit();
      return send(res, 200, { ok: true, status, membershipActivated });
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
  if (method === 'POST' && path === '/api/admin/payments') {
    const payment = paymentPayload(await body(req));
    if (!payment.branchId) { const role = await roleForSession(session); if (!managementRoles.has(role)) { const error = Error('Selecciona la sucursal donde se recibió el pago.'); error.status = 422; throw error; } } else await requireBranchOperator(session, payment.branchId);
    const now = serverDateTime(); const connection = await pool.getConnection(); let item;
    try {
      await connection.beginTransaction();
      const [memberships] = await connection.execute(`SELECT membership.id,membership.user_id,plan.organization_id,membership.status FROM memberships membership INNER JOIN membership_plans plan ON plan.id=membership.membership_plan_id WHERE membership.id=? FOR UPDATE`, [payment.membershipId]);
      const membership = memberships[0]; if (!membership) throw inputError('Selecciona una membresía válida.');
      if (payment.branchId) { const [branches] = await connection.execute('SELECT id FROM branches WHERE id=? AND organization_id=? AND is_active=1', [payment.branchId, membership.organization_id]); if (!branches[0]) throw inputError('Selecciona una sucursal activa de la organización.'); }
      const id = uid();
      await connection.execute('INSERT INTO payments (id,user_id,organization_id,membership_id,branch_id,amount_hnl,method,status,reference,receipt_number,received_at,verified_at,registered_by_user_id,verified_by_user_id,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, membership.user_id, membership.organization_id, payment.membershipId, payment.branchId, payment.amountHnl, payment.method, payment.status, payment.reference, payment.receiptNumber, now, payment.status === 'verified' ? now : null, session.sub, payment.status === 'verified' ? session.sub : null, payment.notes, now, now]);
      if (payment.status === 'verified' && membership.status === 'pending') await connection.execute("UPDATE memberships SET status='active',activated_at=COALESCE(activated_at,?),updated_at=? WHERE id=?", [now, now, payment.membershipId]);
      const [rows] = await connection.execute('SELECT id,membership_id,amount_hnl,currency,method,status,reference,receipt_number,received_at,verified_at,notes,created_at FROM payments WHERE id=?', [id]);
      item = rows[0]; await connection.commit();
    } catch (error) { await connection.rollback(); if (error.code === 'ER_DUP_ENTRY') { const conflict = Error('Ese número de recibo ya existe.'); conflict.status = 409; throw conflict; } throw error; } finally { connection.release(); }
    return send(res, 201, { item });
  }
  if (method === 'GET' && path === '/api/admin/catalog/meals') { await requireAdmin(session); const [items] = await pool.execute('SELECT id,meal_type,title,description,calories,protein_g,carbs_g,fats_g,diet_tags,avoid_tags,ingredients,ingredient_details,steps,is_active,updated_at FROM meal_catalog ORDER BY meal_type,title'); return send(res, 200, { items: items.map(item => ({ ...item, diet_tags: jsonValue(item.diet_tags), avoid_tags: jsonValue(item.avoid_tags), ingredients: jsonValue(item.ingredients), ingredient_details: jsonValue(item.ingredient_details), steps: jsonValue(item.steps) })) }); }
  if (method === 'GET' && path === '/api/admin/catalog/foods') { await requireAdmin(session); const [items] = await pool.execute('SELECT id,name,calories_100g,protein_100g,carbs_100g,fats_100g,default_grams,is_active,updated_at FROM food_catalog ORDER BY name'); return send(res, 200, { items }); }
  if (method === 'POST' && path === '/api/admin/catalog/foods') { await requireAdmin(session); const food = catalogFood(await body(req)); const id = `food-${uid()}`; const now = serverDateTime(); await pool.execute('INSERT INTO food_catalog (id,name,calories_100g,protein_100g,carbs_100g,fats_100g,default_grams,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [id, food.name, food.calories, food.protein, food.carbs, food.fats, food.defaultGrams, food.isActive ? 1 : 0, now, now]); return send(res, 201, { item: { id, name: food.name, calories_100g: food.calories, protein_100g: food.protein, carbs_100g: food.carbs, fats_100g: food.fats, default_grams: food.defaultGrams, is_active: food.isActive ? 1 : 0 } }); }
  if (method === 'PUT' && /^\/api\/admin\/catalog\/foods\/[^/]+$/.test(path)) { await requireAdmin(session); const itemId = decodeURIComponent(path.split('/').pop()); const input = await body(req); if (typeof input.isActive === 'boolean' && Object.keys(input).length === 1) { await pool.execute('UPDATE food_catalog SET is_active=?,updated_at=? WHERE id=?', [input.isActive ? 1 : 0, serverDateTime(), itemId]); return send(res, 200, { ok: true }); } const food = catalogFood(input); const [result] = await pool.execute('UPDATE food_catalog SET name=?,calories_100g=?,protein_100g=?,carbs_100g=?,fats_100g=?,default_grams=?,is_active=?,updated_at=? WHERE id=?', [food.name, food.calories, food.protein, food.carbs, food.fats, food.defaultGrams, food.isActive ? 1 : 0, serverDateTime(), itemId]); if (!result.affectedRows) return send(res, 404, { error: 'No encontramos ese alimento.' }); return send(res, 200, { item: { id: itemId, name: food.name, calories_100g: food.calories, protein_100g: food.protein, carbs_100g: food.carbs, fats_100g: food.fats, default_grams: food.defaultGrams, is_active: food.isActive ? 1 : 0 } }); }
  if (method === 'POST' && path === '/api/admin/catalog/meals') { await requireAdmin(session); const meal = catalogMeal(await body(req)); const id = `custom-${uid()}`; const now = serverDateTime(); await pool.execute('INSERT INTO meal_catalog (id,meal_type,title,description,calories,protein_g,carbs_g,fats_g,diet_tags,avoid_tags,ingredients,ingredient_details,steps,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, meal.mealType, meal.title, meal.description, meal.calories, meal.protein, meal.carbs, meal.fats, JSON.stringify(meal.dietTags), JSON.stringify(meal.avoidTags), JSON.stringify(meal.ingredients), JSON.stringify(meal.ingredientDetails), JSON.stringify(meal.steps), meal.isActive ? 1 : 0, now, now]); return send(res, 201, { item: { id, meal_type: meal.mealType, title: meal.title, description: meal.description, calories: meal.calories, protein_g: meal.protein, carbs_g: meal.carbs, fats_g: meal.fats, diet_tags: meal.dietTags, avoid_tags: meal.avoidTags, ingredients: meal.ingredients, ingredient_details: meal.ingredientDetails, steps: meal.steps, is_active: meal.isActive ? 1 : 0 } }); }
  if (method === 'PUT' && /^\/api\/admin\/catalog\/meals\/[^/]+$/.test(path)) { await requireAdmin(session); const itemId = decodeURIComponent(path.split('/').pop()); const input = await body(req); if (typeof input.isActive === 'boolean' && Object.keys(input).length === 1) { await pool.execute('UPDATE meal_catalog SET is_active=?,updated_at=? WHERE id=?', [input.isActive ? 1 : 0, serverDateTime(), itemId]); return send(res, 200, { ok: true }); } const meal = catalogMeal(input); const [result] = await pool.execute('UPDATE meal_catalog SET meal_type=?,title=?,description=?,calories=?,protein_g=?,carbs_g=?,fats_g=?,diet_tags=?,avoid_tags=?,ingredients=?,ingredient_details=?,steps=?,is_active=?,updated_at=? WHERE id=?', [meal.mealType, meal.title, meal.description, meal.calories, meal.protein, meal.carbs, meal.fats, JSON.stringify(meal.dietTags), JSON.stringify(meal.avoidTags), JSON.stringify(meal.ingredients), JSON.stringify(meal.ingredientDetails), JSON.stringify(meal.steps), meal.isActive ? 1 : 0, serverDateTime(), itemId]); if (!result.affectedRows) return send(res, 404, { error: 'No encontramos esa comida.' }); return send(res, 200, { item: { id: itemId, meal_type: meal.mealType, title: meal.title, description: meal.description, calories: meal.calories, protein_g: meal.protein, carbs_g: meal.carbs, fats_g: meal.fats, diet_tags: meal.dietTags, avoid_tags: meal.avoidTags, ingredients: meal.ingredients, ingredient_details: meal.ingredientDetails, steps: meal.steps, is_active: meal.isActive ? 1 : 0 } }); }
  if (method === 'GET' && path === '/api/admin/catalog/exercises') { await requireAdmin(session); const [items] = await pool.execute('SELECT id,name,level,focus_tags,equipment,prescription,duration_minutes,cues,image_url,video_url,is_active,updated_at FROM exercise_catalog ORDER BY level,name'); return send(res, 200, { items: items.map(item => ({ ...item, focus_tags: jsonValue(item.focus_tags), cues: jsonValue(item.cues) })) }); }
  if (method === 'GET' && /^\/api\/admin\/catalog\/exercises\/[^/]+\/equipment-requirements$/.test(path)) { await requireAdmin(session); const exerciseId = path.split('/')[5]; const [items] = await pool.execute(`SELECT requirement.equipment_id,requirement.is_required,catalog.name
    FROM exercise_equipment_requirements requirement INNER JOIN equipment_catalog catalog ON catalog.id=requirement.equipment_id
    WHERE requirement.exercise_id=? ORDER BY catalog.name`, [exerciseId]); return send(res, 200, { items }); }
  if (method === 'PUT' && /^\/api\/admin\/catalog\/exercises\/[^/]+\/equipment-requirements$/.test(path)) { await requireAdmin(session); const exerciseId = path.split('/')[5]; const input = await body(req); const equipmentIds = Array.isArray(input.equipmentIds) ? [...new Set(input.equipmentIds.map(id => String(id || '').trim()).filter(Boolean))].slice(0, 12) : null; if (!equipmentIds) return send(res, 422, { error: 'Indica la lista de equipo requerida.' }); const connection = await pool.getConnection(); try { await connection.beginTransaction(); const [exercises] = await connection.execute('SELECT id FROM exercise_catalog WHERE id=? FOR UPDATE', [exerciseId]); if (!exercises[0]) { const error = Error('No encontramos ese ejercicio.'); error.status = 404; throw error; } if (equipmentIds.length) { const placeholders = equipmentIds.map(() => '?').join(','); const [equipment] = await connection.execute(`SELECT id FROM equipment_catalog WHERE id IN (${placeholders})`, equipmentIds); if (equipment.length !== equipmentIds.length) { const error = Error('Incluiste un tipo de equipo inexistente.'); error.status = 422; throw error; } } await connection.execute('DELETE FROM exercise_equipment_requirements WHERE exercise_id=?', [exerciseId]); if (equipmentIds.length) await connection.execute(`INSERT INTO exercise_equipment_requirements (exercise_id,equipment_id,is_required) VALUES ${equipmentIds.map(() => '(?,?,1)').join(',')}`, equipmentIds.flatMap(id => [exerciseId, id])); await connection.commit(); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); } return send(res, 200, { ok: true, equipmentIds }); }
  if (method === 'POST' && path === '/api/admin/catalog/exercise-media') { await requireAdmin(session); const input = await body(req); const kind = input.kind === 'image' || input.kind === 'video' ? input.kind : null; if (!kind) return send(res, 422, { error: 'Tipo de archivo inválido.' }); const stored = saveExerciseMedia(input.dataUrl, kind); return send(res, 201, { ok: true, fileUrl: stored.fileUrl, storedBytes: stored.size, kind: stored.kind }); }
  if (method === 'POST' && path === '/api/admin/catalog/exercises') { await requireAdmin(session); const exercise = catalogExercise(await body(req)); const id = `exercise-${uid()}`; const now = serverDateTime(); await pool.execute('INSERT INTO exercise_catalog (id,name,level,focus_tags,equipment,prescription,duration_minutes,cues,image_url,video_url,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, exercise.name, exercise.level, JSON.stringify(exercise.focusTags), exercise.equipment, exercise.prescription, exercise.durationMinutes, JSON.stringify(exercise.cues), exercise.imageUrl, exercise.videoUrl, exercise.isActive ? 1 : 0, now, now]); return send(res, 201, { item: { id, name: exercise.name, level: exercise.level, focus_tags: exercise.focusTags, equipment: exercise.equipment, prescription: exercise.prescription, duration_minutes: exercise.durationMinutes, cues: exercise.cues, image_url: exercise.imageUrl, video_url: exercise.videoUrl, is_active: exercise.isActive ? 1 : 0 } }); }
  if (method === 'PUT' && /^\/api\/admin\/catalog\/exercises\/[^/]+$/.test(path)) { await requireAdmin(session); const itemId = decodeURIComponent(path.split('/').pop()); const input = await body(req); if (typeof input.isActive === 'boolean' && Object.keys(input).length === 1) { const [result] = await pool.execute('UPDATE exercise_catalog SET is_active=?,updated_at=? WHERE id=?', [input.isActive ? 1 : 0, serverDateTime(), itemId]); if (!result.affectedRows) return send(res, 404, { error: 'No encontramos ese ejercicio.' }); return send(res, 200, { ok: true }); } const exercise = catalogExercise(input); const [result] = await pool.execute('UPDATE exercise_catalog SET name=?,level=?,focus_tags=?,equipment=?,prescription=?,duration_minutes=?,cues=?,image_url=?,video_url=?,is_active=?,updated_at=? WHERE id=?', [exercise.name, exercise.level, JSON.stringify(exercise.focusTags), exercise.equipment, exercise.prescription, exercise.durationMinutes, JSON.stringify(exercise.cues), exercise.imageUrl, exercise.videoUrl, exercise.isActive ? 1 : 0, serverDateTime(), itemId]); if (!result.affectedRows) return send(res, 404, { error: 'No encontramos ese ejercicio.' }); return send(res, 200, { item: { id: itemId, name: exercise.name, level: exercise.level, focus_tags: exercise.focusTags, equipment: exercise.equipment, prescription: exercise.prescription, duration_minutes: exercise.durationMinutes, cues: exercise.cues, image_url: exercise.imageUrl, video_url: exercise.videoUrl, is_active: exercise.isActive ? 1 : 0 } }); }
  if (method === 'GET' && path === '/api/branches') { const [branches] = await pool.execute('SELECT id,name,code,address FROM branches WHERE is_active=1 ORDER BY name'); return send(res, 200, { items: branches }); }
  if (method === 'GET' && path === '/api/me') { const [rows] = await pool.execute('SELECT * FROM users WHERE id=?', [session.sub]); const [profiles] = await pool.execute('SELECT * FROM user_profiles WHERE user_id=?', [session.sub]); return send(res, 200, { user: publicUser(rows[0]), profile: profiles[0] || null, plan: await activePlan(session.sub) }); }
  if (method === 'GET' && path === '/api/me/access') return send(res, 200, await membershipAccessForUser(session.sub, url.searchParams.get('branchId')));
  if (method === 'POST' && path === '/api/me/access/qr') return send(res, 201, await issueMembershipQr(session.sub));
  if (method === 'PUT' && path === '/api/me/home-branch') {
    const input = await body(req);
    const homeBranchId = await activeBranchId(session.sub, input.homeBranchId);
    const [result] = await pool.execute('UPDATE user_profiles SET home_branch_id=?,updated_at=? WHERE user_id=?', [homeBranchId, serverDateTime(), session.sub]);
    if (!result.affectedRows) return send(res, 422, { error: 'Completa tu evaluación antes de elegir una sucursal principal.' });
    return send(res, 200, { homeBranchId });
  }
  if (method === 'PUT' && path === '/api/me/profile') {
    const input = await body(req);
    const profile = { goal: input.goal, level: input.level, days_per_week: Number(input.daysPerWeek), minutes_per_session: Number(input.minutesPerSession), diet: input.diet, foods_to_avoid: input.foodsToAvoid || '', target_calories: Number(input.targetCalories), age: Number(input.age), height_cm: Number(input.heightCm), weight_lb: Number(input.weightLb), sex_for_calculation: input.sexForCalculation || 'Prefiero no decir', activity_level: input.activityLevel, equipment_access: input.equipmentAccess, limitations: String(input.limitations || '').slice(0, 500) };
    const valid = ['Ganar músculo', 'Perder grasa', 'Sentirme mejor'].includes(profile.goal) && ['Principiante', 'Intermedio', 'Avanzado'].includes(profile.level) && [3,4,5,6,7].includes(profile.days_per_week) && [30,45,60].includes(profile.minutes_per_session) && Number.isInteger(profile.target_calories) && profile.target_calories >= 1200 && profile.target_calories <= 4000 && Number.isInteger(profile.age) && profile.age >= 16 && profile.age <= 90 && Number.isFinite(profile.height_cm) && profile.height_cm >= 120 && profile.height_cm <= 230 && Number.isFinite(profile.weight_lb) && profile.weight_lb >= 70 && profile.weight_lb <= 500 && ['Mujer','Hombre','Prefiero no decir'].includes(profile.sex_for_calculation) && ['Sedentaria','Ligera','Moderada','Alta'].includes(profile.activity_level) && ['Sin equipo','Bandas o mancuernas','Gimnasio completo'].includes(profile.equipment_access);
    if (!valid) return send(res, 422, { error: 'Completa tus datos personales, incluidas las calorías objetivo, con valores válidos.' });
    const homeBranchId = await activeBranchId(session.sub, input.homeBranchId);
    await pool.execute('INSERT INTO user_profiles (user_id,home_branch_id,goal,level,days_per_week,minutes_per_session,diet,foods_to_avoid,target_calories,age,height_cm,weight_lb,sex_for_calculation,activity_level,equipment_access,limitations,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE home_branch_id=VALUES(home_branch_id),goal=VALUES(goal),level=VALUES(level),days_per_week=VALUES(days_per_week),minutes_per_session=VALUES(minutes_per_session),diet=VALUES(diet),foods_to_avoid=VALUES(foods_to_avoid),target_calories=VALUES(target_calories),age=VALUES(age),height_cm=VALUES(height_cm),weight_lb=VALUES(weight_lb),sex_for_calculation=VALUES(sex_for_calculation),activity_level=VALUES(activity_level),equipment_access=VALUES(equipment_access),limitations=VALUES(limitations),updated_at=VALUES(updated_at)', [session.sub, homeBranchId, ...Object.values(profile), serverDateTime()]);
    return send(res, 200, { profile: { ...profile, home_branch_id: homeBranchId } });
  }
  if (method === 'GET' && path === '/api/progress/insights') return send(res, 200, await progressInsights(session.sub));
  if (method === 'PUT' && path === '/api/progress/goals') { const input = await body(req); const sessionsTarget = safeInteger(input.sessionsTarget, 1, 31); const progressTarget = safeInteger(input.progressTarget, 1, 31); const weightTarget = input.weightTargetLb === '' || input.weightTargetLb == null ? null : Number(input.weightTargetLb); if (sessionsTarget === null || progressTarget === null || (weightTarget !== null && (!Number.isFinite(weightTarget) || weightTarget < 70 || weightTarget > 500))) return send(res, 422, { error: 'Las metas mensuales no son válidas.' }); const month = currentMonthKey(); const now = serverDateTime(); await pool.execute('INSERT INTO monthly_goals (user_id,month_key,sessions_target,progress_target,weight_target_lb,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE sessions_target=VALUES(sessions_target),progress_target=VALUES(progress_target),weight_target_lb=VALUES(weight_target_lb),updated_at=VALUES(updated_at)', [session.sub, month, sessionsTarget, progressTarget, weightTarget, now, now]); return send(res, 200, { ok: true, month, sessionsTarget, progressTarget, weightTargetLb: weightTarget }); }
  if (method === 'PUT' && path === '/api/progress/reminders') { const input = await body(req); const settings = { workoutEnabled: asBoolean(input.workoutEnabled), workoutTime: String(input.workoutTime || '07:00'), mealEnabled: asBoolean(input.mealEnabled), mealTime: String(input.mealTime || '12:00'), weighinEnabled: asBoolean(input.weighinEnabled), weighinWeekday: safeInteger(input.weighinWeekday, 0, 6), weighinTime: String(input.weighinTime || '07:00'), browserEnabled: asBoolean(input.browserEnabled) }; if (!validTime(settings.workoutTime) || !validTime(settings.mealTime) || !validTime(settings.weighinTime) || settings.weighinWeekday === null) return send(res, 422, { error: 'La configuración de recordatorios no es válida.' }); await pool.execute('INSERT INTO user_reminder_settings (user_id,workout_enabled,workout_time,meal_enabled,meal_time,weighin_enabled,weighin_weekday,weighin_time,browser_enabled,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE workout_enabled=VALUES(workout_enabled),workout_time=VALUES(workout_time),meal_enabled=VALUES(meal_enabled),meal_time=VALUES(meal_time),weighin_enabled=VALUES(weighin_enabled),weighin_weekday=VALUES(weighin_weekday),weighin_time=VALUES(weighin_time),browser_enabled=VALUES(browser_enabled),updated_at=VALUES(updated_at)', [session.sub, settings.workoutEnabled, settings.workoutTime, settings.mealEnabled, settings.mealTime, settings.weighinEnabled, settings.weighinWeekday, settings.weighinTime, settings.browserEnabled, serverDateTime()]); return send(res, 200, { ok: true, settings }); }
  if (method === 'POST' && path === '/api/plans/generate') { const [inProgress] = await pool.execute('SELECT id FROM workout_logs WHERE user_id=? AND completed_at IS NULL ORDER BY started_at DESC LIMIT 1', [session.sub]); if (inProgress[0]) return send(res, 409, { error: 'Tienes una rutina en curso. Termínala antes de crear un plan nuevo para conservar sus series y tiempo registrados.' }); const [profiles] = await pool.execute('SELECT * FROM user_profiles WHERE user_id=?', [session.sub]); if (!profiles[0]) return send(res, 422, { error: 'Completa tu perfil antes de generar un plan.' }); const profile = profiles[0]; if (!Number.isInteger(Number(profile.target_calories)) || Number(profile.target_calories) < 1200 || Number(profile.target_calories) > 4000) return send(res, 422, { error: 'Indica tus calorías objetivo diarias antes de crear el plan alimenticio.' }); const branchId = await activeBranchId(session.sub, profile.home_branch_id); const adjustment = basePlanAdjustment(profile); const meals = await catalogWeeklyMeals(profile, `initial-${uid()}`); const generated = { workouts: await catalogWorkouts(profile, branchId, 0, adjustment), meals, macros: nutritionFromMenu(meals, profile), adjustment }; const planId = await storePlan(session.sub, profile, generated, branchId); console.log(`[FormaIA API] Plan de catálogo ${planId} guardado para usuario ${session.sub}`); return send(res, 201, { plan: await activePlan(session.sub) }); }
  if (method === 'POST' && path === '/api/plans/weekly-review') { const input = await body(req); const scope = ['workouts', 'nutrition', 'all'].includes(input.scope) ? input.scope : 'all'; const [profiles] = await pool.execute('SELECT * FROM user_profiles WHERE user_id=?', [session.sub]); if (!profiles[0]) return send(res, 422, { error: 'Completa tu perfil antes de revisar el plan.' }); const profile = profiles[0]; if (scope !== 'workouts' && (!Number.isInteger(Number(profile.target_calories)) || Number(profile.target_calories) < 1200 || Number(profile.target_calories) > 4000)) return send(res, 422, { error: 'Indica tus calorías objetivo diarias antes de ajustar la alimentación.' }); const currentPlan = await activePlan(session.sub); if (!currentPlan) return send(res, 422, { error: 'No hay un plan activo para revisar.' }); const branchId = currentPlan.branchId || await activeBranchId(session.sub, profile.home_branch_id); const reviewWorkouts = scope !== 'nutrition'; const reviewNutrition = scope !== 'workouts'; const context = reviewWorkouts ? await weeklyContext(session.sub, currentPlan) : null; const adjustment = reviewWorkouts ? deriveWeeklyAdjustment(profile, context) : { ...(currentPlan.adjustment || {}), mode: 'nutrition', label: 'Alimentación ajustada', summary: 'Actualizamos el menú semanal según tus preferencias y las calorías objetivo indicadas.' }; const meals = reviewNutrition ? await catalogWeeklyMeals(profile, `review-${uid()}`) : currentPlan.meals.map(item => [item.meal_type, item.title, item.description, item.calories, item.recipe]); const macros = reviewNutrition ? nutritionFromMenu(meals, profile) : [currentPlan.calories, currentPlan.protein, currentPlan.carbs, currentPlan.fats, currentPlan.message]; if (scope === 'nutrition') { await replacePlanNutrition(session.sub, currentPlan.id, { meals, macros, adjustment }); console.log(`[FormaIA API] Alimentación del plan ${currentPlan.id} actualizada sin reiniciar el ciclo para usuario ${session.sub}`); return send(res, 200, { plan: await activePlan(session.sub), context: null, adjustment, scope }); } const workouts = await catalogWorkouts(profile, branchId, context.completed_sessions_last_7_days, adjustment); const generated = { workouts, meals, macros, adjustment }; const planId = await storePlan(session.sub, profile, generated, branchId); console.log(`[FormaIA API] Revisión ${scope} ${adjustment.mode} de catálogo ${planId} guardada para usuario ${session.sub}`); return send(res, 201, { plan: await activePlan(session.sub), context, adjustment, scope }); }
  if (method === 'GET' && path === '/api/plans/active') return send(res, 200, { plan: await activePlan(session.sub) });
  if (method === 'GET' && /^\/api\/plans\/[^/]+\/detail$/.test(path)) { const planId = decodeURIComponent(path.split('/')[3]); const [plans] = await pool.execute('SELECT id,status,calories,protein_g,carbs_g,fats_g,motivational_message,adjustment,created_at FROM plans WHERE id=? AND user_id=? LIMIT 1', [planId, session.sub]); const item = plans[0]; if (!item) return send(res, 404, { error: 'No encontramos este plan en tu historial.' }); const [[workouts], [meals], [workoutLogs], [setLogs], [mealLogs]] = await Promise.all([pool.execute('SELECT id,sequence_no,title,subtitle,duration_minutes,exercises FROM plan_workouts WHERE plan_id=? ORDER BY sequence_no', [item.id]), pool.execute('SELECT id,sequence_no,meal_type,title,description,calories,recipe FROM plan_meals WHERE plan_id=? ORDER BY sequence_no', [item.id]), pool.execute('SELECT wl.id,wl.workout_id,wl.completed_on,wl.started_at,wl.completed_at,wl.duration_seconds FROM workout_logs wl INNER JOIN plan_workouts pw ON pw.id=wl.workout_id WHERE pw.plan_id=? AND wl.user_id=? ORDER BY wl.completed_on DESC,wl.started_at DESC', [item.id, session.sub]), pool.execute('SELECT wsl.workout_log_id,wsl.exercise_index,wsl.set_number,wsl.weight_lb,wsl.repetitions,wsl.duration_seconds FROM workout_set_logs wsl INNER JOIN workout_logs wl ON wl.id=wsl.workout_log_id INNER JOIN plan_workouts pw ON pw.id=wl.workout_id WHERE pw.plan_id=? AND wl.user_id=? ORDER BY wsl.exercise_index,wsl.set_number', [item.id, session.sub]), pool.execute('SELECT plan_meal_id,completed_on,completed_at FROM meal_completion_logs WHERE plan_id=? AND user_id=? ORDER BY completed_on DESC,completed_at DESC', [item.id, session.sub])]); const setsByLog = new Map(); for (const set of setLogs) { const values = setsByLog.get(set.workout_log_id) || []; values.push({ exerciseIndex: Number(set.exercise_index), setNumber: Number(set.set_number), weightLb: set.weight_lb == null ? null : Number(set.weight_lb), repetitions: set.repetitions == null ? null : Number(set.repetitions), durationSeconds: set.duration_seconds == null ? null : Number(set.duration_seconds) }); setsByLog.set(set.workout_log_id, values); } const logsByWorkout = new Map(); for (const log of workoutLogs) { const values = logsByWorkout.get(log.workout_id) || []; values.push({ completedOn: dateOnly(log.completed_on), startedAt: log.started_at, completedAt: log.completed_at, durationSeconds: Number(log.duration_seconds || 0), sets: setsByLog.get(log.id) || [] }); logsByWorkout.set(log.workout_id, values); } const logsByMeal = new Map(); for (const log of mealLogs) { const values = logsByMeal.get(log.plan_meal_id) || []; values.push({ completedOn: dateOnly(log.completed_on), completedAt: log.completed_at }); logsByMeal.set(log.plan_meal_id, values); } return send(res, 200, { plan: { id: item.id, status: item.status, calories: Number(item.calories), protein: Number(item.protein_g), carbs: Number(item.carbs_g), fats: Number(item.fats_g), message: item.motivational_message, adjustment: item.adjustment ? jsonValue(item.adjustment) : null, createdAt: item.created_at, workouts: workouts.map(workout => ({ sequenceNo: Number(workout.sequence_no), title: workout.title, subtitle: workout.subtitle, durationMinutes: Number(workout.duration_minutes), exercises: jsonValue(workout.exercises), sessions: logsByWorkout.get(workout.id) || [] })), meals: meals.map(meal => ({ sequenceNo: Number(meal.sequence_no), mealType: meal.meal_type, title: meal.title, description: meal.description, calories: Number(meal.calories), recipe: jsonValue(meal.recipe), completions: logsByMeal.get(meal.id) || [] })) } }); }
  if (method === 'GET' && path === '/api/plans/history') { const [plans] = await pool.execute('SELECT p.id,p.status,p.calories,p.protein_g,p.carbs_g,p.fats_g,p.adjustment,p.created_at,(SELECT COUNT(*) FROM plan_workouts pw WHERE pw.plan_id=p.id) AS workout_count,(SELECT COUNT(*) FROM plan_meals pm WHERE pm.plan_id=p.id) AS meal_count FROM plans p WHERE p.user_id=? ORDER BY p.created_at DESC LIMIT 20', [session.sub]); return send(res, 200, { items: plans.map(item => ({ id: item.id, status: item.status, calories: item.calories, protein: item.protein_g, carbs: item.carbs_g, fats: item.fats_g, adjustment: item.adjustment ? jsonValue(item.adjustment) : null, createdAt: item.created_at, workoutCount: Number(item.workout_count), mealCount: Number(item.meal_count) })) }); }
  if (method === 'GET' && path === '/api/meals/catalog') { const [items] = await pool.execute('SELECT id,meal_type,title,description,calories,protein_g,carbs_g,fats_g,ingredients,steps FROM meal_catalog WHERE is_active=1 ORDER BY meal_type,title'); return send(res, 200, { items: items.map(item => ({ ...item, ingredients: jsonValue(item.ingredients), steps: jsonValue(item.steps) })), equivalences: localEquivalences }); }
  if (method === 'GET' && path === '/api/plans/active/shopping-list') { const currentPlan = await activePlan(session.sub); if (!currentPlan) return send(res, 422, { error: 'No hay un plan activo.' }); const [prices] = await pool.execute('SELECT * FROM ingredient_price_catalog'); const items = shoppingList(currentPlan.meals, prices); return send(res, 200, { items, estimatedTotalHnl: items.reduce((total, item) => total + Number(item.estimatedHnl || 0), 0), equivalences: localEquivalences, calculation: 'presentaciones_reales' }); }
  if (method === 'GET' && path === '/api/nutrition/pantry') { const [items] = await pool.execute('SELECT ingredient FROM user_pantry_items WHERE user_id=? ORDER BY ingredient', [session.sub]); return send(res, 200, { items: items.map(item => item.ingredient) }); }
  if (method === 'PUT' && path === '/api/nutrition/pantry') { const input = await body(req); const ingredient = String(input.ingredient || '').trim().slice(0, 160); if (!ingredient) return send(res, 422, { error: 'Ingrediente inválido.' }); if (input.inPantry) await pool.execute('INSERT INTO user_pantry_items (user_id,ingredient,updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at)', [session.sub, ingredient, serverDateTime()]); else await pool.execute('DELETE FROM user_pantry_items WHERE user_id=? AND ingredient=?', [session.sub, ingredient]); return send(res, 200, { ok: true }); }
  if (method === 'GET' && path === '/api/nutrition/daily') { const today = serverDate(); const [rows] = await pool.execute('SELECT water_glasses,adherence FROM nutrition_daily_logs WHERE user_id=? AND logged_on=? LIMIT 1', [session.sub, today]); const currentPlan = await activePlan(session.sub); const weekdays = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']; const todayMeals = (currentPlan?.meals || []).filter(meal => String(meal.title).startsWith(`${weekdays[new Date().getDay()]}:`)); return send(res, 200, { waterGlasses: Number(rows[0]?.water_glasses || 0), adherence: rows[0]?.adherence || null, completedMeals: todayMeals.filter(meal => meal.completed_at).length, plannedMeals: todayMeals.length }); }
  if (method === 'PUT' && path === '/api/nutrition/daily') { const input = await body(req); const waterGlasses = safeInteger(input.waterGlasses, 0, 30); const adherence = input.adherence == null || input.adherence === '' ? null : String(input.adherence); if (waterGlasses === null || (adherence !== null && !['Sí','Parcial','No'].includes(adherence))) return send(res, 422, { error: 'Datos diarios de nutrición inválidos.' }); const now = serverDateTime(); await pool.execute('INSERT INTO nutrition_daily_logs (id,user_id,logged_on,water_glasses,adherence,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE water_glasses=VALUES(water_glasses),adherence=VALUES(adherence),updated_at=VALUES(updated_at)', [uid(), session.sub, serverDate(), waterGlasses, adherence, now, now]); return send(res, 200, { ok: true, waterGlasses, adherence }); }
  if (method === 'POST' && /^\/api\/plans\/active\/meals\/[^/]+\/complete$/.test(path)) {
    const mealId = path.split('/')[5];
    const currentPlan = await activePlan(session.sub);
    const meal = currentPlan?.meals.find(item => item.id === mealId);
    if (!meal) return send(res, 404, { error: 'La comida no pertenece al plan activo.' });
    if (!currentPlan.cycle || currentPlan.cycle.completedAt) return send(res, 422, { error: 'Inicia un ciclo activo para registrar tus comidas.' });
    const completedOn = dateForMealThisWeek(meal);
    if (!completedOn) return send(res, 422, { error: 'No pudimos identificar el día programado para esta comida.' });
    const [existing] = await pool.execute('SELECT id FROM meal_completion_logs WHERE user_id=? AND plan_meal_id=? AND cycle_id=? AND completed_on=? LIMIT 1', [session.sub, mealId, currentPlan.cycle.id, completedOn]);
    if (existing[0]) {
      await pool.execute('DELETE FROM meal_completion_logs WHERE id=? AND user_id=?', [existing[0].id, session.sub]);
      return send(res, 200, { ok: true, completed: false, completedOn });
    }
    if (completedOn !== serverDate()) return send(res, 422, { error: 'Solo puedes completar la comida programada para hoy.' });
    const completedAt = serverDateTime();
    await pool.execute('INSERT INTO meal_completion_logs (id,user_id,plan_id,plan_meal_id,cycle_id,completed_on,completed_at) VALUES (?,?,?,?,?,?,?)', [uid(), session.sub, currentPlan.id, mealId, currentPlan.cycle.id, completedOn, completedAt]);
    return send(res, 201, { ok: true, completed: true, completedOn });
  }
  if (method === 'PUT' && /^\/api\/plans\/active\/meals\/[^/]+$/.test(path)) { const mealId = path.split('/')[5]; const currentPlan = await activePlan(session.sub); const meal = currentPlan?.meals.find(item => item.id === mealId); if (!meal) return send(res, 404, { error: 'La comida no pertenece al plan activo.' }); const input = await body(req); const currentRecipe = jsonValue(meal.recipe); const servings = [0.5, 1, 1.5, 2].includes(Number(input.servings)) ? Number(input.servings) : Number(currentRecipe.servings || 1); let catalogId = input.catalogId || currentRecipe.catalogId; const [catalogRows] = await pool.execute('SELECT * FROM meal_catalog WHERE id=? AND is_active=1', [catalogId]); const catalog = catalogRows[0]; if (!catalog || catalog.meal_type !== meal.meal_type) return send(res, 422, { error: 'Selecciona una comida válida del mismo tiempo de comida.' }); const day = currentRecipe.day || String(meal.title).split(':')[0]; const recipe = { day, catalogId: catalog.id, servings, proteinG: Math.round(Number(catalog.protein_g) * servings), carbsG: Math.round(Number(catalog.carbs_g) * servings), fatsG: Math.round(Number(catalog.fats_g) * servings), ingredients: jsonValue(catalog.ingredients), steps: jsonValue(catalog.steps) }; await pool.execute('UPDATE plan_meals SET title=?,description=?,calories=?,recipe=?,completed_at=NULL WHERE id=?', [`${day}: ${catalog.title}`, catalog.description, Math.round(Number(catalog.calories) * servings), JSON.stringify(recipe), mealId]); if (currentPlan.cycle) await pool.execute('DELETE FROM meal_completion_logs WHERE user_id=? AND plan_meal_id=? AND cycle_id=?', [session.sub, mealId, currentPlan.cycle.id]); return send(res, 200, { plan: await activePlan(session.sub) }); }
  if (method === 'POST' && path === '/api/plans/active/continue') { const currentPlan = await activePlan(session.sub); if (!currentPlan?.cycle?.completedAt) return send(res, 422, { error: 'Completa las sesiones de esta semana antes de continuar el plan.' }); await pool.execute('INSERT INTO plan_cycles (id,plan_id,user_id,started_on,created_at) VALUES (?,?,?,?,?)', [uid(), currentPlan.id, session.sub, serverDate(), serverDateTime()]); return send(res, 201, { plan: await activePlan(session.sub) }); }
  if (method === 'PUT' && /^\/api\/workouts\/[^/]+\/schedule$/.test(path)) { const workoutId = path.split('/')[3]; const input = await body(req); const scheduledOn = String(input.scheduledOn || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledOn) || Number.isNaN(Date.parse(`${scheduledOn}T12:00:00Z`))) return send(res, 422, { error: 'Selecciona una fecha válida.' }); const currentPlan = await activePlan(session.sub); const selected = currentPlan?.workouts.find(workout => workout.id === workoutId); if (!selected) return send(res, 404, { error: 'La rutina no pertenece al plan activo.' }); if (currentPlan.cycle?.completedAt) return send(res, 422, { error: 'Este ciclo ya fue completado.' }); const [conflicts] = await pool.execute('SELECT id FROM plan_workouts WHERE plan_id=? AND scheduled_on=? AND id<>?', [currentPlan.id, scheduledOn, workoutId]); if (conflicts[0]) return send(res, 409, { error: 'Ya hay otra rutina movida a esa fecha. Elige otro día.' }); const [completed] = await pool.execute('SELECT id FROM workout_logs WHERE user_id=? AND workout_id=? AND completed_at IS NOT NULL LIMIT 1', [session.sub, workoutId]); if (completed[0]) return send(res, 422, { error: 'No puedes mover una rutina que ya está completada.' }); await pool.execute('UPDATE plan_workouts SET scheduled_on=? WHERE id=?', [scheduledOn, workoutId]); return send(res, 200, { plan: await activePlan(session.sub) }); }
  if (method === 'POST' && /^\/api\/workouts\/[^/]+\/substitute$/.test(path)) { const workoutId = path.split('/')[3]; const input = await body(req); const exerciseIndex = safeInteger(input.exerciseIndex, 0, 30); const reason = String(input.reason || 'equipo'); if (exerciseIndex === null || !['equipo', 'lesion', 'ocupado'].includes(reason)) return send(res, 422, { error: 'Selecciona un motivo de sustitución válido.' }); const currentPlan = await activePlan(session.sub); const workout = currentPlan?.workouts.find(item => item.id === workoutId); if (!workout) return send(res, 404, { error: 'La rutina no pertenece al plan activo.' }); const exercises = Array.isArray(workout.exercises) ? workout.exercises : []; const currentExercise = exercises[exerciseIndex]; if (!currentExercise) return send(res, 404, { error: 'No encontramos ese ejercicio.' }); const [profiles] = await pool.execute('SELECT level,equipment_access,limitations FROM user_profiles WHERE user_id=?', [session.sub]); const profile = profiles[0]; if (!profile) return send(res, 422, { error: 'Completa tu perfil antes de sustituir ejercicios.' }); const [catalog] = await pool.execute('SELECT * FROM exercise_catalog WHERE is_active=1 AND level=?', [profile.level]); const [originalRows] = await pool.execute('SELECT * FROM exercise_catalog WHERE name=? AND level=? LIMIT 1', [String(currentExercise[0]), profile.level]); const focus = new Set(jsonValue(originalRows[0]?.focus_tags || '[]'));
    let candidates = catalog.filter(item => item.name !== currentExercise[0] && [...focus].some(tag => jsonValue(item.focus_tags).includes(tag)));
    if (reason !== 'lesion') candidates = candidates.filter(item => compatibleEquipment(item, profile.equipment_access));
    if (reason === 'lesion') candidates = candidates.filter(item => !injuryUnsafe(item, profile.limitations));
    if (reason === 'ocupado' && originalRows[0]) candidates = candidates.filter(item => normalizedText(item.equipment) !== normalizedText(originalRows[0].equipment));
    if (!candidates.length) candidates = catalog.filter(item => item.name !== currentExercise[0] && compatibleEquipment(item, profile.equipment_access) && (reason !== 'lesion' || !injuryUnsafe(item, profile.limitations)));
    if (!candidates.length) return send(res, 422, { error: 'No hay una alternativa segura en tu catálogo para esa condición. Consulta a un profesional si tienes dolor o una lesión.' });
    const replacement = candidates[0]; exercises[exerciseIndex] = catalogExerciseTuple(replacement); await pool.execute('UPDATE plan_workouts SET exercises=? WHERE id=?', [JSON.stringify(exercises), workoutId]); return send(res, 200, { plan: await activePlan(session.sub), replacement: { name: replacement.name, equipment: replacement.equipment } }); }
  if (method === 'GET' && path === '/api/workouts/active-session') { const [logs] = await pool.execute('SELECT id,workout_id FROM workout_logs WHERE user_id=? AND completed_on=? AND completed_at IS NULL ORDER BY started_at DESC LIMIT 1', [session.sub, serverDate()]); if (!logs[0]) return send(res, 200, { workoutId: null, session: null }); const log = await workoutLogWithElapsed(logs[0].id); const [sets] = await pool.execute('SELECT exercise_index,set_number,weight_lb,repetitions,duration_seconds FROM workout_set_logs WHERE workout_log_id=? ORDER BY exercise_index,set_number', [log.id]); return send(res, 200, { workoutId: logs[0].workout_id, session: { workoutLogId: log.id, elapsedSeconds: elapsedInLog(log), running: Boolean(log.timer_running), completed: false, sets } }); }
  if (method === 'POST' && /^\/api\/workouts\/[^/]+\/start$/.test(path)) { const workoutId = path.split('/')[3]; const currentPlan = await activePlan(session.sub); if (!currentPlan || !currentPlan.workouts.some(workout => workout.id === workoutId)) return send(res, 404, { error: 'La rutina no pertenece al plan activo.' }); if (currentPlan.cycle?.completedAt) return send(res, 422, { error: 'Esta semana ya fue completada.' }); const todayDate = serverDate(); const [today] = await pool.execute('SELECT * FROM workout_logs WHERE user_id=? AND completed_on=? LIMIT 1', [session.sub, todayDate]); if (today[0] && today[0].workout_id !== workoutId) return send(res, 409, { error: 'Ya registraste otra rutina hoy.' }); let log = today[0]; if (!log) { const id = uid(); const now = serverDateTime(); await pool.execute('INSERT INTO workout_logs (id,user_id,branch_id,workout_id,completed_on,started_at,duration_seconds,timer_running,timer_updated_at) VALUES (?,?,?,?,?, ?,0,1,?)', [id, session.sub, currentPlan.branchId, workoutId, todayDate, now, now]); const [created] = await pool.execute('SELECT * FROM workout_logs WHERE id=?', [id]); log = created[0]; } else if (!log.completed_at && !log.timer_running) { await pool.execute('UPDATE workout_logs SET timer_running=1,timer_updated_at=? WHERE id=?', [serverDateTime(), log.id]); } log = await workoutLogWithElapsed(log.id); return send(res, 200, { ok: true, workoutLogId: log.id, startedAt: log.started_at, completedAt: log.completed_at, elapsedSeconds: elapsedInLog(log), running: Boolean(log.timer_running) }); }
  if (method === 'GET' && /^\/api\/workouts\/[^/]+\/session$/.test(path)) { const workoutId = path.split('/')[3]; const [logs] = await pool.execute('SELECT id FROM workout_logs WHERE user_id=? AND workout_id=? AND completed_on=? ORDER BY completed_at DESC, started_at DESC LIMIT 1', [session.sub, workoutId, serverDate()]); if (!logs[0]) return send(res, 200, { session: null }); const log = await workoutLogWithElapsed(logs[0].id); const [sets] = await pool.execute('SELECT exercise_index, set_number, weight_lb, repetitions, duration_seconds FROM workout_set_logs WHERE workout_log_id=? ORDER BY exercise_index,set_number', [log.id]); return send(res, 200, { session: { workoutLogId: log.id, elapsedSeconds: elapsedInLog(log), running: Boolean(log.timer_running), completed: Boolean(log.completed_at), sets } }); }
  if (method === 'POST' && /^\/api\/workouts\/[^/]+\/timer$/.test(path)) { const workoutId = path.split('/')[3]; const input = await body(req); const elapsed = safeInteger(input.elapsedSeconds, 0, 21600); if (elapsed === null || typeof input.running !== 'boolean') return send(res, 422, { error: 'Estado del temporizador inválido.' }); const [logs] = await pool.execute('SELECT id,completed_at FROM workout_logs WHERE user_id=? AND workout_id=? AND completed_on=? LIMIT 1', [session.sub, workoutId, serverDate()]); if (!logs[0] || logs[0].completed_at) return send(res, 422, { error: 'No hay una rutina en curso para actualizar.' }); await pool.execute('UPDATE workout_logs SET duration_seconds=?,timer_running=?,timer_updated_at=? WHERE id=?', [elapsed, input.running ? 1 : 0, serverDateTime(), logs[0].id]); return send(res, 200, { ok: true }); }
  if (method === 'POST' && /^\/api\/workouts\/[^/]+\/sets$/.test(path)) { const workoutId = path.split('/')[3]; const currentPlan = await activePlan(session.sub); if (!currentPlan || !currentPlan.workouts.some(workout => workout.id === workoutId)) return send(res, 404, { error: 'La rutina no pertenece al plan activo.' }); const [logs] = await pool.execute('SELECT * FROM workout_logs WHERE user_id=? AND workout_id=? AND completed_on=? LIMIT 1', [session.sub, workoutId, serverDate()]); if (!logs[0]) return send(res, 422, { error: 'Inicia la rutina antes de guardar una serie.' }); if (logs[0].completed_at) return send(res, 422, { error: 'Esta rutina ya fue completada.' }); const input = await body(req); const saved = await saveSetLog(logs[0].id, input); return send(res, 201, { ok: true, set: saved }); }
  if (method === 'POST' && /^\/api\/workouts\/[^/]+\/complete$/.test(path)) {
    const workoutId = path.split('/')[3];
    const currentPlan = await activePlan(session.sub);
    const workout = currentPlan?.workouts.find(item => item.id === workoutId);
    if (!workout) return send(res, 404, { error: 'La rutina no pertenece al plan activo.' });
    if (currentPlan.cycle?.completedAt) return send(res, 422, { error: 'Esta semana ya fue completada. Revisa el plan o inicia un nuevo ciclo.' });
    const input = await body(req);
    const todayDate = serverDate();
    const [today] = await pool.execute('SELECT * FROM workout_logs WHERE user_id=? AND completed_on=? LIMIT 1', [session.sub, todayDate]);
    if (today[0] && today[0].workout_id !== workoutId) return send(res, 409, { error: 'Ya registraste otra rutina hoy.' });
    const log = today[0];
    if (!log) return send(res, 422, { error: 'Inicia la rutina y registra todas las series antes de finalizarla.' });
    if (log.completed_at) return send(res, 200, { ok: true, alreadyCompleted: true, cycleCompleted: Boolean(currentPlan.cycle?.completedAt), durationSeconds: log.duration_seconds });
    for (const item of Array.isArray(input.sets) ? input.sets : []) await saveSetLog(log.id, item);
    const missing = await missingWorkoutSets(log.id, workout.exercises);
    if (missing.length) {
      const byExercise = new Map();
      for (const item of missing) byExercise.set(item.name, (byExercise.get(item.name) || 0) + 1);
      const summary = [...byExercise].map(([name, total]) => `${name} (${total} pendiente${total === 1 ? '' : 's'})`).join('; ');
      return send(res, 422, { error: `Completa todas las series antes de finalizar: ${summary}.`, missingSets: missing });
    }
    const elapsed = safeInteger(input.elapsedSeconds, 0, 21600);
    const duration = elapsed === null ? elapsedInLog(log) : elapsed;
    const completedAt = serverDateTime();
    await pool.execute('UPDATE workout_logs SET completed_at=?, duration_seconds=?,timer_running=0,timer_updated_at=? WHERE id=?', [completedAt, duration, completedAt, log.id]);
    const [count] = await pool.execute('SELECT COUNT(DISTINCT workout_id) AS total FROM workout_logs WHERE user_id=? AND completed_at IS NOT NULL AND workout_id IN (SELECT id FROM plan_workouts WHERE plan_id=?) AND completed_on>=?', [session.sub, currentPlan.id, currentPlan.cycle.startedOn]);
    const completed = Number(count[0].total) >= currentPlan.workouts.length;
    if (completed) await pool.execute('UPDATE plan_cycles SET completed_at=? WHERE id=?', [completedAt, currentPlan.cycle.id]);
    return send(res, 201, { ok: true, cycleCompleted: completed, durationSeconds: duration });
  }
  if (method === 'POST' && path === '/api/progress') { const input = await body(req); const weight = input.weightLb ? Number(input.weightLb) : null; if (weight && (weight < 70 || weight > 500)) return send(res, 422, { error: 'El peso debe estar entre 70 y 500 lb.' }); if (!['Alta', 'Media', 'Baja'].includes(input.energy)) return send(res, 422, { error: 'Energía inválida.' }); const measurements = input.measurements && typeof input.measurements === 'object' ? input.measurements : null; const today = serverDate(); const [existing] = await pool.execute('SELECT id FROM progress_logs WHERE user_id=? AND logged_on=? ORDER BY created_at DESC LIMIT 1', [session.sub, today]); const progressId = existing[0]?.id || uid(); const values = [weight, input.energy, String(input.note || '').slice(0, 280), JSON.stringify(measurements)]; if (existing[0]) await pool.execute('UPDATE progress_logs SET weight_lb=?, energy=?, note=?, measurements=? WHERE id=? AND user_id=?', [...values, progressId, session.sub]); else await pool.execute('INSERT INTO progress_logs (id,user_id,logged_on,weight_lb,energy,note,measurements,created_at) VALUES (?,?,?,?,?,?,?,?)', [progressId, session.sub, today, ...values, serverDateTime()]); return send(res, existing[0] ? 200 : 201, { ok: true, progressId, updated: Boolean(existing[0]) }); }
  if (method === 'POST' && path === '/api/progress/photos') { const input = await body(req); const [logs] = await pool.execute('SELECT id FROM progress_logs WHERE id=? AND user_id=?', [input.progressId, session.sub]); if (!logs[0]) return send(res, 404, { error: 'Registro de avance no encontrado.' }); const stored = savePhoto(input.dataUrl); const photoId = uid(); await pool.execute('INSERT INTO progress_photos (id,user_id,progress_log_id,file_url,created_at) VALUES (?,?,?,?,?)', [photoId, session.sub, input.progressId, stored.fileUrl, serverDateTime()]); const [photos] = await pool.execute('SELECT id FROM progress_photos WHERE id=? AND user_id=? AND progress_log_id=? AND file_url=?', [photoId, session.sub, input.progressId, stored.fileUrl]); return send(res, 201, { ok: true, verified: Boolean(photos[0]), fileUrl: stored.fileUrl, storedBytes: stored.size }); }
  if (method === 'GET' && path === '/api/progress') { const [rows] = await pool.execute('SELECT * FROM progress_logs WHERE user_id=? ORDER BY logged_on DESC,created_at DESC LIMIT 30', [session.sub]); const [photos] = await pool.execute('SELECT id,progress_log_id,file_url,created_at FROM progress_photos WHERE user_id=? ORDER BY created_at DESC', [session.sub]); const photosByProgress = new Map(); for (const photo of photos) { const items = photosByProgress.get(photo.progress_log_id) || []; items.push(photo); photosByProgress.set(photo.progress_log_id, items); } const [workouts] = await pool.execute('SELECT workout_id, completed_on, started_at, completed_at, duration_seconds FROM workout_logs WHERE user_id=? AND completed_at IS NOT NULL AND completed_on >= ? ORDER BY completed_on ASC, completed_at ASC', [session.sub, serverDateDaysAgo(30)]); return send(res, 200, { progress: rows.map(item => ({ ...item, measurements: item.measurements ? jsonValue(item.measurements) : {}, photos: photosByProgress.get(item.id) || [] })), workouts, exerciseHistory: await exerciseHistory(session.sub), personalRecords: await personalRecords(session.sub) }); }
  return send(res, 404, { error: 'Ruta no encontrada.' });
};
http.createServer((req, res) => routes(req, res).catch(error => { const status = error.status || (error.message.includes('token') || error.message.includes('Authentication') ? 401 : 500); const cause = error.cause ? ` | causa: ${error.cause.code || error.name || 'red'} — ${error.cause.message}` : ''; const detail = `${error.message}${cause}`; console.error(`[FormaIA API] ${error.code || error.name} ${detail}`); const payload = { error: process.env.NODE_ENV === 'production' && status >= 500 ? 'No fue posible procesar la solicitud.' : detail }; if (error.code === 'MEMBERSHIP_ACCESS_DENIED') payload.code = error.code; send(res, status, payload); })).listen(Number(env('PORT') || 3000), () => { console.log(`FormaIA API security-v1 listening on ${env('PORT') || 3000}`); void logDatabaseConnection(); });
