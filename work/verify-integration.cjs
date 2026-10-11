const { spawnSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const checks = [
  'work/integration-check.cjs', 'work/order-status-check.cjs',
  'work/checkout-screen-check.cjs', 'work/price-client-check.cjs',
  'work/availability-client-check.cjs', 'work/reward-hardening/hook-check.cjs',
  'loyalty/rewardEntitlement.selfcheck.js', 'loyalty/loyaltyService.selfcheck.js',
];
for (const file of checks) {
  const result = spawnSync(process.execPath, [file], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error('FAILED:', file, result.error?.message || ''); process.exit(1);
  }
}
console.log('PASS: all eight integration suites');
