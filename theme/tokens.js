// theme/tokens.js — единая система токенов v2 (премиальный редизайн SBL)
export const colors = {
  surface0: '#ECEAE5',
  surface1: '#F8F7F4',
  surface2: '#FFFFFF',
  surface3: '#111111',
  surface3Alt: '#171717',

  textPrimary:            '#0C0C0C',
  textSecondary:          '#777570',
  textMuted:              '#A3A09A',
  textOnDark:             '#FFFFFF',
  textOnDarkMuted:        'rgba(255,255,255,0.42)',
  textOnDarkFaint:        'rgba(255,255,255,0.28)',

  border:                 'rgba(12,12,12,0.08)',
  borderStrong:           'rgba(12,12,12,0.16)',
  borderOnDark:           'rgba(255,255,255,0.08)',

  accent:                 '#E8500A',
  accentPressed:          '#C94105',
  accentSoft:             'rgba(232,80,10,0.12)',

  success:                '#268A58',
  danger:                 '#C9443D',
  disabled:               '#D9D6D0',
  skeleton:               '#E5E2DC',

  silverLight:            '#F7F7F5',
  silverMid:              '#E7E8EA',
  silverDeep:             '#C9CCD1',
  silverShadow:           '#AEB3BA',
  silverHighlight:        '#FFFFFF',

  // Алиасы для обратной совместимости со старыми экранами
  background:             '#ECEAE5',
  surface:                '#F8F7F4',
  surfaceElevated:        '#FFFFFF',
  darkSurface:            '#111111',
  darkSurfaceSecondary:   '#171717',
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32, xxxl: 40,
};

export const radius = {
  small: 10, medium: 16, large: 22, xlarge: 28, pill: 999,
};

export const shadow = {
  level1: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.035,
    shadowRadius: 14,
    elevation: 1,
  },
  level2: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.055,
    shadowRadius: 24,
    elevation: 2,
  },
  level3: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.09,
    shadowRadius: 34,
    elevation: 4,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 2,
  },
  dark: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 6,
  },
  button: {
    shadowColor: '#E8500A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 4,
  },
};

export const materials = {
  matteBackground: {
    backgroundColor: colors.surface0,
  },
  whiteSurface: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blackAcrylic: {
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  silverChrome: {
    backgroundColor: colors.silverMid,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
  },
};

export const typography = {
  eyebrow:      { fontSize: 11, fontWeight: '600', letterSpacing: 2.5, textTransform: 'uppercase' },
  caption:      { fontSize: 12, fontWeight: '400' },
  body:         { fontSize: 15, fontWeight: '400' },
  cardTitle:    { fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 21, fontWeight: '700' },
  screenTitle:  { fontSize: 30, fontWeight: '700' },
  hero:         { fontSize: 34, fontWeight: '700' },
};

// Радужный спектр голографического эффекта: синий → белый → жёлтый → красный → розовый → снова синий
export const holoSpectrum = [
  'rgba(58,110,255,0.18)',
  'rgba(255,255,255,0.55)',
  'rgba(255,209,64,0.5)',
  'rgba(255,59,48,0.46)',
  'rgba(255,72,196,0.46)',
  'rgba(58,110,255,0.18)',
];

// Серебряная база — металлическая поверхность
export const silverBase = [
  '#FBFBFA',
  '#EEF1F4',
  '#D6DBE2',
  '#B4BBC5',
  '#FFFFFF',
];

export function getHorizontalPadding(width) {
  return width < 360 ? spacing.lg : spacing.xl;
}

// Тёмный премиальный режим экрана профиля SBL — отдельная палитра,
// не путать с обычным darkSurface (используется на других тёмных фрагментах).
export const darkProfile = {
  background: '#050505',
  backgroundTop: '#030303',
  backgroundCenter: '#080808',
  surface: '#0C0C0D',
  surfaceElevated: '#111113',
  border: 'rgba(255,255,255,0.12)',
  borderStrong: 'rgba(255,255,255,0.2)',
  text: '#F5F5F5',
  textSecondary: 'rgba(255,255,255,0.55)',
  divider: 'rgba(255,255,255,0.08)',
  pressed: 'rgba(255,255,255,0.04)',
};

// Бренд-тексты — единственный источник копирайта
export const brand = {
  name: 'SBL',
  tagline: 'Кофе с блеском',
  fullName: 'кофе от SBLESKOM',
};
