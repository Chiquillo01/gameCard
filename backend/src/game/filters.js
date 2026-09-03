const { getCard } = require('./cardIndex');

// Shared "does this monster on field match this filter" used by continuous buffs, search
// effects, targeting, etc. All keys are optional and AND together.
function matchesFilter(monsterEntry, filter = {}) {
  if (!monsterEntry) return false;
  const card = getCard(monsterEntry.cardId);
  if (filter.name && card.name !== filter.name) return false;
  if (filter.nameContains && !card.name.includes(filter.nameContains)) return false;
  if (filter.breed && card.breed !== filter.breed) return false;
  if (filter.breedIn && !filter.breedIn.includes(card.breed)) return false;
  if (filter.family && card.family !== filter.family) return false;
  if (filter.attribute && !attributeMatches(card.attribute, filter.attribute)) return false;
  if (filter.level != null && card.level !== filter.level) return false;
  if (filter.minLevel != null && (card.level || 0) < filter.minLevel) return false;
  return true;
}

const SPANISH_ATTR_TO_ENGLISH = {
  agua: 'water', fuego: 'fire', tierra: 'earth', luz: 'light', oscuridad: 'darkness', aire: 'wind',
};

function attributeMatches(cardAttribute, wantedSpanish) {
  if (!cardAttribute || !wantedSpanish) return false;
  const wantedEnglish = SPANISH_ATTR_TO_ENGLISH[wantedSpanish.toLowerCase()] || wantedSpanish.toLowerCase();
  return cardAttribute.toLowerCase() === wantedEnglish || cardAttribute.toLowerCase() === wantedSpanish.toLowerCase();
}

// Cards a deck-search style effect ("agrega a tu mano un monstruo X de tu mazo") can find,
// searching a face-down zone (deck) by card definition rather than by field state.
function matchesCardFilter(card, filter = {}) {
  if (filter.name && card.name !== filter.name) return false;
  if (filter.nameContains && !card.name.includes(filter.nameContains)) return false;
  if (filter.breed && card.breed !== filter.breed) return false;
  if (filter.family && card.family !== filter.family) return false;
  if (filter.attribute && !attributeMatches(card.attribute, filter.attribute)) return false;
  if (filter.level != null && card.level !== filter.level) return false;
  if (filter.maxLevel != null && (card.level || 0) > filter.maxLevel) return false;
  return true;
}

module.exports = { matchesFilter, matchesCardFilter, attributeMatches };
