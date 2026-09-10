// test-sbis-connection.js
// Проверка доступа к API СБИС (Saby): получение токена + список точек продаж.
// Запуск: node test-sbis-connection.js
// Требуется Node.js 18+ (там есть встроенный fetch, отдельно ставить ничего не нужно).

// ЗАПОЛНИТЕ ЭТИ ТРИ ЗНАЧЕНИЯ СВОИМИ (из раздела Безопасность → Подключения к Saby → SBL coffee app):
const APP_CLIENT_ID = "4402856400799386"; // "ID подключения" — уже вписан, менять не нужно
const APP_SECRET = "ВСТАВЬТЕ_СЮДА_ЗАЩИЩЁННЫЙ_КЛЮЧ"; // значение из поля "Защищённый ключ" (иконка "глаз", чтобы посмотреть)
const SECRET_KEY = "ВСТАВЬТЕ_СЮДА_СОДЕРЖИМОЕ_СКАЧАННОГО_ФАЙЛА"; // содержимое скачанного файла сервисного ключа (откройте файл текстовым редактором и скопируйте, что там написано)

async function main() {
  console.log("1) Пробуем получить токен...");

  const tokenRes = await fetch("https://online.sbis.ru/oauth/service/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_client_id: APP_CLIENT_ID,
      app_secret: APP_SECRET,
      secret_key: SECRET_KEY,
    }),
  });

  const tokenText = await tokenRes.text();
  console.log("   HTTP статус:", tokenRes.status);
  console.log("   Ответ сервера:", tokenText);

  if (!tokenRes.ok) {
    console.log("\n❌ Не удалось получить токен. Проверьте, что все три значения скопированы без пробелов/переносов строк, и что сервисный доступ включён и сохранён в СБИС.");
    return;
  }

  let token;
  try {
    const parsed = JSON.parse(tokenText);
    token = parsed.token;
  } catch (e) {
    console.log("\n⚠️ Не удалось разобрать ответ как JSON — посмотрите на 'Ответ сервера' выше вручную.");
    return;
  }

  if (!token) {
    console.log("\n⚠️ В ответе нет поля 'token' — посмотрите на 'Ответ сервера' выше, возможно, там другая структура или сообщение об ошибке.");
    return;
  }

  console.log("\n✅ Токен получен:", token.slice(0, 20) + "...");

  console.log("\n2) Пробуем получить список точек продаж (нужен pointId)...");

  const pointsRes = await fetch("https://api.sbis.ru/retail/point/list?product=retail", {
    method: "GET",
    headers: { "X-SBISAccessToken": token },
  });

  const pointsText = await pointsRes.text();
  console.log("   HTTP статус:", pointsRes.status);
  console.log("   Ответ сервера:", pointsText);

  if (pointsRes.ok) {
    console.log("\n✅ Если видите выше JSON со списком salesPoints — интеграция работает. Найдите вашу кофейню в списке и запишите её поле 'id' — это и есть pointId.");
  } else {
    console.log("\n❌ Токен получен, но запрос точек продаж не прошёл — возможно, разделу 'Магазин' не хватает прав, или тариф Saby Retail не активен на этом аккаунте.");
  }
}

main().catch(err => {
  console.error("Ошибка выполнения скрипта:", err);
});
