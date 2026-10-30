import { CAFE } from './ordering';

// Coordinates verified against the SBL organisation's own Yandex Maps listing:
// https://yandex.com/maps/org/sbl/96849739091/ (data-coordinates, 2026-10-29).
// Directory opening hours are intentionally not imported; the owner confirmed 11–20.
export const CAFE_LOCATION = Object.freeze({
  latitude: 56.481399,
  longitude: 84.94905,
  organisationUrl: 'https://yandex.ru/maps/org/sbl/96849739091/',
  routeUrl: 'https://yandex.ru/maps/?mode=routes&rtext=~56.481399,84.94905',
  twoGisUrl: 'https://2gis.ru/geo/84.94905,56.481399',
  twoGisRouteUrl: 'https://2gis.ru/directions/points/|84.94905,56.481399',
  osmCopyrightUrl: 'https://www.openstreetmap.org/copyright',
  mapIssueUrl: 'https://www.openstreetmap.org/fixthemap',
});

export const MAP_USER_AGENT = 'SBL-Coffee/1.0 (+https://github.com/sHiikky/sbl_last_coffee)';
export const MAP_MIN_ZOOM = 0;
export const MAP_MAX_ZOOM = 18;
const MERCATOR_MAX_LATITUDE = 85.05112878;

export function validMapCoordinate(coordinate) {
  return !!coordinate && Number.isFinite(coordinate.latitude) && Number.isFinite(coordinate.longitude)
    && Math.abs(coordinate.latitude) <= 90 && Math.abs(coordinate.longitude) <= 180;
}

