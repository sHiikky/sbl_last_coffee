-- Tiny "has the menu changed?" signal. The app checks it in the background and downloads the
-- full catalog only when the admin panel (or the SBIS sync) actually changed something.
-- Every product update bumps products.catalog_version (catalog_product_before_write), and
-- inserts/removals/visibility changes alter the set itself, so the hash covers all of them.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_ordering_catalog_version()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT md5(coalesce(string_agg(p.id::text || ':' || p.catalog_version::text, ',' ORDER BY p.id), ''))
 FROM public.products p
 WHERE p.is_available AND (p.is_modifier OR p.is_visible);
$$;

REVOKE ALL ON FUNCTION public.get_ordering_catalog_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ordering_catalog_version() TO anon, authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
