-- menu-taxonomy-2026-10.sql
-- Разметка меню «осень-зима 2026» (прайс СБИС от 08.10.2026) по образцу products-menu-taxonomy.sql.
-- Что делает: (1) ставит актуальные цены; (2) размечает новые/неразмеченные позиции меню
--   (menu_category пусто -> заполняется; уже размеченное вручную НЕ трогается);
-- (3) помечает добавки (+ и - в начале названия) как is_modifier; (4) пересчитывает видимость
--   по тому же правилу, что раньше; (5) скрывает позиции, которых нет в новом меню.
-- Безопасно запускать повторно и ПОСЛЕ синхронизации со СБИС (UPDATE по точному названию:
--   если строки ещё нет, ничего не меняется). Всё в одной транзакции.
begin;

-- ---- 0. Добавляем позиции нового меню, которых ещё нет в таблице (по названию) ----
-- sbis_id у них временный и ОТРИЦАТЕЛЬНЫЙ (поле integer, у СБИС 18..851): в таблице нет артикулов. Если позже синхронизация
-- привезёт те же товары с настоящими sbis_id, дубли по названию нужно будет убрать.
insert into public.products (sbis_id, name, category, price) select -234331010, 'Аффогато', 'Классика', 250 where not exists (select 1 from public.products where name='Аффогато');
insert into public.products (sbis_id, name, category, price) select -102899831, 'Раф тыква карамель', 'Классика', 370 where not exists (select 1 from public.products where name='Раф тыква карамель');
insert into public.products (sbis_id, name, category, price) select -236086236, 'Американо с облепиховой пеной', 'Классика', 250 where not exists (select 1 from public.products where name='Американо с облепиховой пеной');
insert into public.products (sbis_id, name, category, price) select -264787285, 'Американо с вишневой пеной', 'Классика', 250 where not exists (select 1 from public.products where name='Американо с вишневой пеной');
insert into public.products (sbis_id, name, category, price) select -193619728, 'Американо с малиновой пеной', 'Классика', 250 where not exists (select 1 from public.products where name='Американо с малиновой пеной');
insert into public.products (sbis_id, name, category, price) select -216493427, 'Черри Латте', 'Классика', 350 where not exists (select 1 from public.products where name='Черри Латте');
insert into public.products (sbis_id, name, category, price) select -51012023, 'Земляничный убе', 'Освежающие', 340 where not exists (select 1 from public.products where name='Земляничный убе');
insert into public.products (sbis_id, name, category, price) select -210031549, 'Лимонад Земляничный', 'Освежающие', 260 where not exists (select 1 from public.products where name='Лимонад Земляничный');
insert into public.products (sbis_id, name, category, price) select -147150727, 'Лимонад Розовый лимон', 'Освежающие', 310 where not exists (select 1 from public.products where name='Лимонад Розовый лимон');
insert into public.products (sbis_id, name, category, price) select -148970023, 'Матча Жасмин', 'Освежающие', 340 where not exists (select 1 from public.products where name='Матча Жасмин');
insert into public.products (sbis_id, name, category, price) select -255305941, 'Пинк дринк', 'Освежающие', 290 where not exists (select 1 from public.products where name='Пинк дринк');
insert into public.products (sbis_id, name, category, price) select -263877443, 'Пинк дринк Матча', 'Освежающие', 340 where not exists (select 1 from public.products where name='Пинк дринк Матча');
insert into public.products (sbis_id, name, category, price) select -122944030, 'Апероль', 'Освежающие', 380 where not exists (select 1 from public.products where name='Апероль');
insert into public.products (sbis_id, name, category, price) select -135383160, 'Москито', 'Освежающие', 310 where not exists (select 1 from public.products where name='Москито');
insert into public.products (sbis_id, name, category, price) select -232897620, 'Облепиховый ромарио', 'Освежающие', 360 where not exists (select 1 from public.products where name='Облепиховый ромарио');
insert into public.products (sbis_id, name, category, price) select -170048546, 'Матча Мятный пломбир', 'Не кофе', 450 where not exists (select 1 from public.products where name='Матча Мятный пломбир');
insert into public.products (sbis_id, name, category, price) select -48737948, 'Матча Фисташковый пломбир', 'Не кофе', 450 where not exists (select 1 from public.products where name='Матча Фисташковый пломбир');
insert into public.products (sbis_id, name, category, price) select -102840526, 'Убе Ежевичный пломбир', 'Не кофе', 450 where not exists (select 1 from public.products where name='Убе Ежевичный пломбир');
insert into public.products (sbis_id, name, category, price) select -64968919, 'Ходжича латте 400 мл', 'Не кофе', 340 where not exists (select 1 from public.products where name='Ходжича латте 400 мл');
insert into public.products (sbis_id, name, category, price) select -158513721, 'Ходжича латте 250 мл', 'Не кофе', 250 where not exists (select 1 from public.products where name='Ходжича латте 250 мл');
insert into public.products (sbis_id, name, category, price) select -51616968, 'Какао грог', 'Не кофе', 320 where not exists (select 1 from public.products where name='Какао грог');
insert into public.products (sbis_id, name, category, price) select -225780648, 'Чай Малина-мята 500 мл', 'Чайники', 320 where not exists (select 1 from public.products where name='Чай Малина-мята 500 мл');
insert into public.products (sbis_id, name, category, price) select -35876492, 'Чай розовый жасмин', 'Чайники', 280 where not exists (select 1 from public.products where name='Чай розовый жасмин');
insert into public.products (sbis_id, name, category, price) select -159982253, 'Ежевичный чай', 'Чайники', 390 where not exists (select 1 from public.products where name='Ежевичный чай');
insert into public.products (sbis_id, name, category, price) select -141636035, 'Малиновый пунш', 'Чайники', 320 where not exists (select 1 from public.products where name='Малиновый пунш');
insert into public.products (sbis_id, name, category, price) select -62568504, 'Шиповник ягодный', 'Чайники', 290 where not exists (select 1 from public.products where name='Шиповник ягодный');
insert into public.products (sbis_id, name, category, price) select -164432346, 'Лимонад Расцветай!', 'Коллаб', 320 where not exists (select 1 from public.products where name='Лимонад Расцветай!');
insert into public.products (sbis_id, name, category, price) select -21464652, 'Эспрессо-тоник на игристом', 'Коллаб', 350 where not exists (select 1 from public.products where name='Эспрессо-тоник на игристом');
insert into public.products (sbis_id, name, category, price) select -129497177, 'Эспрессо-тоник Пало санто Валентины', 'Коллаб', 350 where not exists (select 1 from public.products where name='Эспрессо-тоник Пало санто Валентины');
insert into public.products (sbis_id, name, category, price) select -266195614, 'Боул с курицей', 'Вкусно', 470 where not exists (select 1 from public.products where name='Боул с курицей');
insert into public.products (sbis_id, name, category, price) select -198182054, 'Боул с форелью', 'Вкусно', 590 where not exists (select 1 from public.products where name='Боул с форелью');
insert into public.products (sbis_id, name, category, price) select -199561796, 'Греческий', 'Вкусно', 430 where not exists (select 1 from public.products where name='Греческий');
insert into public.products (sbis_id, name, category, price) select -196385137, 'Овсяная с конфитюром апельсин-ваниль', 'Вкусно', 200 where not exists (select 1 from public.products where name='Овсяная с конфитюром апельсин-ваниль');
insert into public.products (sbis_id, name, category, price) select -166498640, 'Рисовая с апельсиновым конфитюром', 'Вкусно', 200 where not exists (select 1 from public.products where name='Рисовая с апельсиновым конфитюром');
insert into public.products (sbis_id, name, category, price) select -257333780, 'Рисовая с шоколадом и вишней', 'Вкусно', 200 where not exists (select 1 from public.products where name='Рисовая с шоколадом и вишней');
insert into public.products (sbis_id, name, category, price) select -229680531, 'Рисовая с шоколадом и орехом', 'Вкусно', 200 where not exists (select 1 from public.products where name='Рисовая с шоколадом и орехом');
insert into public.products (sbis_id, name, category, price) select -29070746, 'Роти с ветчиной и сыром', 'Вкусно', 390 where not exists (select 1 from public.products where name='Роти с ветчиной и сыром');
insert into public.products (sbis_id, name, category, price) select -157419170, 'Роти с курицей и песто', 'Вкусно', 430 where not exists (select 1 from public.products where name='Роти с курицей и песто');
insert into public.products (sbis_id, name, category, price) select -95852325, 'Цезарь с курицей', 'Вкусно', 410 where not exists (select 1 from public.products where name='Цезарь с курицей');
insert into public.products (sbis_id, name, category, price) select -204661065, 'Цезарь с лососем', 'Вкусно', 500 where not exists (select 1 from public.products where name='Цезарь с лососем');
insert into public.products (sbis_id, name, category, price) select -38230599, '+икра лососевая 25 гр', 'добавки', 450 where not exists (select 1 from public.products where name='+икра лососевая 25 гр');
insert into public.products (sbis_id, name, category, price) select -244034021, '+масло 20 гр', 'добавки', 50 where not exists (select 1 from public.products where name='+масло 20 гр');
insert into public.products (sbis_id, name, category, price) select -76445459, '+яйцо 1шт.', 'добавки', 50 where not exists (select 1 from public.products where name='+яйцо 1шт.');
insert into public.products (sbis_id, name, category, price) select -40879045, 'Зефир ПП', 'Моменты', 105 where not exists (select 1 from public.products where name='Зефир ПП');
insert into public.products (sbis_id, name, category, price) select -87563539, 'Аффогато с фисташкой', 'Мороженое', 320 where not exists (select 1 from public.products where name='Аффогато с фисташкой');
insert into public.products (sbis_id, name, category, price) select -236748198, 'Мороженое Гранат-орех', 'Мороженое', 300 where not exists (select 1 from public.products where name='Мороженое Гранат-орех');
insert into public.products (sbis_id, name, category, price) select -81699171, 'Мороженое лайм-миндаль', 'Мороженое', 300 where not exists (select 1 from public.products where name='Мороженое лайм-миндаль');
insert into public.products (sbis_id, name, category, price) select -191873736, 'Мороженое малина-фисташка', 'Мороженое', 310 where not exists (select 1 from public.products where name='Мороженое малина-фисташка');
insert into public.products (sbis_id, name, category, price) select -14543133, 'Фундучное печенье', 'МСП', 150 where not exists (select 1 from public.products where name='Фундучное печенье');
insert into public.products (sbis_id, name, category, price) select -57291966, 'Шоколадное печенье', 'МСП', 150 where not exists (select 1 from public.products where name='Шоколадное печенье');
insert into public.products (sbis_id, name, category, price) select -64156664, 'Сырники мсп', 'МСП', 350 where not exists (select 1 from public.products where name='Сырники мсп');
insert into public.products (sbis_id, name, category, price) select -160111663, 'Боул с креветкой мсп', 'МСП', 550 where not exists (select 1 from public.products where name='Боул с креветкой мсп');
insert into public.products (sbis_id, name, category, price) select -24885409, 'Боул с курицей мсп', 'МСП', 450 where not exists (select 1 from public.products where name='Боул с курицей мсп');
insert into public.products (sbis_id, name, category, price) select -245519536, 'Яичный рулет с жульеном', 'МСП', 420 where not exists (select 1 from public.products where name='Яичный рулет с жульеном');
insert into public.products (sbis_id, name, category, price) select -84255312, 'Эклер Черника-лаванда', 'Дело в креме', 230 where not exists (select 1 from public.products where name='Эклер Черника-лаванда');
insert into public.products (sbis_id, name, category, price) select -92447728, 'Эклер Лесные ягоды', 'Дело в креме', 230 where not exists (select 1 from public.products where name='Эклер Лесные ягоды');
insert into public.products (sbis_id, name, category, price) select -118044301, 'Эклер Вишня-кола', 'Дело в креме', 230 where not exists (select 1 from public.products where name='Эклер Вишня-кола');
insert into public.products (sbis_id, name, category, price) select -137264817, 'Эклер Смородина', 'Дело в креме', 230 where not exists (select 1 from public.products where name='Эклер Смородина');
insert into public.products (sbis_id, name, category, price) select -171664693, 'Эклер фисташка', 'Дело в креме', 230 where not exists (select 1 from public.products where name='Эклер фисташка');
insert into public.products (sbis_id, name, category, price) select -119987019, 'Эклер Манго-зеленый чай', 'Дело в креме', 230 where not exists (select 1 from public.products where name='Эклер Манго-зеленый чай');
insert into public.products (sbis_id, name, category, price) select -44496849, 'Эклер с жимолостью', 'Дело в креме', 230 where not exists (select 1 from public.products where name='Эклер с жимолостью');
insert into public.products (sbis_id, name, category, price) select -137400808, 'Наполеон ДвК', 'Дело в креме', 250 where not exists (select 1 from public.products where name='Наполеон ДвК');
insert into public.products (sbis_id, name, category, price) select -190187965, 'Павлова', 'Дело в креме', 370 where not exists (select 1 from public.products where name='Павлова');
insert into public.products (sbis_id, name, category, price) select -147396342, 'Картошка в шоколаде', 'Дело в креме', 270 where not exists (select 1 from public.products where name='Картошка в шоколаде');
insert into public.products (sbis_id, name, category, price) select -178245137, 'Набор корпусных конфет', 'Дело в креме', 2100 where not exists (select 1 from public.products where name='Набор корпусных конфет');
insert into public.products (sbis_id, name, category, price) select -257461678, 'Корпусное малина', 'Дело в креме', 450 where not exists (select 1 from public.products where name='Корпусное малина');
insert into public.products (sbis_id, name, category, price) select -107078815, 'Корпусное кофе', 'Дело в креме', 450 where not exists (select 1 from public.products where name='Корпусное кофе');
insert into public.products (sbis_id, name, category, price) select -89305963, 'Корпусное манго', 'Дело в креме', 450 where not exists (select 1 from public.products where name='Корпусное манго');
insert into public.products (sbis_id, name, category, price) select -80178132, 'Корпусное лимон', 'Дело в креме', 450 where not exists (select 1 from public.products where name='Корпусное лимон');
insert into public.products (sbis_id, name, category, price) select -101369033, 'Корпусное ежевика', 'Дело в креме', 450 where not exists (select 1 from public.products where name='Корпусное ежевика');
insert into public.products (sbis_id, name, category, price) select -57475976, 'Корпусное кокос', 'Дело в креме', 490 where not exists (select 1 from public.products where name='Корпусное кокос');
insert into public.products (sbis_id, name, category, price) select -214957724, 'Корпус фисташка', 'Дело в креме', 450 where not exists (select 1 from public.products where name='Корпус фисташка');
insert into public.products (sbis_id, name, category, price) select -232400393, 'Корпусное банан', 'Дело в креме', 250 where not exists (select 1 from public.products where name='Корпусное банан');
insert into public.products (sbis_id, name, category, price) select -72236052, 'Трайфл двк', 'Дело в креме', 930 where not exists (select 1 from public.products where name='Трайфл двк');
insert into public.products (sbis_id, name, category, price) select -17901565, 'Ваза керамическая  в форме рыбы 31 см', 'Товары', 7500 where not exists (select 1 from public.products where name='Ваза керамическая  в форме рыбы 31 см');
insert into public.products (sbis_id, name, category, price) select -3800410, 'Сумочка из бусин', 'Товары', 1490 where not exists (select 1 from public.products where name='Сумочка из бусин');
insert into public.products (sbis_id, name, category, price) select -145009884, 'Сумка держатель короткая ручка', 'Товары', 1290 where not exists (select 1 from public.products where name='Сумка держатель короткая ручка');

