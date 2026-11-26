-- Called only by the server-held service role after the normal attempt rate limits.
BEGIN;
CREATE OR REPLACE FUNCTION public.waitcall_registered_phone(p_phone text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN p_phone ~ '^\+7[0-9]{10}$' THEN EXISTS(
  SELECT 1 FROM auth.users u WHERE u.phone=ltrim(p_phone,'+')
   AND u.phone_confirmed_at IS NOT NULL AND u.is_anonymous=false
 ) ELSE false END;
$$;
REVOKE ALL ON FUNCTION public.waitcall_registered_phone(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.waitcall_registered_phone(text) TO service_role;
COMMIT;
