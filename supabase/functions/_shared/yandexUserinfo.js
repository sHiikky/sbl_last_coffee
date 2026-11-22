// Supabase Auth custom OAuth2 provider "custom:yandex-id" -> userinfo adapter.
// Supabase expects OIDC-style claims (sub, name, ...), while Yandex ID returns its own
// shape (id, login, real_name, ...) and wants "Authorization: OAuth <token>".
// Supabase calls this URL with "Authorization: Bearer <yandex access token>".
// The function holds no secrets: it only forwards that token to Yandex and renames the
// fields of the answer. Never log the token or the profile.

const YANDEX_INFO_URL = 'https://login.yandex.ru/info?format=json';
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]{10,512}$/;

export function mapYandexProfile(profile) {
  const id = String(profile?.id ?? '').trim();
  if (!id) return null;
  const given = String(profile.first_name || '').trim();
  const family = String(profile.last_name || '').trim();
  const name = String(profile.real_name || profile.display_name || [given, family].filter(Boolean).join(' ') || profile.login || '').trim();
  const avatar = profile.default_avatar_id && !profile.is_avatar_empty
    ? `https://avatars.yandex.net/get-yapic/${encodeURIComponent(profile.default_avatar_id)}/islands-200` : '';
  // Supabase Auth cannot LINK an identity without a verified email to a user that has no email
  // (phone-only accounts, guests): it tries to send a confirmation mail and fails with
  // over_email_send_rate_limit. We do not need the real address, so Yandex ID gets a non-deliverable
  // placeholder derived from its id (RFC 2606 ".invalid"); no personal email is requested or stored.
  const claims = { sub: id, email: `yandex-${id.replace(/[^0-9A-Za-z]/g, '').slice(0, 40)}@yandex-id.invalid`, email_verified: true };
  if (name) claims.name = name;
  if (given) claims.given_name = given;
  if (family) claims.family_name = family;
  if (profile.login) claims.preferred_username = String(profile.login);
  if (avatar) claims.picture = avatar;
  return claims;
}

export function createYandexUserinfo({ fetchImpl = fetch } = {}) {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

  return async function handle(request) {
    if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const header = request.headers.get('authorization') || '';
    const token = header.replace(/^(Bearer|OAuth)\s+/i, '').trim();
    if (!TOKEN_PATTERN.test(token)) return json(401, { error: 'invalid_token' });

    let response;
    try {
      response = await fetchImpl(YANDEX_INFO_URL, { headers: { Authorization: `OAuth ${token}` }, signal: AbortSignal.timeout(4000) });
    } catch { return json(502, { error: 'yandex_unavailable' }); }
    if (response.status === 401 || response.status === 403) return json(401, { error: 'invalid_token' });
    if (!response.ok) return json(502, { error: 'yandex_unavailable' });

    const claims = mapYandexProfile(await response.json().catch(() => null));
    if (!claims) return json(502, { error: 'yandex_bad_profile' });
    return json(200, claims);
  };
}
