// test-sbis-catalog-full.js
// Полная выгрузка каталога СБИС в JSON-файл + проверка priceListId (cost:null) + проверка авторизации картинок.
// Запуск: node test-sbis-catalog-full.js
// Требуется Node.js 18+ (встроенный fetch).

const fs = require("fs");

// ЗАПОЛНИТЕ (как и раньше):
const APP_CLIENT_ID = process.env.SBIS_APP_CLIENT_ID;
const APP_SECRET = process.env.SBIS_APP_SECRET;
const SECRET_KEY = process.env.SBIS_SECRET_KEY;

const POINT_ID = 240;
const PAGE_SIZE = 25;
const MAX_PAGES = 500; // защитный потолок, чтобы точно не уйти в бесконечный цикл при непредвиденном формате ответа

const OUT_CATALOG_FILE = "catalog.json";
const OUT_REPORT_FILE = "catalog-report.json";

async function getToken() {
  const res = await fetch("https://online.sbis.ru/oauth/service/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_client_id: APP_CLIENT_ID,
      app_secret: APP_SECRET,
      secret_key: SECRET_KEY,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Не удалось получить токен. HTTP ${res.status}: ${text}`);
  }
  const parsed = JSON.parse(text);
  if (!parsed.token) {
    throw new Error(`В ответе нет token: ${text}`);
  }
  return parsed.token;
}

// Достаёт из ответа список товаров + признак "есть ли ещё страницы",
// не полагаясь жёстко на одно конкретное название поля (SBIS в разных
// местах документации называет это по-разному).
function extractPage(json) {
  const items =
    json.nomenclatures ||
    json.items ||
    json.result ||
    (Array.isArray(json) ? json : []);

  let hasMore;
  if (typeof json.hasMore === "boolean") hasMore = json.hasMore;
  else if (json.outcome && typeof json.outcome.hasMore === "boolean")
    hasMore = json.outcome.hasMore;
  else hasMore = undefined; // определим по факту ниже, через длину страницы

  return { items: items || [], hasMore };
}

async function fetchCatalogPage(token, page, extraParams = {}) {
  const params = new URLSearchParams({
    pointId: String(POINT_ID),
    withBalance: "true",
    withBarcode: "true",
    pageSize: String(PAGE_SIZE),
    page: String(page),
    ...extraParams,
  });
  const url = `https://api.sbis.ru/retail/v2/nomenclature/list?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "X-SBISAccessToken": token },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Страница ${page}: HTTP ${res.status}: ${text}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Страница ${page}: ответ не является JSON: ${text.slice(0, 300)}`);
  }
  return json;
}

async function fetchFullCatalog(token, extraParams = {}) {
  let all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    console.log(`  ...загружаю страницу ${page}`);
    const json = await fetchCatalogPage(token, page, extraParams);
    const { items, hasMore } = extractPage(json);
    all = all.concat(items);

    // Останавливаемся, если явно сказано, что страниц больше нет,
    // либо (если поле hasMore не найдено/не понятно) страница пришла короче pageSize —
    // это универсальный и надёжный признак "это была последняя страница".
    const stopByFlag = hasMore === false;
    const stopByLength = hasMore === undefined && items.length < PAGE_SIZE;
    const stopByEmpty = items.length === 0;

    if (stopByEmpty || stopByFlag || stopByLength) {
      console.log(`  Страница ${page} — последняя (товаров на странице: ${items.length}).`);
      break;
    }
  }
  return all;
}

async function getPriceListId(token) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const params = new URLSearchParams({ pointId: String(POINT_ID), actualDate: today });
  const url = `https://api.sbis.ru/retail/nomenclature/price-list?${params.toString()}`;
  const res = await fetch(url, { headers: { "X-SBISAccessToken": token } });
  const text = await res.text();
  console.log("  HTTP статус (price-list):", res.status);
  console.log("  Ответ сервера (price-list):", text.slice(0, 1000));
  if (!res.ok) return null;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  // Пытаемся достать priceListId из разных возможных форм ответа
  if (Array.isArray(json) && json.length && json[0].priceListId) return json[0].priceListId;
  if (json.priceListId) return json.priceListId;
  if (Array.isArray(json.priceLists) && json.priceLists.length) {
    return json.priceLists[0].priceListId || json.priceLists[0].id;
  }
  if (Array.isArray(json.result) && json.result.length) {
    return json.result[0].priceListId || json.result[0].id;
  }
  console.log("  ⚠️ Не удалось автоматически найти priceListId в ответе — посмотрите на 'Ответ сервера' выше вручную.");
  return null;
}

