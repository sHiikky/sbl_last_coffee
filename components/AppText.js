import React, { createContext, forwardRef, useContext } from 'react';
import { Text as NativeText, StyleSheet } from 'react-native';
import { fontFamilies } from '../theme/fontFaces';

export const FontReadyContext = createContext(false);
const TextFaceContext = createContext({ weight: '400', fontStyle: 'normal' });

export function resolveTextFace(style, inherited = { weight: '400', fontStyle: 'normal' }, ready = true) {
  const flat = StyleSheet.flatten(style) || {};
  const weight = flat.fontWeight ?? inherited.weight;
  const fontStyle = flat.fontStyle ?? inherited.fontStyle;
  // An explicit non-brand font (e.g. an icon font) remains untouched.
  if (flat.fontFamily && !Object.values(fontFamilies).includes(flat.fontFamily)) {
    return { inherited: { weight, fontStyle }, style: {} };
  }
  if (!ready) return { inherited: { weight, fontStyle }, style: { fontFamily: undefined, fontWeight: weight, fontStyle } };
  const numeric = weight === 'bold' ? 700 : weight === 'normal' ? 400 : Number(weight);
  const resolved = Math.max(400, Math.min(900, Math.round((numeric || 400) / 100) * 100));
  return {
    inherited: { weight, fontStyle },
    // The selected file already contains this weight; don't ask native to synthesize bold.
    style: { fontFamily: fontFamilies[resolved], fontWeight: 'normal', fontStyle },
  };
}

const AppText = forwardRef(function AppText({ style, ...props }, ref) {
  const ready = useContext(FontReadyContext);
  const inherited = useContext(TextFaceContext);
  const face = resolveTextFace(style, inherited, ready);
  return (
    <TextFaceContext.Provider value={face.inherited}>
      <NativeText {...props} ref={ref} style={[style, face.style]} />
    </TextFaceContext.Provider>
  );
});
export default AppText;
