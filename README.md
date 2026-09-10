# SBL — приложение кофейни

React Native / Expo (SDK 54) приложение для сети кофеен «SBL». Backend — Supabase (Postgres + Auth + Realtime).

## Стек

- Expo 54, React 19, React Native 0.81
- Навигация: `@react-navigation` (bottom-tabs + native-stack)
- Локальное состояние: AsyncStorage (корзина, избранное, история заказов, активный заказ)
- Backend: Supabase (`@supabase/supabase-js`) — анонимная авторизация покупателей, таблицы `orders`/`order_items`/`bonus_accounts`/`bonus_transactions`/`promo_banners`
- Пакетный менеджер: pnpm

## Запуск

```
pnpm install
pnpm start   # или: pnpm web / pnpm android / pnpm ios
```

## Структура

- `App.js` — корень: таб-навигация (Главная/Меню/Корзина/Профиль) + модальный экран товара, открывается сразу без промежуточных экранов; вся бизнес-логика корзины/заказов/избранного/активного заказа живёт здесь
- `screens/` — HomeScreen, MenuScreen, ProductScreen, CartScreen, OrderSuccessScreen, ProfileScreen
- `components/` — переиспользуемые UI-компоненты, включая набор «голографических» декоративных элементов
- `components/home/ActiveOrderBanner.js` — карточка активного заказа на Главной (см. ниже)
- `hooks/useOrderStatus.js` — общий хук чтения + realtime-подписки на статус заказа (используется и `OrderSuccessScreen`, и `ActiveOrderBanner`)
- `data/products.js` — каталог товаров + хелперы `calcPrice`/`cartKey`/`getProductById`
- `theme/tokens.js` — цвета и токены дизайна
- `navigation/TabIcons.js` — иконки для таб-бара
- `lib/supabaseClient.js` — единый Supabase-клиент, `ensureAnonymousSession()`, `getUserOrThrow()`
- `loyalty/` — программа лояльности «Серия SBL» (подробности см. ниже)
- `kassa-terminal/index.html` — отдельная веб-панель кассира (не Expo-приложение, чистый HTML/JS + Supabase CDN), запускать через любой статический сервер (например `npx serve kassa-terminal -l 5050`), не через `file://`

## Supabase

Backend развёрнут отдельно (проект `rsgtniffmcedjzmvkdyn`), схема и RLS-политики не меняются из приложения.

- Анонимный вход (`signInAnonymously`) должен быть включён в Supabase Dashboard → Authentication → Sign In / Providers → Anonymous Sign-Ins. Без этого `ensureAnonymousSession()` тихо падает и оформление заказа завершается ошибкой.
- **Realtime обязательно должен быть включён для таблиц `orders` и `order_items`**: Supabase Dashboard → Database → Publications → `supabase_realtime` → добавить таблицы (либо `alter publication supabase_realtime add table public.orders, public.order_items;` через SQL Editor). Без этого `postgres_changes`-подписки в `OrderSuccessScreen`/`ActiveOrderBanner`/кассе формально подключаются (`SUBSCRIBED`), но никогда не получают события — статус заказа обновляется только при ручной перезагрузке страницы.
- RLS: покупатель (анонимный) видит и создаёт только свои заказы; сотрудники (таблица `staff`, привязана к `auth.users` по `user_id`) видят и меняют любые заказы. У таблицы `staff` обязательно должна быть SELECT-политика, разрешающая пользователю читать свою же строку (`auth.uid() = user_id`) — иначе EXISTS-проверка в политиках `orders` не проходит даже для реальных сотрудников.

## Модель данных заказа/корзины

Ключ товара в корзине строится из `cartKey(id, sizeId, milkId, temperatureId, addonIds)` — один и тот же продукт с разными опциями хранится как отдельные позиции. Цена считается через `calcPrice`.

## Активный заказ (баннер на Главной)

После оформления заказа приложение показывает полноэкранный `OrderSuccessScreen` с живым статусом. После возврата на Главную («На главную») статус заказа остаётся видимым в виде компактного баннера (`ActiveOrderBanner`), пока заказ не переведён в `completed`/`cancelled`:

