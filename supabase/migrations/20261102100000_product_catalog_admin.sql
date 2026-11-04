-- Product editor. Apply separately in the coffee project, after pickup checkout.
BEGIN;

ALTER TABLE public.products ALTER COLUMN sbis_id DROP NOT NULL;
ALTER TABLE public.products
 ADD COLUMN app_content jsonb CHECK(app_content IS NULL OR jsonb_typeof(app_content)='object'),
 ADD COLUMN manual_price numeric(10,2) CHECK(manual_price IS NULL OR manual_price BETWEEN 0 AND 99999999.99),
 ADD COLUMN allowed_modifier_ids uuid[],
 ADD COLUMN catalog_version integer NOT NULL DEFAULT 1 CHECK(catalog_version>0);
COMMENT ON COLUMN public.products.sbis_id IS 'NULL = manual app SKU, never matched by SBIS sync. Existing SBIS IDs are preserved.';
COMMENT ON COLUMN public.products.app_content IS 'Curated app name, description, ingredients, allergens, size and nutrition; SBIS sync never writes this column.';
COMMENT ON COLUMN public.products.allowed_modifier_ids IS 'NULL preserves legacy unrestricted additions; empty array permits none; otherwise exact allowed modifier UUIDs.';
COMMENT ON COLUMN public.products.manual_price IS 'When set, authoritative products.price is pinned to this value even during SBIS sync. NULL restores SBIS price ownership.';

CREATE TABLE public.product_catalog_edits (
 product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
 expected_version integer NOT NULL,
 saved_version integer NOT NULL,
 payload jsonb NOT NULL
);
ALTER TABLE public.product_catalog_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_catalog_edits FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.product_catalog_edits TO service_role;

CREATE FUNCTION public.catalog_product_before_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.manual_price IS NOT NULL THEN NEW.price:=NEW.manual_price; END IF;
 IF TG_OP='UPDATE' THEN NEW.catalog_version:=OLD.catalog_version+1; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.catalog_product_before_write() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER products_catalog_before_write BEFORE INSERT OR UPDATE ON public.products
 FOR EACH ROW EXECUTE FUNCTION public.catalog_product_before_write();

CREATE FUNCTION public.catalog_order_item_additions_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE allowed uuid[];
BEGIN
 SELECT allowed_modifier_ids INTO allowed FROM public.products WHERE id=NEW.product_id;
 IF allowed IS NOT NULL AND EXISTS(
  SELECT 1 FROM jsonb_array_elements(NEW.modifiers) m
  WHERE NOT ((m->>'product_id')::uuid=ANY(allowed))
 ) THEN RAISE EXCEPTION 'MODIFIER_NOT_ALLOWED: review product additions' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.catalog_order_item_additions_guard() FROM PUBLIC,anon,authenticated,service_role;
-- Historical order snapshots are never rewritten when a product is edited.
CREATE TRIGGER order_items_catalog_additions BEFORE INSERT ON public.order_items
 FOR EACH ROW EXECUTE FUNCTION public.catalog_order_item_additions_guard();

CREATE FUNCTION public.staff_list_catalog_products() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()) THEN
  RAISE EXCEPTION 'STAFF_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(
  (to_jsonb(p)-'raw_payload') || jsonb_build_object('sbis_price',
    CASE WHEN jsonb_typeof(p.raw_payload->'cost')='number' THEN p.raw_payload->'cost' ELSE NULL END)
  ORDER BY p.is_modifier,p.menu_category,p.sort_order,p.name,p.id) FROM public.products p),'[]'::jsonb));
END $$;

