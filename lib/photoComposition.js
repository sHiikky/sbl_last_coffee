import savedCompositions from '../data/photo-compositions.json';

const PROJECT_REF = 'vxefueynagwuavlyeiqc';
const finiteInRange = (value, min, max) => typeof value === 'number'
  && Number.isFinite(value) && value >= min && value <= max;

export function validPhotoFrame(frame) {
  return !!frame && ['contain', 'cover'].includes(frame.fit)
    && finiteInRange(frame.zoom, 0.5, 1.8)
    && finiteInRange(frame.offsetX, -35, 35)
    && finiteInRange(frame.offsetY, -35, 35);
}

// Composition is presentation metadata, never a replacement image URL.
// A changed catalog image invalidates the old crop instead of misapplying it.
export function getPhotoComposition(product, view = 'detail', manifest = savedCompositions) {
  const isCard = view === 'card';
  const legacyZoom = isCard
    ? product?.quickZoom ?? product?.cardZoom ?? product?.imageZoom ?? 1
    : product?.detailZoom ?? 0.9;
  const legacyFit = isCard ? product?.cardContentFit : product?.imageFit;
  const defaults = {
    fit: ['contain', 'cover'].includes(legacyFit) ? legacyFit : 'contain',
    zoom: finiteInRange(legacyZoom, 0.5, 1.8) ? legacyZoom : (isCard ? 1 : 0.9),
    offsetX: 0,
    offsetY: 0,
  };
  const sourceUrl = typeof product?.image === 'string' ? product.image : product?.image?.uri;
  if (!sourceUrl || !product?.id || !['card', 'detail'].includes(view)
    || manifest?.type !== 'sbl-photo-composition' || manifest?.version !== 1
    || manifest?.projectRef !== PROJECT_REF || !Array.isArray(manifest?.products)
    || manifest.products.length > 1000) return defaults;
  const matches = manifest.products.filter(row => row?.id === product.id);
  if (matches.length !== 1 || matches[0].sourceUrl !== sourceUrl) return defaults;
  const frame = matches[0][view];
  return validPhotoFrame(frame)
    ? { fit: frame.fit, zoom: frame.zoom, offsetX: frame.offsetX, offsetY: frame.offsetY }
    : defaults;
}

export function photoTranslation(frame, layout) {
  return {
    x: Number.isFinite(layout?.width) ? layout.width * (frame?.offsetX || 0) / 100 : 0,
    y: Number.isFinite(layout?.height) ? layout.height * (frame?.offsetY || 0) / 100 : 0,
  };
}