function findItemById(list, id) {
  return list.find((x) => x.id === id || x.id === String(id));
}

async function testImageAuth(token, catalog) {
  // Ищем первый товар с непустым полем images/image
  const withImage = catalog.find(
    (x) => x.image || (Array.isArray(x.images) && x.images.length)
  );
  if (!withImage) {
    console.log("  В каталоге не нашлось товара с изображением — тест пропущен.");
    return { tested: false };
  }
  const rawPath = withImage.image || withImage.images[0];
  console.log("  Найден пример пути картинки:", rawPath);

  const hosts = ["https://api.sbis.ru", "https://online.sbis.ru"];
  const results = [];

  for (const host of hosts) {
    const fullUrl = rawPath.startsWith("http") ? rawPath : `${host}${rawPath.startsWith("/") ? "" : "/"}${rawPath}`;

    // без токена
    try {
      const noAuthRes = await fetch(fullUrl);
      results.push({ host, url: fullUrl, withAuth: false, status: noAuthRes.status });
      console.log(`  [${host}] без токена → HTTP ${noAuthRes.status}`);
    } catch (e) {
      results.push({ host, url: fullUrl, withAuth: false, error: String(e) });
      console.log(`  [${host}] без токена → ошибка: ${e}`);
    }

    // с токеном
    try {
      const authRes = await fetch(fullUrl, { headers: { "X-SBISAccessToken": token } });
      results.push({ host, url: fullUrl, withAuth: true, status: authRes.status });
      console.log(`  [${host}] с токеном → HTTP ${authRes.status}`);
    } catch (e) {
      results.push({ host, url: fullUrl, withAuth: true, error: String(e) });
      console.log(`  [${host}] с токеном → ошибка: ${e}`);
    }

    if (rawPath.startsWith("http")) break; // абсолютный URL — хост перебирать не нужно
  }

  return { tested: true, rawPath, results };
}

async function main() {
  console.log("1) Получаем токен...");
  const token = await getToken();
  console.log("   ✅ токен получен\n");

  console.log("2) Загружаем ПОЛНЫЙ каталог (без priceListId)...");
  const fullCatalog = await fetchFullCatalog(token);
  console.log(`   ✅ всего товаров/папок загружено: ${fullCatalog.length}\n`);

  fs.writeFileSync(OUT_CATALOG_FILE, JSON.stringify(fullCatalog, null, 2), "utf-8");
  console.log(`   💾 сохранено в файл: ${OUT_CATALOG_FILE}\n`);

  console.log("3) Проверяем гипотезу про priceListId и cost:null (товар id=270, 'Айс Латте миндаль')...");
  const before = findItemById(fullCatalog, 270);
  console.log("   До (без priceListId): cost =", before ? before.cost : "товар не найден в выгрузке");

  const priceListId = await getPriceListId(token);
  let after = null;
  if (priceListId) {
    console.log(`   Найден priceListId = ${priceListId}, повторно запрашиваем каталог с этим параметром...`);
    const catalogWithPrice = await fetchFullCatalog(token, { priceListId: String(priceListId) });
    after = findItemById(catalogWithPrice, 270);
    console.log("   После (с priceListId): cost =", after ? after.cost : "товар не найден в выгрузке");
    fs.writeFileSync(
      "catalog-with-pricelist.json",
      JSON.stringify(catalogWithPrice, null, 2),
      "utf-8"
    );
    console.log("   💾 сохранено в файл: catalog-with-pricelist.json");
  } else {
    console.log("   ⚠️ priceListId не получен — см. вывод выше, гипотезу проверить не удалось.");
  }
  console.log("");

  console.log("4) Проверяем, нужен ли токен для загрузки картинок товаров...");
  const imageTest = await testImageAuth(token, fullCatalog);
  console.log("");

  const report = {
    generatedAt: new Date().toISOString(),
    totalItems: fullCatalog.length,
    item270: { before: before ? before.cost : null, after: after ? after.cost : null, priceListId },
    imageTest,
  };
  fs.writeFileSync(OUT_REPORT_FILE, JSON.stringify(report, null, 2), "utf-8");
  console.log(`💾 итоговый отчёт сохранён в файл: ${OUT_REPORT_FILE}`);
  console.log("\n✅ Готово. Отправьте мне (или ChatGPT) содержимое catalog.json и catalog-report.json.");
}

main().catch((err) => {
  console.error("\n❌ Ошибка выполнения скрипта:", err.message || err);
});
