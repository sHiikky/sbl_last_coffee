import { createClient } from '@supabase/supabase-js';

export const url = Deno.env.get('SUPABASE_URL')!;
export const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
export const admin = () => createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
export const json = (body: object, status = 200) => Response.json(body, { status, headers: cors });
export async function anonymousUser(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await client.auth.getUser();
  return !error && user?.is_anonymous === true ? user : null;
}
export function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let delta = 0;
  for (let i = 0; i < a.length; i++) delta |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return delta === 0;
}
