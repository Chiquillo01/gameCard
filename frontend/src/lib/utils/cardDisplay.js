// Single source of truth for how a card's raw data (category/rarity/attribute/subtype) maps to
// display: icon, color, label. CardItem, CardModal and the filter menu all import from here
// instead of keeping their own copies — those copies drifted from the real card data before
// (English keys like "fire"/"dragon" against cards that actually store "Fuego"/"Dragón"), which
// silently broke every icon and filter except rarity.
import {
  FaFireAlt,
  FaWater,
  FaMoon,
  FaMountain,
  FaSun,
  FaWind,
  FaInfinity,
  FaSnowflake,
  FaBolt,
  FaHourglassHalf,
  FaSkullCrossbones,
} from 'react-icons/fa';
import { FaArrowsRotate } from 'react-icons/fa6';
import {
  GiFastArrow,
  GiOakLeaf,
  GiMetalBar,
  GiCrystalBall,
  GiThirdEye,
  GiCrystalBars,
  GiBlackHoleBolas,
  GiVolcano,
  GiSoundWaves,
  GiTornado,
} from 'react-icons/gi';
import { FiHexagon } from 'react-icons/fi';
import { GoTools } from 'react-icons/go';

// Card attributes are stored in Spanish exactly as authored on the card (e.g. "Fuego", "Natura").
export const ATTRIBUTE_ICONS = {
  Fuego: FaFireAlt,
  Agua: FaWater,
  Tierra: FaMountain,
  Oscuridad: FaMoon,
  Luz: FaSun,
  Viento: FaWind,
  Natura: GiOakLeaf,
  Metal: GiMetalBar,
  Hielo: FaSnowflake,
  Electricidad: FaBolt,
  Tiempo: FaHourglassHalf,
  Arcano: GiCrystalBall,
  Veneno: FaSkullCrossbones,
  Hipnosis: GiThirdEye,
  Cristal: GiCrystalBars,
  Gravedad: GiBlackHoleBolas,
  Lava: GiVolcano,
  Sonido: GiSoundWaves,
  Tormenta: GiTornado,
};

// Designer-provided color per monster attribute — used to color the attribute badge/icon so
// each element reads at a glance instead of everything sharing the rarity color.
export const ATTRIBUTE_COLORS = {
  Agua: '#0C29E8',
  Arcano: '#200733',
  Cristal: '#B4B7D4',
  Electricidad: '#F7F21E',
  Fuego: '#EB0707',
  Gravedad: '#382107',
  Hielo: '#42E7ED',
  Hipnosis: '#51F09B',
  Lava: '#990F0F',
  Luz: '#F5F7D2',
  Metal: '#999999',
  Natura: '#316B2F',
  Oscuridad: '#000000',
  Sonido: '#1A4B6B',
  Tiempo: '#F584F0',
  Tierra: '#A38A58',
  Tormenta: '#F5B845',
  Veneno: '#B745F5',
  Viento: '#33F5DB',
};

// Apoyo (support) subtype -> icon. `type`/`subtype` store these as the internal English code.
export const SUPPORT_SUBTYPE_ICONS = {
  normal: FiHexagon,
  continuous: FaInfinity,
  instant: GiFastArrow,
  equipment: GoTools,
  counter: FaArrowsRotate,
  field: FaMountain,
};

export const SUPPORT_SUBTYPE_LABELS = {
  normal: 'Normal',
  continuous: 'Continuo',
  instant: 'Veloz',
  equipment: 'Equipo',
  counter: 'Contraataque',
  field: 'Reino',
};

export const RARITY_COLORS = {
  legendary: '#ae8d0b',
  epic: '#7d3fbf',
  rare: '#8a8a8a',
  common: '#4a3220',
};

export const RARITY_LABELS = {
  legendary: 'Legendaria',
  epic: 'Épica',
  rare: 'Rara',
  common: 'Común',
};

export const CATEGORY_COLORS = {
  monster: '#5c330a',
  support: '#8892c6',
  fusion: '#543c5a',
  token: '#3d6b4a',
};

export const CATEGORY_LABELS = {
  monster: 'Monstruo',
  support: 'Apoyo',
  fusion: 'Compilación',
  token: 'Token',
};

// A monster/fusion card's `type` is its breed, already a display-ready Spanish word (e.g.
// "Dragón") — no translation table needed, just render it as-is. A support card's `type` is the
// internal subtype code above, which DOES need translating.
export function getTypeLabel(card) {
  if (card.category === 'support') return SUPPORT_SUBTYPE_LABELS[card.type] || card.type;
  return card.type || '';
}

export function getTypeIcon(card) {
  if (card.category === 'support') return SUPPORT_SUBTYPE_ICONS[card.type] || null;
  return ATTRIBUTE_ICONS[card.attribute] || null;
}

// Color for the type/attribute badge: a monster/fusion/token shows its element's own color;
// a support card has no attribute to speak of, so it falls back to whatever color the caller
// passes in (typically the rarity color).
export function getTypeBadgeColor(card, fallback) {
  if (card.category === 'support') return fallback;
  return ATTRIBUTE_COLORS[card.attribute] || fallback;
}

// The attribute palette spans pure black (Oscuridad) to near-white (Luz) — a fixed white icon
// would disappear on the light end, so pick black or white per background using relative
// luminance (standard WCAG-ish formula) instead of hardcoding per color.
export function getContrastColor(hexColor) {
  const hex = (hexColor || '').replace('#', '');
  if (hex.length !== 6) return '#fff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1a1a' : '#fff';
}
