const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// A palette is presentation metadata. Pale/neutral photos use a reviewed
// fallback rather than turning white milk or a silver reflection into colour.
export function derivePhotoPalette(pixels, { fallback = 32, toneRange } = {}) {
  const bins = Array.from({ length: 36 }, () => ({ weight: 0, count: 0, x: 0, y: 0, saturation: 0 }));
  let allWeight = 0, candidates = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    if (alpha < .7) continue;
    const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min, light = (max + min) / 2;
    if (chroma < .04 || light < .1 || light > .86) continue;
    const saturation = chroma / (1 - Math.abs(2 * light - 1));
    if (saturation < .15) continue;
    let hue = (max === r ? (g - b) / chroma : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4) * 60;
    hue = (hue + 360) % 360;
    const weight = alpha * Math.sqrt(chroma) * (.5 + saturation) * (1 - Math.abs(light - .45) * .6);
    const bin = bins[Math.floor(hue / 10)];
    bin.weight += weight; bin.count++; bin.x += Math.cos(hue * Math.PI / 180) * weight;
    bin.y += Math.sin(hue * Math.PI / 180) * weight; bin.saturation += saturation * weight;
    allWeight += weight; candidates++;
  }
  let dominant = null;
  for (let i = 0; i < 36; i++) {
    const group = [bins[(i + 35) % 36], bins[i], bins[(i + 1) % 36]].reduce((a, b) => ({
      weight: a.weight + b.weight, count: a.count + b.count, x: a.x + b.x,
      y: a.y + b.y, saturation: a.saturation + b.saturation,
    }), { weight: 0, count: 0, x: 0, y: 0, saturation: 0 });
    if (!dominant || group.weight > dominant.weight) dominant = group;
  }
  const confident = candidates >= Math.max(24, pixels.length / 4 * .025)
    && dominant.count >= 20 && dominant.weight / allWeight >= .22;
  let hue = confident ? (Math.atan2(dominant.y, dominant.x) * 180 / Math.PI + 360) % 360 : fallback;
  if (toneRange) hue = clamp(hue, toneRange[0], toneRange[1]);
  return {
    hue,
    saturation: confident ? clamp(dominant.saturation / dominant.weight * 64, 26, 42) : 34,
    fromPhoto: confident,
  };
}