export function projectMapCoordinate(coordinate, zoom) {
  if (!validMapCoordinate(coordinate) || !Number.isFinite(zoom)) return null;
  const scale = 256 * 2 ** zoom;
  const latitude = Math.max(-MERCATOR_MAX_LATITUDE, Math.min(MERCATOR_MAX_LATITUDE, coordinate.latitude));
  const radians = latitude * Math.PI / 180;
  return { x: (coordinate.longitude + 180) / 360 * scale,
    y: (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * scale };
}

export function unprojectMapPoint(point, zoom) {
  const scale = 256 * 2 ** zoom;
  const x = ((point.x % scale) + scale) % scale;
  const y = Math.max(0, Math.min(scale, point.y));
  return { longitude: x / scale * 360 - 180,
    latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI };
}

export function mapPointInViewport(coordinate, center, zoom, width, height) {
  const point = projectMapCoordinate(coordinate, zoom), origin = projectMapCoordinate(center, zoom);
  if (!point || !origin) return null;
  const scale = 256 * 2 ** zoom;
  let dx = point.x - origin.x;
  if (dx > scale / 2) dx -= scale;
  if (dx < -scale / 2) dx += scale;
  return { x: width / 2 + dx, y: height / 2 + point.y - origin.y };
}

export function panMapCenter(center, zoom, dx, dy) {
  const point = projectMapCoordinate(center, zoom);
  return point ? unprojectMapPoint({ x: point.x - dx, y: point.y - dy }, zoom) : center;
}

// Keep the geographic point under the fingers fixed while the scale changes.
export function zoomMapAt(center, oldZoom, newZoom, anchorX, anchorY, width, height) {
  const point = projectMapCoordinate(center, oldZoom);
  if (!point) return center;
  const ratio = 2 ** (newZoom - oldZoom);
  return unprojectMapPoint({ x: (point.x + anchorX - width / 2) * ratio - anchorX + width / 2,
    y: (point.y + anchorY - height / 2) * ratio - anchorY + height / 2 }, newZoom);
}

export function fitMapCoordinates(coordinates, width, height) {
  const points = coordinates.filter(validMapCoordinate).map(coordinate => projectMapCoordinate(coordinate, 0));
  if (!points.length) return { center: CAFE_LOCATION, zoom: 16 };
  const anchor = points[0].x;
  for (const point of points) {
    if (point.x - anchor > 128) point.x -= 256;
    if (point.x - anchor < -128) point.x += 256;
  }
  const left = Math.min(...points.map(point => point.x)), right = Math.max(...points.map(point => point.x));
  const top = Math.min(...points.map(point => point.y)), bottom = Math.max(...points.map(point => point.y));
  const availableWidth = Math.max(48, width - 144), availableHeight = Math.max(48, height - 144);
  const zoom = Math.max(MAP_MIN_ZOOM, Math.min(16, Math.floor(Math.log2(Math.min(
    availableWidth / Math.max(0.001, right - left), availableHeight / Math.max(0.001, bottom - top))))));
  return { center: unprojectMapPoint({ x: (left + right) / 2, y: (top + bottom) / 2 }, 0), zoom };
}

// Visible tiles only. Never prefetch neighbouring viewports or download offline maps.
export function visibleMapTiles(width, height, zoom = 16, center = CAFE_LOCATION) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 2048)
    || !Number.isInteger(zoom) || zoom < MAP_MIN_ZOOM || zoom > MAP_MAX_ZOOM) return [];
  const point = projectMapCoordinate(center, zoom);
  if (!point) return [];
  const size = 256, scale = 2 ** zoom, left = point.x - width / 2, top = point.y - height / 2;
  const tiles = [];
  for (let y = Math.max(0, Math.floor(top / size)); y <= Math.min(scale - 1, Math.floor((top + height - 0.001) / size)); y++) {
    for (let x = Math.floor(left / size); x <= Math.floor((left + width - 0.001) / size); x++) {
      const wrappedX = ((x % scale) + scale) % scale;
      tiles.push({ key: `${zoom}/${x}/${y}`, cacheKey: `${zoom}/${wrappedX}/${y}`,
        uri: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`,
        left: x * size - left, top: y * size - top, size });
    }
  }
  return tiles;
}

export function cafeClock(config, deviceNow = Date.now()) {
  const received = typeof config?.receivedAt === 'number' ? config.receivedAt : NaN;
  const server = Date.parse(config?.server_now);
  return new Date(Number.isFinite(server) && Number.isFinite(received)
    ? server + Math.max(0, deviceNow - received)
    : deviceNow);
}

export function getCafeHours(config, deviceNow = Date.now()) {
  const now = cafeClock(config, deviceNow);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: CAFE.timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  const hour = Number(parts.hour);
  const seconds = hour * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  const physicallyOpen = seconds >= CAFE.openHour * 3600 && seconds < CAFE.closeHour * 3600;
  const acceptsOrders = physicallyOpen && seconds + CAFE.preparationMax * 60 <= CAFE.closeHour * 3600;
  return {
    hour, physicallyOpen, acceptsOrders,
    hoursLabel: '11:00–20:00',
    statusLabel: physicallyOpen ? 'Открыто до 20:00' : seconds < CAFE.openHour * 3600 ? 'Откроемся в 11:00' : 'Завтра с 11:00',
    orderLabel: acceptsOrders ? 'Готовим 3–5 минут' : physicallyOpen ? 'Приём новых заказов завершён' : 'Заказы принимаем с 11:00',
  };
}

export function cafeGreeting(config, deviceNow = Date.now()) {
  const { hour, physicallyOpen } = getCafeHours(config, deviceNow);
  if (!physicallyOpen) return 'До встречи за кофе';
  if (hour < 12) return 'Начнём день с блеска';
  if (hour < 18) return 'Время для любимого кофе';
  return 'Время притормозить и выпить кофе';
}

// Only visible tiles for one fixed cafe are requested. No background prefetch,
// no offline download, no cache-busting URL or no-cache request headers.
export function cafeMapTiles(width, height = 280, zoom = 16) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 512)
    || !Number.isInteger(zoom) || zoom < 14 || zoom > 18) return [];
  return visibleMapTiles(width, height, zoom);
}
