# SQL, применённый к рабочей базе вручную (не миграции)

Эти файлы НЕ лежат в `supabase/migrations/` и не должны запускаться через `supabase db push` / `db reset`:
изменения уже внесены в рабочую базу `vxefueynagwuavlyeiqc` через SQL Editor 18.10.2026.
Хранятся как история и чтобы воспроизвести состояние при переезде на новую базу.

| Файл | Что делает |
|---|---|
| `products-menu-taxonomy.sql` | разметка `menu_category` / `menu_subcategory` (на неё ссылается `lib/catalogService.js`) |
| `menu-taxonomy-2026-10.sql` | меню «осень-зима 2026»: +77 позиций с временным отрицательным `sbis_id`, цены, разметка, скрыто 19 позиций вне меню; идемпотентен |
| `product-photos-storage.sql` | публичный bucket `product-photos` (2 МБ, WebP/PNG/JPEG, запись только service-ключом) |
| `products-backup-2026-10-18.json` | копия изменяемых полей `products` до применения |

Порядок при новой базе: миграции -> `products-menu-taxonomy.sql` -> `menu-taxonomy-2026-10.sql` -> `product-photos-storage.sql`.
Если `sync-sbis-catalog` позже привезёт те же товары с настоящим `sbis_id`, дубли по названию надо убрать.
Скрипты загрузки фото (`prepare/publish/replace/center-product-photos.py`) лежат локально в `scripts/` (в git не входят).
