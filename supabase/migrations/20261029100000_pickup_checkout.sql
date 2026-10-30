-- Pickup checkout v2. Local candidate: applying this file is a separate deployment.
BEGIN;

ALTER TABLE public.orders
 ADD COLUMN customer_name text CHECK(customer_name IS NULL OR length(customer_name) BETWEEN 1 AND 80),
 ADD COLUMN customer_phone text CHECK(customer_phone IS NULL OR customer_phone ~ '^\+7[0-9]{10}$'),
 ADD COLUMN pickup_point text,
 ADD COLUMN pickup_at timestamptz,
 ADD COLUMN comment text NOT NULL DEFAULT '' CHECK(length(comment)<=500),
 ADD COLUMN payment_method text NOT NULL DEFAULT 'on_pickup' CHECK(payment_method='on_pickup'),
 ADD COLUMN paid_at timestamptz,
 ADD COLUMN manual_sale_recorded_at timestamptz,
 ADD CONSTRAINT orders_manual_sale_requires_payment CHECK(manual_sale_recorded_at IS NULL OR paid_at IS NOT NULL);
ALTER TABLE public.order_items
 ADD COLUMN line_key text,
 ADD COLUMN base_unit_price numeric(10,2) CHECK(base_unit_price IS NULL OR base_unit_price>=0),
 ADD COLUMN modifiers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(modifiers)='array'),
 ADD COLUMN preparation_note text NOT NULL DEFAULT '' CHECK(length(preparation_note)<=200
  AND translate(preparation_note,E'\n','') !~ '[[:cntrl:]]' AND preparation_note !~ U&'[\0080-\009F]');
COMMENT ON COLUMN public.orders.customer_phone IS 'Order contact only. A guest-supplied number is not proof of phone verification.';
COMMENT ON COLUMN public.orders.pickup_point IS 'Snapshot of the pickup address, selected by the server from point_id.';
COMMENT ON COLUMN public.orders.paid_at IS 'Explicit staff confirmation of payment and handover; not an online payment transaction.';
COMMENT ON COLUMN public.orders.manual_sale_recorded_at IS 'Staff confirmation that the sale was entered manually in Saby.';
COMMENT ON COLUMN public.order_items.line_key IS 'Canonical product UUID plus sorted |modifierUUIDxquantityPerParent segments and optional |note:preparation_note. A gift and its paid remainder share a key.';
COMMENT ON COLUMN public.order_items.base_unit_price IS 'Original catalog base price snapshot, including for a gifted unit; price is the charged unit price with modifiers.';
COMMENT ON COLUMN public.order_items.modifiers IS 'Server snapshots [{product_id,name,quantity,unit_price}]; quantity is per one parent unit.';
COMMENT ON COLUMN public.order_items.preparation_note IS 'Preparation preference only, never a priced modifier. CRLF/CR normalized to LF; ASCII space/LF/tab trimmed; other controls rejected. Included in line_key.';

CREATE FUNCTION public.pickup_ordering_constants() RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('time_zone','Asia/Tomsk','point_id','lenina-72',
  'point_address','Томск, проспект Ленина, 72','open_hour',11,'close_hour',20,
  'preparation_min',3,'preparation_max',5);
$$;
-- Private clock seam permits deterministic local rollback tests without any
-- client-controlled clock, configuration flag, or time override in checkout.
CREATE FUNCTION public.pickup_order_clock() RETURNS timestamptz
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT clock_timestamp(); $$;
REVOKE ALL ON FUNCTION public.pickup_ordering_constants(),public.pickup_order_clock()
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_ordering_config() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c jsonb:=public.pickup_ordering_constants(); n timestamptz:=public.pickup_order_clock();
 local_now timestamp; opens timestamptz; closes timestamptz; next_opens timestamptz; accepting boolean;
BEGIN
 local_now:=n AT TIME ZONE (c->>'time_zone');
 opens:=(local_now::date + make_interval(hours=>(c->>'open_hour')::int)) AT TIME ZONE (c->>'time_zone');
 closes:=(local_now::date + make_interval(hours=>(c->>'close_hour')::int)) AT TIME ZONE (c->>'time_zone');
 accepting:=n>=opens AND n<closes AND n+make_interval(mins=>(c->>'preparation_max')::int)<=closes;
 next_opens:=CASE WHEN n<opens THEN opens WHEN accepting THEN opens
  ELSE ((local_now::date+1)+make_interval(hours=>(c->>'open_hour')::int)) AT TIME ZONE (c->>'time_zone') END;
 RETURN c || jsonb_build_object('server_now',n,'is_open',accepting,'next_open_at',next_opens);
