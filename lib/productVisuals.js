import manifest from '../data/product-palettes.json';

export function getProductVisual(product, data = manifest) {
  const source = typeof product?.image?.uri === 'string' ? product.image.uri : null;
  const entry = source && data?.version === 1 ? data.photos?.[source] : null;
  const valid = entry && Number.isFinite(entry.hue) && entry.hue >= 0 && entry.hue < 360
    && Number.isFinite(entry.saturation) && entry.saturation >= 26 && entry.saturation <= 42;
  const hue = valid ? entry.hue : 32, saturation = valid ? entry.saturation : 30;
  const hsl=(s,l)=>`hsl(${hue}, ${s}%, ${l}%)`;
  return {
    hue, saturation, source,
    cutout: valid && entry.cutout === 'latte' ? 'latte' : null,
    base: [hsl(saturation, 29), hsl(27, 20), hsl(23, 11)],
    glow: [hsl(saturation, 37), 'rgba(0,0,0,0)'],
    halo: [hsl(38, 53), 'rgba(0,0,0,0)'],
    footer: hsl(27, 13),
  };
}
