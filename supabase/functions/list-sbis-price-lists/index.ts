// Administrative discovery only: no database writes, catalogue sync or notifications.
// Invoke with apikey: <Supabase Secret API key (sb_secret_...)>.
// Legacy service-role credentials remain supported when provisioned identically.
// Set verify_jwt=false for this function: the mandatory admin-key check below
// authenticates apikey requests before any SBIS call. SBIS Secrets stay server-side.
const POINT_ID = 240;
const PAGE_SIZE = 25;
const MAX_PAGES = 40;
const VERSION = '2026-10-09.1';

type JsonObject = Record<string, unknown>;
type PriceList = { id: string | number; name: string };

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject : null;
}

function reply(status: number, body: JsonObject): Response {
  return Response.json({ version: VERSION, ...body }, { status, headers: { 'Cache-Control': 'no-store' } });
}

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function unpack(value: unknown): { items: unknown[]; hasMore: boolean | undefined } {
  if (Array.isArray(value)) return { items: value, hasMore: undefined };
  const data = object(value);
  if (!data) throw new RequestError(502, 'Unexpected SBIS price-list response.');
  const items = data.priceLists ?? data.price_lists ?? data.items ?? data.result;
  if (!Array.isArray(items)) {
    throw new RequestError(502, 'SBIS response has no recognised price-list array.');
  }
  const more = object(data.outcome)?.hasMore ?? data.hasMore;
  if (more !== undefined && typeof more !== 'boolean') {
    throw new RequestError(502, 'Unexpected SBIS pagination flag.');
  }
  return { items, hasMore: more as boolean | undefined };
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Check before reading credentials or making any SBIS request. An anon key
  // or customer JWT passing the gateway is insufficient for this admin tool.
  const adminKeys = new Set<string>();
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacyKey) adminKeys.add(legacyKey);
  const singleSecretKey = Deno.env.get('SUPABASE_SECRET_KEY');
  if (singleSecretKey?.startsWith('sb_secret_')) adminKeys.add(singleSecretKey);
  const namedSecrets = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (namedSecrets) {
    try {
      const keys = object(JSON.parse(namedSecrets));
      if (!keys) throw new Error();
      for (const value of Object.values(keys)) {
        if (typeof value === 'string' && value.startsWith('sb_secret_')) adminKeys.add(value);
      }
    } catch {
      return reply(503, { ok: false, error: 'Project Secret API key configuration is invalid.' });
    }
  }
  if (!adminKeys.size) return reply(503, { ok: false, error: 'Admin credential is not configured.' });
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const apiKey = req.headers.get('apikey')?.trim();
  const explicitAdminKey = req.headers.get('x-sbl-admin-key')?.trim();
  if (![bearer, apiKey, explicitAdminKey].some(key => key !== undefined && adminKeys.has(key))) {
    return reply(403, { ok: false, error: 'Admin authorization required. Use a project Secret API key (sb_secret_...) in the apikey header.' });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return reply(405, { ok: false, error: 'Use GET or POST.' });
  }

  let authDiagnostics: JsonObject | undefined;
  try {
    let input: JsonObject = {};
    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > 4096) throw new RequestError(400, 'Request body is too large.');
      if (text.trim()) {
        try { input = object(JSON.parse(text)) ?? (() => { throw new Error(); })(); }
        catch { throw new RequestError(400, 'Body must be a JSON object.'); }
      }
    }
    const url = new URL(req.url);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tomsk', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const date = input.actualDate ?? url.searchParams.get('actualDate') ?? today;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      throw new RequestError(400, 'actualDate must be a valid YYYY-MM-DD date.');
    }
    const credentials: Record<string, string> = {};
    for (const [field, secret] of [
      ['app_client_id', 'SBIS_APP_CLIENT_ID'],
      ['app_secret', 'SBIS_APP_SECRET'],
      ['secret_key', 'SBIS_SECRET_KEY'],
    ]) {
      const value = Deno.env.get(secret);
      if (!value) throw new RequestError(503, `Missing project Secret: ${secret}.`);
      credentials[field] = value.trim();
      if (!credentials[field]) throw new RequestError(503, `Empty project Secret: ${secret}.`);
    }
    // An administrator may check a known public app ID without changing the
    // shared project Secrets used by the existing catalogue sync.
    if (input.appClientId !== undefined) {
      if (typeof input.appClientId !== 'string' || !/^\d{6,20}$/.test(input.appClientId)) {
        throw new RequestError(400, 'appClientId must be a numeric application ID string.');
      }
      credentials.app_client_id = input.appClientId;
    }
    if (input.authHost !== undefined && input.authHost !== 'saby' && input.authHost !== 'sbis') {
      throw new RequestError(400, 'authHost must be saby or sbis.');
    }
    const authHost = input.authHost === 'saby' ? 'online.saby.ru' : 'online.sbis.ru';
    authDiagnostics = {
      host: authHost,
      confirmedAppIdUsed: credentials.app_client_id === '4402856400799386',
      appIdFromRequest: input.appClientId !== undefined,
    };
    const signal = AbortSignal.timeout(45_000);
    async function fetchJson(address: string, init: RequestInit, operation: string): Promise<unknown> {
      const response = await fetch(address, { ...init, signal, redirect: 'error' });
      if (!response.ok) {
        // Only an administrative caller can see a provider error. Never echo
        // the raw body; redact all request credentials from recognised messages.
        const body = object(await response.json().catch(() => null));
        const candidate = object(body?.error)?.message ?? body?.message ?? body?.error;
        let detail = typeof candidate === 'string' ? candidate : '';
        for (const secret of Object.values(credentials)) {
          detail = detail.split(secret).join('[redacted]');
        }
        for (const secret of adminKeys) detail = detail.split(secret).join('[redacted]');
        detail = detail.replace(/eyJ[A-Za-z0-9_.-]+|sb_secret_[A-Za-z0-9_-]+/g, '[redacted]')
          .replace(/[\r\n]+/g, ' ').slice(0, 400);
        throw new RequestError(502, `${operation}: HTTP ${response.status}.${detail ? ` ${detail}` : ''}`);
      }
      try { return await response.json(); }
      catch { throw new RequestError(502, `${operation}: response is not JSON.`); }
    }
    const auth = object(await fetchJson(`https://${authHost}/oauth/service/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    }, 'SBIS authorization'));
    if (typeof auth?.token !== 'string' || !auth.token) {
      throw new RequestError(502, 'SBIS authorization returned no token.');
    }
    const lists = new Map<string, PriceList>();
    const pages = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = new URLSearchParams({
        pointId: String(POINT_ID), actualDate: date, page: String(page), pageSize: String(PAGE_SIZE),
      });
      const { items, hasMore } = unpack(await fetchJson(
        `https://api.sbis.ru/retail/nomenclature/price-list?${query}`,
        { method: 'GET', headers: { 'X-SBISAccessToken': auth.token } }, 'SBIS price lists',
      ));
      const parsed = items.map((value): PriceList => {
        const item = object(value);
        const id = item?.id ?? item?.priceListId;
        if ((typeof id !== 'string' && typeof id !== 'number') || String(id).trim() === ''
          || typeof item?.name !== 'string' || !item.name.trim()) {
          throw new RequestError(502, 'SBIS returned a price list without id or name.');
        }
        return { id, name: item.name };
      });
      if (parsed.length) {
        const signature = JSON.stringify(parsed);
        if (pages.has(signature)) throw new RequestError(502, 'SBIS pagination repeated a page; result is incomplete.');
        pages.add(signature);
      } else if (hasMore === true) {
        throw new RequestError(502, 'SBIS pagination returned an empty page with hasMore=true.');
      }
      for (const item of parsed) lists.set(String(item.id), item);
      if (hasMore === false || parsed.length === 0 || (hasMore === undefined && parsed.length < PAGE_SIZE)) {
        const priceLists = [...lists.values()];
        const matches = priceLists.filter(item =>
          item.name.trim().toLocaleLowerCase('ru').replace(/\s+/g, ' ') === 'осень зима 2026');
        let catalog: JsonObject | undefined;
        if (input.catalogPriceListId !== undefined) {
          if (typeof input.catalogPriceListId !== 'number'
            || !Number.isSafeInteger(input.catalogPriceListId) || input.catalogPriceListId <= 0) {
            throw new RequestError(400, 'catalogPriceListId must be a positive integer.');
          }
          const selected = priceLists.find(item => String(item.id) === String(input.catalogPriceListId));
          if (!selected) throw new RequestError(400, 'Requested price list is not active at this point/date.');
          const catalogItems: unknown[] = [];
          const catalogPages = new Set<string>();
          for (let catalogPage = 0; catalogPage < MAX_PAGES; catalogPage++) {
            const query = new URLSearchParams({
              pointId: String(POINT_ID), priceListId: String(selected.id),
              pageSize: String(PAGE_SIZE), page: String(catalogPage),
            });
            const response = await fetchJson(`https://api.sbis.ru/retail/v2/nomenclature/list?${query}`, {
              method: 'GET', headers: { 'X-SBISAccessToken': auth.token },
            }, 'SBIS catalogue preview');
            const data = object(response);
            const items = Array.isArray(response) ? response : data?.nomenclatures ?? data?.items ?? data?.result;
            const more = object(data?.outcome)?.hasMore ?? data?.hasMore;
            if (!Array.isArray(items) || (more !== undefined && typeof more !== 'boolean')) {
              throw new RequestError(502, 'Unexpected SBIS catalogue response.');
            }
            if (items.length) {
              const signature = JSON.stringify(items);
              if (catalogPages.has(signature)) throw new RequestError(502, 'SBIS catalogue repeated a page; result is incomplete.');
              catalogPages.add(signature);
            } else if (more === true) {
              throw new RequestError(502, 'SBIS catalogue returned an empty page with hasMore=true.');
            }
            catalogItems.push(...items);
            if (more === false || items.length === 0 || (more === undefined && items.length < PAGE_SIZE)) {
              catalog = { priceListId: selected.id, priceListName: selected.name, count: catalogItems.length, items: catalogItems };
              break;
            }
          }
          if (!catalog) throw new RequestError(502, 'SBIS catalogue pagination limit reached; result is incomplete.');
        }
        return reply(200, {
          ok: true, readOnly: true, pointId: POINT_ID, actualDate: date,
          count: priceLists.length, priceLists, matches, catalog,
        });
      }
    }
    throw new RequestError(502, 'SBIS pagination limit reached; result is incomplete.');
  } catch (error) {
    // Never return/log upstream bodies, tokens, headers or credential values.
    if (error instanceof RequestError) return reply(error.status, { ok: false, error: error.message, authDiagnostics });
    return reply(502, { ok: false, error: 'SBIS request failed or timed out.' });
  }
});
