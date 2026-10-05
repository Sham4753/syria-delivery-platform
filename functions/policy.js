const POLICY_REGISTRY = Object.freeze({
  credit_limit: Object.freeze({
    scope: 'private',
    source: 'courier_wallets/{courierId}.credit_limit',
    type: 'number',
    min: 0,
    max: 1000000000,
    default: 0,
  }),
  debt_formula_version: Object.freeze({
    scope: 'private',
    source: 'courier_wallets/{courierId}.debt',
    type: 'string',
    allowed: ['gross_cash_collected_v1'],
    default: 'gross_cash_collected_v1',
  }),
  manual_transfer_wait_timeout_minutes: Object.freeze({
    scope: 'private', type: 'number', min: 90, max: 120, default: 105, status: 'proposed_only',
  }),
  manual_transfer_review_sla_minutes: Object.freeze({
    scope: 'private', type: 'number', min: 15, max: 30, default: 20, status: 'proposed_only',
  }),
  manual_transfer_escalation_mode: Object.freeze({
    scope: 'private', type: 'string', allowed: ['pending_verification_only'], default: 'pending_verification_only', status: 'proposed_only',
  }),
  refund_destination: Object.freeze({
    scope: 'private', type: 'string', allowed: ['internal_wallet'], default: 'internal_wallet', status: 'proposed_only',
  }),
  coupon_commission_rule: Object.freeze({
    scope: 'private', type: 'string', allowed: ['goods_discount_reduces_commission_base_free_delivery_does_not'], default: 'goods_discount_reduces_commission_base_free_delivery_does_not', status: 'proposed_only',
  }),
});

function numberOrDefault(value, rule) {
  const number = Number(value);
  return Number.isFinite(number) && number >= rule.min && number <= rule.max ? number : rule.default;
}

function readValue(raw, key) {
  const rule = POLICY_REGISTRY[key];
  const value = raw?.[key];
  if (rule.type === 'number') return numberOrDefault(value, rule);
  if (rule.allowed.includes(value)) return value;
  return rule.default;
}

async function readEffectivePolicy({db, tx} = {}) {
  if (!db && !tx) throw new Error('policy_reader_required');
  const ref = db.doc('system_config/main');
  const snap = tx ? await tx.get(ref) : await ref.get();
  const config = snap.data() || {};
  const raw = config.policy && typeof config.policy === 'object' && !Array.isArray(config.policy) ? config.policy : {};
  const configured = Boolean(config.policy && typeof config.policy === 'object');
  const readinessStatus = configured ? 'ready' : 'policy_not_ready';
  return {
    schemaVersion: Number(config.policy_schema_version || 1),
    readinessStatus,
    readiness: {
      status: readinessStatus,
      source: 'system_config/main.policy',
      missing: configured ? [] : ['policy'],
    },
    creditLimit: readValue(raw, 'credit_limit'),
    creditLimitSource: POLICY_REGISTRY.credit_limit.source,
    debtFormulaVersion: readValue(raw, 'debt_formula_version'),
    manualTransferWaitTimeoutMinutes: readValue(raw, 'manual_transfer_wait_timeout_minutes'),
    manualTransferReviewSlaMinutes: readValue(raw, 'manual_transfer_review_sla_minutes'),
    manualTransferEscalationMode: readValue(raw, 'manual_transfer_escalation_mode'),
    refundDestination: readValue(raw, 'refund_destination'),
    couponCommissionRule: readValue(raw, 'coupon_commission_rule'),
  };
}

function orderPolicyValues(policy) {
  return {
    schema_version: policy.schemaVersion,
    readiness_status: policy.readinessStatus,
    debt_formula_version: policy.debtFormulaVersion,
  };
}

function transferPolicyValues(policy) {
  return {
    schema_version: policy.schemaVersion,
    readiness_status: policy.readinessStatus,
    escalation_mode: policy.manualTransferEscalationMode,
  };
}

module.exports = {POLICY_REGISTRY, readEffectivePolicy, orderPolicyValues, transferPolicyValues};
