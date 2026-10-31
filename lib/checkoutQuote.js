import { canonicalModifiers, optionCartKey, makeCartItem, compareCartKeys } from './cartOptions.js';

export function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error('INVALID_PAYLOAD: Некорректная сумма.');
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

export function buildCheckoutQuote(items, payable) {
  const grouped = new Map();
  for (const item of items) {
    const price = money(item.baseUnitPrice ?? item.unitPrice);
    const modifiers = canonicalModifiers(item.modifiers).map(m => [m.id, m.quantity, money(m.unitPrice)]);
    const key = optionCartKey(item.id, item.modifiers, item.preparationNote);
    const previous = grouped.get(key);
    if (previous && (previous[3] !== price || JSON.stringify(previous[4]) !== JSON.stringify(modifiers))) throw new Error('INVALID_PAYLOAD: Разные цены одной позиции.');
    grouped.set(key, [key, item.id, (previous?.[2] || 0) + item.qty, price, modifiers]);
  }
  return { version: 2, items: [...grouped.values()].sort((a, b) => compareCartKeys(a[0], b[0])), payable: money(payable) };
}

export function refreshCartPrices(cart, products) {
  const byId = new Map(products.map(product => [product.id, product]));
  return Object.fromEntries(Object.entries(cart).flatMap(([key, item]) => {
    const product = byId.get(item.id);
    if (!product || product.isModifier) return [];
    const modifiers = canonicalModifiers(item.modifiers);
    // A stopped addition removes this line; silently changing its recipe is unsafe.
    if (modifiers.some(m => !byId.get(m.id)?.isModifier || byId.get(m.id)?.isAvailable === false)) return [];
    const refreshed = modifiers.map(m => ({ ...m, name: m.name || byId.get(m.id).name, unitPrice: byId.get(m.id).price }));
    const next = makeCartItem(product, refreshed, item.qty, item.preparationNote);
    return next ? [[next.key, next]] : [];
  }));
}