CREATE FUNCTION public.staff_save_catalog_product(p_id uuid,p_expected_version integer,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 old public.products%ROWTYPE; saved public.products%ROWTYPE; previous public.product_catalog_edits%ROWTYPE;
 exists_before boolean; key text; value text; cleaned jsonb:='{}'; nutrition jsonb:='{}';
 amount numeric; price_value numeric; manual_value numeric; ids uuid[]; modifier_id uuid;
 visible boolean; modifier boolean; mode text; photo text; title text; category_value text; size_value text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()) THEN
  RAISE EXCEPTION 'STAFF_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_payload IS NULL
 OR jsonb_typeof(p_payload)<>'object' OR pg_column_size(p_payload)>32768 THEN
  RAISE EXCEPTION 'INVALID_CATALOG_PRODUCT' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k<>ALL(ARRAY[
  'name','description','ingredients','allergens','size_label','nutrition','nutrition_basis','menu_category','menu_subcategory',
  'image_url','price','price_mode','badge','sort_order','is_visible','is_available','is_quick_pick','is_modifier','allowed_modifier_ids'])) THEN
  RAISE EXCEPTION 'INVALID_CATALOG_FIELDS' USING ERRCODE='22023'; END IF;
 FOREACH key IN ARRAY ARRAY['name','description','ingredients','allergens','size_label','menu_category','menu_subcategory','badge'] LOOP
  IF p_payload ? key AND jsonb_typeof(p_payload->key) NOT IN ('string','null') THEN
   RAISE EXCEPTION 'INVALID_CATALOG_TEXT' USING ERRCODE='22023'; END IF;
  value:=btrim(coalesce(p_payload->>key,''));
  IF length(value)>(CASE WHEN key IN ('description','ingredients') THEN 3000 WHEN key='allergens' THEN 500
   WHEN key='name' THEN 120 WHEN key='size_label' THEN 40 WHEN key='badge' THEN 32 ELSE 80 END)
  OR value ~ E'[\x01-\x08\x0B-\x1F\x7F]' OR value ~ U&'[\0080-\009F]' THEN
   RAISE EXCEPTION 'INVALID_CATALOG_TEXT' USING ERRCODE='22023'; END IF;
  cleaned:=cleaned||jsonb_build_object(key,value);
 END LOOP;
 IF p_payload->'description'='null'::jsonb THEN cleaned:=cleaned||jsonb_build_object('description',NULL); END IF;
 title:=cleaned->>'name'; category_value:=cleaned->>'menu_category'; size_value:=cleaned->>'size_label';
 IF title='' OR category_value='' THEN RAISE EXCEPTION 'CATALOG_NAME_CATEGORY_REQUIRED' USING ERRCODE='22023'; END IF;
 FOREACH key IN ARRAY ARRAY['is_visible','is_available','is_quick_pick','is_modifier'] LOOP
  IF jsonb_typeof(p_payload->key) IS DISTINCT FROM 'boolean' THEN
   RAISE EXCEPTION 'INVALID_CATALOG_BOOLEAN' USING ERRCODE='22023'; END IF;
 END LOOP;
 modifier:=(p_payload->>'is_modifier')::boolean; visible:=(p_payload->>'is_visible')::boolean AND NOT modifier;
 mode:=p_payload->>'price_mode';
 IF mode IS NULL OR mode NOT IN ('manual','sbis') OR jsonb_typeof(p_payload->'price') IS DISTINCT FROM 'number' THEN
  RAISE EXCEPTION 'INVALID_CATALOG_PRICE' USING ERRCODE='22023'; END IF;
 price_value:=(p_payload->>'price')::numeric;
 IF price_value<0 OR price_value>99999999.99 OR price_value<>round(price_value,2) THEN
  RAISE EXCEPTION 'INVALID_CATALOG_PRICE' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_payload->'sort_order') IS DISTINCT FROM 'number'
 OR (p_payload->>'sort_order')::numeric NOT BETWEEN 0 AND 1000000
 OR (p_payload->>'sort_order')::numeric<>trunc((p_payload->>'sort_order')::numeric) THEN
  RAISE EXCEPTION 'INVALID_CATALOG_SORT' USING ERRCODE='22023'; END IF;
 photo:=nullif(btrim(p_payload->>'image_url'),'');
 IF photo IS NOT NULL AND (length(photo)>2048 OR photo !~ '^https://[^[:space:]<>"@]+$'
 OR photo ~* '^https://api\.sbis\.ru/img([/?]|$)') THEN
  RAISE EXCEPTION 'INVALID_CATALOG_PHOTO' USING ERRCODE='22023'; END IF;
 IF visible AND photo IS NULL THEN RAISE EXCEPTION 'CATALOG_PHOTO_REQUIRED' USING ERRCODE='22023'; END IF;
 IF p_payload->>'nutrition_basis' IS NULL OR p_payload->>'nutrition_basis' NOT IN ('portion','100g','100ml','unknown')
 OR jsonb_typeof(p_payload->'nutrition') NOT IN ('object','null') OR NOT p_payload ? 'nutrition' THEN
  RAISE EXCEPTION 'INVALID_CATALOG_NUTRITION' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(coalesce(nullif(p_payload->'nutrition','null'::jsonb),'{}')) k WHERE k<>ALL(ARRAY['calories','protein','fat','carbs'])) THEN
  RAISE EXCEPTION 'INVALID_CATALOG_NUTRITION' USING ERRCODE='22023'; END IF;
 FOREACH key IN ARRAY ARRAY['calories','protein','fat','carbs'] LOOP
  IF p_payload->'nutrition'->key IS NULL OR p_payload->'nutrition'->key='null'::jsonb THEN CONTINUE; END IF;
  IF jsonb_typeof(p_payload->'nutrition'->key)<>'number' THEN RAISE EXCEPTION 'INVALID_CATALOG_NUTRITION' USING ERRCODE='22023'; END IF;
  amount:=(p_payload->'nutrition'->>key)::numeric;
  IF amount<0 OR amount>100000 OR amount<>round(amount,2) THEN RAISE EXCEPTION 'INVALID_CATALOG_NUTRITION' USING ERRCODE='22023'; END IF;
  nutrition:=nutrition||jsonb_build_object(key,amount);
 END LOOP;
 IF p_payload->'nutrition'='null'::jsonb THEN nutrition:=NULL; END IF;
 IF NOT p_payload ? 'allowed_modifier_ids' OR jsonb_typeof(p_payload->'allowed_modifier_ids') NOT IN ('array','null') THEN
  RAISE EXCEPTION 'INVALID_CATALOG_MODIFIERS' USING ERRCODE='22023'; END IF;
 IF p_payload->'allowed_modifier_ids'<>'null'::jsonb THEN
  IF jsonb_array_length(p_payload->'allowed_modifier_ids')>200 THEN RAISE EXCEPTION 'INVALID_CATALOG_MODIFIERS' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(DISTINCT v::uuid ORDER BY v::uuid),'{}'::uuid[]) INTO ids
   FROM jsonb_array_elements_text(p_payload->'allowed_modifier_ids') v;
  IF array_position(ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'INVALID_CATALOG_MODIFIERS' USING ERRCODE='22023'; END IF;
 END IF;
 IF modifier THEN ids:='{}'; END IF;
 cleaned:=cleaned||jsonb_build_object('nutrition',nutrition,'nutrition_basis',p_payload->>'nutrition_basis');
 -- Serialize retries of a new client-generated UUID, then lock the actual product.
 PERFORM pg_advisory_xact_lock(hashtextextended('catalog:'||p_id::text,0));
 SELECT * INTO old FROM public.products WHERE id=p_id FOR UPDATE;
 exists_before:=FOUND;
 SELECT * INTO previous FROM public.product_catalog_edits WHERE product_id=p_id;
 IF exists_before AND previous.expected_version=p_expected_version AND previous.saved_version=old.catalog_version
 AND previous.payload=p_payload THEN RETURN to_jsonb(old)-'raw_payload'; END IF;
 IF (exists_before AND old.catalog_version<>p_expected_version) OR (NOT exists_before AND p_expected_version<>0) THEN
  RAISE EXCEPTION 'CATALOG_CONFLICT' USING ERRCODE='40001'; END IF;
 IF exists_before AND old.is_modifier<>modifier THEN RAISE EXCEPTION 'CATALOG_TYPE_IMMUTABLE' USING ERRCODE='22023'; END IF;
 -- Locks follow checkout's UUID order, so an addition cannot change while being attached.
 PERFORM id FROM public.products WHERE id=ANY(ids) ORDER BY id FOR SHARE;
 IF EXISTS(SELECT 1 FROM unnest(ids) a WHERE a=p_id OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=a AND is_modifier)) THEN
  RAISE EXCEPTION 'CATALOG_MODIFIER_NOT_FOUND' USING ERRCODE='22023'; END IF;
 IF mode='manual' THEN manual_value:=price_value;
 ELSE
  IF NOT exists_before OR old.sbis_id IS NULL THEN RAISE EXCEPTION 'CATALOG_MANUAL_SKU_PRICE_REQUIRED' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(old.raw_payload->'cost')='number' THEN price_value:=(old.raw_payload->>'cost')::numeric;
  ELSIF old.manual_price IS NOT NULL THEN RAISE EXCEPTION 'CATALOG_SBIS_PRICE_UNKNOWN' USING ERRCODE='22023';
  ELSE price_value:=old.price; END IF;
  IF price_value<0 OR price_value>99999999.99 OR price_value<>round(price_value,2) THEN RAISE EXCEPTION 'INVALID_CATALOG_PRICE' USING ERRCODE='22023'; END IF;
 END IF;
 IF exists_before THEN
  UPDATE public.products SET app_content=cleaned,display_name=title,image_override_url=photo,
   menu_category=category_value,menu_subcategory=nullif(cleaned->>'menu_subcategory',''),
   price=price_value,manual_price=manual_value,allowed_modifier_ids=ids,is_visible=visible,
   is_available=(p_payload->>'is_available')::boolean,is_quick_pick=(p_payload->>'is_quick_pick')::boolean,
   badge=nullif(cleaned->>'badge',''),sort_order=(p_payload->>'sort_order')::int,updated_at=now()
   WHERE id=p_id RETURNING * INTO saved;
 ELSE
  INSERT INTO public.products(id,sbis_id,name,display_name,category,description,price,manual_price,
   image_override_url,menu_category,menu_subcategory,is_visible,is_available,is_quick_pick,is_modifier,
   badge,sort_order,app_content,allowed_modifier_ids)
  VALUES(p_id,NULL,title||CASE WHEN size_value<>'' THEN ' '||size_value ELSE '' END,title,category_value,
   cleaned->>'description',price_value,manual_value,photo,category_value,nullif(cleaned->>'menu_subcategory',''),visible,
   (p_payload->>'is_available')::boolean,(p_payload->>'is_quick_pick')::boolean,modifier,
   nullif(cleaned->>'badge',''),(p_payload->>'sort_order')::int,cleaned,ids) RETURNING * INTO saved;
 END IF;
 INSERT INTO public.product_catalog_edits VALUES(p_id,p_expected_version,saved.catalog_version,p_payload)
  ON CONFLICT(product_id) DO UPDATE SET expected_version=EXCLUDED.expected_version,saved_version=EXCLUDED.saved_version,payload=EXCLUDED.payload;
 RETURN to_jsonb(saved)-'raw_payload';
