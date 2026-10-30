const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeBase(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) return null;
    url.hash = ''; url.search = '';
    return url;
  } catch (_) { return null; }
}

export function productShareUrl(productId, { platform = 'native', webOrigin = null, publicBase = process.env.EXPO_PUBLIC_APP_WEB_URL } = {}) {
  if (!UUID.test(productId || '')) return null;
  const id = productId.toLowerCase();
  const base = safeBase(publicBase) || (platform === 'web' ? safeBase(webOrigin) : null);
  if (base) { base.hash = `product/${id}`; return base.toString(); }
  return `sbl://product/${id}`;
}

export function parseProductLink(value, { webOrigin = null, publicBase = process.env.EXPO_PUBLIC_APP_WEB_URL } = {}) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    let id;
    if (url.protocol === 'sbl:' && url.hostname === 'product' && !url.username && !url.password && !url.search && !url.hash) {
      id = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    } else {
      const bases = [safeBase(webOrigin), safeBase(publicBase)].filter(Boolean);
      if (!bases.some(base => base.origin === url.origin && base.pathname === url.pathname) || url.search) return null;
      const match = /^#product\/([^/]+)$/.exec(url.hash);
      id = match?.[1];
    }
    return UUID.test(id || '') ? id.toLowerCase() : null;
  } catch (_) { return null; }
}

export async function shareProduct(product, { platform, webOrigin, share, copy, publicBase } = {}) {
  const url = productShareUrl(product?.id, { platform, webOrigin, publicBase });
  if (!url) throw new Error('У этой позиции пока нет ссылки.');
  const title = product.displayName || product.name || 'Напиток SBL';
  if (platform === 'web' && copy) { await copy(url); return { copied: true, url }; }
  if (share) { await share({ title: `${title} · SBL`, message: `${title} · SBL\n${url}`, url }); return { copied: false, url }; }
  throw new Error('Не удалось открыть отправку ссылки.');
}
