-- News/promotions for Home. Apply separately; does not create/publish sample posts.
BEGIN;

CREATE TABLE public.app_publications (
 id uuid PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('news','promotion')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 100),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),
 image_url text CHECK(image_url IS NULL OR (length(image_url)<=2048 AND image_url ~ '^https://[^[:space:]<>"@]+$')),
 product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 starts_at timestamptz NOT NULL DEFAULT now(),
 ends_at timestamptz,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 last_write_fingerprint jsonb NOT NULL,
 CHECK(ends_at IS NULL OR ends_at>starts_at)
);
CREATE INDEX app_publications_published ON public.app_publications(starts_at DESC) WHERE status='published';
ALTER TABLE public.app_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_publications FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.app_publications TO service_role;

CREATE FUNCTION public.get_app_publications() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('server_now',now(),'items',coalesce((
  SELECT jsonb_agg(item ORDER BY starts_at DESC,id) FROM (
   SELECT p.id,p.starts_at,jsonb_build_object('id',p.id,'kind',p.kind,'title',p.title,'body',p.body,
    'image_url',p.image_url,'product_id',p.product_id,'starts_at',p.starts_at,'ends_at',p.ends_at) AS item
   FROM public.app_publications p WHERE p.status='published' AND p.starts_at<=now()
    AND (p.ends_at IS NULL OR p.ends_at>now()) ORDER BY p.starts_at DESC,p.id LIMIT 20
  ) active
 ),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.get_app_publications() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_app_publications() TO anon,authenticated,service_role;

CREATE FUNCTION public.staff_list_app_publications() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid()) THEN
  RAISE EXCEPTION 'STAFF_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('server_now',now(),'items',coalesce((
  SELECT jsonb_agg(item ORDER BY updated_at DESC,id) FROM (
   SELECT p.id,p.updated_at,(to_jsonb(p)-'last_write_fingerprint') || jsonb_build_object('visibility',
    CASE WHEN p.status='draft' THEN 'draft' WHEN p.status='archived' THEN 'archived'
     WHEN p.starts_at>now() THEN 'scheduled' WHEN p.ends_at IS NOT NULL AND p.ends_at<=now() THEN 'expired'
     ELSE 'active' END) AS item
   FROM public.app_publications p ORDER BY p.updated_at DESC,p.id LIMIT 200
  ) recent
 ),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.staff_list_app_publications() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.staff_list_app_publications() TO authenticated,service_role;

