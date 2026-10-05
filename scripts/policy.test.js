const assert = require('assert');
const {POLICY_REGISTRY, readEffectivePolicy, orderPolicyValues, transferPolicyValues} = require('../functions/policy');

const snapshots = [
  {data: () => ({})},
  {data: () => ({policy: {credit_limit: 125, debt_formula_version: 'gross_cash_collected_v1', manual_transfer_escalation_mode: 'pending_verification_only'}})},
  {data: () => ({policy: {credit_limit: -1, debt_formula_version: 'net_after_earnings_v1'}})},
];
const db = {doc: () => ({get: async () => snapshots.shift()})};
(async () => {
  assert.equal(POLICY_REGISTRY.credit_limit.source, 'courier_wallets/{courierId}.credit_limit');
  const notReady = await readEffectivePolicy({db});
  assert.equal(notReady.readinessStatus, 'policy_not_ready');
  assert.equal(notReady.creditLimit, 0);
  assert.equal(notReady.debtFormulaVersion, 'gross_cash_collected_v1');
  assert.deepStrictEqual(orderPolicyValues(notReady), {schema_version: 1, readiness_status: 'policy_not_ready', debt_formula_version: 'gross_cash_collected_v1'});
  const ready = await readEffectivePolicy({db});
  assert.equal(ready.readinessStatus, 'ready');
  assert.equal(ready.creditLimit, 125);
  assert.equal(transferPolicyValues(ready).escalation_mode, 'pending_verification_only');
  const invalid = await readEffectivePolicy({db});
  assert.equal(invalid.creditLimit, 0);
  assert.equal(invalid.debtFormulaVersion, 'gross_cash_collected_v1');
  console.log('Policy tests passed: single registry, readiness model, bounded defaults, gross debt formula, narrow snapshots.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
