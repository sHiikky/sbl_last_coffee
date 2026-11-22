// Supabase Auth Send SMS hook: delivers sign-in codes through sms.ru.
// Secrets (Supabase -> Edge Functions -> Secrets, never in git or the app):
//   SMSRU_API_ID          — api_id from sms.ru
//   SEND_SMS_HOOK_SECRET  — "v1,whsec_..." generated in Auth -> Hooks -> Send SMS
//   SMSRU_FROM            — optional approved sender name
//   SMSRU_TEST            — "1" = sms.ru test mode (no SMS sent, no charge)
import { createSmsRuHook } from '../_shared/smsRuHook.js';

const handler = createSmsRuHook({
  apiId: Deno.env.get('SMSRU_API_ID') || '',
  hookSecret: Deno.env.get('SEND_SMS_HOOK_SECRET') || '',
  sender: Deno.env.get('SMSRU_FROM') || '',
  testMode: Deno.env.get('SMSRU_TEST') === '1',
});

Deno.serve((request: Request) => handler(request));
