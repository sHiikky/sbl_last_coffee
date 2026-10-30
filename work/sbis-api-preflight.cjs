// Read-only Saby preflight: service authentication, point, price lists and
// a single catalogue preview page. No orders, payments or database writes.
// Credentials stay in memory and are never included in the report.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const POINT_ID = 240;
const APP_ID = '4402856400799386';
const API = 'https://api.sbis.ru';
const AUTH_HOST = process.argv.includes('--saby') ? 'online.saby.ru' : 'online.sbis.ru';
const report = { readOnly: true, pointId: POINT_ID, authHost: AUTH_HOST, checkedAt: new Date().toISOString(), checks: [] };
const secretValues = new Set();

function credentials() {
  const fields = { app_client_id: process.env.SBIS_APP_CLIENT_ID,
    app_secret: process.env.SBIS_APP_SECRET, secret_key: process.env.SBIS_SECRET_KEY };
  if (!Object.values(fields).every(value => typeof value === 'string' && value.trim())) throw new Error('CREDENTIALS_UNAVAILABLE');
  for (const key of Object.keys(fields)) fields[key] = fields[key].trim();
  if (fields.app_client_id !== APP_ID) throw new Error('APP_ID_MISMATCH');
  Object.values(fields).forEach(value => secretValues.add(value));
  return fields;
}

async function jsonRequest(url, options, operation) {
  let response;
  try { response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(25_000) }); }
  catch { throw new Error(`${operation}: NETWORK_OR_TIMEOUT`); }
  // Never echo raw upstream bodies. A recognised, redacted auth error helps
  // distinguish a stale service key from a network problem without exposing it.
  if (!response.ok) {
    if (operation === 'AUTH') {
      const data = await response.json().catch(() => null);
      const candidate = data?.error?.message ?? data?.error_description ?? data?.message ?? data?.error;
      if (typeof candidate === 'string') {
        let message = candidate;
        for (const value of secretValues) message = message.split(value).join('[redacted]');
        report.authError = message.replace(/eyJ[A-Za-z0-9_.-]+|sb_secret_[A-Za-z0-9_-]+/g, '[redacted]')
          .replace(/[\r\n]+/g, ' ').slice(0, 400);
      }
    }
    throw new Error(`${operation}: HTTP_${response.status}`);
  }
  try { return await response.json(); }
  catch { throw new Error(`${operation}: INVALID_JSON`); }
}

function arrayResult(data, names) {
  if (Array.isArray(data)) return data;
  for (const name of names) if (Array.isArray(data?.[name])) return data[name];
  throw new Error('UNRECOGNISED_RESPONSE_SHAPE');
}

async function main() {
  const auth = await jsonRequest(`https://${AUTH_HOST}/oauth/service/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials()),
  }, 'AUTH');
  if (typeof auth?.token !== 'string' || !auth.token) throw new Error('AUTH: TOKEN_MISSING');
  secretValues.add(auth.token);
  report.checks.push({ test: 'service authentication', result: 'PASS', confirmedAppId: true });
  const get = (route, params) => jsonRequest(`${API}${route}?${new URLSearchParams(params)}`, {
    method: 'GET', headers: { 'X-SBISAccessToken': auth.token },
  }, route);

  const points = arrayResult(await get('/retail/point/list', {
    pointId: String(POINT_ID), product: 'delivery', withPrices: 'true', withSchedule: 'true', page: '0', pageSize: '500',
  }), ['salesPoints', 'items', 'result']);
  const matchingPoints = points.filter(point => String(point.id) === String(POINT_ID));
  report.checks.push({ test: 'point available via delivery API', result: matchingPoints.length ? 'PASS' : 'FAIL',
    points: matchingPoints.map(point => ({ id: point.id, name: point.name, product: point.product,
      prices: point.prices, defaultPriceLists: point.defaultPriceLists })) });

  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tomsk', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  report.actualDate = date;
  const lists = new Map(), pageSignatures = new Set();
  let complete = false;
  for (let page = 0; page < 40; page++) {
    const data = await get('/retail/nomenclature/price-list', {
      pointId: String(POINT_ID), actualDate: date, page: String(page), pageSize: '25',
    });
    const items = arrayResult(data, ['priceLists', 'price_lists', 'items', 'result']);
    const more = data?.outcome?.hasMore ?? data?.hasMore;
    if (more !== undefined && typeof more !== 'boolean') throw new Error('PRICE_LISTS: INVALID_PAGINATION');
    if (!items.length && more === true) throw new Error('PRICE_LISTS: EMPTY_NONFINAL_PAGE');
    const signature = JSON.stringify(items);
    if (items.length && pageSignatures.has(signature)) throw new Error('PRICE_LISTS: REPEATED_PAGE');
    pageSignatures.add(signature);
    for (const item of items) {
      const id = item.id ?? item.priceListId;
      if (id === undefined || typeof item.name !== 'string') throw new Error('PRICE_LISTS: INVALID_ITEM');
      lists.set(String(id), { id, name: item.name });
    }
    if (more === false || !items.length || (more === undefined && items.length < 25)) { complete = true; break; }
  }
  if (!complete) throw new Error('PRICE_LISTS: PAGE_LIMIT');
  report.priceLists = [...lists.values()];
  const normalize = value => value.toLocaleLowerCase('ru').replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  const matches = report.priceLists.filter(item => normalize(item.name) === 'осень зима 2026');
  report.checks.push({ test: 'selected menu resolves to one active price list',
    result: matches.length === 1 ? 'PASS' : 'FAIL', matches });
  if (matches.length === 1) {
    const priceListId = matches[0].id;
    const data = await get('/retail/v2/nomenclature/list', {
      pointId: String(POINT_ID), priceListId: String(priceListId), page: '0', pageSize: '25',
    });
    const items = arrayResult(data, ['nomenclatures', 'items', 'result']);
    report.cataloguePreview = { priceListId, page: 0, pageSize: 25, returnedRows: items.length,
      hasMore: data?.outcome?.hasMore ?? data?.hasMore ?? null,
      sample: items.slice(0, 8).map(item => ({ id: item.id, externalId: item.externalId,
        hierarchicalId: item.hierarchicalId, name: item.name, cost: item.cost })) };
  }
  report.orderCreationTested = false;
  report.note = 'Read checks do not prove order-creation permission or remote idempotency.';
}

main().catch(error => {
  // Only generated, allowlisted error strings can reach the report.
  const value = String(error?.message ?? '');
  report.error = /^[A-Z_]+(?:: [A-Z_0-9]+)?$/.test(value) || /^\/retail\/[a-z/0-9-]+: (HTTP_\d+|NETWORK_OR_TIMEOUT|INVALID_JSON)$/.test(value)
    ? value : 'PREFLIGHT_FAILED';
  process.exitCode = 1;
}).finally(() => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`));