- источник истины — Supabase, не локальный кэш: при каждом запуске приложения `App.js` запрашивает самый свежий незавершённый заказ пользователя (`refreshActiveOrder`)
- `AsyncStorage` (`sbl_active_order`) используется только как кэш для мгновенной отрисовки до ответа сервера
- если у пользователя несколько незавершённых заказов одновременно — баннер показывает только самый свежий (осознанное упрощение)
- баннер и `OrderSuccessScreen` используют один и тот же хук `useOrderStatus` — при завершении заказа (`completed`/`cancelled`) баннер исчезает сам через колбэк `onFinished`

## Loyalty / программа лояльности «Серия SBL»

Полноценная бонусная система посещений (streak), отдельная от кэшбек-программы с уровнями (`HomeLoyaltyCard`, см. раздел «Бонусная программа» ниже) — механики не смешаны.

- `loyalty/` — чистый domain-слой без React/RN-зависимостей (кроме `loyaltyStorage.js` и `useLoyaltyState.js`): `loyaltyConfig.js` (единый конфиг, milestones, timezone кофейни `Asia/Tomsk`), `loyaltyDate.js` (business-day утилиты, устойчивые к DST/переходу месяца/года), `loyaltyService.js` (расчёт streak, milestone/reward логика, идемпотентность наград), `loyaltySelectors.js` (карта пути, cycle progress), `useLoyaltyState.js` (React-хук: persistence + reconciliation + celebratory modal), `loyaltyDev.js` (DEV-only симуляция дней/серии).
- Источник истины — накопленный `visitedDays` в AsyncStorage (`sbl_loyalty_v1`), а НЕ сырой `orderHistory` напрямую: `orderHistory` в App.js хранит только последние 12 заказов (`.slice(0, 12)`), поэтому `visitedDays` монотонно сливается (union) с каждым изменением `orderHistory`, чтобы обрезка истории не съедала прогресс серии.
- UI: `components/loyalty/*` (LoyaltyHomeWidget на Home, LoyaltyPath/DayNode, LoyaltyCalendar, LoyaltyRewardModal, LoyaltyRewardCartCard в корзине), `screens/LoyaltyScreen.js` — отдельный Stack-экран `"Loyalty"`.
- Тесты: `loyalty/loyaltyService.selfcheck.js` — запускается напрямую через `node loyaltyService.selfcheck.js`.
- Награда за 10 дней подряд — `free_dessert` (десерт в подарок, раньше был бесплатный напиток), покрывает самый дешёвый товар категории `dessert` в корзине (`loyalty/loyaltyService.js` → `getEligibleCartItemsForReward`, стратегия `cheapest_dessert`); если в корзине нет десерта — награда не применима.

## Бонусная программа (кэшбек с уровнями + списание бонусов)

Целиком на бэкенде — источник истины в Supabase, не в AsyncStorage. Миграции: `supabase/migrations/20260822120000_bonus_program.sql` (бонусы) и `20260822130000_promo_banners.sql` (промо-баннеры).

- Таблицы: `bonus_accounts` (`customer_id` PK, `balance`, `lifetime_paid` — сумма покупок клиента, оплаченная ДЕНЬГАМИ, накопительно за всё время, без сброса — основа уровня) и `bonus_transactions` (журнал `earn`/`redeem`/`refund`, привязан к `order_id`). RLS: клиент видит только свои строки, `staff` — полный доступ. Обе таблицы нельзя писать напрямую с клиента — только триггеры (`security definer`).
- Уровни (`bonus_rate_for(lifetime_paid)`, единственное место с порогами): 5% (≤10000₽), 10% (10001–30000₽), 15% (>30000₽).
- `orders` получил колонки `bonus_redeemed` (сколько бонусов клиент списал на заказ, 1 бонус = 1₽, максимум 50% от `total`), `bonus_earned` (сколько начислено — для чтения без джойна) и `bonus_refunded` (флаг идемпотентности возврата при отмене). `orders.total` по-прежнему полная стоимость товаров, `bonus_redeemed` НЕ вычитается из него — сколько реально просить деньгами на кассе = `total - bonus_redeemed` (кассир видит это в `kassa-terminal`).
- Списание (`handle_order_bonus_redeem`, `AFTER INSERT` на `orders`, не `BEFORE` — иначе `bonus_transactions.order_id` не может сослаться на ещё не существующую строку `orders`) проверяет лимит 50% и баланс, иначе `RAISE EXCEPTION` откатывает весь заказ.
- Начисление (`handle_order_status_change`, `BEFORE UPDATE`) — при переходе в `completed` (кассир жмёт «Выдано»), только с денежной части (`total - bonus_redeemed`), по ставке уровня клиента НА МОМЕНТ покупки (до её же зачёта в `lifetime_paid`). При `cancelled` — автоматически возвращает списанные бонусы.
- Фронтенд: `lib/bonusConfig.js` (клиентское зеркало уровней/ставок — только для UI-оценки, не источник истины), `hooks/useBonusAccount.js` (баланс + realtime-подписка), `HomeLoyaltyCard` на Главной, `components/bonus/BonusRedeemCartCard.js` в корзине (визуально зеркалит `LoyaltyRewardCartCard`).
- Протестировано вручную (Management API, в транзакции с `ROLLBACK`) и под реальной RLS-ролью anon-клиента: списание, начисление, возврат при отмене, отказ при превышении лимита, невозможность напрямую отредактировать `balance`.