END $$;

CREATE FUNCTION public.get_ordering_catalog() RETURNS SETOF public.products
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p.* FROM public.products p
 WHERE p.is_available AND (p.is_modifier OR p.is_visible)
 ORDER BY p.category,p.sort_order,p.name,p.id;
$$;
REVOKE ALL ON FUNCTION public.get_ordering_config(),public.get_ordering_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ordering_config(),public.get_ordering_catalog() TO anon,authenticated,service_role;

CREATE FUNCTION public.create_pickup_order(
 p_idempotency_key uuid,p_items jsonb,p_promo_code text DEFAULT NULL,
 p_reward_requested boolean DEFAULT false,p_bonus_redeem numeric DEFAULT 0,p_quote jsonb DEFAULT NULL,
 p_contact jsonb DEFAULT NULL,p_fulfillment jsonb DEFAULT NULL
) RETURNS SETOF public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 customer uuid:=auth.uid(); c jsonb:=public.pickup_ordering_constants();
 raw_line jsonb; raw_modifier jsonb; raw_modifiers jsonb; mods jsonb; canonical jsonb:='[]';
 priced jsonb:='[]'; snapshots jsonb; quote_items jsonb:='[]'; quote_modifiers jsonb;
 line record; modifier record; product public.products%ROWTYPE; addon public.products%ROWTYPE;
 product_id uuid; modifier_id uuid; parent_qty int; modifier_qty int; key text; note text;
 requested_pickup timestamptz; actual_pickup timestamptz; n timestamptz; local_now timestamp;
 opens timestamptz; closes timestamptz;
 name text; phone text; notes text; verified_phone text; verified_at timestamptz;
 promo text; reward_requested boolean:=coalesce(p_reward_requested,false); bonus numeric:=coalesce(p_bonus_redeem,0);
 fingerprint jsonb; previous_fingerprint jsonb; order_id uuid;
 subtotal numeric:=0; promo_discount numeric:=0; reward_discount numeric:=0; total_amount numeric;
 unit_price numeric; modifier_total numeric; entitlement uuid; reward_key text; remaining_qty int;
