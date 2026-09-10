# SBL — приложение кофейни

React Native / Expo (SDK 54) приложение для сети кофеен "SBL". Изначально экспортировано из Expo Snack.

## Стек
- Expo 54, React 19, React Native 0.81
- Навигация: @react-navigation (bottom-tabs + native-stack)
- Хранение состояния локально: AsyncStorage (корзина, избранное, история заказов)
- Пакетный менеджер: pnpm (есть pnpm-lock.yaml)

## Запуск
```
pnpm install
pnpm start   # или: pnpm web / pnpm android / pnpm ios
```

## Структура
- `App.js` — корень: таб-навигация (Главная/Меню/Корзина/Профиль) + модальный экран товара, открывается сразу без промежуточных экранов; вся бизнес-логика корзины/заказов/избранного живёт здесь и пробрасывается пропсами вниз
- `screens/` — HomeScreen, MenuScreen, ProductScreen, CartScreen, OrderSuccessScreen, ProfileScreen
- `components/` — переиспользуемые UI-компоненты, в т.ч. набор "голографических" декоративных элементов (HolographicSurface, HoloRing, HoloLine, ChromeEdge и т.п.) — это часть визуального стиля приложения
- `data/products.js` — каталог товаров + хелперы calcPrice/cartKey/getProductById
- `theme/tokens.js` — цвета и токены дизайна
- `navigation/TabIcons.js` — иконки для таб-бара

## Модель данных заказа/корзины
Ключ товара в корзине строится из `cartKey(id, sizeId, milkId, temperatureId, addonIds)` — то есть один и тот же продукт с разными опциями (размер/молоко/температура/добавки) хранится как отдельные позиции. Цена считается через `calcPrice`.

## Дизайн-система
- `components/Chip.js` — единая пилюля-переключатель (Размер/Молоко/Температура/
  Добавки в ProductScreen, точка/время самовывоза в CartScreen, категории в
  MenuScreen) с залитым тёмным active-состоянием + тенью. До этого в трёх
  экранах было три чуть разных стиля active (где обводка, где заливка) —
  унифицировано, дубли стилей удалены.
- `components/ProductCard.js` — карточка товара на Главной/в Меню: убрана
  плоская окантовка (`borderWidth`), вместо неё мягкая тень (`shadow.level2`,
  карточка "парит"), кнопка "+" получила фирменное оранжевое свечение
  (`shadow.button`, как у PrimaryButton) вместо плоской заливки.
- `components/profile/ProfileMenuGroup.js`/`ProfileMenuItem.js` — пункты меню
  в Профиле ("Мои заказы", "Избранное" и т.д.) теперь отдельные карточки с
  отступом (`gap: spacing.sm`) между ними, а не строки в одном блоке с
  разделителями (`showDivider` убран как неиспользуемый).

## Loyalty / программа лояльности "Серия SBL"
Полноценная бонусная система посещений (streak), отдельная от кэшбек-программы
с уровнями (`HomeLoyaltyCard`, см. "Бонусная программа" ниже) — механики не
смешаны.
- `loyalty/` — чистый domain-слой без React/RN-зависимостей (кроме
  `loyaltyStorage.js` и `useLoyaltyState.js`): `loyaltyConfig.js` (единый
  конфиг, milestones, timezone кофейни `Asia/Tomsk`), `loyaltyDate.js`
  (business-day утилиты, устойчивые к DST/переходу месяца/года),
  `loyaltyService.js` (расчёт streak, milestone/reward логика, идемпотентность
  наград), `loyaltySelectors.js` (карта пути, cycle progress), `useLoyaltyState.js`
  (React-хук: persistence + reconciliation + celebratory modal),
  `loyaltyDev.js` (DEV-only симуляция дней/серии).
- Источник истины — накопленный `visitedDays` в AsyncStorage
  (`sbl_loyalty_v1`), а НЕ сырой `orderHistory` напрямую: `orderHistory` в
  App.js хранит только последние 12 заказов (`.slice(0, 12)`), поэтому
  `visitedDays` монотонно сливается (union) с каждым изменением orderHistory,
  чтобы обрезка истории не съедала прогресс серии.
