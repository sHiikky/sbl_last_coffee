const assert = require('node:assert/strict');
const load = require('./load-domain.cjs');
const CAFE = { timeZone: 'Asia/Tomsk', openHour: 11, closeHour: 20, preparationMin: 3, preparationMax: 5 };
const map = load('lib/cafeLocation.js', { './ordering': { CAFE } });
const { CAFE_LOCATION, visibleMapTiles, projectMapCoordinate, unprojectMapPoint, panMapCenter, mapPointInViewport, zoomMapAt, fitMapCoordinates } = map;
const { requestMapPosition, requestBrowserMapPosition } = load('lib/mapPosition.js', { './cafeLocation': map }, { setTimeout, clearTimeout });
const near = (actual, expected, epsilon = 1e-7) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} must be near ${expected}`);
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

for (const coordinate of [CAFE_LOCATION, { latitude: 0, longitude: 0 }, { latitude: -45, longitude: 179.9 }]) {
  for (const zoom of [3, 12, 16, 18]) {
    const roundtrip = unprojectMapPoint(projectMapCoordinate(coordinate, zoom), zoom);
    near(roundtrip.latitude, coordinate.latitude); near(roundtrip.longitude, coordinate.longitude);
  }
}
const width = 420, height = 680, zoom = 16;
const moved = panMapCenter(CAFE_LOCATION, zoom, 130, -90);
const cafePixel = mapPointInViewport(CAFE_LOCATION, moved, zoom, width, height);
near(cafePixel.x, width / 2 + 130); near(cafePixel.y, height / 2 - 90);
const anchorX = 70, anchorY = 120;
const world = projectMapCoordinate(CAFE_LOCATION, zoom);
const anchoredCoordinate = unprojectMapPoint({ x: world.x + anchorX - width / 2, y: world.y + anchorY - height / 2 }, zoom);
const zoomedCenter = zoomMapAt(CAFE_LOCATION, zoom, 18, anchorX, anchorY, width, height);
const anchoredPixel = mapPointInViewport(anchoredCoordinate, zoomedCenter, 18, width, height);
near(anchoredPixel.x, anchorX); near(anchoredPixel.y, anchorY);
for (const center of [CAFE_LOCATION, moved, { latitude: 56, longitude: 179.999 }]) {
  const tiles = visibleMapTiles(width, height, 16, center);
  assert.ok(tiles.length >= 8 && tiles.length <= 20, 'only current viewport tiles are requested');
  for (const tile of tiles) {
    assert.ok(tile.left < width && tile.left + 256 > 0 && tile.top < height && tile.top + 256 > 0);
    const [, x, y] = tile.cacheKey.split('/').map(Number);
    assert.ok(x >= 0 && x < 2 ** 16 && y >= 0 && y < 2 ** 16, 'dateline coordinates wrap into valid provider tile indices');
  }
}
assert.equal(visibleMapTiles(10000, height).length, 0);
assert.equal(visibleMapTiles(width, height, 19).length, 0);
assert.equal(visibleMapTiles(width, height, 16, { latitude: NaN, longitude: 0 }).length, 0);
const nearby = { latitude: 56.49, longitude: 84.98 };
const fitted = fitMapCoordinates([CAFE_LOCATION, nearby], width, height);
for (const coordinate of [CAFE_LOCATION, nearby]) {
  const pixel = mapPointInViewport(coordinate, fitted.center, fitted.zoom, width, height);
  assert.ok(pixel.x >= 72 && pixel.x <= width - 72 && pixel.y >= 72 && pixel.y <= height - 72);
}
const distant = { latitude: -30, longitude: -80 };
const worldFit = fitMapCoordinates([CAFE_LOCATION, distant], width, height);
for (const coordinate of [CAFE_LOCATION, distant]) {
  const pixel = mapPointInViewport(coordinate, worldFit.center, worldFit.zoom, width, height);
  assert.ok(pixel.x >= 72 && pixel.x <= width - 72 && pixel.y >= 72 && pixel.y <= height - 72, 'far-away user still fits with cafe rather than disappearing offscreen');
}
assert.equal(CAFE_LOCATION.twoGisRouteUrl, 'https://2gis.ru/directions/points/|84.94905,56.481399');
assert.equal(CAFE_LOCATION.twoGisUrl, 'https://2gis.ru/geo/84.94905,56.481399');
assert.ok(!CAFE_LOCATION.twoGisRouteUrl.includes('routeSearch'), 'current documented universal link rather than legacy scheme');
assert.ok(!CAFE_LOCATION.twoGisRouteUrl.includes('from'), 'device location is never put into external links');

async function main() {
  let watches = 0, removes = 0, watchCallback, timerCallback;
  const timers = { setTimer: callback => { timerCallback = callback; return 1; }, clearTimer: () => {} };
  const api = {
    Accuracy: { Balanced: 3 },
    requestForegroundPermissionsAsync: async () => ({ granted: true }),
    hasServicesEnabledAsync: async () => true,
    watchPositionAsync: async (options, callback) => { watches++; watchCallback = callback; return { remove() { removes++; } }; },
  };
  const denied = requestMapPosition({ ...api, requestForegroundPermissionsAsync: async () => ({ granted: false }) }, timers);
  await assert.rejects(denied.promise, error => error.code === 'denied');
  assert.equal(watches, 0, 'no GPS watch without permission');
  const disabled = requestMapPosition({ ...api, hasServicesEnabledAsync: async () => false }, timers);
  await assert.rejects(disabled.promise, error => error.code === 'disabled');
  assert.equal(watches, 0);

  const request = requestMapPosition(api, timers); await tick();
  assert.equal(watches, 1);
  watchCallback({ coords: { latitude: NaN, longitude: 84 } });
  assert.equal(removes, 0, 'invalid coordinates are not accepted');
  watchCallback({ coords: { latitude: 56.49, longitude: 84.98, accuracy: 45 } });
  assert.deepEqual(plain(await request.promise), { latitude: 56.49, longitude: 84.98, accuracy: 45 });
  assert.equal(removes, 1, 'first valid fix immediately stops GPS watch');
  request.cancel(); assert.equal(removes, 1, 'cleanup remains idempotent');

  const timeout = requestMapPosition(api, timers); await tick();
  const rejected = assert.rejects(timeout.promise, error => error.code === 'timeout');
  timerCallback(); await rejected;
  assert.equal(removes, 2, 'timeout stops GPS watch');

  const permission = deferred();
  const beforePermission = requestMapPosition({ ...api, requestForegroundPermissionsAsync: () => permission.promise }, timers);
  const cancelled = assert.rejects(beforePermission.promise, error => error.code === 'cancelled');
  beforePermission.cancel(); permission.resolve({ granted: true }); await cancelled; await tick();
  assert.equal(watches, 2, 'closing map while permission prompt is pending never starts GPS');

  const subscription = deferred();
  const late = requestMapPosition({ ...api, watchPositionAsync: async () => { watches++; return subscription.promise; } }, timers);
  const lateCancelled = assert.rejects(late.promise, error => error.code === 'cancelled');
  await tick(); late.cancel(); subscription.resolve({ remove() { removes++; } }); await lateCancelled; await tick();
  assert.equal(removes, 3, 'late native subscription is removed even after modal closes');

  const sync = requestMapPosition({ ...api, watchPositionAsync: async (options, callback) => {
    callback({ coords: { latitude: 56.5, longitude: 85, accuracy: null } });
    return { remove() { removes++; } };
  } }, timers);
  await sync.promise; await tick();
  assert.equal(removes, 4, 'cached native fix before subscription promise also removes watch');

  let browserSuccess, browserError, browserCleared = [];
  const browser = {
    watchPosition(success, error, options) {
      browserSuccess = success; browserError = error;
      assert.equal(options.maximumAge, 0, 'do not present a stale browser fix as current');
      return 7;
    },
    clearWatch(id) { browserCleared.push(id); },
  };
  const browserDenied = requestBrowserMapPosition(browser, timers);
  const browserRejected = assert.rejects(browserDenied.promise, error => error.code === 'denied');
  browserError({ code: 1 }); await browserRejected;
  assert.deepEqual(browserCleared, [7], 'denial clears the browser watch');
  const browserFix = requestBrowserMapPosition(browser, timers);
  browserSuccess({ coords: { latitude: 56.48, longitude: 84.94, accuracy: 20 } });
  assert.deepEqual(plain(await browserFix.promise), { latitude: 56.48, longitude: 84.94, accuracy: 20 });
  assert.deepEqual(browserCleared, [7, 7], 'browser stops after the first valid fix');
  const browserCancel = requestBrowserMapPosition(browser, timers);
  const browserCancelRejected = assert.rejects(browserCancel.promise, error => error.code === 'cancelled');
  browserCancel.cancel(); browserSuccess({ coords: nearby }); await browserCancelRejected;
  assert.deepEqual(browserCleared, [7, 7, 7], 'closing map cancels browser location and ignores late fix');
  await assert.rejects(requestBrowserMapPosition(null, timers).promise, error => error.code === 'unavailable');
  console.log('PASS: map pan/zoom anchoring, viewport tiles, provider URLs, native/browser denial, first fix, timeout and late-callback cleanup');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
