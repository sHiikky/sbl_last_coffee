export function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error('INVALID_PAYLOAD: Некорректная сумма.');
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

export function buildCheckoutQuote(items, payable) {
  const grouped = new Map();
  for (const item of items) {
    const price = money(item.unitPrice);
    const previous = grouped.get(item.id);
    if (previous && previous[2] !== price) throw new Error('INVALID_PAYLOAD: Разные цены одного товара.');
    grouped.set(item.id, [item.id, (previous?.[1] || 0) + item.qty, price]);
  }
  return { items: [...grouped.values()].sort((a, b) => a[0].localeCompare(b[0])), payable: money(payable) };
}

export function refreshCartPrices(cart, products) {
  const byId = new Map(products.map(product => [product.id, product]));
  return Object.fromEntries(Object.entries(cart).flatMap(([key, item]) => {
    const product = byId.get(item.id);
    return product ? [[key, { ...item, unitPrice: product.price, name: product.name, menuCategory: product.menuCategory }]] : [];
  }));
}
