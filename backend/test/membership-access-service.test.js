import test from 'node:test';
import assert from 'node:assert/strict';
import { membershipAccessDecision, membershipPeriodDecision } from '../src/services/membership-access-service.js';

const membership = overrides => ({
  id: 'membership-1',
  status: 'active',
  startsOn: '2026-10-01',
  endsOn: '2026-10-31',
  graceEndsOn: null,
  branchAccessPolicy: 'all_branches',
  ...overrides
});

test('permite una membresía activa dentro de su vigencia', () => {
  assert.deepEqual(membershipPeriodDecision(membership(), '2026-10-30').allowed, true);
  assert.equal(membershipPeriodDecision(membership(), '2026-10-30').reason, 'membership_active');
});

test('permite el periodo de gracia y lo identifica', () => {
  const result = membershipPeriodDecision(membership({ graceEndsOn: '2026-11-03' }), '2026-11-02');
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'membership_grace_period');
  assert.equal(result.isGracePeriod, true);
});

test('deniega una membresía vencida o no activa', () => {
  assert.equal(membershipPeriodDecision(membership(), '2026-11-01').reason, 'membership_expired');
  assert.equal(membershipPeriodDecision(membership({ status: 'pending' }), '2026-10-30').reason, 'membership_not_active');
  assert.equal(membershipPeriodDecision(membership({ status: 'suspended' }), '2026-10-30').reason, 'membership_not_active');
});

test('exige un pago verificado para los planes con costo', () => {
  assert.equal(membershipPeriodDecision(membership({ requiresPayment: true, latestPaymentStatus: 'pending' }), '2026-10-30').reason, 'payment_pending');
  assert.equal(membershipPeriodDecision(membership({ requiresPayment: true, latestPaymentStatus: 'rejected' }), '2026-10-30').reason, 'payment_rejected');
  assert.equal(membershipPeriodDecision(membership({ requiresPayment: true, latestPaymentStatus: 'verified' }), '2026-10-30').allowed, true);
});

test('requiere permiso explícito para planes de sucursales seleccionadas', () => {
  const selected = membership({ branchAccessPolicy: 'selected_branches' });
  assert.equal(membershipAccessDecision({ membership: selected, today: '2026-10-30', scope: 'branch', hasBranchAccess: false }).reason, 'branch_not_allowed');
  assert.equal(membershipAccessDecision({ membership: selected, today: '2026-10-30', scope: 'branch', hasBranchAccess: true }).allowed, true);
});

test('permite cualquier sucursal activa cuando el plan tiene cobertura total', () => {
  const result = membershipAccessDecision({ membership: membership({ branchAccessPolicy: 'all_branches' }), today: '2026-10-30', scope: 'branch', hasBranchAccess: false });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'membership_active');
});

test('deniega el acceso a una sucursal inactiva', () => {
  assert.equal(membershipAccessDecision({ membership: membership(), today: '2026-10-30', scope: 'branch', branchIsActive: false }).reason, 'branch_unavailable');
});
