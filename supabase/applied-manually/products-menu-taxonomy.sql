-- products-menu-taxonomy.sql
-- Кураторская категоризация меню для покупателя (Напитки / Еда / Десерты /
-- Магазин), поверх технической структуры папок СБИС. Обсуждали и сверяли
-- вручную (плюс разбор от ChatGPT по скриншотам реального меню) — см.
-- переписку. Эти колонки синхронизация из СБИС никогда не трогает (как и
-- is_visible/is_quick_pick/badge) — это исключительно ручная разметка.
--
-- Как применить: Supabase Dashboard -> SQL Editor -> вставить целиком -> Run.
-- Безопасно запускать повторно (UPDATE по точному имени — если имя не
-- совпадёт ни с одной строкой, просто ничего не изменится, ничего не сломается).
--
-- ВАЖНО про видимость: после этого скрипта is_visible пересчитывается заново
-- по правилу "показываем только то, что явно размечено" (menu_category не
-- пусто и это не добавка). Значит:
--   - 3-4 позиции без надёжной классификации ("Кедровая сказка", "Шоковзлёт",
--     "Очень странные дела по-сибирски") временно ИСЧЕЗНУТ из приложения —
--     это осознанно, лучше скрыть непонятное, чем показать неверно. Уточните,
--     что это такое, и мы доразметим одной строкой.
--   - "Магазин" (вазы, кофе в зёрнах, свечи, цветы) размечен, но НЕ включён
--     (is_visible остаётся false) — если решите продавать это через
--     приложение, включите отдельно (команда в самом низу файла).
--   - Товары, которых нет в этом списке вообще (если СБИС пришлёт что-то
--     новое) — тоже останутся скрыты, пока не разметите вручную. Это
--     сознательное ужесточение: раньше новый товар в одной из 4 старых папок
--     СБИС появлялся в меню автоматически, теперь — только после разметки.

alter table public.products add column if not exists menu_category text;
alter table public.products add column if not exists menu_subcategory text;
alter table public.products add column if not exists display_name text;
alter table public.products add column if not exists is_modifier boolean not null default false;
alter table public.products add column if not exists tags text[];

comment on column public.products.menu_category is 'Раздел меню для покупателя: Напитки / Еда / Десерты / Магазин. Ручная разметка, синхронизация не трогает.';
comment on column public.products.menu_subcategory is 'Под-раздел внутри menu_category (например "Кофе", "Авторский кофе"). Ручная разметка.';
comment on column public.products.display_name is 'Человеко-понятное название для карточки товара (например "Капучино" вместо "Кофе Капучино маленький"). Если пусто — используется исходное имя из СБИС.';
comment on column public.products.is_modifier is 'true = это добавка/модификатор ("+ сыр 20 гр", молоко, сироп), не самостоятельная позиция меню — никогда не показывается в каталоге.';

-- ============================== НАПИТКИ / Кофе ==============================
update public.products set menu_category='Напитки', menu_subcategory='Кофе' where name='Кофе Флэт';
update public.products set menu_category='Напитки', menu_subcategory='Кофе', display_name='Латте' where name='Кофе Латте большой';
update public.products set menu_category='Напитки', menu_subcategory='Кофе' where name='Френч пресс';
update public.products set menu_category='Напитки', menu_subcategory='Кофе' where name='Раф классика';
update public.products set menu_category='Напитки', menu_subcategory='Кофе', display_name='Капучино' where name='Кофе Капучино маленький';
update public.products set menu_category='Напитки', menu_subcategory='Кофе' where name='Френч пресс декаф';
update public.products set menu_category='Напитки', menu_subcategory='Кофе' where name='Айс Латте';
update public.products set menu_category='Напитки', menu_subcategory='Кофе' where name='Холодный Американо';

-- ========================= НАПИТКИ / Авторский кофе =========================
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Латте «кокос арахис»';
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name like 'Шмель%' or name like 'Бамбл%';
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Латте фисташка-карамель с цедрой';
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Протеиновый латте от Анисьи';
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Гранатовый кофе';
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Юдзу американо';
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Кедровый латте с клубникой';

-- =========================== НАПИТКИ / Матча и убе ===========================
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Матча латте';
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Матча латте протеин';
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name like 'Матча Blue%';
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Фисташковая Матча Латте 300 мл';
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Убе Латте 350 мл';
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Убе Латте';
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Матча-тоник';