- UI: `components/loyalty/*` (LoyaltyHomeWidget на Home, LoyaltyPath/DayNode,
  LoyaltyCalendar, LoyaltyRewardModal, LoyaltyRewardCartCard в корзине),
  `screens/LoyaltyScreen.js` — отдельный Stack-экран `"Loyalty"`, открывается с
  Home и из Profile (`LoyaltyTeaser`).
- Тесты: `loyalty/loyaltyService.selfcheck.js` — запускается напрямую через
  `node loyaltyService.selfcheck.js` (см. `loyalty/package.json` с
  `"type":"module"` — нужно только для Node CLI, Metro это поле не читает).

## Supabase (backend заказов)
Backend уже развёрнут отдельно (проект `rsgtniffmcedjzmvkdyn`), схема и RLS
не меняются из приложения — только подключение.
- `lib/supabaseClient.js` — единый клиент (`persistSession` через
  AsyncStorage). `ensureAnonymousSession()` вызывается тихо при старте
  приложения (App.js) — `signInAnonymously()`, без экрана регистрации.
  `getUserOrThrow()` — получить текущего пользователя с фолбэком на
  повторный анонимный вход.
  - Важно: `import 'react-native-url-polyfill/auto'` НЕ резолвится Metro в
    этом проекте (subpath-импорт через pnpm-симлинки на Windows не находится).
    Обход — импортировать `setupURLPolyfill` из главного экспорта пакета и
    вызывать вручную (см. верх `lib/supabaseClient.js`).
- Оформление заказа (`screens/CartScreen.js` → `handleOrder`): вставляет
  строку в `orders` (`customer_id`, `status:'new'`, `total`), получает обратно
  `id`/`order_number`, затем вставляет строки в `order_items`
  (`product_name`, `quantity`, `price` — price здесь цена ЗА ЕДИНИЦУ, не
  сумма по строке). Только после успеха обновляется локальный `orderHistory`
  (нужен loyalty-программе) — при ошибке Supabase локальный заказ не
  создаётся и корзина не очищается.
- `screens/OrderSuccessScreen.js` — теперь настоящий экран статуса заказа:
  подписка на `postgres_changes` (`UPDATE` по `orders`, `filter: id=eq.<id>`),
  отписка (`supabase.removeChannel`) при размонтировании. Раньше здесь был
  локальный фейковый таймер обратного отсчёта — убран, статус теперь всегда
  соответствует тому, что видит панель кассира.

## Бонусная программа (кэшбек с уровнями + списание)
Отдельная система от "Серии SBL" (см. выше) — целиком на бэкенде, источник
истины в Supabase, а не в AsyncStorage. Миграция:
`supabase/migrations/20260822120000_bonus_program.sql`.
- Таблицы: `bonus_accounts` (`customer_id` PK, `balance`, `lifetime_paid` —
  сумма покупок клиента, оплаченная ДЕНЬГАМИ, накопительно за всё время, без
  сброса — это основа уровня) и `bonus_transactions` (журнал
  `earn`/`redeem`/`refund`, привязан к `order_id`). RLS: клиент видит только
  свои строки (`auth.uid() = customer_id`), `staff` — полный доступ. Обе
  таблицы НЕЛЬЗЯ писать напрямую с клиента — только триггеры (`security
  definer`), иначе можно было бы начислить/списать себе бонусы произвольно.
- Уровни: `bonus_rate_for(lifetime_paid)` — 5% (≤10000₽), 10% (10001–30000₽),
  15% (>30000₽). Единственное место с этими порогами.
- `orders` получил колонки `bonus_redeemed` (сколько бонусов клиент списал на
  заказ, 1 бонус = 1₽, максимум 50% от `total` — проверяет триггер),
  `bonus_earned` (сколько начислено, заполняется триггером, для чтения без
  джойна) и `bonus_refunded` (флаг идемпотентности возврата при отмене).
  `orders.total` по-прежнему полная стоимость товаров (как считалось раньше)
  — `bonus_redeemed` НЕ вычитается из него, это отдельное поле; сколько
  реально просить деньгами на кассе = `total - bonus_redeemed`.
