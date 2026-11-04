// A cart line is a product and a canonical set of additions, per one unit.
export function isModifierAllowed(product, id) {
  return product?.allowedModifierIds == null || product.allowedModifierIds.includes(id);
}

export function canonicalModifiers(modifiers = []) {
  const grouped = new Map();
  for (const modifier of modifiers) {
    const id = String(modifier.id || modifier.product_id || '').toLowerCase();
    const quantity = Number(modifier.quantity ?? modifier.qty ?? 1);
    if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new Error('INVALID_MODIFIERS: Некорректное количество добавки.');
    }
    if (grouped.has(id)) throw new Error('INVALID_MODIFIERS: Добавка указана дважды.');
    grouped.set(id, { ...modifier, id, quantity, unitPrice: Number(modifier.unitPrice ?? modifier.unit_price ?? modifier.price ?? 0) });
  }
  if (grouped.size > 20) throw new Error('INVALID_MODIFIERS: Не более 20 разных добавок.');
  return [...grouped.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function normalizePreparationNote(value = '') {
  const note = String(value ?? '').replace(/\r\n?/g, '\n').replace(/^[ \n\t]+|[ \n\t]+$/g, '');
  if (Array.from(note).length > 200 || /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(note)) throw new Error('Пожелание к позиции: до 200 символов, без управляющих знаков.');
  return note;
}

export function compareCartKeys(a, b) {
  const left = Array.from(a, c => c.codePointAt(0));
  const right = Array.from(b, c => c.codePointAt(0));
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] - right[i];
  return left.length - right.length;
}

export function optionCartKey(id, modifiers = [], preparationNote = '') {
  const note = normalizePreparationNote(preparationNote);
  return String(id).toLowerCase() + canonicalModifiers(modifiers).map(m => `|${m.id}x${m.quantity}`).join('') + (note ? `|note:${note}` : '');
}

export function additionsTotal(modifiers = []) {
  return Math.round(canonicalModifiers(modifiers).reduce((sum, m) => sum + m.unitPrice * m.quantity, 0) * 100) / 100;
}

export function makeCartItem(product, modifiers = [], qty = 1, preparationNote = '') {
  if (!product || product.isAvailable === false || product.isModifier || !Number.isInteger(qty) || qty < 1 || qty > 99) return null;
  const selected = canonicalModifiers(modifiers);
  if (selected.some(modifier => !isModifierAllowed(product, modifier.id))) return null;
  const baseUnitPrice = Number(product.price);
  if (!Number.isFinite(baseUnitPrice) || baseUnitPrice < 0 || selected.some(m => !Number.isFinite(m.unitPrice) || m.unitPrice < 0)) return null;
  return {
    key: optionCartKey(product.id, selected, preparationNote), id: product.id, name: product.name,
    image: product.image, imageFit: product.imageFit, imagePosition: product.imagePosition,
    category: product.category, menuCategory: product.menuCategory,
    baseUnitPrice, unitPrice: Math.round((baseUnitPrice + additionsTotal(selected)) * 100) / 100,
    modifiers: selected, preparationNote: normalizePreparationNote(preparationNote), qty,
  };
}

export function formatAdditions(modifiers = []) {
  return canonicalModifiers(modifiers).map(m => `${m.name || 'Добавка'}${m.quantity > 1 ? ` × ${m.quantity}` : ''}`).join(', ');
}

export function cartMatchesSnapshot(cart, snapshotItems) {
  if (!Array.isArray(snapshotItems)) return false;
  const canonical = items => {
    const grouped = new Map();
    for (const item of items) {
      const key = optionCartKey(item.id, item.modifiers, item.preparationNote);
      grouped.set(key, (grouped.get(key) || 0) + Number(item.qty));
    }
    return [...grouped.entries()].sort((a, b) => compareCartKeys(a[0], b[0]));
  };
  try { return JSON.stringify(canonical(Object.values(cart))) === JSON.stringify(canonical(snapshotItems)); }
  catch { return false; }
}
