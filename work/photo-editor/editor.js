(function () {
  'use strict';
  const M = window.SblPhotoModel;
  const STORAGE_KEY = 'sbl.photo-composition.drafts.v1';
  const PROJECT_URL = 'https://vxefueynagwuavlyeiqc.supabase.co';
  // Public, read-only catalog key already used by the application. Never add a service key here.
  const PUBLIC_KEY = 'sb_publishable_OD1Fh_a_qhnjKeMd30RQRA_WgpOXZwq';
  const $ = id => document.getElementById(id);
  const ids = ['message','productList','search','category','onlyPhotos','catalogCount','emptyList','productCategory','productName','draftStatus','detailFrame','cardFrame','detailImage','cardImage','detailKicker','detailName','cardName','detailPrice','cardPrice','sourceLink','imageMeta','settings','fit','zoom','zoomOutput','offsetX','offsetXOutput','offsetY','offsetYOutput','detailTab','cardTab','exportButton','exportCount','importButton','importFile','reloadButton','smallPreview','largePreview','guides','centerButton','resetViewButton','resetProductButton','discardProductButton','productId','storageStatus'];
  const ui = Object.fromEntries(ids.map(id => [id, $(id)]));
  let products = [], byId = new Map(), fingerprints = new Map(), drafts = new Map();
  let selectedId = null, activeView = 'detail', loading = false, loaded = false, generation = 0;
  let imageReady = false, changedSinceExport = false, storageFailed = false, notice = '';

  function message(text, kind = '') {
    ui.message.textContent = text;
    ui.message.className = `message${kind ? ' ' + kind : ''}`;
  }
  function nameOf(product) { return product.display_name || product.name || 'Без названия'; }
  function priceOf(product) {
    const price = Number(product?.price);
    return Number.isFinite(price) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(price) + ' ₽' : '— ₽';
  }
  function currentProduct() { return byId.get(selectedId); }
  function matchingDraft(product) {
    const draft = drafts.get(product?.id);
    return draft && draft.sourceUrl === M.sourceUrl(product)
      && draft.sourceFingerprint === fingerprints.get(draft.sourceUrl) ? draft : null;
  }
  function settingsFor(product, view) { return matchingDraft(product)?.[view] || M.defaultView(view); }
  function eligibleDrafts() {
    return [...drafts.values()].filter(entry => {
      const product = byId.get(entry.id);
      return product && matchingDraft(product) === entry;
    });
  }
  function updateStatus() {
    const valid = eligibleDrafts();
    const stale = loaded ? drafts.size - valid.length : 0;
    ui.exportCount.textContent = String(valid.length);
    ui.exportButton.disabled = loading || !loaded || !valid.length;
    ui.importButton.disabled = loading || !loaded;
    const current = matchingDraft(currentProduct());
    ui.draftStatus.textContent = current ? (M.isDefault(current) ? 'Сброс в стандартное' : 'Есть настройка') : 'Без изменений';
    ui.draftStatus.classList.toggle('changed', !!current);
    ui.discardProductButton.disabled = loading || !drafts.has(selectedId);
    ui.storageStatus.textContent = storageFailed
      ? 'Браузер не сохранил черновик. Перед закрытием скачайте настройки.'
      : !drafts.size
        ? 'Черновик пуст. Настройте фото и скачайте файл для передачи в чат.'
        : changedSinceExport && valid.length
        ? 'Правки сохранены в этом браузере. Скачайте файл, чтобы передать их в чат.'
        : 'Черновик автоматически сохраняется в этом браузере.';
    if (stale) ui.storageStatus.textContent += ` Настроек для скрытых позиций или заменённых фото: ${stale}. Они не попадут в экспорт.`;
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(M.documentFor([...drafts.values()])));
      storageFailed = false;
    } catch { storageFailed = true; }
    updateStatus();
  }
  function readDrafts() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) drafts = new Map(M.parseDocument(stored).map(entry => [entry.id, entry]));
    } catch {
      storageFailed = true;
      notice = 'Старый черновик не удалось прочитать. Его можно восстановить из ранее скачанного JSON-файла.';
    }
  }
  function filteredProducts() {
    const query = ui.search.value.trim().toLocaleLowerCase('ru');
    return products.filter(product => (!ui.category.value || product.menu_category === ui.category.value)
      && (!ui.onlyPhotos.checked || !!M.sourceUrl(product))
      && (!query || [product.name, product.display_name, product.menu_subcategory].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(query)));
  }
  function renderList() {
    const visible = filteredProducts();
    ui.catalogCount.textContent = `${visible.length} / ${products.length}`;
    ui.emptyList.hidden = visible.length > 0 || loading;
    const fragment = document.createDocumentFragment();
    for (const product of visible) {
      const row = document.createElement('div');
      row.setAttribute('role', 'listitem');
      const button = document.createElement('button');
      button.className = 'product-item' + (selectedId === product.id ? ' selected' : '');
      button.setAttribute('aria-pressed', String(selectedId === product.id));
      button.setAttribute('aria-label', `${nameOf(product)}${matchingDraft(product) ? ', есть настройка' : ''}`);
      const source = M.sourceUrl(product);
      if (source) {
        const image = document.createElement('img');
        image.className = 'thumb'; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.src = source;
        image.addEventListener('error', () => { image.removeAttribute('src'); image.style.visibility = 'hidden'; }, { once: true });
        button.append(image);
      } else {
        const placeholder = document.createElement('span'); placeholder.className = 'thumb'; placeholder.setAttribute('aria-hidden', 'true'); button.append(placeholder);
      }
      const text = document.createElement('span');
      const title = document.createElement('span'); title.className = 'label'; title.textContent = nameOf(product);
      const subtitle = document.createElement('span'); subtitle.className = 'sub'; subtitle.textContent = product.menu_subcategory || product.menu_category || 'Другие позиции';
      text.append(title, subtitle); button.append(text);
      if (matchingDraft(product)) {
        const dot = document.createElement('span'); dot.className = 'edited-dot'; dot.setAttribute('aria-hidden', 'true'); button.append(dot);
      }
      button.addEventListener('click', () => selectProduct(product.id));
      row.append(button); fragment.append(row);
    }
    ui.productList.replaceChildren(fragment);
  }
  function renderSettings() {
    const settings = settingsFor(currentProduct(), activeView);
    ui.fit.value = settings.fit;
    for (const key of ['zoom','offsetX','offsetY']) {
      ui[key].value = String(settings[key]);
      ui[key + 'Output'].textContent = key === 'zoom' ? `${Math.round(settings[key] * 100)}%` : `${settings[key] > 0 ? '+' : ''}${settings[key]}%`;
    }
    for (const view of M.VIEWS) {
      const selected = view === activeView;
      ui[view + 'Tab'].classList.toggle('selected', selected);
      ui[view + 'Tab'].setAttribute('aria-pressed', String(selected));
    }
    ui.settings.disabled = !imageReady || loading;
  }
  function renderTransforms() {
    for (const view of M.VIEWS) {
      const settings = settingsFor(currentProduct(), view);
      const frame = ui[view + 'Frame'];
      const image = ui[view + 'Image'];
      frame.querySelector('.image-translate').style.transform = `translate(${settings.offsetX}%, ${settings.offsetY}%)`;
      image.style.transform = `scale(${settings.zoom})`;
      image.style.objectFit = settings.fit;
    }
  }
  function selectProduct(id) {
    const product = byId.get(id);
    if (!product) return;
    selectedId = id; imageReady = false;
    const source = M.sourceUrl(product), name = nameOf(product), selectionGeneration = ++generation;
    ui.productName.textContent = name; ui.detailName.textContent = name; ui.cardName.textContent = name;
    ui.productCategory.textContent = [product.menu_category, product.menu_subcategory].filter(Boolean).join(' · ') || 'ФОТО ПРОДУКТА';
    ui.detailKicker.textContent = ui.productCategory.textContent;
    ui.detailPrice.textContent = priceOf(product); ui.cardPrice.textContent = priceOf(product); ui.productId.textContent = product.id;
    ui.sourceLink.hidden = !source;
    if (source) ui.sourceLink.href = source;
    else ui.sourceLink.removeAttribute('href');
    ui.imageMeta.textContent = source ? 'Загружаем оригинал…' : 'У этой позиции пока нет ссылки на фото.';
    for (const view of M.VIEWS) {
      const frame = ui[view + 'Frame'], image = ui[view + 'Image'];
      frame.classList.add('no-photo');
      frame.querySelector('.photo-placeholder').textContent = source ? 'Загрузка фото…' : 'Фото ещё не добавлено';
      image.onload = () => {
        if (selectionGeneration !== generation) return;
        frame.classList.remove('no-photo');
        if (view === 'detail') {
          imageReady = true;
          ui.imageMeta.textContent = `${image.naturalWidth} × ${image.naturalHeight} px · исходник не меняется`;
          renderSettings();
        }
      };
      image.onerror = () => {
        if (selectionGeneration !== generation) return;
        frame.classList.add('no-photo'); frame.querySelector('.photo-placeholder').textContent = 'Фото не загрузилось';
        if (view === 'detail') { imageReady = false; ui.imageMeta.textContent = 'Ссылка не вернула изображение. Настройки для этой позиции пока недоступны.'; renderSettings(); }
      };
      if (source) image.src = source;
      else image.removeAttribute('src');
    }
    renderTransforms(); renderSettings(); renderList(); updateStatus();
    if (source && ui.detailImage.complete && ui.detailImage.naturalWidth) ui.detailImage.onload();
    if (source && ui.cardImage.complete && ui.cardImage.naturalWidth) ui.cardImage.onload();
  }
  function editView(settings) {
    const product = currentProduct(), source = M.sourceUrl(product);
    if (!product || !source || !imageReady || loading) return;
    const previous = matchingDraft(product);
    const entry = {
      id: product.id, name: nameOf(product), sourceUrl: source, sourceFingerprint: fingerprints.get(source),
      detail: { ...(previous?.detail || M.defaultView('detail')) },
      card: { ...(previous?.card || M.defaultView('card')) },
      [activeView]: M.normalizeView(settings),
    };
    // Explicit defaults must be exported too: they reset an already integrated override.
    drafts.set(product.id, M.validateEntry(entry));
    changedSinceExport = true;
    persist(); renderTransforms(); renderSettings(); renderList();
  }
  async function refreshCatalog() {
    if (loading) return;
    loading = true; ui.reloadButton.disabled = true; updateStatus(); renderSettings();
    message('Загружаем актуальные названия и ссылки на фотографии…');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const select = 'id,name,display_name,price,image_override_url,image_url,menu_category,menu_subcategory,is_visible,is_available,is_modifier';
      const query = new URLSearchParams({ select, is_visible: 'eq.true', is_available: 'eq.true', is_modifier: 'eq.false', order: 'name.asc,id.asc', limit: '1000' });
      const response = await fetch(`${PROJECT_URL}/rest/v1/products?${query}`, {
        method: 'GET', headers: { apikey: PUBLIC_KEY, Accept: 'application/json' }, signal: controller.signal, credentials: 'omit',
      });
      if (!response.ok) throw new Error(`Каталог недоступен (HTTP ${response.status}).`);
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length >= 1000) throw new Error('Каталог слишком большой или имеет неверный формат. Требуется обновить редактор.');
      const incoming = rows.filter(row => M.UUID.test(row.id || '')).map(row => ({ ...row, id: row.id.toLowerCase() }));
      const urls = [...new Set(incoming.map(M.sourceUrl).filter(Boolean))];
      const hashes = await Promise.all(urls.map(async url => [url, await M.fingerprint(url)]));
      products = incoming; byId = new Map(products.map(product => [product.id, product])); fingerprints = new Map(hashes); loaded = true;
      const previousCategory = ui.category.value;
      ui.category.replaceChildren(new Option('Все разделы', ''));
      for (const category of [...new Set(products.map(product => product.menu_category).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'ru'))) ui.category.add(new Option(category, category));
      if ([...ui.category.options].some(option => option.value === previousCategory)) ui.category.value = previousCategory;
      const first = byId.get(selectedId) || products.find(product => M.sourceUrl(product)) || products[0];
      loading = false;
      if (first) selectProduct(first.id); else { renderList(); renderSettings(); updateStatus(); }
      const photoCount = products.filter(product => M.sourceUrl(product)).length;
      message(`Позиций в каталоге: ${products.length}. Со ссылкой на фото: ${photoCount}. Настройте размещение и скачайте JSON.${notice ? ' ' + notice : ''}`, notice ? '' : 'success');
    } catch (error) {
      message(error.name === 'AbortError' ? 'Каталог не ответил за 20 секунд. Проверьте интернет и нажмите «Обновить».' : error.message || 'Не удалось загрузить каталог.', 'error');
    } finally {
      clearTimeout(timeout); loading = false; ui.reloadButton.disabled = false; updateStatus(); renderSettings();
    }
  }
  async function exportSettings() {
    const entries = eligibleDrafts();
    if (!entries.length || loading) return;
    ui.exportButton.disabled = true;
    try {
      const verified = await Promise.all(entries.map(async entry => {
        if (await M.fingerprint(entry.sourceUrl) !== entry.sourceFingerprint) throw new Error('Адрес фото изменился. Обновите каталог и проверьте настройки.');
        return { ...entry, name: nameOf(byId.get(entry.id)) };
      }));
      const document = M.documentFor(verified), blob = new Blob([JSON.stringify(document, null, 2) + '\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob), anchor = window.document.createElement('a');
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tomsk', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      anchor.href = url; anchor.download = `SBL-photo-settings-${date}.json`; anchor.hidden = true; window.document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      changedSinceExport = false;
      message(`Файл настроек подготовлен. Позиций: ${verified.length}. Прикрепите скачанный JSON-файл в чат — после проверки его можно встроить в приложение.`, 'success');
    } catch (error) { message(error.message || 'Не удалось подготовить файл.', 'error'); }
    finally { updateStatus(); }
  }
  async function importSettings(file) {
    if (!file || loading || !loaded) return;
    if (file.size > 1024 * 1024) { message('Файл настроек должен быть не больше 1 МБ.', 'error'); return; }
    ui.importButton.disabled = true;
    try {
      const entries = M.parseDocument(await file.text()), accepted = [], skipped = [];
      for (const entry of entries) {
        const product = byId.get(entry.id);
        if (!product || M.sourceUrl(product) !== entry.sourceUrl || await M.fingerprint(entry.sourceUrl) !== entry.sourceFingerprint) skipped.push(entry);
        else accepted.push(entry);
      }
      // Validate the entire document before changing the draft; malformed files cannot partially apply.
      for (const entry of accepted) drafts.set(entry.id, { ...entry, name: nameOf(byId.get(entry.id)) });
      changedSinceExport = accepted.length > 0 || changedSinceExport; persist();
      renderTransforms(); renderSettings(); renderList();
      message(`Открыто настроек: ${accepted.length}.${skipped.length ? ` Пропущено ${skipped.length}: позиция скрыта, фото заменено или отпечаток источника не совпал.` : ''} База данных не изменялась.`, skipped.length ? '' : 'success');
    } catch (error) { message(error.message || 'Не удалось открыть настройки.', 'error'); }
    finally { updateStatus(); ui.importFile.value = ''; }
  }
  ui.search.addEventListener('input', renderList); ui.category.addEventListener('change', renderList); ui.onlyPhotos.addEventListener('change', renderList);
  ui.reloadButton.addEventListener('click', refreshCatalog);
  for (const view of M.VIEWS) ui[view + 'Tab'].addEventListener('click', () => { activeView = view; renderSettings(); });
  ui.fit.addEventListener('change', () => editView({ ...settingsFor(currentProduct(), activeView), fit: ui.fit.value }));
  for (const key of ['zoom','offsetX','offsetY']) ui[key].addEventListener('input', () => editView({ ...settingsFor(currentProduct(), activeView), [key]: Number(ui[key].value) }));
  ui.centerButton.addEventListener('click', () => editView({ ...settingsFor(currentProduct(), activeView), offsetX: 0, offsetY: 0 }));
  ui.resetViewButton.addEventListener('click', () => {
    editView(M.defaultView(activeView));
    message('Этот вид возвращён к стандартному размещению. Сброс войдёт в скачанный файл.');
  });
  ui.resetProductButton.addEventListener('click', () => {
    const product = currentProduct(), source = M.sourceUrl(product);
    if (!product || !source || !imageReady || loading) return;
    drafts.set(product.id, M.validateEntry({id:product.id,name:nameOf(product),sourceUrl:source,
      sourceFingerprint:fingerprints.get(source),detail:M.defaultView('detail'),card:M.defaultView('card')}));
    changedSinceExport = true; persist(); renderTransforms(); renderSettings(); renderList();
    message('Оба вида возвращены к стандартному размещению. Эта настройка войдёт в JSON и позволит сбросить прежнюю композицию в приложении.');
  });
  ui.discardProductButton.addEventListener('click', () => {
    drafts.delete(selectedId); changedSinceExport = drafts.size > 0; persist(); renderTransforms(); renderSettings(); renderList();
    message('Позиция убрана только из локального черновика. Фотография и приложение не менялись.');
  });
  for (const [button, compact] of [[ui.smallPreview, true],[ui.largePreview, false]]) button.addEventListener('click', () => {
    document.body.classList.toggle('compact', compact);
    ui.smallPreview.classList.toggle('selected', compact); ui.largePreview.classList.toggle('selected', !compact);
    ui.smallPreview.setAttribute('aria-pressed', String(compact)); ui.largePreview.setAttribute('aria-pressed', String(!compact));
  });
  ui.guides.addEventListener('change', () => document.body.classList.toggle('show-guides', ui.guides.checked));
  ui.exportButton.addEventListener('click', exportSettings);
  ui.importButton.addEventListener('click', () => ui.importFile.click());
  ui.importFile.addEventListener('change', () => importSettings(ui.importFile.files[0]));
  window.addEventListener('beforeunload', event => { if (storageFailed && changedSinceExport && drafts.size) { event.preventDefault(); event.returnValue = ''; } });
  readDrafts(); updateStatus(); refreshCatalog();
})();
