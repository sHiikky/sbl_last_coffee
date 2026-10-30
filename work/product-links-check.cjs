const assert = require('node:assert/strict');
const load = require('./load-domain.cjs');
const { productShareUrl, parseProductLink, shareProduct } = load('lib/productLinks.js', {}, { URL });
const id = '11111111-1111-4111-8111-111111111111';
const scheme = `sbl://product/${id}`;
const local = 'http://127.0.0.1:8094/';
assert.equal(productShareUrl(id), scheme);
assert.equal(parseProductLink(scheme), id);
assert.equal(productShareUrl(id, { platform: 'web', webOrigin: local }), `${local}#product/${id}`);
assert.equal(parseProductLink(`${local}#product/${id}`, { webOrigin: local }), id);
const publicBase = 'https://coffee.example/app/';
const publicLink = productShareUrl(id, { publicBase });
assert.equal(publicLink, `${publicBase}#product/${id}`);
assert.equal(parseProductLink(publicLink, { publicBase }), id);
for (const url of [`https://evil.example/#product/${id}`, `${local}?access_token=secret#product/${id}`, `sbl://auth/${id}`, `${scheme}?access_token=secret`, `sbl://product/${id}/extra`, `https://person:password@coffee.example/app/#product/${id}`, 'javascript:alert(1)', 'x'.repeat(4097)]) {
  assert.equal(parseProductLink(url, { webOrigin: local, publicBase }), null);
}
assert.equal(productShareUrl('not-an-id'), null);
assert.equal(productShareUrl(id, { publicBase: 'https://user:pass@example.com/' }), scheme);
assert.equal(productShareUrl(id, { publicBase: 'http://coffee.example/' }), scheme);
(async () => {
  const copies = [], shares = [];
  const product = { id, displayName: 'Айс Латте', privateField: 'must-not-be-shared' };
  const copied = await shareProduct(product, { platform: 'web', webOrigin: local, copy: async value => copies.push(value), share: async value => shares.push(value) });
  assert.equal(copied.copied, true); assert.equal(copies[0], `${local}#product/${id}`); assert.equal(shares.length, 0);
  await shareProduct(product, { platform: 'ios', share: async value => shares.push(value) });
  assert.equal(shares[0].url, scheme); assert.equal(shares[0].message.includes(id), true); assert.equal(JSON.stringify(shares).includes('must-not-be-shared'), false);
  await assert.rejects(shareProduct(product, { platform: 'web', webOrigin: local, copy: async () => { throw new Error('Denied'); } }));
  console.log('PASS: product links bind public SKU, open native/web, reject foreign/Auth links and share no private data');
})().catch(error => { console.error(error); process.exitCode = 1; });
