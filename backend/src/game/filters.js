const { getCard, isEffectless, extraAttributesOf } = require('./cardIndex');

// Card text has drifted slightly across data-entry passes (accents dropped/added, e.g. "Marino"
// vs "Maríno"), while meaning the same thing. Effect/fusion filters compare accent-insensitively
// so that drift doesn't silently make a requirement impossible to satisfy.
const normalize = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sameText = (a, b) => normalize(a) === normalize(b);

// A Compilación (fusion) card counts as a monster on the field/in the deck for anything that
// says `category: "Compilado"` — the Spanish label authored in the effect data — even though
// the schema's own `category` value for it is "fusion".
const CATEGORY_LABEL_TO_SCHEMA = { compilado: 'fusion', monstruo: 'monster', soporte: 'support', token: 'token' };
const categoryMatches = (cardCategory, wanted) => normalize(cardCategory) === (CATEGORY_LABEL_TO_SCHEMA[normalize(wanted)] || normalize(wanted));

// Shared "does this monster on field match this filter" used by continuous buffs, search
// effects, targeting, etc. All keys are optional and AND together.
function matchesFilter(monsterEntry, filter = {}) {
  if (!monsterEntry || monsterEntry.isToken) return false;
  const base = getCard(monsterEntry.cardId);
  // What the card counts as right now on the field: a monster turned into another breed (Pegaso,
  // Capitán Bandido) matches as that breed; one that took another card's name and level
  // (Licántropo Mago, "hasta el final del turno") matches as that name/level; Doppelganger ("es
  // considerado de todos los tipos") matches any breed or family.
  const card = {
    ...base,
    breed: monsterEntry.breedOverride || base.breed,
    name: (monsterEntry.nameOverride && monsterEntry.nameOverride.name) || base.name,
    level: monsterEntry.nameOverride && monsterEntry.nameOverride.level != null ? monsterEntry.nameOverride.level : base.level,
  };
  if (filter.position && monsterEntry.position !== filter.position) return false;
  if (monsterEntry.gainsAllTypes) return matchesCardFilter(card, { ...filter, breed: undefined, breedIn: undefined, family: undefined });
  return matchesCardFilter(card, filter);
}

const SPANISH_ATTR_TO_ENGLISH = {
  agua: 'water', fuego: 'fire', tierra: 'earth', luz: 'light', oscuridad: 'darkness', viento: 'wind',
};

function attributeMatches(cardAttribute, wantedSpanish) {
  if (!cardAttribute || !wantedSpanish) return false;
  const wantedEnglish = SPANISH_ATTR_TO_ENGLISH[wantedSpanish.toLowerCase()] || wantedSpanish.toLowerCase();
  return cardAttribute.toLowerCase() === wantedEnglish || sameText(cardAttribute, wantedSpanish);
}

// Cards a deck-search style effect ("agrega a tu mano un monstruo X de tu mazo") can find,
// searching a face-down zone (deck) by card definition rather than by field state. Also used to
// validate fusion/Compilación material requirements against a candidate card.
function matchesCardFilter(card, filter = {}) {
  if (!card) return false;
  if (filter.name && !sameText(card.name, filter.name)) return false;
  // `nameIncludes` is the older spelling of `nameContains` some effect data still uses.
  const contains = filter.nameContains || filter.nameIncludes;
  if (contains && !normalize(card.name).includes(normalize(contains))) return false;
  if (filter.excludeName && sameText(card.name, filter.excludeName)) return false;
  if (filter.breed && !sameText(card.breed, filter.breed)) return false;
  if (filter.breedIn && !filter.breedIn.some((b) => sameText(card.breed, b))) return false;
  if (filter.family && !sameText(card.family, filter.family)) return false;
  if (filter.category && !categoryMatches(card.category, filter.category)) return false;
  if (filter.attribute && ![card.attribute, ...extraAttributesOf(card)].some((a) => attributeMatches(a, filter.attribute))) return false;
  if (filter.level != null && card.level !== filter.level) return false;
  if (filter.minLevel != null && (card.level || 0) < filter.minLevel) return false;
  if (filter.maxLevel != null && (card.level || 0) > filter.maxLevel) return false;
  // "Monstruo sin efecto" (true) or a monster that has one (false).
  if (filter.effectless != null && isEffectless(card) !== !!filter.effectless) return false;
  return true;
}

module.exports = { matchesFilter, matchesCardFilter, attributeMatches };
