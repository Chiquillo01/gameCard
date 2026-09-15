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
import { GiFastArrow, GiOakLeaf, GiMetalBar, GiCrystalBall, GiThirdEye } from 'react-icons/gi';
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
