'use strict';
// Inspect a pasted read-only Saby catalogue and compare it with public product
// data from this application's Supabase project. GET requests only; no login,
// catalogue synchronization, orders, payments or customer data access.
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Provide the saved catalogue JSON file path.');
  const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (data.ok !== true || data.readOnly !== true || data.pointId !== 240
      || data.catalog?.priceListId !== 67 || !Array.isArray(data.catalog.items)
      || data.catalog.count !== data.catalog.items.length) throw new Error('Unexpected catalogue or incomplete result.');
  const folders = new Map(data.catalog.items.filter(item => item.isParent).map(item => [item.hierarchicalId, item]));
  const rowsById = new Map();
  const duplicates = [];
  for (const item of data.catalog.items.filter(item => !item.isParent)) {
    if (!Number.isSafeInteger(item.id) || !item.externalId) throw new Error('A catalogue item has no stable identity.');
    if (rowsById.has(item.id)) {
      const previous = rowsById.get(item.id);
      duplicates.push({ id: item.id, identical: JSON.stringify(previous) === JSON.stringify(item) });
      if (JSON.stringify(previous) !== JSON.stringify(item)) throw new Error('Conflicting duplicate catalogue item.');
    }
    rowsById.set(item.id, item);
  }
  function folderPath(item) {
    const result = [], seen = new Set();
    let id = item.hierarchicalParent;
    while (id != null) {
      if (seen.has(id) || !folders.has(id)) throw new Error('Incomplete or cyclic catalogue hierarchy.');
      seen.add(id);
      const folder = folders.get(id);
      result.unshift(folder.name);
      id = folder.hierarchicalParent;
    }
    return result;
  }
  const summary = {
    readOnly: true, pointId: 240, priceListId: 67, priceListName: data.catalog.priceListName,
    capturedDate: data.actualDate, totalRows: data.catalog.items.length, folders: folders.size,
    uniqueProducts: rowsById.size, uniquePricedProducts: [...rowsById.values()].filter(item => typeof item.cost === 'number').length,
    duplicates, requiredModifierProducts: [...rowsById.values()].filter(item =>
      item.modifiers?.some(modifier => modifier.isParent && Number(modifier.minCount) > 0)).map(item => ({
        id: item.id, name: item.name,
        groups: item.modifiers.filter(modifier => modifier.isParent && Number(modifier.minCount) > 0)
          .map(modifier => ({ name: modifier.name, minCount: modifier.minCount, maxCount: modifier.maxCount })),
      })),
  };
  const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8').split(/\r?\n/)
    .filter(line => /^[A-Z_]+=/.test(line)).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
  if (env.EXPO_PUBLIC_SUPABASE_URL !== 'https://vxefueynagwuavlyeiqc.supabase.co'
      || !env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) throw new Error('Unexpected public project configuration.');
  const query = new URLSearchParams({ select: 'id,sbis_id,name,price,is_visible,category,menu_category,menu_subcategory', order: 'sbis_id', limit: '1000' });
  const response = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/products?${query}`, {
    method: 'GET', redirect: 'error', headers: { apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Public products read: HTTP ${response.status}`);
  const products = await response.json();
  if (!Array.isArray(products) || products.length >= 1000) throw new Error('Unexpected or possibly truncated public products result.');
  // Public RLS may hide rows; this is the API-visible set, not an admin dump.
  const missing = [], unpriced = [], changedPrices = [], modifiedProducts = [], hierarchyChanges = [];
  for (const product of products) {
    const item = rowsById.get(product.sbis_id);
    const base = { sbisId: product.sbis_id, name: product.name, visible: product.is_visible };
    if (!item) { missing.push(base); continue; }
    const itemPath = folderPath(item);
    if (itemPath[0] !== product.category) hierarchyChanges.push({ ...base, oldCategory: product.category, newPath: itemPath });
    if (typeof item.cost !== 'number') unpriced.push(base);
    else if (Number(product.price) !== item.cost) changedPrices.push({ ...base, oldPrice: Number(product.price), newPrice: item.cost });
    const required = item.modifiers?.filter(modifier => modifier.isParent && Number(modifier.minCount) > 0) ?? [];
    if (required.length) modifiedProducts.push({ ...base, groups: required.map(group => group.name) });
  }
  const appSbisIds = new Set(products.map(item => item.sbis_id));
  summary.publicProductComparison = {
    fetchedRows: products.length, explicitlyVisibleRows: products.filter(item => item.is_visible).length,
    missingFromNewMenu: missing, noPriceInNewMenu: unpriced, changedPrices,
    requiredModifierProducts: modifiedProducts, hierarchyChanges,
    newPricedProducts: [...rowsById.values()].filter(item => typeof item.cost === 'number' && !appSbisIds.has(item.id))
      .map(item => ({ sbisId: item.id, name: item.name, price: item.cost, path: folderPath(item) })),
  };
  const output = path.join(__dirname, 'sbis-catalog-67-audit.json');
  fs.writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ report: output, totalRows: summary.totalRows, uniqueProducts: summary.uniqueProducts,
    uniquePricedProducts: summary.uniquePricedProducts, duplicateRows: duplicates.length,
    requiredModifierProducts: summary.requiredModifierProducts.length,
    publicProductComparison: { fetchedRows: products.length, explicitlyVisibleRows: summary.publicProductComparison.explicitlyVisibleRows,
      missing: missing.length, missingVisible: missing.filter(item => item.visible).length,
      changedPrices: changedPrices.length, changedVisiblePrices: changedPrices.filter(item => item.visible).length,
      requiredModifiers: modifiedProducts.length, requiredModifiersVisible: modifiedProducts.filter(item => item.visible).length,
      newPricedProducts: summary.publicProductComparison.newPricedProducts.length,
      missingSample: missing.filter(item => item.visible).slice(0, 6),
      changedPriceSample: changedPrices.filter(item => item.visible).slice(0, 6),
      requiredSample: modifiedProducts.filter(item => item.visible).slice(0, 6),
    } }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