CREATE FUNCTION public.staff_save_app_publication(p_id uuid,p_expected_version integer,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 actor uuid:=auth.uid(); previous public.app_publications%ROWTYPE; saved public.app_publications%ROWTYPE;
 title_value text; body_value text; image_value text; kind_value text; status_value text; product_value uuid;
 start_value timestamptz; end_value timestamptz; normalized jsonb; n timestamptz:=now(); found_previous boolean;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=actor) THEN
  RAISE EXCEPTION 'STAFF_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_payload IS NULL
  OR jsonb_typeof(p_payload)<>'object' OR pg_column_size(p_payload)>32768 THEN
  RAISE EXCEPTION 'INVALID_PUBLICATION' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_payload->'title') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_payload->'body') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_payload->'kind') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_payload->'status') IS DISTINCT FROM 'string' THEN
  RAISE EXCEPTION 'INVALID_PUBLICATION' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k
  WHERE k NOT IN ('title','body','kind','status','image_url','product_id','starts_at','ends_at')) THEN
  RAISE EXCEPTION 'INVALID_PUBLICATION_FIELDS' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES('image_url'),('product_id'),('starts_at'),('ends_at')) keys(name)
  WHERE p_payload ? name AND jsonb_typeof(p_payload->name) NOT IN ('string','null')) THEN
  RAISE EXCEPTION 'INVALID_PUBLICATION' USING ERRCODE='22023'; END IF;
 title_value:=btrim(p_payload->>'title'); body_value:=btrim(replace(replace(p_payload->>'body',E'\r\n',E'\n'),E'\r',E'\n'));
 kind_value:=p_payload->>'kind'; status_value:=p_payload->>'status'; image_value:=nullif(btrim(p_payload->>'image_url'),'');
 IF length(title_value) NOT BETWEEN 1 AND 100 OR length(body_value) NOT BETWEEN 1 AND 3000
  OR kind_value NOT IN ('news','promotion') OR status_value NOT IN ('draft','published','archived')
  OR title_value ~ '[[:cntrl:]]' OR translate(body_value,E'\n\t','') ~ '[[:cntrl:]]'
  OR title_value ~ U&'[\0080-\009F]' OR body_value ~ U&'[\0080-\009F]' THEN
  RAISE EXCEPTION 'INVALID_PUBLICATION_TEXT' USING ERRCODE='22023'; END IF;
 IF image_value IS NOT NULL AND (length(image_value)>2048 OR image_value !~ '^https://[^[:space:]<>"@]+$') THEN
  RAISE EXCEPTION 'INVALID_PUBLICATION_IMAGE: HTTPS URL required' USING ERRCODE='22023'; END IF;
 BEGIN
  product_value:=nullif(p_payload->>'product_id','')::uuid;
  start_value:=nullif(p_payload->>'starts_at','')::timestamptz;
  end_value:=nullif(p_payload->>'ends_at','')::timestamptz;
 EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION 'INVALID_PUBLICATION_SCHEDULE' USING ERRCODE='22023'; END;
 IF (start_value IS NOT NULL AND NOT isfinite(start_value)) OR (end_value IS NOT NULL AND NOT isfinite(end_value)) THEN
  RAISE EXCEPTION 'INVALID_PUBLICATION_SCHEDULE' USING ERRCODE='22023'; END IF;
 IF product_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products p WHERE p.id=product_value AND p.is_visible AND NOT p.is_modifier) THEN
  RAISE EXCEPTION 'PUBLICATION_PRODUCT_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 normalized:=jsonb_build_object('title',title_value,'body',body_value,'kind',kind_value,'status',status_value,
  'image_url',image_value,'product_id',product_value,'starts_at',start_value,'ends_at',end_value);
 -- Stable client UUID + expected version make identical lost-response retries safe.
 PERFORM pg_advisory_xact_lock(hashtextextended('app-publication:'||p_id::text,0));
 SELECT * INTO previous FROM public.app_publications WHERE id=p_id FOR UPDATE;
 found_previous:=FOUND;
 IF found_previous THEN
  IF previous.version=p_expected_version+1 AND previous.last_write_fingerprint=normalized THEN
   RETURN to_jsonb(previous)-'last_write_fingerprint'; END IF;
  IF previous.version<>p_expected_version OR p_expected_version=0 THEN
   RAISE EXCEPTION 'PUBLICATION_CONFLICT: reload before editing' USING ERRCODE='40001'; END IF;
 ELSE
  IF p_expected_version<>0 THEN RAISE EXCEPTION 'PUBLICATION_NOT_FOUND' USING ERRCODE='22023'; END IF;
 END IF;
 start_value:=coalesce(start_value,CASE WHEN found_previous THEN previous.starts_at ELSE n END);
 IF end_value IS NOT NULL AND end_value<=start_value THEN
  RAISE EXCEPTION 'INVALID_PUBLICATION_SCHEDULE: end must be later than start' USING ERRCODE='22023'; END IF;
 IF status_value='published' AND kind_value='promotion' AND end_value IS NULL THEN
  RAISE EXCEPTION 'PUBLICATION_PROMOTION_END_REQUIRED' USING ERRCODE='22023'; END IF;
 IF status_value='published' AND end_value IS NOT NULL AND end_value<=n THEN
  RAISE EXCEPTION 'PUBLICATION_ALREADY_EXPIRED' USING ERRCODE='22023'; END IF;
 IF found_previous THEN
  UPDATE public.app_publications SET title=title_value,body=body_value,kind=kind_value,status=status_value,
   image_url=image_value,product_id=product_value,starts_at=start_value,ends_at=end_value,
   version=version+1,updated_by=actor,updated_at=n,last_write_fingerprint=normalized WHERE id=p_id RETURNING * INTO saved;
 ELSE
  INSERT INTO public.app_publications(id,kind,title,body,image_url,product_id,status,starts_at,ends_at,created_by,updated_by,last_write_fingerprint)
  VALUES(p_id,kind_value,title_value,body_value,image_value,product_value,status_value,start_value,end_value,actor,actor,normalized)
  RETURNING * INTO saved;
 END IF;
 RETURN to_jsonb(saved)-'last_write_fingerprint';
END $$;
REVOKE ALL ON FUNCTION public.staff_save_app_publication(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.staff_save_app_publication(uuid,integer,jsonb) TO authenticated,service_role;

COMMENT ON TABLE public.app_publications IS 'Home editorial feed. Staff RPCs only; all staff may edit. Publishing text does not change product prices or grant a discount. Archive preserves audit history.';
NOTIFY pgrst,'reload schema';
COMMIT;
