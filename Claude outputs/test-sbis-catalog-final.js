// test-sbis-catalog-final.js
// Финальная выгрузка каталога с ПРАВИЛЬНЫМ прайс-листом "Осень-Зима 25'26" (id=64).
// Запуск: node test-sbis-catalog-final.js

const fs = require("fs");

const APP_CLIENT_ID = "4402856400799386";
const APP_SECRET = "ВСТАВЬТЕ_СЮДА_ЗАЩИЩЁННЫЙ_КЛЮЧ";
const SECRET_KEY = "ВСТАВЬТЕ_СЮДА_СОДЕРЖИМОЕ_СКАЧАННОГО_ФАЙЛА";

const POINT_ID = 240;
const PRICE_LIST_ID = 64; // "Осень-Зима 25'26" — актуальный
const PAGE_SIZE = 25;
const MAX_PAGES = 500;

const OUT_FILE = "catalog-final.json";

async function getToken() {
  const res = await fetch("https://online.sbis.ru/oauth/service/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_client_id: APP_CLIENT_ID, app_secret: APP_SECRET, secret_key: SECRET_KEY }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Не удалось получить токен. HTTP ${res.status}: ${text}`);
  const parsed = JSON.parse(text);
  if (!parsed.token) throw new Error(`В ответе нет token: ${text}`);
  return parsed.token;
}

function extractPage(json) {
  const items = json.nomenclatures || json.items || json.result || (Array.isArray(json) ? json : []);
  let hasMore;
  if (typeof json.hasMore === "boolean") hasMore = json.hasMore;
  else if (json.outcome && typeof json.outcome.hasMore === "boolean") hasMore = json.outcome.hasMore;
  else hasMore = undefined;
  return { items: items || [], hasMore };
}

async function fetchCatalogPage(token, page) {
  const params = new URLSearchParams({
    pointId: String(POINT_ID),
    priceListId: String(PRICE_LIST_ID),
    withBalance: "true",
    withBarcode: "true",
    pageSize: String(PAGE_SIZE),
    page: String(page),
  });
  const url = `https://api.sbis.ru/retail/v2/nomenclature/list?${params.toString()}`;
  const res = await fetch(url, { method: "GET", headers: { "X-SBISAccessToken": token } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Страница ${page}: HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  console.log("1) Получаем токен...");
  const token = await getToken();
  console.log("   ✅ токен получен\n");

  console.log(`2) Загружаем каталог с priceListId=${PRICE_LIST_ID} ("Осень-Зима 25'26")...`);
  let all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    console.log(`  ...страница ${page}`);
    const json = await fetchCatalogPage(token, page);
    const { items, hasMore } = extractPage(json);
    all = all.concat(items);
    if (items.length === 0 || hasMore === false || (hasMore === undefined && items.length < PAGE_SIZE)) {
      console.log(`  Страница ${page} — последняя (товаров: ${items.length}).`);
      break;
    }
  }
  console.log(`   ✅ всего загружено: ${all.length}\n`);

  fs.writeFileSync(OUT_FILE, JSON.stringify(all, null, 2), "utf-8");
  console.log(`   💾 сохранено в файл: ${OUT_FILE}`);

  // Быстрая проверка на глаз: несколько случайных напитков и их цены
  const drinks = all.filter((x) => !x.isParent && typeof x.cost === "number" && x.cost > 0).slice(0, 10);
  console.log("\n3) Примеры товаров и цен (проверьте на глаз, похоже ли на реальное меню):");
  drinks.forEach((d) => console.log(`   - ${d.name}: ${d.cost} ₽`));

  const nullCost = all.filter((x) => !x.isParent && x.cost === null).length;
  console.log(`\n4) Товаров без цены (cost:null), не считая папок: ${nullCost}`);

  console.log("\n✅ Готово. Пришлите мне catalog-final.json (и что скажете по ценам из пункта 3 — похоже на актуальное меню или нет).");
}

main().catch((err) => console.error("\n❌ Ошибка:", err.message || err));
