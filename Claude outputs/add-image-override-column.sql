-- add-image-override-column.sql
-- Добавляет в products возможность вручную подставить фото товару, не
-- дожидаясь, пока оно появится в самом СБИС (сейчас реальные фото есть
-- всего у 13 из 151 позиции). Синхронизация из СБИС эту колонку никогда
-- не трогает — заполняете только вы, вручную, в Table Editor.
--
-- Как применить: Supabase Dashboard -> SQL Editor -> вставить целиком -> Run.
-- Безопасно запускать повторно (if not exists).

alter table public.products
  add column if not exists image_override_url text;

comment on column public.products.image_override_url is
  'Ручная ссылка на фото товара (например, из Supabase Storage или любого CDN). Если задана — приложение показывает её вместо фото из СБИС. Синхронизация эту колонку не трогает.';
