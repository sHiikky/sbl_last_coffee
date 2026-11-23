-- Staff-managed app-only promotions. Apply after pickup checkout and product catalog.
BEGIN;
CREATE TABLE public.app_promo_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z0-9_-]{2,32}$'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 discount_type text NOT NULL CHECK(discount_type IN ('percent','fixed')),
 discount_value numeric(10,2) NOT NULL CHECK(discount_value>0 AND discount_value<=99999999.99),
 min_order numeric(10,2) NOT NULL DEFAULT 0 CHECK(min_order>=0),
 max_order numeric(10,2) CHECK(max_order>=min_order),
 max_discount numeric(10,2) CHECK(max_discount>0),
 starts_at timestamptz, ends_at timestamptz,
 scope text NOT NULL DEFAULT 'all' CHECK(scope IN ('all','products','categories')),
 product_ids uuid[] NOT NULL DEFAULT '{}', categories text[] NOT NULL DEFAULT '{}',
 active boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_payload jsonb, last_expected integer,
 CHECK(discount_type<>'percent' OR discount_value<=100),
 CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at),
 CHECK(scope<>'products' OR cardinality(product_ids)>0),
 CHECK(scope<>'categories' OR cardinality(categories)>0)
);
ALTER TABLE public.app_promo_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_promo_codes FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.app_promo_codes TO service_role;
INSERT INTO public.app_promo_codes(code,name,discount_type,discount_value,active)
 VALUES('SBL10','Скидка SBL 10%','percent',10,true);

CREATE FUNCTION public.staff_list_app_promos() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()) THEN
 RAISE EXCEPTION 'STAFF_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(p)-'last_payload'-'last_expected' ORDER BY updated_at DESC,id) FROM public.app_promo_codes p),'[]');
END $$;

