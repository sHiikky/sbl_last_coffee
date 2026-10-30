-- Хранилище фото позиций (Supabase Storage). Выполнить ОДИН раз в SQL Editor проекта.
-- Публичный bucket: фото видны по прямой ссылке, поэтому их можно вставлять в
-- products.image_override_url (см. add-image-override-column.sql). Загружать файлы
-- может только владелец проекта (через дашборд или scripts/replace-product-photo.py
-- с service-ключом); анонимным пользователям доступно только чтение.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Проверка: должна вернуться одна строка с public = true
select id, public, file_size_limit from storage.buckets where id = 'product-photos';