## Промо-баннеры (временные акции на Главной)

`promo_banners` — админ-панели нет, баннеры добавляются/выключаются вручную через SQL (Management API или SQL Editor в Supabase). `lib/promoService.js` читает баннер, у которого `now()` попадает в `[starts_at, ends_at]`; `components/home/PromoBanner.js` показывает его на Главной, тап ведёт на товар (`product_id` — id из локального каталога `data/products.js`, не FK) или в меню, если `product_id` пуст. Пример:
```sql
insert into public.promo_banners (title, subtitle, product_id, starts_at, ends_at)
values ('-20% на раф с солёной карамелью', 'Только эту неделю', 'salted-caramel-raf', now(), now() + interval '7 days');
```

## Дизайн-система

- `components/Chip.js` — единая пилюля-переключатель (размер/молоко/температура/добавки в `ProductScreen`, точка/время самовывоза в `CartScreen`, категории в `MenuScreen`) с залитым тёмным active-состоянием + тенью. До этого в трёх экранах было три чуть разных стиля active — унифицировано.
- `components/ProductCard.js` — карточка товара на Главной/в Меню: без плоской окантовки, с мягкой тенью и фирменным оранжевым свечением у кнопки «+» (как у основных CTA-кнопок).
- `components/profile/ProfileMenuGroup.js`/`ProfileMenuItem.js` — пункты меню в Профиле («Мои заказы», «Избранное» и т.д.) теперь отдельные карточки с отступом между ними, а не строки в одном блоке с разделителями.

## Оформление заказа

`screens/CartScreen.js` → `handleOrder`: вставляет строку в `orders` (`customer_id`, `status:'new'`, `total`), получает обратно `id`/`order_number`, затем вставляет строки в `order_items` (`product_name`, `quantity`, `price` — цена ЗА ЕДИНИЦУ). Только после успеха обновляется локальный `orderHistory` — при ошибке Supabase локальный заказ не создаётся и корзина не очищается.


## Заметки

- Git-репозиторий в родительской папке («Приложение проект/.git») — изменения коммитятся оттуда.
- Dev-сервер (`expo start --web`) иногда виснет и держит порт 8081 после перезапуска — если `pnpm web` падает с «Port 8081 is being used», найти процесс (`netstat -ano | grep 8081`) и завершить его перед повторным запуском.
- `react-native-url-polyfill/auto` не резолвится Metro через pnpm-симлинки на Windows — используется ручной `setupURLPolyfill()` из главного экспорта пакета (см. `lib/supabaseClient.js`).

## Показ приложения другу онлайн (через ngrok)

Чтобы друг мог смотреть live-изменения приложения в Expo Go со своего телефона (не в одной Wi-Fi сети):

- Запусти `запустить-для-друга.bat` на рабочем столе (или `start-tunnel.ps1` в этой папке) — он сам поднимает ngrok-туннель на порт 8081, настраивает Metro и обновляет QR-код `Desktop/qr-приложение.png`.
- Друг сканирует этот QR в Expo Go (или вводит ссылку exp:// вручную).
- Встроенный `expo start --tunnel` (пакет `@expo/ngrok`) сейчас сломан — используется свой ngrok.exe (`../ngrok3/ngrok.exe`, авторизован) + переменная окружения `EXPO_PACKAGER_PROXY_URL`.
- ngrok на бесплатном плане даёт новый случайный поддомен при каждом перезапуске — старую ссылку/QR после перезапуска нужно обновлять (скрипт делает это автоматически).
