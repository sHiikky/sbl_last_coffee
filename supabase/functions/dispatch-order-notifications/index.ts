import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { createOrderNotificationWorker, notificationCors } from '../_shared/orderNotificationWorker.js';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const admin = url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const handler = admin ? createOrderNotificationWorker({
  admin,
  enabled: Deno.env.get('ORDER_PUSH_ENABLED') === 'true',
  workerSecret: Deno.env.get('ORDER_PUSH_WORKER_SECRET') || '',
  expoAccessToken: Deno.env.get('EXPO_ACCESS_TOKEN') || '',
  async authenticateStaff(token: string) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user?.id) return false;
    const staff = await admin.from('staff').select('user_id').eq('user_id', data.user.id).maybeSingle();
    if (staff.error) throw new Error('STAFF_CHECK_UNAVAILABLE');
    return !!staff.data;
  },
}) : null;

Deno.serve((request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: notificationCors });
  if (!handler) return new Response(JSON.stringify({ error: 'PUSH_NOT_CONFIGURED' }), { status: 503, headers: { ...notificationCors, 'Content-Type': 'application/json' } });
  return handler(request);
});