-- ---- 1. Цены из прайса (нулевые и пустые пропускаем) ----
update public.products set price=250 where name='Аффогато' and price<>250;
update public.products set price=180 where name='Кофе Американо' and price<>180;
update public.products set price=280 where name='Кофе Капучино большой' and price<>280;
update public.products set price=210 where name='Кофе Капучино маленький' and price<>210;
update public.products set price=280 where name='Кофе Латте большой' and price<>280;
update public.products set price=210 where name='Кофе Латте маленький' and price<>210;
update public.products set price=240 where name='Кофе Флэт' and price<>240;
update public.products set price=150 where name='Кофе Эспрессо' and price<>150;
update public.products set price=350 where name='Раф классика' and price<>350;
update public.products set price=300 where name='Френч пресс' and price<>300;
update public.products set price=350 where name='Френч пресс декаф' and price<>350;
update public.products set price=280 where name='Айс Латте' and price<>280;
update public.products set price=310 where name='Гранатовый кофе' and price<>310;
update public.products set price=370 where name='Латте «кокос арахис»' and price<>370;
update public.products set price=390 where name='Латте «миндаль»' and price<>390;
update public.products set price=520 where name='Раф «кедровый»' and price<>520;
update public.products set price=390 where name='Шмель/Бамбл' and price<>390;
update public.products set price=260 where name='Эспрессо-тоник' and price<>260;
update public.products set price=250 where name='Юдзу американо' and price<>250;
update public.products set price=370 where name='Раф тыква карамель' and price<>370;
update public.products set price=250 where name='Американо с облепиховой пеной' and price<>250;
update public.products set price=250 where name='Американо с вишневой пеной' and price<>250;
update public.products set price=250 where name='Американо с малиновой пеной' and price<>250;
update public.products set price=350 where name='Черри Латте' and price<>350;
update public.products set price=340 where name='Банановый какао' and price<>340;
update public.products set price=340 where name='Земляничный убе' and price<>340;
update public.products set price=310 where name='Лимонад Дюшес' and price<>310;
update public.products set price=260 where name='Лимонад Земляничный' and price<>260;
update public.products set price=310 where name='Лимонад Розовый лимон' and price<>310;
update public.products set price=260 where name='Лимонад Юдзу' and price<>260;
update public.products set price=340 where name='Матча Жасмин' and price<>340;
update public.products set price=290 where name='Пинк дринк' and price<>290;
update public.products set price=340 where name='Пинк дринк Матча' and price<>340;
update public.products set price=360 where name='Протеиновый смузи' and price<>360;
update public.products set price=315 where name='Фреш апельсин' and price<>315;
update public.products set price=320 where name='Фреш яблочный' and price<>320;
update public.products set price=380 where name='Апероль' and price<>380;
update public.products set price=310 where name='Москито' and price<>310;
update public.products set price=360 where name='Облепиховый ромарио' and price<>360;
update public.products set price=250 where name='Какао 300 мл' and price<>250;
update public.products set price=320 where name='Какао "Горячая" вишня' and price<>320;
update public.products set price=350 where name='Какао Шмель' and price<>350;
update public.products set price=250 where name='Матча Blue Sbleskom' and price<>250;
update public.products set price=340 where name='Матча Blue Sbleskom 350 мл' and price<>340;
update public.products set price=250 where name='Матча латте' and price<>250;
update public.products set price=340 where name='Матча латте 350мл' and price<>340;
update public.products set price=450 where name='Матча Мятный пломбир' and price<>450;
update public.products set price=260 where name='Матча-тоник' and price<>260;
update public.products set price=450 where name='Матча Фисташковый пломбир' and price<>450;
update public.products set price=450 where name='Убе Ежевичный пломбир' and price<>450;
update public.products set price=250 where name='Убе Латте' and price<>250;
update public.products set price=340 where name='Убе Латте 350 мл' and price<>340;
update public.products set price=390 where name='Фисташковая Матча Латте 300 мл' and price<>390;
update public.products set price=340 where name='Ходжича латте 400 мл' and price<>340;
update public.products set price=250 where name='Ходжича латте 250 мл' and price<>250;
update public.products set price=320 where name='Какао грог' and price<>320;
update public.products set price=220 where name='Чай гречишный 500 мл' and price<>220;
update public.products set price=220 where name='Чай зеленый 500мл' and price<>220;
update public.products set price=320 where name='Чай Малина-мята 500 мл' and price<>320;
update public.products set price=320 where name='Чай Малина-Розмарин 500 мл' and price<>320;
update public.products set price=320 where name='Чай Облепиха-имбирь 500 мл' and price<>320;
update public.products set price=280 where name='Чай Ройбош Шишка-Гранат 500мл' and price<>280;
update public.products set price=220 where name='Чай ромашковый' and price<>220;
update public.products set price=220 where name='Чай черный 500мл' and price<>220;
update public.products set price=280 where name='Чай розовый жасмин' and price<>280;
update public.products set price=390 where name='Ежевичный чай' and price<>390;
update public.products set price=360 where name='Апельсиновый пунш 300мл' and price<>360;
update public.products set price=290 where name='Глинтвейн грейпфрут' and price<>290;
update public.products set price=240 where name='Имбирный Юдзу 300 мл' and price<>240;
update public.products set price=280 where name='Сибирский чай с корицей 300мл' and price<>280;
update public.products set price=210 where name='Шиповник с апельсином 300 мл' and price<>210;
update public.products set price=320 where name='Малиновый пунш' and price<>320;
update public.products set price=290 where name='Шиповник ягодный' and price<>290;
update public.products set price=420 where name='Бамбл Грейпфрут-Малина от Ульяны' and price<>420;
update public.products set price=320 where name='Лимонад Расцветай!' and price<>320;
update public.products set price=280 where name='Чай витамин от Управляющей' and price<>280;
update public.products set price=350 where name='Эспрессо-тоник на игристом' and price<>350;
update public.products set price=350 where name='Эспрессо-тоник Пало санто Валентины' and price<>350;
update public.products set price=470 where name='Боул с курицей' and price<>470;
update public.products set price=590 where name='Боул с форелью' and price<>590;
update public.products set price=430 where name='Греческий' and price<>430;
update public.products set price=200 where name='Овсяная с конфитюром апельсин-ваниль' and price<>200;
update public.products set price=200 where name='Рисовая с апельсиновым конфитюром' and price<>200;
update public.products set price=200 where name='Рисовая с шоколадом и вишней' and price<>200;
update public.products set price=200 where name='Рисовая с шоколадом и орехом' and price<>200;
update public.products set price=390 where name='Роти с ветчиной и сыром' and price<>390;
update public.products set price=430 where name='Роти с курицей и песто' and price<>430;
update public.products set price=410 where name='Цезарь с курицей' and price<>410;
update public.products set price=500 where name='Цезарь с лососем' and price<>500;
update public.products set price=450 where name='+икра лососевая 25 гр' and price<>450;
update public.products set price=70 where name='+ конфитюр 40 гр' and price<>70;
update public.products set price=50 where name='+масло 20 гр' and price<>50;
update public.products set price=45 where name='+ сыр 20 гр' and price<>45;
update public.products set price=30 where name='+ хлеб 1 кус' and price<>30;
update public.products set price=50 where name='+яйцо 1шт.' and price<>50;
update public.products set price=990 where name='Бутерброд с икрой' and price<>990;
update public.products set price=310 where name='Гранола с кедровым орехом' and price<>310;
update public.products set price=320 where name='Завтрак с яйцами' and price<>320;
update public.products set price=120 where name='Булочка сахарная,70 гр' and price<>120;
update public.products set price=150 where name='Ириска Зерно' and price<>150;
update public.products set price=190 where name='Конфета Кедровый грильяж' and price<>190;
update public.products set price=150 where name='Конфета Метелица/Маска' and price<>150;
update public.products set price=120 where name='Печенье Блонди' and price<>120;
update public.products set price=120 where name='Печенье Брауни' and price<>120;
update public.products set price=100 where name='Печенье овсяное Зерно' and price<>100;
update public.products set price=310 where name='Пирог сытный' and price<>310;
update public.products set price=300 where name='Пирожное Сникерс' and price<>300;
update public.products set price=350 where name='Круассан с ветчиной и сыром' and price<>350;
update public.products set price=490 where name='Круассан с лососем' and price<>490;
update public.products set price=250 where name='Макаронс в ассорт.' and price<>250;
update public.products set price=290 where name='Мусс Васюганские болота' and price<>290;
update public.products set price=300 where name='Птичье молоко' and price<>300;
update public.products set price=350 where name='Сэндвич с курицей' and price<>350;
update public.products set price=490 where name='Сэндвич с рваным брискетом (говядина)' and price<>490;
update public.products set price=230 where name='Эклеры в ассортименте' and price<>230;
update public.products set price=105 where name='Зефир ПП' and price<>105;
update public.products set price=320 where name='Аффогато с фисташкой' and price<>320;
update public.products set price=300 where name='Мороженое Гранат-орех' and price<>300;
update public.products set price=300 where name='Мороженое лайм-миндаль' and price<>300;
update public.products set price=310 where name='Мороженое малина-фисташка' and price<>310;
update public.products set price=450 where name='Десерт Манго-кокос' and price<>450;
update public.products set price=290 where name='Кекс банановый vegan' and price<>290;
update public.products set price=400 where name='Медовик низкокалорийный' and price<>400;
update public.products set price=420 where name='Сэндвич с курицей МСП' and price<>420;
update public.products set price=550 where name='Сэндвич с форелью МСП' and price<>550;
update public.products set price=150 where name='Трюфель vegan' and price<>150;
update public.products set price=150 where name='Фундучное печенье' and price<>150;
update public.products set price=150 where name='Шоколадное печенье' and price<>150;
update public.products set price=350 where name='Сырники мсп' and price<>350;
update public.products set price=550 where name='Боул с креветкой мсп' and price<>550;
update public.products set price=450 where name='Боул с курицей мсп' and price<>450;
update public.products set price=420 where name='Яичный рулет с жульеном' and price<>420;
update public.products set price=110 where name='Мадлен' and price<>110;
update public.products set price=180 where name='Мадлен в шоколаде' and price<>180;
update public.products set price=250 where name='Шу лимонный курд' and price<>250;
update public.products set price=160 where name='Шу сливочный' and price<>160;
update public.products set price=210 where name='Шу Соленая карамель' and price<>210;
update public.products set price=230 where name='Эклер Черника-лаванда' and price<>230;
update public.products set price=230 where name='Эклер Лесные ягоды' and price<>230;
update public.products set price=230 where name='Эклер Вишня-кола' and price<>230;
update public.products set price=230 where name='Эклер Смородина' and price<>230;
update public.products set price=230 where name='Эклер фисташка' and price<>230;
update public.products set price=230 where name='Эклер Манго-зеленый чай' and price<>230;
update public.products set price=230 where name='Эклер с жимолостью' and price<>230;
update public.products set price=250 where name='Наполеон ДвК' and price<>250;
update public.products set price=370 where name='Павлова' and price<>370;
update public.products set price=270 where name='Картошка в шоколаде' and price<>270;
update public.products set price=2100 where name='Набор корпусных конфет' and price<>2100;
update public.products set price=450 where name='Корпусное малина' and price<>450;
update public.products set price=450 where name='Корпусное кофе' and price<>450;
update public.products set price=450 where name='Корпусное манго' and price<>450;
update public.products set price=450 where name='Корпусное лимон' and price<>450;
update public.products set price=450 where name='Корпусное ежевика' and price<>450;
update public.products set price=490 where name='Корпусное кокос' and price<>490;
update public.products set price=450 where name='Корпус фисташка' and price<>450;
update public.products set price=250 where name='Корпусное банан' and price<>250;
update public.products set price=930 where name='Трайфл двк' and price<>930;
update public.products set price=50 where name='Имбирный фреш 15 мл' and price<>50;
update public.products set price=50 where name='-какао порошок EXTRA BRUTE 5 гр' and price<>50;
update public.products set price=30 where name='Кардамон/Можжевельник 2 гр' and price<>30;
update public.products set price=45 where name='Мед 20гр' and price<>45;
update public.products set price=50 where name='Молоко 100мл.' and price<>50;
update public.products set price=25 where name='Молоко 50 мл' and price<>25;
update public.products set price=60 where name='-молоко альтер. 100 мл' and price<>60;
update public.products set price=100 where name='Мороженое 50гр' and price<>100;
update public.products set price=50 where name='Паста арахисовая 20гр.' and price<>50;
update public.products set price=30 where name='Сироп 10 мл' and price<>30;
update public.products set price=50 where name='Сливки 50мл.' and price<>50;
update public.products set price=30 where name='Содовая 100 мл' and price<>30;
update public.products set price=120 where name='Урбеч кедровый 20гр.' and price<>120;
update public.products set price=100 where name='Урбеч миндальный 20гр.' and price<>100;
update public.products set price=100 where name='Чай 6 гр' and price<>100;
update public.products set price=5100 where name='Ваза «Береза» M (размер 22,5 см)' and price<>5100;
update public.products set price=3300 where name='Ваза «Береза» S ( размер 12,5 см)' and price<>3300;
update public.products set price=5900 where name='Ваза «Береза» XL (размер 25,5 см)' and price<>5900;
update public.products set price=480 where name='Город не бесит Не открытки 1 шт набор' and price<>480;
update public.products set price=170 where name='Лимонад Малина-базилик 0.33л' and price<>170;
update public.products set price=990 where name='Свеча "Сибирская береза"' and price<>990;
update public.products set price=7500 where name='Ваза керамическая  в форме рыбы 31 см' and price<>7500;
update public.products set price=1490 where name='Сумочка из бусин' and price<>1490;
update public.products set price=1290 where name='Сумка держатель короткая ручка' and price<>1290;