BEGIN
 IF customer IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED: active session required' USING ERRCODE='28000'; END IF;
 IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'INVALID_PAYLOAD: idempotency key required' USING ERRCODE='22023'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN
  RAISE EXCEPTION 'INVALID_PAYLOAD: items must be an array' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 OR pg_column_size(p_items)>262144 THEN
  RAISE EXCEPTION 'INVALID_PAYLOAD: invalid basket size' USING ERRCODE='22023'; END IF;
 IF p_quote IS NULL OR jsonb_typeof(p_quote) IS DISTINCT FROM 'object'
 OR p_quote->'version' IS DISTINCT FROM '2'::jsonb OR jsonb_typeof(p_quote->'items') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_quote->'payable') IS DISTINCT FROM 'number' THEN
  RAISE EXCEPTION 'QUOTE_REQUIRED: quote version 2 required' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_quote->'items')>50 OR pg_column_size(p_quote)>262144
 OR (p_quote->>'payable')::numeric<0 OR (p_quote->>'payable')::numeric>99999999.99
 OR (p_quote->>'payable')::numeric<>round((p_quote->>'payable')::numeric,2) THEN
  RAISE EXCEPTION 'INVALID_PAYLOAD: invalid quote' USING ERRCODE='22023'; END IF;
 IF bonus::text IN ('NaN','Infinity','-Infinity') OR bonus<0 OR bonus>99999999 OR bonus<>trunc(bonus) THEN
  RAISE EXCEPTION 'BONUS_REDEEM_INVALID: nonnegative whole points required' USING ERRCODE='22023'; END IF;
 IF p_contact IS NULL OR jsonb_typeof(p_contact)<>'object'
 OR jsonb_typeof(p_contact->'name') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_contact->'phone') IS DISTINCT FROM 'string' THEN
  RAISE EXCEPTION 'CONTACT_REQUIRED: customer name and phone required' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_contact->'customer_id') IS DISTINCT FROM 'string'
 OR (p_contact->>'customer_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'SESSION_CHANGED: checkout customer must match the authenticated session' USING ERRCODE='22023'; END IF;
 IF (p_contact->>'customer_id')::uuid<>customer THEN
  RAISE EXCEPTION 'SESSION_CHANGED: checkout customer must match the authenticated session' USING ERRCODE='22023'; END IF;
 name:=regexp_replace(btrim(p_contact->>'name'),'\s+',' ','g'); phone:=btrim(p_contact->>'phone');
 notes:=coalesce(p_contact->>'comment','');
 IF length(name) NOT BETWEEN 1 AND 80 OR phone !~ '^\+7[0-9]{10}$' OR length(notes)>500
 OR (p_contact ? 'comment' AND jsonb_typeof(p_contact->'comment') NOT IN ('string','null')) THEN
  RAISE EXCEPTION 'INVALID_CONTACT: name 1..80, +7 phone and comment up to 500 characters required' USING ERRCODE='22023'; END IF;
 IF p_fulfillment IS NULL OR jsonb_typeof(p_fulfillment)<>'object'
 OR p_fulfillment->>'point_id' IS DISTINCT FROM c->>'point_id'
 OR (p_fulfillment ? 'pickup_at' AND jsonb_typeof(p_fulfillment->'pickup_at') NOT IN ('null','string')) THEN
  RAISE EXCEPTION 'INVALID_PICKUP: select the Lenina 72 pickup point' USING ERRCODE='22023'; END IF;
 IF p_fulfillment->>'pickup_at' IS NOT NULL THEN
  BEGIN requested_pickup:=(p_fulfillment->>'pickup_at')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
   RAISE EXCEPTION 'INVALID_PICKUP: invalid pickup timestamp' USING ERRCODE='22023'; END;
  IF NOT isfinite(requested_pickup) THEN RAISE EXCEPTION 'INVALID_PICKUP: finite timestamp required' USING ERRCODE='22023'; END IF;
 END IF;

 -- Validate integers before casting. Never coerce fractional JSON quantities.
 FOR raw_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(raw_line)<>'object' OR jsonb_typeof(raw_line->'product_id') IS DISTINCT FROM 'string'
  OR (raw_line->>'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR jsonb_typeof(raw_line->'quantity') IS DISTINCT FROM 'number' THEN
   RAISE EXCEPTION 'INVALID_PAYLOAD: invalid product or quantity' USING ERRCODE='22023'; END IF;
  IF (raw_line->>'quantity')::numeric NOT BETWEEN 1 AND 99
  OR (raw_line->>'quantity')::numeric<>trunc((raw_line->>'quantity')::numeric) THEN
   RAISE EXCEPTION 'INVALID_QUANTITY: product quantity must be 1..99' USING ERRCODE='22023'; END IF;
  product_id:=(raw_line->>'product_id')::uuid; parent_qty:=((raw_line->>'quantity')::numeric)::int;
  IF raw_line ? 'preparation_note' AND jsonb_typeof(raw_line->'preparation_note') IS DISTINCT FROM 'string' THEN
   RAISE EXCEPTION 'INVALID_PREPARATION_NOTE: preparation note must be a string' USING ERRCODE='22023'; END IF;
  note:=btrim(replace(replace(coalesce(raw_line->>'preparation_note',''),E'\r\n',E'\n'),E'\r',E'\n'),E' \n\t');
  IF length(note)>200 OR translate(note,E'\n','') ~ '[[:cntrl:]]' OR note ~ U&'[\0080-\009F]' THEN
   RAISE EXCEPTION 'INVALID_PREPARATION_NOTE: at most 200 characters and no controls except line feed' USING ERRCODE='22023'; END IF;
  raw_modifiers:=coalesce(raw_line->'modifiers','[]'::jsonb);
  IF jsonb_typeof(raw_modifiers)<>'array' OR jsonb_array_length(raw_modifiers)>100 THEN
   RAISE EXCEPTION 'INVALID_PAYLOAD: invalid modifiers array' USING ERRCODE='22023'; END IF;
  FOR raw_modifier IN SELECT value FROM jsonb_array_elements(raw_modifiers) LOOP
   IF jsonb_typeof(raw_modifier)<>'object' OR jsonb_typeof(raw_modifier->'product_id') IS DISTINCT FROM 'string'
   OR (raw_modifier->>'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR jsonb_typeof(raw_modifier->'quantity') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: invalid modifier' USING ERRCODE='22023'; END IF;
   IF (raw_modifier->>'quantity')::numeric NOT BETWEEN 1 AND 10
   OR (raw_modifier->>'quantity')::numeric<>trunc((raw_modifier->>'quantity')::numeric) THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: modifier quantity must be 1..10 per parent unit' USING ERRCODE='22023'; END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('product_id',m.id,'quantity',m.qty) ORDER BY m.id),'[]'::jsonb)
  INTO mods FROM (SELECT (value->>'product_id')::uuid AS id,sum(((value->>'quantity')::numeric)::int) AS qty
   FROM jsonb_array_elements(raw_modifiers) GROUP BY (value->>'product_id')::uuid) m;
  IF jsonb_array_length(mods)>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(mods) m WHERE (m->>'quantity')::int>10) THEN
   RAISE EXCEPTION 'INVALID_QUANTITY: at most 20 modifiers, 1..10 each per parent unit' USING ERRCODE='22023'; END IF;
  key:=product_id::text;
  FOR modifier IN SELECT (value->>'product_id')::uuid AS id,(value->>'quantity')::int AS qty FROM jsonb_array_elements(mods)
   ORDER BY (value->>'product_id')::uuid LOOP
   key:=key||'|'||modifier.id::text||'x'||modifier.qty::text;
  END LOOP;
  IF note<>'' THEN key:=key||'|note:'||note; END IF;
  canonical:=canonical||jsonb_build_array(jsonb_build_object('line_key',key,'product_id',product_id,'quantity',parent_qty,
   'modifiers',mods,'preparation_note',note));
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('line_key',l.key,'product_id',l.id,'quantity',l.qty,'modifiers',l.mods,
  'preparation_note',l.note) ORDER BY l.key COLLATE "C")
 INTO canonical FROM (SELECT value->>'line_key' AS key,(value->>'product_id')::uuid AS id,
  sum((value->>'quantity')::int) AS qty,value->'modifiers' AS mods,value->>'preparation_note' AS note FROM jsonb_array_elements(canonical)
  GROUP BY value->>'line_key',(value->>'product_id')::uuid,value->'modifiers',value->>'preparation_note') l;
 IF jsonb_array_length(canonical)>50
 OR (SELECT sum((value->>'quantity')::int) FROM jsonb_array_elements(canonical))>300
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(canonical) WHERE (value->>'quantity')::int>99) THEN
  RAISE EXCEPTION 'INVALID_QUANTITY: basket quantity limit exceeded' USING ERRCODE='22023'; END IF;
 promo:=nullif(upper(btrim(coalesce(p_promo_code,''))),'');
 fingerprint:=jsonb_build_object('version',2,'items',canonical,'promo_code',promo,'reward_requested',reward_requested,
  'bonus_redeem',bonus,'quote',p_quote,'contact',jsonb_build_object('customer_id',customer,'name',name,'phone',phone,'comment',notes),
  'fulfillment',jsonb_build_object('point_id',c->>'point_id','pickup_at',
   CASE WHEN requested_pickup IS NULL THEN NULL ELSE to_char(requested_pickup AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END));

 -- Common customer lock serializes idempotency, rewards, completion and debit.
 INSERT INTO public.reward_progress(customer_id) VALUES(customer) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM public.reward_progress r WHERE r.customer_id=customer FOR UPDATE;
 SELECT o.id,o.request_fingerprint INTO order_id,previous_fingerprint FROM public.orders o
 WHERE o.customer_id=customer AND o.idempotency_key=p_idempotency_key;
 IF order_id IS NOT NULL THEN
  IF previous_fingerprint IS DISTINCT FROM fingerprint THEN
   RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: key belongs to another request' USING ERRCODE='23505'; END IF;
  RETURN QUERY SELECT o.* FROM public.orders o WHERE o.id=order_id; RETURN;
 END IF;
 SELECT u.phone,u.phone_confirmed_at INTO verified_phone,verified_at FROM auth.users u WHERE u.id=customer;
 IF verified_at IS NOT NULL AND phone IS DISTINCT FROM (CASE WHEN left(verified_phone,1)='+' THEN verified_phone ELSE '+'||verified_phone END) THEN
  RAISE EXCEPTION 'CONTACT_PHONE_MISMATCH: use the verified account phone' USING ERRCODE='22023'; END IF;
 -- One deterministic product-lock order includes both bases and all modifiers.
 PERFORM p.id FROM public.products p WHERE p.id IN (
  SELECT (value->>'product_id')::uuid FROM jsonb_array_elements(canonical)
  UNION SELECT (m.value->>'product_id')::uuid FROM jsonb_array_elements(canonical) l
   CROSS JOIN LATERAL jsonb_array_elements(l.value->'modifiers') m
 ) ORDER BY p.id FOR SHARE;
 n:=public.pickup_order_clock(); local_now:=n AT TIME ZONE (c->>'time_zone');
 opens:=(local_now::date+make_interval(hours=>(c->>'open_hour')::int)) AT TIME ZONE (c->>'time_zone');
 closes:=(local_now::date+make_interval(hours=>(c->>'close_hour')::int)) AT TIME ZONE (c->>'time_zone');
 IF n<opens OR n>=closes OR n+make_interval(mins=>(c->>'preparation_max')::int)>closes THEN
  RAISE EXCEPTION 'CAFE_CLOSED: orders are accepted 11:00-19:55 Asia/Tomsk for pickup by 20:00' USING ERRCODE='22023'; END IF;
 actual_pickup:=coalesce(requested_pickup,n+make_interval(mins=>(c->>'preparation_max')::int));
 IF actual_pickup<n+make_interval(mins=>(c->>'preparation_max')::int) OR actual_pickup>closes THEN
  RAISE EXCEPTION 'INVALID_PICKUP: pickup must allow five minutes preparation and be no later than 20:00 today' USING ERRCODE='22023'; END IF;

 FOR line IN SELECT value AS data FROM jsonb_array_elements(canonical) ORDER BY (value->>'line_key') COLLATE "C" LOOP
  SELECT * INTO product FROM public.products p WHERE p.id=(line.data->>'product_id')::uuid;
  IF NOT FOUND OR NOT product.is_visible OR NOT product.is_available OR product.is_modifier OR product.price<0 THEN
   RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE: base product unavailable' USING ERRCODE='22023'; END IF;
  snapshots:='[]'::jsonb; quote_modifiers:='[]'::jsonb; modifier_total:=0;
  FOR modifier IN SELECT (value->>'product_id')::uuid AS id,(value->>'quantity')::int AS qty FROM jsonb_array_elements(line.data->'modifiers')
   ORDER BY (value->>'product_id')::uuid LOOP
   SELECT * INTO addon FROM public.products p WHERE p.id=modifier.id;
   IF NOT FOUND OR NOT addon.is_modifier OR NOT addon.is_available OR addon.price<0 THEN
    RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE: modifier unavailable' USING ERRCODE='22023'; END IF;
   modifier_total:=modifier_total+addon.price*modifier.qty;
   snapshots:=snapshots||jsonb_build_array(jsonb_build_object('product_id',addon.id,'name',coalesce(addon.display_name,addon.name),
    'quantity',modifier.qty,'unit_price',addon.price));
   quote_modifiers:=quote_modifiers||jsonb_build_array(jsonb_build_array(addon.id,modifier.qty,addon.price));
  END LOOP;
  unit_price:=product.price+modifier_total;
  IF unit_price>99999999.99 THEN RAISE EXCEPTION 'INVALID_PAYLOAD: unit price limit exceeded' USING ERRCODE='22023'; END IF;
  subtotal:=subtotal+unit_price*(line.data->>'quantity')::int;
  priced:=priced||jsonb_build_array(line.data||jsonb_build_object('product_name',coalesce(product.display_name,product.name),
   'base_unit_price',product.price,'unit_price',unit_price,'modifiers',snapshots,'menu_category',product.menu_category));
  quote_items:=quote_items||jsonb_build_array(jsonb_build_array(line.data->>'line_key',product.id,
   (line.data->>'quantity')::int,product.price,quote_modifiers));
 END LOOP;
 IF subtotal>99999999.99 THEN RAISE EXCEPTION 'INVALID_PAYLOAD: order price limit exceeded' USING ERRCODE='22023'; END IF;
 IF reward_requested THEN
  SELECT r.id INTO entitlement FROM public.reward_entitlements r WHERE r.customer_id=customer
   AND r.redeemed_at IS NULL AND r.expires_at>clock_timestamp() ORDER BY r.earned_at,r.id LIMIT 1 FOR UPDATE;
 END IF;
 IF entitlement IS NOT NULL THEN
  SELECT value->>'line_key',(value->>'base_unit_price')::numeric INTO reward_key,reward_discount
  FROM jsonb_array_elements(priced) WHERE value->>'menu_category'='Десерты'
  ORDER BY (value->>'base_unit_price')::numeric,(value->>'line_key') COLLATE "C" LIMIT 1;
  IF reward_key IS NULL THEN entitlement:=NULL; reward_discount:=0; END IF;
 END IF;
 -- A gift removes one base only. Modifiers remain chargeable; promotion applies
 -- to the remaining charged amount, never again to the already gifted base.
 IF promo='SBL10' THEN promo_discount:=round((subtotal-reward_discount)*0.1,2); ELSE promo:=NULL; END IF;
 total_amount:=subtotal-reward_discount-promo_discount;
 IF p_quote->'items' IS DISTINCT FROM quote_items OR (p_quote->>'payable')::numeric IS DISTINCT FROM total_amount-bonus THEN
  RAISE EXCEPTION 'PRICE_CHANGED: review current base, modifier and payable prices' USING ERRCODE='22023'; END IF;

 INSERT INTO public.orders(customer_id,status,total,subtotal,discount_total,promo_code,reward_applied,reward_discount,
  bonus_redeemed,idempotency_key,request_fingerprint,reward_entitlement_id,customer_name,customer_phone,pickup_point,pickup_at,comment,payment_method)
 VALUES(customer,'new',total_amount,subtotal,promo_discount,promo,entitlement IS NOT NULL,reward_discount,
  bonus::integer,p_idempotency_key,fingerprint,entitlement,name,phone,c->>'point_address',actual_pickup,notes,'on_pickup')
 RETURNING id INTO order_id;
 FOR line IN SELECT value AS data FROM jsonb_array_elements(priced) LOOP
  remaining_qty:=(line.data->>'quantity')::int;
  IF entitlement IS NOT NULL AND line.data->>'line_key'=reward_key THEN
   INSERT INTO public.order_items(order_id,product_id,product_name,quantity,price,line_key,base_unit_price,modifiers,preparation_note)
   VALUES(order_id,(line.data->>'product_id')::uuid,line.data->>'product_name',1,
    (line.data->>'unit_price')::numeric-(line.data->>'base_unit_price')::numeric,line.data->>'line_key',
    (line.data->>'base_unit_price')::numeric,line.data->'modifiers',line.data->>'preparation_note');
   remaining_qty:=remaining_qty-1;
  END IF;
  IF remaining_qty>0 THEN
   INSERT INTO public.order_items(order_id,product_id,product_name,quantity,price,line_key,base_unit_price,modifiers,preparation_note)
   VALUES(order_id,(line.data->>'product_id')::uuid,line.data->>'product_name',remaining_qty,(line.data->>'unit_price')::numeric,
    line.data->>'line_key',(line.data->>'base_unit_price')::numeric,line.data->'modifiers',line.data->>'preparation_note');
  END IF;
 END LOOP;
 RETURN QUERY SELECT o.* FROM public.orders o WHERE o.id=order_id;
END $$;
REVOKE ALL ON FUNCTION public.create_pickup_order(uuid,jsonb,text,boolean,numeric,jsonb,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_pickup_order(uuid,jsonb,text,boolean,numeric,jsonb,jsonb,jsonb) TO authenticated,service_role;

CREATE FUNCTION public.update_order_status(p_order_id uuid,p_status text,p_payment_confirmed boolean DEFAULT false,
 p_manual_sale_recorded boolean DEFAULT false) RETURNS SETOF public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.orders%ROWTYPE; customer uuid; target public.order_status; n timestamptz:=clock_timestamp();
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff s WHERE s.user_id=auth.uid()) THEN
  RAISE EXCEPTION 'STAFF_REQUIRED' USING ERRCODE='42501'; END IF;
 BEGIN target:=p_status::public.order_status;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE='22023'; END;
 IF target IS NULL THEN RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE='22023'; END IF;
 SELECT t.customer_id INTO customer FROM public.orders t WHERE t.id=p_order_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE='22023'; END IF;
 IF customer IS NOT NULL THEN
  INSERT INTO public.reward_progress(customer_id) VALUES(customer) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.reward_progress r WHERE r.customer_id=customer FOR UPDATE;
 END IF;
 SELECT * INTO o FROM public.orders t WHERE t.id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE='22023'; END IF;
 IF coalesce(p_manual_sale_recorded,false) AND (target<>'completed' OR NOT coalesce(p_payment_confirmed,false)) THEN
  RAISE EXCEPTION 'PAYMENT_CONFIRMATION_REQUIRED: Saby sale requires confirmed payment and completion' USING ERRCODE='22023'; END IF;
 IF o.status=target THEN
  IF coalesce(p_manual_sale_recorded,false) AND o.paid_at IS NOT NULL AND o.manual_sale_recorded_at IS NULL THEN
   UPDATE public.orders t SET manual_sale_recorded_at=n,updated_at=n WHERE t.id=o.id;
  ELSIF coalesce(p_manual_sale_recorded,false) AND o.paid_at IS NULL THEN
   RAISE EXCEPTION 'PAYMENT_CONFIRMATION_REQUIRED: historical completion has no payment confirmation' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT t.* FROM public.orders t WHERE t.id=o.id; RETURN;
 END IF;
 IF NOT ((o.status='new' AND target IN ('accepted','preparing','cancelled'))
  OR (o.status='accepted' AND target IN ('preparing','cancelled'))
  OR (o.status='preparing' AND target IN ('ready','cancelled'))
  OR (o.status='ready' AND target IN ('completed','cancelled'))
  OR (o.status='completed' AND target='cancelled')) THEN
  RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: refresh the order' USING ERRCODE='22023'; END IF;
 IF target='completed' AND NOT coalesce(p_payment_confirmed,false) THEN
  RAISE EXCEPTION 'PAYMENT_CONFIRMATION_REQUIRED: confirm payment before handover' USING ERRCODE='22023'; END IF;
 UPDATE public.orders t SET status=target,updated_at=n,
  paid_at=CASE WHEN target='completed' THEN coalesce(t.paid_at,n) ELSE t.paid_at END,
  manual_sale_recorded_at=CASE WHEN target='completed' AND coalesce(p_manual_sale_recorded,false)
   THEN coalesce(t.manual_sale_recorded_at,n) ELSE t.manual_sale_recorded_at END WHERE t.id=o.id;
 RETURN QUERY SELECT t.* FROM public.orders t WHERE t.id=o.id;
END $$;
REVOKE ALL ON FUNCTION public.update_order_status(uuid,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid,text,boolean,boolean) TO authenticated,service_role;

-- Staff use the checked RPC too: no direct API update can skip payment,
-- mutate snapshots/contact, insert unpriced items, or bypass opening hours.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.orders,public.order_items FROM PUBLIC,anon,authenticated;
-- Table-level REVOKE does not remove pre-existing per-column grants.
DO $$ DECLARE t text; columns text; BEGIN
 FOREACH t IN ARRAY ARRAY['orders','order_items'] LOOP
  SELECT string_agg(quote_ident(a.attname),',' ORDER BY a.attnum) INTO columns FROM pg_attribute a
   WHERE a.attrelid=('public.'||t)::regclass AND a.attnum>0 AND NOT a.attisdropped;
  EXECUTE format('REVOKE INSERT(%1$s),UPDATE(%1$s),REFERENCES(%1$s) ON public.%2$I FROM PUBLIC,anon,authenticated',columns,t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.create_order(uuid,jsonb,text,boolean,numeric,jsonb) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
