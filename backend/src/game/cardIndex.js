const { Card } = require('../data/Schema/card');
const { Effect } = require('../data/Schema/effect');

// Synchronous, in-memory lookup the rest of the engine relies on. Match logic runs many times
// per action and can't afford a DB round trip per lookup, so we load everything once and
// refresh on a timer / on demand instead.
let cardsById = new Map();
let effectsById = new Map();
let loadedAt = 0;

async function loadCardIndex(force = false) {
  if (!force && Date.now() - loadedAt < 60_000 && cardsById.size) return;
  const [cards, effects] = await Promise.all([Card.find().lean(), Effect.find().lean()]);
  cardsById = new Map(cards.map((c) => [c._id.toString(), c]));
  effectsById = new Map(effects.map((e) => [e._id, e]));
  loadedAt = Date.now();
}

function getCard(cardId) {
  const c = cardsById.get(cardId.toString());
  if (!c) throw new Error(`Card not found in index: ${cardId}`);
  return c;
}

function getEffect(effectId) {
  return effectsById.get(effectId) || null;
}

function isIndexLoaded() {
  return cardsById.size > 0;
}

module.exports = { loadCardIndex, getCard, getEffect, isIndexLoaded };
