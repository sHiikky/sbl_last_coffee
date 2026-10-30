import { validMapCoordinate } from './cafeLocation';

// Called by the location button only. One foreground fix; never a background task.
// The returned cancellation also removes a watch whose subscription arrives late.
export function requestMapPosition(api, { timeoutMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let closed = false, watch, timer, rejectResult;
  const stop = () => { if (timer) clearTimer(timer); timer = null; watch?.remove?.(); watch = null; };
  const promise = new Promise((resolve, reject) => {
    rejectResult = reject;
    const fail = (code, message) => {
      if (closed) return;
      closed = true; stop();
      const error = new Error(message); error.code = code; reject(error);
    };
    Promise.resolve().then(async () => {
      const permission = await api.requestForegroundPermissionsAsync();
      if (closed) return;
      if (!permission?.granted) {
        fail('denied', 'Разрешите геолокацию для SBL в настройках устройства или браузера. Адрес кофейни доступен без разрешения.');
        return;
      }
      const enabled = await api.hasServicesEnabledAsync();
      if (closed) return;
      if (!enabled) { fail('disabled', 'Геолокация выключена на устройстве. Включите её и попробуйте ещё раз.'); return; }
      timer = setTimer(() => fail('timeout', 'Не удалось определить место. Попробуйте у окна или откройте маршрут в навигаторе.'), timeoutMs);
      const subscription = await api.watchPositionAsync({ accuracy: api.Accuracy.Balanced, timeInterval: 1000, distanceInterval: 0 }, position => {
        if (closed || !validMapCoordinate(position?.coords)) return;
        closed = true; stop();
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) && position.coords.accuracy >= 0 ? position.coords.accuracy : null });
      }, () => fail('unavailable', 'Местоположение недоступно. Попробуйте ещё раз или откройте маршрут в навигаторе.'));
      if (closed) subscription?.remove?.();
      else watch = subscription;
    }).catch(() => fail('unavailable', 'Местоположение недоступно. Попробуйте ещё раз или откройте маршрут в навигаторе.'));
  });
  return { promise, cancel() {
    if (closed) return;
    closed = true; stop();
    const error = new Error('Location request cancelled'); error.code = 'cancelled'; rejectResult(error);
  } };
}

// Browser API requests permission as part of watchPosition. Using it directly
// also works in browsers without Permissions.query and avoids a redundant fix.
export function requestBrowserMapPosition(geolocation, { timeoutMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let closed = false, watchId, timer, rejectResult;
  const stop = () => {
    if (timer) clearTimer(timer); timer = null;
    if (watchId !== undefined) { geolocation.clearWatch(watchId); watchId = undefined; }
  };
  const promise = new Promise((resolve, reject) => {
    rejectResult = reject;
    const fail = (code, message) => {
      if (closed) return;
      closed = true; stop();
      const error = new Error(message); error.code = code; reject(error);
    };
    if (!geolocation?.watchPosition) { fail('unavailable', 'Этот браузер не поддерживает геолокацию. Откройте маршрут в навигаторе.'); return; }
    timer = setTimer(() => fail('timeout', 'Не удалось определить место. Попробуйте ещё раз или откройте маршрут в навигаторе.'), timeoutMs);
    try {
      watchId = geolocation.watchPosition(position => {
        if (closed || !validMapCoordinate(position?.coords)) return;
        closed = true; stop();
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) && position.coords.accuracy >= 0 ? position.coords.accuracy : null });
      }, failure => fail(failure.code === 1 ? 'denied' : 'unavailable', failure.code === 1
        ? 'Разрешите геолокацию для SBL в настройках браузера. Адрес кофейни доступен без разрешения.'
        : 'Местоположение недоступно. Попробуйте ещё раз или откройте маршрут в навигаторе.'),
      { enableHighAccuracy: false, maximumAge: 0, timeout: timeoutMs });
      if (closed) stop();
    } catch (_) { fail('unavailable', 'Местоположение недоступно. Откройте маршрут в навигаторе.'); }
  });
  return { promise, cancel() {
    if (closed) return;
    closed = true; stop();
    const error = new Error('Location request cancelled'); error.code = 'cancelled'; rejectResult(error);
  } };
}
