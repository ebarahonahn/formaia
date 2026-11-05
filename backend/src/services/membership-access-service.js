const asDate = value => String(value || '').slice(0, 10);

const allowed = (membership, reason, isGracePeriod = false) => ({
  allowed: true,
  reason,
  membership,
  isGracePeriod
});

const denied = (reason, membership = null) => ({
  allowed: false,
  reason,
  membership,
  isGracePeriod: false
});

/**
 * Evaluates the membership period without mutating it. An active membership
 * remains valid through its configured grace date, if any.
 */
export const membershipPeriodDecision = (membership, today) => {
  if (!membership) return denied('membership_required');
  if (membership.status !== 'active') return denied('membership_not_active', membership);
  if (membership.requiresPayment && membership.latestPaymentStatus !== 'verified') {
    const paymentReason = {
      pending: 'payment_pending',
      rejected: 'payment_rejected',
      refunded: 'payment_refunded',
      void: 'payment_void'
    }[membership.latestPaymentStatus] || 'payment_required';
    return denied(paymentReason, membership);
  }

  const currentDate = asDate(today);
  const startsOn = asDate(membership.startsOn);
  const endsOn = asDate(membership.endsOn);
  const graceEndsOn = asDate(membership.graceEndsOn);

  if (!currentDate || !startsOn || !endsOn) return denied('membership_dates_invalid', membership);
  if (currentDate < startsOn) return denied('membership_not_started', membership);
  if (currentDate <= endsOn) return allowed(membership, 'membership_active');
  if (graceEndsOn && currentDate <= graceEndsOn) return allowed(membership, 'membership_grace_period', true);
  return denied('membership_expired', membership);
};

/**
 * Applies app or branch scope to a membership that is active for the date.
 * A selected-branches plan requires an explicit membership branch grant.
 */
export const membershipAccessDecision = ({ membership, today, scope = 'app', branchIsActive = true, hasBranchAccess = false }) => {
  const period = membershipPeriodDecision(membership, today);
  if (!period.allowed || scope === 'app') return period;
  if (!branchIsActive) return denied('branch_unavailable', membership);
  if (membership.branchAccessPolicy === 'all_branches') return period;
  if (membership.branchAccessPolicy === 'selected_branches' && hasBranchAccess) return period;
  return denied('branch_not_allowed', membership);
};