- Триггер `handle_order_bonus_redeem` (`AFTER INSERT` на `orders`) — списывает
  `bonus_redeemed` сразу при создании заказа: проверяет лимит 50% и баланс,
  иначе `RAISE EXCEPTION` (откатывает весь INSERT, клиент увидит ошибку в
  `Alert` как при любой другой ошибке Supabase в `CartScreen`). Специально
  `AFTER`, а не `BEFORE` INSERT — иначе `bonus_transactions.order_id` не
  может сослаться на ещё не существующую строку `orders` (в `BEFORE`-триггере
  FK ловит ошибку `23503`, это баг, на который наткнулись при тестировании).
- Триггер `handle_order_status_change` (`BEFORE UPDATE` на `orders`) — при
  переходе в `completed` (кассир жмёт "Выдано" в kassa-terminal, `ready →
  completed`) начисляет кэшбек ТОЛЬКО с денежной части (`total -
  bonus_redeemed`), по ставке уровня клиента НА МОМЕНТ этой покупки (до её
  же зачёта в `lifetime_paid` — покупка, что перевела на новый уровень, ещё
  кэшбечится по старой ставке). При переходе в `cancelled` — автоматически
  возвращает списанные на этот заказ бонусы (если ещё не возвращены).
- Логика протестирована вручную через Management API SQL-запрос в транзакции
  с `ROLLBACK` (реальные данные не менялись) — списание, начисление,
  возврат при отмене и отказ при превышении 50% лимита все отработали верно.
- CLI-таблица `supabase_migrations.schema_migrations` на этом проекте вообще
  не инициализирована (все миграции раньше применялись вручную через SQL, не
  `supabase db push`) — `supabase migration list` показывает локальные
  миграции без "remote" отметки, это ожидаемо и не является проблемой.
- Протестировано и под RLS реальным anon-клиентом (`sb_publishable_...` ключ,
  `signInAnonymously`, не только через Management API service-role) — клиент
  может создать свой заказ со списанием бонусов, НЕ может списать себе больше
  лимита (триггер кидает исключение), и НЕ может напрямую отредактировать
  `bonus_accounts.balance` (RLS блокирует, 0 строк затронуто).

## Промо-баннеры (временные акции на Главной)
`promo_banners` (миграция `20260822130000_promo_banners.sql`) — админ-панели
нет, баннеры добавляются/выключаются вручную через SQL (Management API или
SQL Editor в Supabase). `lib/promoService.js` читает баннер, у которого
`now()` попадает в `[starts_at, ends_at]`; `components/home/PromoBanner.js` на
Главной показывает его, тап ведёт на товар (`product_id` — id из локального
каталога `data/products.js`, НЕ FK) или в меню, если `product_id` пуст.
Пример добавления баннера на неделю:
```sql
insert into public.promo_banners (title, subtitle, product_id, starts_at, ends_at)
values ('-20% на раф с солёной карамелью', 'Только эту неделю', 'salted-caramel-raf', now(), now() + interval '7 days');
```

## Заметки
- Git-репозиторий в родительской папке ("Приложение проект/.git") пустой/не инициализирован по-настоящему — изменения пока нигде не закоммичены.
- Dev-сервер (`expo start --web`) иногда виснет и держит порт 8081 после
  перезапуска — если `pnpm web` падает с "Port 8081 is being used", найти
  процесс (`netstat -ano | grep 8081`) и завершить его перед повторным запуском.

## Показ приложения другу онлайн (через ngrok)
Чтобы друг мог смотреть live-изменения приложения в Expo Go со своего телефона (не в одной Wi-Fi сети):
- Запусти `запустить-для-друга.bat` на рабочем столе (или `start-tunnel.ps1` в этой папке) — он сам поднимает ngrok-туннель на порт 8081, настраивает Metro и обновляет QR-код `Desktop/qr-приложение.png`.
- Друг сканирует этот QR в Expo Go (или вводит ссылку exp:// вручную).
- Важно: встроенный `expo start --tunnel` (пакет `@expo/ngrok`) сейчас сломан — падает с `Cannot read properties of undefined (reading 'body')`. Поэтому используется свой ngrok.exe (лежит в `../ngrok3/ngrok.exe`, авторизован) + переменная окружения `EXPO_PACKAGER_PROXY_URL`, которая заставляет Metro класть в манифест публичный адрес ngrok вместо `127.0.0.1`.
- ngrok на бесплатном плане даёт новый случайный поддомен при каждом перезапуске — старую ссылку/QR после перезапуска нужно обновлять (скрипт делает это автоматически).