-- ---- 2. Разметка (только там, где menu_category ещё пусто) ----
update public.products set menu_category='Напитки', menu_subcategory='Кофе' where name='Аффогато' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Кофе' where name='Кофе Американо' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Кофе' where name='Кофе Эспрессо' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Латте «миндаль»' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Раф «кедровый»' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Раф тыква карамель' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Американо с облепиховой пеной' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Американо с вишневой пеной' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Американо с малиновой пеной' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Черри Латте' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Эспрессо-тоник на игристом' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Авторский кофе' where name='Эспрессо-тоник Пало санто Валентины' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Эспрессо-тоник' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Лимонад Земляничный' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Лимонад Розовый лимон' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Лимонад Юдзу' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Лимонад Расцветай!' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Лимонад Малина-базилик 0.33л' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Пинк дринк' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Пинк дринк Матча' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Протеиновый смузи' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Фреш апельсин' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Апероль' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Москито' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Холодные напитки' where name='Облепиховый ромарио' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Матча латте' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Матча латте 350мл' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Матча Мятный пломбир' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Матча Фисташковый пломбир' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Убе Ежевичный пломбир' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Земляничный убе' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Матча Жасмин' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Ходжича латте 400 мл' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Матча и убе' where name='Ходжича латте 250 мл' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Какао и альтернативы' where name='Какао 300 мл' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Какао и альтернативы' where name='Какао Шмель' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Какао и альтернативы' where name='Какао грог' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Чай зеленый 500мл' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Чай Малина-мята 500 мл' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Чай Ройбош Шишка-Гранат 500мл' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Чай розовый жасмин' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Ежевичный чай' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Апельсиновый пунш 300мл' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Малиновый пунш' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Шиповник ягодный' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Чай и травяные' where name='Чай витамин от Управляющей' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Завтраки' where name='Овсяная с конфитюром апельсин-ваниль' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Завтраки' where name='Рисовая с апельсиновым конфитюром' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Завтраки' where name='Рисовая с шоколадом и вишней' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Завтраки' where name='Рисовая с шоколадом и орехом' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Завтраки' where name='Сырники мсп' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Супы и сытное' where name='Боул с курицей' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Супы и сытное' where name='Боул с форелью' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Супы и сытное' where name='Боул с креветкой мсп' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Супы и сытное' where name='Боул с курицей мсп' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Супы и сытное' where name='Греческий' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Супы и сытное' where name='Цезарь с курицей' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Супы и сытное' where name='Цезарь с лососем' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Супы и сытное' where name='Яичный рулет с жульеном' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Сэндвичи и круассаны' where name='Роти с ветчиной и сыром' and menu_category is null;
update public.products set menu_category='Еда', menu_subcategory='Сэндвичи и круассаны' where name='Роти с курицей и песто' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Эклер Черника-лаванда' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Эклер Лесные ягоды' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Эклер Вишня-кола' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Эклер Смородина' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Эклер фисташка' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Эклер Манго-зеленый чай' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Эклер с жимолостью' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Наполеон ДвК' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Павлова' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Картошка в шоколаде' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Трайфл двк' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Аффогато с фисташкой' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Мороженое Гранат-орех' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Мороженое лайм-миндаль' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Пирожные и порционные' where name='Мороженое малина-фисташка' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Набор корпусных конфет' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Корпусное малина' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Корпусное кофе' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Корпусное манго' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Корпусное лимон' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Корпусное ежевика' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Корпусное кокос' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Корпус фисташка' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Корпусное банан' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Конфеты и сладости' where name='Зефир ПП' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Печенье и брауни' where name='Фундучное печенье' and menu_category is null;
update public.products set menu_category='Десерты', menu_subcategory='Печенье и брауни' where name='Шоколадное печенье' and menu_category is null;
update public.products set menu_category='Магазин', menu_subcategory='Декор и подарки' where name='Ваза керамическая  в форме рыбы 31 см' and menu_category is null;
update public.products set menu_category='Магазин', menu_subcategory='Декор и подарки' where name='Сумочка из бусин' and menu_category is null;
update public.products set menu_category='Магазин', menu_subcategory='Декор и подарки' where name='Сумка держатель короткая ручка' and menu_category is null;

