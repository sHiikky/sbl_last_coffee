// Reviewed display copies only: source photos and Storage records stay intact.
// A new catalog URL automatically falls back to its own original image.
const photos = {
  'breakfast-constructor-7736456714.webp': require('../assets/product-cutouts/breakfast.png'),
  'orange-punch-38d9e5b68c.webp': require('../assets/product-cutouts/orange-punch.png'),
};
export function productPhotoSource(source) {
  const uri = typeof source === 'string' ? source : source?.uri;
  if (!uri) return source;
  try {
    const url = new URL(uri);
    const prefix = url.origin === 'https://31.31.207.216' ? '/coffee' : url.origin === 'https://vxefueynagwuavlyeiqc.supabase.co' ? '' : null;
    if (prefix === null) return source;
    const path = prefix + '/storage/v1/object/public/product-photos/';
    if (!url.pathname.startsWith(path)) return source;
    return photos[url.pathname.slice(path.length)] || source;
  } catch { return source; }
}