-- ========================== НАПИТКИ / Чай и травяные ==========================
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Чай Мандарин-Розмарин 500 мл';
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Сибирский чай с корицей 300мл';
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Чай ромашковый';
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Чай Облепиха-имбирь 500 мл';
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Чай гречишный 500 мл';
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Чай черный 500мл';
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Имбирный Юдзу 300 мл';
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Шиповник с апельсином 300 мл';
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Чай Малина-Розмарин 500 мл';

-- ======================= НАПИТКИ / Какао и альтернативы =======================
update public.products set menu_category='Напитки', menu_subcategory='Какао и альтернативы' where name like 'Какао%вишня%';
update public.products set menu_category='Напитки', menu_subcategory='Какао и альтернативы' where name='Банановый какао';
update public.products set menu_category='Напитки', menu_subcategory='Какао и альтернативы' where name='Флэт на цикории';

-- =========================== НАПИТКИ / Холодные напитки ===========================
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Шот Витамин';
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Лимонад Малина-Базилик 0.33л';
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Фреш яблочный';
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name like 'Лимонад Дюшес%';

-- ========================= НАПИТКИ / Авторские без кофе =========================
update public.products set menu_category='Напитки', menu_subcategory='Авторские без кофе' where name='Глинтвейн грейпфрут';
-- "Кедровая сказка", "Шоковзлёт", "Очень странные дела по-сибирски" —
-- намеренно НЕ размечены (см. пояснение вверху файла), уточните и добавьте
-- отдельной строкой, когда узнаете, что это такое.

-- ================================ ЕДА / Завтраки ================================
update public.products set menu_category='Еда', menu_subcategory='Завтраки' where name='Гранола с кедровым орехом';
update public.products set menu_category='Еда', menu_subcategory='Завтраки' where name='Завтрак конструктор';
update public.products set menu_category='Еда', menu_subcategory='Завтраки' where name='Завтрак с яйцами';

-- ========================== ЕДА / Сэндвичи и круассаны ==========================
update public.products set menu_category='Еда', menu_subcategory='Сэндвичи и круассаны' where name='Сэндвич с курицей МСП';
update public.products set menu_category='Еда', menu_subcategory='Сэндвичи и круассаны' where name='Сэндвич с курицей';
update public.products set menu_category='Еда', menu_subcategory='Сэндвичи и круассаны' where name='Круассан с лососем';
update public.products set menu_category='Еда', menu_subcategory='Сэндвичи и круассаны' where name='Сэндвич с форелью МСП';
update public.products set menu_category='Еда', menu_subcategory='Сэндвичи и круассаны' where name='Сэндвич с рваным брискетом (говядина)';
update public.products set menu_category='Еда', menu_subcategory='Сэндвичи и круассаны' where name='Бутерброд с икрой';
update public.products set menu_category='Еда', menu_subcategory='Сэндвичи и круассаны' where name='Круассан с ветчиной и сыром';

-- ============================== ЕДА / Супы и сытное ==============================
update public.products set menu_category='Еда', menu_subcategory='Супы и сытное' where name='Тыквенный суп';
update public.products set menu_category='Еда', menu_subcategory='Супы и сытное' where name='Пирог сытный';
update public.products set menu_category='Еда', menu_subcategory='Супы и сытное' where name='Чечевичный суп';

-- ================================== ЕДА / Снеки ==================================
update public.products set menu_category='Еда', menu_subcategory='Снеки' where name='Протеиновый батончик';

-- ========================= ДЕСЕРТЫ / Пирожные и порционные =========================
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Медовик низкокалорийный';
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Тирамису';
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Десерт Манго-кокос';
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Пирожное Чизкейк манго-маракуйя';
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Мусс Васюганские болота';
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Птичье молоко';
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Пирожное Сникерс';
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Картошка праздничная';
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Тарт ягодный';
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Эклеры в ассортименте';

-- ================================== ДЕСЕРТЫ / Шу ==================================
update public.products set menu_category='Десерты', menu_subcategory='Шу' where name='Шу лимонный курд';
update public.products set menu_category='Десерты', menu_subcategory='Шу' where name='Шу Соленая карамель';
update public.products set menu_category='Десерты', menu_subcategory='Шу' where name='Шу сливочный';