-- двойники размеров: общий display_name, чтобы приложение склеило их в одну карточку
update public.products set menu_category='Напитки', menu_subcategory='Кофе', display_name='Капучино' where name='Кофе Капучино большой' and menu_category is null;
update public.products set menu_category='Напитки', menu_subcategory='Кофе', display_name='Латте' where name='Кофе Латте маленький' and menu_category is null;

-- ---- 3. Добавки ----
update public.products set is_modifier=true where name ~ '^[+-]';

-- ---- 4. Видимость: показываем только размеченное и не добавки (раздел «Магазин» скрыт) ----
update public.products set is_visible = (menu_category is not null and menu_category <> 'Магазин' and not is_modifier);

-- ---- 5. Позиции, которых нет в новом меню: скрыть (не удаляем — можно вернуть) ----
update public.products set is_visible=false where name in (
  'Зернобон с творогом и клюквой',
  'Картошка праздничная',
  'Кедровый латте с клубникой',
  'Конфета Для любимых',
  'Конфета Дубайский шоколад',
  'Латте фисташка-карамель с цедрой',
  'Матча латте протеин',
  'Печенье маленькое',
  'Пирожное Чизкейк манго-маракуйя',
  'Плетенка с яблоком',
  'Протеиновый батончик',
  'Тарт ягодный',
  'Тирамису',
  'Тыквенный суп',
  'Флэт на цикории',
  'Холодный Американо',
  'Чай Мандарин-Розмарин 500 мл',
  'Чечевичный суп',
  'Шот Витамин'
);

commit;
