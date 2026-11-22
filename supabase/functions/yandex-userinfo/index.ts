// Userinfo endpoint for the Supabase custom OAuth2 provider "custom:yandex-id".
// Called only by Supabase Auth with the user's Yandex token; needs no secrets.
// Deploy: npx supabase functions deploy yandex-userinfo --no-verify-jwt --use-api
import { createYandexUserinfo } from '../_shared/yandexUserinfo.js';

const handler = createYandexUserinfo();

Deno.serve((request: Request) => handler(request));
