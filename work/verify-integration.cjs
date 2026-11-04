const { spawnSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const checks = [
  'work/integration-check.cjs', 'work/order-status-check.cjs',
  'work/checkout-screen-check.cjs', 'work/price-client-check.cjs',
  'work/availability-client-check.cjs', 'work/reward-hardening/hook-check.cjs',
  'loyalty/rewardEntitlement.selfcheck.js', 'loyalty/loyaltyService.selfcheck.js',
  'work/pickup-client-check.cjs', 'work/cashier-board-check.cjs', 'work/checkout-session-check.cjs',
  'work/account-notifications/client-worker-check.cjs',
  'work/photo-composition-check.cjs', 'work/photo-editor-check.cjs',
  'work/publications/client-admin-check.cjs',
  'work/cart-modifiers-ux-check.cjs', 'work/status-network-ux-check.cjs',
  'work/cafe-location-check.cjs', 'work/product-links-check.cjs',
  'work/launch-motion-check.cjs',
  'work/phone-mask-check.cjs', 'work/brand-surfaces-check.cjs',
  'work/cafe-map-interaction-check.cjs',
  'work/satin-card-check.cjs',
  'work/menu-photo-visibility-check.cjs',
  'work/product-sheet-check.cjs',
  'work/typography-onest/check.cjs',
  'work/catalog-admin/client-check.cjs',
];
for (const file of checks) {
  const result = spawnSync(process.execPath, [file], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error('FAILED:', file, result.error?.message || ''); process.exit(1);
  }
}
console.log(`PASS: all ${checks.length} integration suites`);
