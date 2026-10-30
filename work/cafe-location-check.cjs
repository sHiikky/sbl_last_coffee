const assert = require('node:assert/strict');
const load = require('./load-domain.cjs');
const CAFE = { pointId: 'lenina-72', address: 'SBL · Томск, проспект Ленина, 72', timeZone: 'Asia/Tomsk', openHour: 11, closeHour: 20, preparationMin: 3, preparationMax: 5 };
const { cafeClock, getCafeHours, cafeGreeting, cafeMapTiles, CAFE_LOCATION, MAP_USER_AGENT } = load('lib/cafeLocation.js', { './ordering': { CAFE } });
function at(iso) { return getCafeHours(null, Date.parse(iso)); }
assert.equal(at('2026-10-29T03:59:59Z').physicallyOpen, false, '10:59:59 Tomsk is closed');
assert.equal(at('2026-10-29T04:00:00Z').physicallyOpen, true, '11:00 Tomsk opens');
assert.equal(at('2026-10-29T12:55:00Z').acceptsOrders, true, '19:55:00 permits last new order');
assert.equal(at('2026-10-29T12:55:01Z').acceptsOrders, false, '19:55:01 no new order');
assert.equal(at('2026-10-29T12:59:59Z').physicallyOpen, true, 'cafe is still open after new-order cutoff');
assert.equal(at('2026-10-29T13:00:00Z').physicallyOpen, false, '20:00 closes');
assert.equal(at('2026-10-29T13:00:00Z').statusLabel, 'Завтра с 11:00');
assert.equal(at('2026-10-29T03:59:59Z').statusLabel, 'Откроемся в 11:00');
assert.equal(at('2026-10-29T12:59:59Z').statusLabel, 'Открыто до 20:00');
assert.equal(cafeGreeting(null, Date.parse('2026-10-29T01:00:00Z')), 'До встречи за кофе');
const offset = { server_now: '2026-10-29T05:00:00Z', receivedAt: 1000 };
assert.equal(cafeClock(offset, 61000).toISOString(), '2026-10-29T05:01:00.000Z', 'server clock advances by elapsed device time');
assert.equal(getCafeHours(offset, 61000).hour, 12, 'status uses Tomsk/server clock, not device zone');
assert.equal(cafeClock({ server_now: 'bad', receivedAt: 0 }, 61000).getTime(), 61000);
assert.equal(cafeClock({ server_now: offset.server_now, receivedAt: null }, 61000).getTime(), 61000, 'null reception time does not produce a decades-long offset');
assert.equal(CAFE_LOCATION.latitude, 56.481399);
assert.equal(CAFE_LOCATION.longitude, 84.94905);
assert.match(CAFE_LOCATION.organisationUrl, /96849739091/);
assert.match(CAFE_LOCATION.routeUrl, /rtext=~56\.481399,84\.94905/);
assert.match(CAFE_LOCATION.routeUrl, /mode=routes/);
assert.match(MAP_USER_AGENT, /^SBL-Coffee\//);
for (const width of [280, 320, 380, 420, 512]) {
  const height = 280, tiles = cafeMapTiles(width, height);
  assert.ok(tiles.length > 0 && tiles.length <= 9, 'one visible fixed viewport only, no prefetch');
  for (const tile of tiles) {
    assert.match(tile.uri, /^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/);
    assert.ok(tile.left < width && tile.left + tile.size > 0);
    assert.ok(tile.top < height && tile.top + tile.size > 0);
    assert.equal(tile.size, 256);
  }
  for (const [x, y] of [[0.1, 0.1], [width - 0.1, 0.1], [0.1, height - 0.1], [width - 0.1, height - 0.1], [width/2, height/2]]) {
    assert.ok(tiles.some(tile => x >= tile.left && x < tile.left + tile.size && y >= tile.top && y < tile.top + tile.size), 'map tiles cover every viewport corner and exact cafe center');
  }
}
assert.equal(cafeMapTiles(0).length, 0);
assert.equal(cafeMapTiles(2000).length, 0);
assert.equal(cafeMapTiles(320, 280, 20).length, 0);
console.log('PASS: Tomsk cafe/ordering boundaries, server clock, verified map pin, visible-tile geometry and provider links');