CREATE FUNCTION public.staff_save_app_promo(p_id uuid,p_expected_version integer,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old public.app_promo_codes; saved public.app_promo_codes; ids uuid[]; cats text[]; kind text; scope_value text;
 code_value text; value numeric; minimum numeric; maximum numeric; cap numeric; start_time timestamptz; end_time timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()) THEN
 RAISE EXCEPTION 'STAFF_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_payload IS NULL
 OR jsonb_typeof(p_payload)<>'object' OR pg_column_size(p_payload)>65536 THEN RAISE EXCEPTION 'INVALID_PROMO'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO old FROM public.app_promo_codes WHERE id=p_id FOR UPDATE;
 IF FOUND AND old.last_expected=p_expected_version AND old.last_payload=p_payload THEN
 RETURN to_jsonb(old)-'last_payload'-'last_expected'; END IF;
 IF coalesce(old.version,0)<>p_expected_version THEN RAISE EXCEPTION 'PROMO_CONFLICT: reload current version'; END IF;
 code_value:=upper(btrim(p_payload->>'code')); kind:=p_payload->>'discount_type';scope_value:=p_payload->>'scope';
 value:=(p_payload->>'discount_value')::numeric; minimum:=(p_payload->>'min_order')::numeric;
 maximum:=nullif(p_payload->>'max_order','')::numeric;cap:=nullif(p_payload->>'max_discount','')::numeric;
 start_time:=nullif(p_payload->>'starts_at','')::timestamptz;end_time:=nullif(p_payload->>'ends_at','')::timestamptz;
 IF code_value IS NULL OR code_value !~ '^[A-Z0-9_-]{2,32}$' OR length(btrim(coalesce(p_payload->>'name',''))) NOT BETWEEN 1 AND 120
 OR kind IS NULL OR kind NOT IN ('percent','fixed') OR scope_value IS NULL OR scope_value NOT IN ('all','products','categories')
 OR value IS NULL OR value::text IN ('NaN','Infinity','-Infinity') OR value<=0 OR value>99999999.99 OR value<>round(value,2)
 OR (kind='percent' AND value>100) OR minimum IS NULL OR minimum::text IN ('NaN','Infinity','-Infinity') OR minimum<0 OR minimum>99999999.99 OR minimum<>round(minimum,2)
 OR (maximum IS NOT NULL AND (maximum::text IN ('NaN','Infinity','-Infinity') OR maximum<minimum OR maximum>99999999.99 OR maximum<>round(maximum,2)))
 OR (cap IS NOT NULL AND (cap::text IN ('NaN','Infinity','-Infinity') OR cap<=0 OR cap>99999999.99 OR cap<>round(cap,2)))
 OR (start_time IS NOT NULL AND NOT isfinite(start_time)) OR (end_time IS NOT NULL AND NOT isfinite(end_time))
 OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time<=start_time)
 OR jsonb_typeof(p_payload->'active') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(p_payload->'product_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'product_ids')>500
 OR jsonb_typeof(p_payload->'categories') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'categories')>100
 THEN RAISE EXCEPTION 'INVALID_PROMO: check rules'; END IF;
 SELECT coalesce(array_agg(DISTINCT x::uuid),'{}') INTO ids FROM jsonb_array_elements_text(p_payload->'product_ids') x;
 SELECT coalesce(array_agg(DISTINCT x),'{}') INTO cats FROM jsonb_array_elements_text(p_payload->'categories') x;
 IF scope_value='products' AND (cardinality(ids)=0 OR EXISTS(SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS(SELECT 1 FROM public.products p WHERE p.id=x AND NOT p.is_modifier)))
 OR scope_value='categories' AND (cardinality(cats)=0 OR EXISTS(SELECT 1 FROM unnest(cats) x WHERE NOT EXISTS(SELECT 1 FROM public.products p WHERE p.menu_category=x AND NOT p.is_modifier)))
 THEN RAISE EXCEPTION 'INVALID_PROMO_SCOPE'; END IF;
 INSERT INTO public.app_promo_codes(id,code,name,discount_type,discount_value,min_order,max_order,max_discount,starts_at,ends_at,scope,product_ids,categories,active,version,last_payload,last_expected)
 VALUES(p_id,code_value,btrim(p_payload->>'name'),kind,value,minimum,maximum,cap,start_time,end_time,scope_value,ids,cats,(p_payload->>'active')::boolean,p_expected_version+1,p_payload,p_expected_version)
 ON CONFLICT(id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,discount_type=EXCLUDED.discount_type,discount_value=EXCLUDED.discount_value,
 min_order=EXCLUDED.min_order,max_order=EXCLUDED.max_order,max_discount=EXCLUDED.max_discount,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,
 scope=EXCLUDED.scope,product_ids=EXCLUDED.product_ids,categories=EXCLUDED.categories,active=EXCLUDED.active,version=EXCLUDED.version,
 last_payload=EXCLUDED.last_payload,last_expected=EXCLUDED.last_expected,updated_at=clock_timestamp() RETURNING * INTO saved;
 RETURN to_jsonb(saved)-'last_payload'-'last_expected';
END $$;

CREATE FUNCTION public.app_promo_discount(p_code text,p_priced jsonb,p_subtotal numeric,p_reward_key text,p_reward_discount numeric) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rule public.app_promo_codes; eligible numeric:=0; amount numeric; line jsonb; n timestamptz:=clock_timestamp();
BEGIN
 IF nullif(btrim(p_code),'') IS NULL THEN RETURN 0; END IF;
 SELECT * INTO rule FROM public.app_promo_codes WHERE code=upper(btrim(p_code)) FOR SHARE;
 IF NOT FOUND OR NOT rule.active OR (rule.starts_at IS NOT NULL AND n<rule.starts_at) OR (rule.ends_at IS NOT NULL AND n>=rule.ends_at)
 THEN RAISE EXCEPTION 'PROMO_INVALID: inactive or expired code' USING ERRCODE='22023'; END IF;
 IF p_subtotal<rule.min_order OR (rule.max_order IS NOT NULL AND p_subtotal>rule.max_order) THEN
 RAISE EXCEPTION 'PROMO_NOT_APPLICABLE: order amount outside bounds' USING ERRCODE='22023'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_priced) LOOP
  IF rule.scope='all' OR (rule.scope='products' AND (line->>'product_id')::uuid=ANY(rule.product_ids))
  OR (rule.scope='categories' AND line->>'menu_category'=ANY(rule.categories)) THEN
   eligible:=eligible+greatest(0,(line->>'unit_price')::numeric*(line->>'quantity')::int-
    CASE WHEN line->>'line_key'=p_reward_key THEN p_reward_discount ELSE 0 END);
  END IF;
 END LOOP;
 IF eligible<=0 THEN RAISE EXCEPTION 'PROMO_NOT_APPLICABLE: no eligible paid items' USING ERRCODE='22023'; END IF;
 amount:=CASE WHEN rule.discount_type='percent' THEN round(eligible*rule.discount_value/100,2) ELSE rule.discount_value END;
 RETURN least(amount,eligible,coalesce(rule.max_discount,eligible));