END $$;

REVOKE ALL ON FUNCTION public.staff_list_catalog_products(),public.staff_save_catalog_product(uuid,integer,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.staff_list_catalog_products(),public.staff_save_catalog_product(uuid,integer,jsonb)
 TO authenticated,service_role;
-- Editing products goes through validated staff RPCs; availability RPC still works.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.products FROM PUBLIC,anon,authenticated;
DO $$ DECLARE columns text; BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columns FROM pg_attribute
  WHERE attrelid='public.products'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.products FROM PUBLIC,anon,authenticated',columns,columns,columns);
END $$;
CREATE POLICY catalog_products_read_guard ON public.products AS RESTRICTIVE FOR SELECT TO PUBLIC
 USING(is_visible OR is_modifier OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()));

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('catalog-photos','catalog-photos',true,2097152,ARRAY['image/webp','image/jpeg','image/png'])
 ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='catalog-photos' AND public=true AND file_size_limit=2097152
  AND allowed_mime_types=ARRAY['image/webp','image/jpeg','image/png']) THEN
  RAISE EXCEPTION 'CATALOG_BUCKET_SETTINGS_CONFLICT: check existing catalog-photos bucket'; END IF;
END $$;
CREATE POLICY catalog_photos_staff_upload ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='catalog-photos' AND (storage.foldername(name))[1]=auth.uid()::text
 AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$'
 AND EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()));
-- Other permissive Storage policies must not open this bucket to customer writes.
CREATE POLICY catalog_photos_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
 WITH CHECK(bucket_id<>'catalog-photos' OR ((storage.foldername(name))[1]=auth.uid()::text
 AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$'
 AND EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid())));
CREATE POLICY catalog_photos_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
 USING(bucket_id<>'catalog-photos') WITH CHECK(bucket_id<>'catalog-photos');
CREATE POLICY catalog_photos_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
 USING(bucket_id<>'catalog-photos');
NOTIFY pgrst,'reload schema';
COMMIT;
