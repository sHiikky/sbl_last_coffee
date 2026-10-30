(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SblPhotoModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TYPE = 'sbl-photo-composition';
  const VERSION = 1;
  const PROJECT_REF = 'vxefueynagwuavlyeiqc';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const VIEWS = ['detail', 'card'];
  const LIMITS = Object.freeze({ zoom: [0.5, 1.8], offsetX: [-35, 35], offsetY: [-35, 35] });

  function defaultView(view) {
    if (!VIEWS.includes(view)) throw new Error('Неизвестный вид фотографии.');
    return { fit: 'contain', zoom: view === 'detail' ? 0.9 : 1, offsetX: 0, offsetY: 0 };
  }
  function normalizeView(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !['contain', 'cover'].includes(input.fit)) {
      throw new Error('Неверный способ размещения фотографии.');
    }
    const result = { fit: input.fit };
    for (const [key, [min, max]] of Object.entries(LIMITS)) {
      if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < min || input[key] > max) {
        throw new Error(`Параметр ${key} выходит за допустимые пределы.`);
      }
      result[key] = Math.round(input[key] * 1000) / 1000;
    }
    return result;
  }
  function sourceUrl(row) {
    const raw = row?.image_override_url || row?.image_url;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const text = raw.startsWith('http') ? raw : `https://api.sbis.ru${raw}`;
    try {
      const url = new URL(text);
      return url.protocol === 'https:' && !url.username && !url.password && text.length <= 4096 ? text : null;
    } catch { return null; }
  }
  async function fingerprint(source, cryptoApi = globalThis.crypto) {
    if (!cryptoApi?.subtle) throw new Error('Для проверки фото откройте редактор через localhost в современном браузере.');
    const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(source));
    return 'url-sha256:' + Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
  }
  function validateEntry(input) {
    if (!input || typeof input !== 'object' || !UUID.test(input.id || '')
      || typeof input.sourceUrl !== 'string' || sourceUrl({ image_url: input.sourceUrl }) !== input.sourceUrl
      || typeof input.sourceFingerprint !== 'string' || !/^url-sha256:[a-f0-9]{64}$/.test(input.sourceFingerprint)) {
      throw new Error('Запись фото содержит неверный ID, адрес или отпечаток источника.');
    }
    if (typeof input.name !== 'string' || input.name.length > 500) throw new Error('Неверное название позиции.');
    return {
      id: input.id.toLowerCase(), name: input.name, sourceUrl: input.sourceUrl,
      sourceFingerprint: input.sourceFingerprint,
      detail: normalizeView(input.detail), card: normalizeView(input.card),
    };
  }
  function parseDocument(input) {
    const document = typeof input === 'string' ? JSON.parse(input) : input;
    if (!document || document.type !== TYPE || document.version !== VERSION || document.projectRef !== PROJECT_REF
      || !Array.isArray(document.products) || document.products.length > 1000) {
      throw new Error('Нужен файл настроек SBL версии 1 для проекта кофейни.');
    }
    const entries = document.products.map(validateEntry);
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('В файле повторяются ID позиций.');
    return entries;
  }
  function documentFor(entries, now = new Date()) {
    const products = entries.map(validateEntry).sort((a, b) => a.id.localeCompare(b.id, 'en'));
    if (new Set(products.map(entry => entry.id)).size !== products.length) throw new Error('В настройках повторяются ID позиций.');
    return { type: TYPE, version: VERSION, projectRef: PROJECT_REF, exportedAt: now.toISOString(), products };
  }
  function isDefault(entry) {
    return VIEWS.every(view => JSON.stringify(normalizeView(entry[view])) === JSON.stringify(defaultView(view)));
  }
  function geometry(frameWidth, frameHeight, naturalWidth, naturalHeight, settings) {
    const view = normalizeView(settings);
    if (![frameWidth, frameHeight, naturalWidth, naturalHeight].every(x => typeof x === 'number' && Number.isFinite(x) && x > 0)) {
      throw new Error('Размеры изображения и рамки должны быть положительными.');
    }
    const ratio = view.fit === 'contain'
      ? Math.min(frameWidth / naturalWidth, frameHeight / naturalHeight)
      : Math.max(frameWidth / naturalWidth, frameHeight / naturalHeight);
    const width = naturalWidth * ratio * view.zoom;
    const height = naturalHeight * ratio * view.zoom;
    return {
      width, height,
      left: (frameWidth - width) / 2 + frameWidth * view.offsetX / 100,
      top: (frameHeight - height) / 2 + frameHeight * view.offsetY / 100,
    };
  }
  return Object.freeze({ TYPE, VERSION, PROJECT_REF, UUID, VIEWS, LIMITS, defaultView, normalizeView, sourceUrl, fingerprint, validateEntry, parseDocument, documentFor, isDefault, geometry });
});