END $$;

-- Quote prices are read from products, never accepted from the mobile client.
CREATE FUNCTION public.quote_app_promo(p_code text,p_items jsonb,p_reward_key text DEFAULT NULL,p_reward_discount numeric DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE line jsonb; addon jsonb; p public.products; a public.products; price numeric; subtotal numeric:=0; priced jsonb:='[]'; q int; extras jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50
 OR pg_column_size(p_items)>65536 OR p_reward_discount IS NULL OR p_reward_discount::text IN ('NaN','Infinity','-Infinity') OR p_reward_discount<0 THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF (line->>'quantity')::numeric NOT BETWEEN 1 AND 99 OR (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  q:=(line->>'quantity')::int;
  SELECT * INTO p FROM public.products WHERE id=(line->>'product_id')::uuid AND is_available AND is_visible AND NOT is_modifier;
  IF NOT FOUND OR q IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE'; END IF;
  price:=p.price;extras:=coalesce(line->'modifiers','[]');
  IF jsonb_typeof(extras)<>'array' OR jsonb_array_length(extras)>20 THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
  FOR addon IN SELECT value FROM jsonb_array_elements(extras) LOOP
   IF (addon->>'quantity')::numeric NOT BETWEEN 1 AND 10 OR (addon->>'quantity')::numeric<>trunc((addon->>'quantity')::numeric) OR addon->>'quantity' IS NULL THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
   SELECT * INTO a FROM public.products WHERE id=(addon->>'product_id')::uuid AND is_modifier AND is_available;
   IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE'; END IF;
   price:=price+a.price*(addon->>'quantity')::int;
  END LOOP;
  subtotal:=subtotal+price*q;
  priced:=priced||jsonb_build_array(jsonb_build_object('product_id',p.id,'quantity',q,'unit_price',price,'menu_category',p.menu_category,'line_key',line->>'line_key'));
 END LOOP;
 RETURN jsonb_build_object('discount',public.app_promo_discount(p_code,priced,subtotal,p_reward_key,p_reward_discount),'code',upper(btrim(p_code)));
END $$;

-- Keep the tested checkout, locks, retries and reward/bonus triggers intact.
-- Fail closed if the deployed checkout no longer matches this known revision.
DO $$ DECLARE body text; old text:=$s$IF promo='SBL10' THEN promo_discount:=round((subtotal-reward_discount)*0.1,2); ELSE promo:=NULL; END IF;$s$;
BEGIN
 body:=pg_get_functiondef('public.create_pickup_order(uuid,jsonb,text,boolean,numeric,jsonb,jsonb,jsonb)'::regprocedure);
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'PROMO_CHECKOUT_VERSION_MISMATCH'; END IF;
 EXECUTE replace(body,old,'promo_discount:=public.app_promo_discount(promo,priced,subtotal,reward_key,reward_discount);');
END $$;
REVOKE ALL ON FUNCTION public.app_promo_discount(text,jsonb,numeric,text,numeric) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.staff_list_app_promos(),public.staff_save_app_promo(uuid,integer,jsonb),public.quote_app_promo(text,jsonb,text,numeric) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.staff_list_app_promos(),public.staff_save_app_promo(uuid,integer,jsonb),public.quote_app_promo(text,jsonb,text,numeric) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
