const { getCard } = require('./cardIndex');

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
  if (!monsterEntry) return false;
  // A monster that was turned into another breed (Capitán Bandido's captures) matches as that breed.
  const card = monsterEntry.breedOverride ? { ...getCard(monsterEntry.cardId), breed: monsterEntry.breedOverride } : getCard(monsterEntry.cardId);
  if (filter.name && !sameText(card.name, filter.name)) return false;
  if (filter.nameContains && !normalize(card.name).includes(normalize(filter.nameContains))) return false;
  if (filter.breed && !sameText(card.breed, filter.breed)) return false;
  if (filter.breedIn && !filter.breedIn.some((b) => sameText(card.breed, b))) return false;
  if (filter.family && !sameText(card.family, filter.family)) return false;
  if (filter.category && !categoryMatches(card.category, filter.category)) return false;
  if (filter.attribute && !attributeMatches(card.attribute, filter.attribute)) return false;
  if (filter.level != null && card.level !== filter.level) return false;
  if (filter.minLevel != null && (card.level || 0) < filter.minLevel) return false;
  return true;
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
  if (filter.name && !sameText(card.name, filter.name)) return false;
  if (filter.nameContains && !normalize(card.name).includes(normalize(filter.nameContains))) return false;
  if (filter.breed && !sameText(card.breed, filter.breed)) return false;
  if (filter.breedIn && !filter.breedIn.some((b) => sameText(card.breed, b))) return false;
  if (filter.family && !sameText(card.family, filter.family)) return false;
  if (filter.category && !categoryMatches(card.category, filter.category)) return false;
  if (filter.attribute && !attributeMatches(card.attribute, filter.attribute)) return false;
  if (filter.level != null && card.level !== filter.level) return false;
  if (filter.minLevel != null && (card.level || 0) < filter.minLevel) return false;
  if (filter.maxLevel != null && (card.level || 0) > filter.maxLevel) return false;
  return true;
}

module.exports = { matchesFilter, matchesCardFilter, attributeMatches };
