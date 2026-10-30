// A local original is not enough: the customer catalog needs a connected photo.
// Do not probe the network here: a temporary outage must not erase the menu.
export function hasProductPhoto(product) {
  const source = product?.image;
  if (Number.isInteger(source) && source > 0) return true; // bundled RN asset
  const uri = typeof source?.uri === 'string' ? source.uri.trim() : '';
  if (!uri) return false;
  try {
    const url = new URL(uri);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return false;
    // These catalog links return an HTML page, not an image (photo audit).
    if (url.hostname.toLowerCase() === 'api.sbis.ru' && /^\/img\/?$/i.test(url.pathname)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

export function selectMenuProducts(products = []) {
  return products.filter(product => product && !product.isModifier
    && product.isAvailable !== false && hasProductPhoto(product));
}

// A refresh can remove the last photographed item from a selected section.
export function resolveSubcategoryFilter(subcategories, selected) {
  return subcategories.includes(selected) ? selected : 'all';
}