-- ================================ ДЕСЕРТЫ / Выпечка ================================
update public.products set menu_category='Десерты', menu_subcategory='Выпечка' where name='Мадлен';
update public.products set menu_category='Десерты', menu_subcategory='Выпечка' where name='Мадлен в шоколаде';
update public.products set menu_category='Десерты', menu_subcategory='Выпечка' where name='Зернобон с творогом и клюквой';
update public.products set menu_category='Десерты', menu_subcategory='Выпечка' where name='Булочка сахарная,70 гр';
update public.products set menu_category='Десерты', menu_subcategory='Выпечка' where name='Кекс банановый vegan';
update public.products set menu_category='Десерты', menu_subcategory='Выпечка' where name='Плетенка с яблоком';

-- ============================ ДЕСЕРТЫ / Печенье и брауни ============================
update public.products set menu_category='Десерты', menu_subcategory='Печенье и брауни' where name='Печенье Брауни';
update public.products set menu_category='Десерты', menu_subcategory='Печенье и брауни' where name='Печенье овсяное Зерно';
update public.products set menu_category='Десерты', menu_subcategory='Печенье и брауни' where name='Печенье маленькое';
update public.products set menu_category='Десерты', menu_subcategory='Печенье и брауни' where name='Печенье Блонди';

-- =========================== ДЕСЕРТЫ / Конфеты и сладости ===========================
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Конфета Кедровый грильяж';
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Конфета Дубайский шоколад';
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Ириска Зерно';
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Конфета Для любимых';
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Конфета Метелица/Маска';
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Трюфель vegan';
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Макаронс в ассорт.';

-- ============================ МАГАЗИН (размечен, но выключен) ============================
update public.products set menu_category='Магазин', menu_subcategory='Кофе в зёрнах' where name like 'Кофе в зернах%';
update public.products set menu_category='Магазин', menu_subcategory='Кофе в зёрнах' where name like 'Декаф в зёрнах%';
update public.products set menu_category='Магазин', menu_subcategory='Декор и подарки' where name like 'Ваза%Берез%';
update public.products set menu_category='Магазин', menu_subcategory='Декор и подарки' where name like 'Свеча%';
update public.products set menu_category='Магазин', menu_subcategory='Декор и подарки' where name='Цветы Амариллис луковица';
update public.products set menu_category='Магазин', menu_subcategory='Декор и подарки' where name='Город не бесит Не открытки шт 1 набор';
update public.products set menu_category='Магазин', menu_subcategory='Напитки навынос' where name='Газ. вода Coca Cola, шт';

-- ================================ ДОБАВКИ (всегда скрыты) ================================
-- Отдельная категория menu_category для них не нужна — is_modifier=true сам
-- по себе гарантирует, что ниже они не попадут в is_visible=true.
update public.products set is_modifier=true where name ~ '^\+\s';
update public.products set is_modifier=true where category='Добавки';
update public.products set is_modifier=true where name ilike '%молоко%' and category='Добавки';
update public.products set is_modifier=true where name ilike 'сливки%' or name ilike 'сироп%' or name ilike 'урбеч%' or name ilike 'паста арахисовая%' or name ilike 'мороженое %гр' or name ilike 'мед %гр' or name ilike 'кардамон%' or name ilike 'имбирный фреш%' or name ilike 'содовая%';

-- ============================== Пересчёт видимости ==============================
-- Показываем только то, что явно размечено кураторской категорией и не
-- является добавкой. Всё неразмеченное (в т.ч. "Магазин" на данный момент,
-- "Кедровая сказка" и подобные) станет скрытым — это осознанно.
update public.products
set is_visible = (menu_category is not null and menu_category <> 'Магазин' and not is_modifier);

-- ============================== Проверка ==============================
-- Выполните отдельно, чтобы увидеть, что осталось неразмеченным среди
-- потенциально настоящих позиций меню (не добавок) — это то, что нужно
-- доразметить вручную одной строкой update по образцу выше:
--
-- select sbis_id, name, category, price
-- from products
-- where menu_category is null and not is_modifier
-- order by category, name;

-- Когда решите включить раздел "Магазин" в приложении — просто:
-- update public.products set is_visible = true where menu_category = 'Магазин';
