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

// The effects a field entry currently has: its own card's, plus any it copied (Doppelganger:
// "el efecto de este monstruo es el del monstruo destruido"). Tokens have none.
function effectCodesOf(entry) {
  if (!entry || entry.isToken || !entry.cardId) return [];
  return [...(getCard(entry.cardId).effectCodes || []), ...(entry.copiedEffectCodes || [])];
}

// "Monstruo sin efecto": a monster whose only effects describe how it's summoned (summon_rule) or
// static rules about the card itself — Valkiria, Esqueleto, the Giants, Perro Esqueleto... Other
// cards can refer to exactly that (filter key `effectless`).
function isEffectless(card) {
  if (!card || !['monster', 'fusion'].includes(card.category)) return false;
  return (card.effectCodes || []).every((id) => {
    const effect = getEffect(id);
    return !effect || effect.type === 'summon_rule' || effect.type === 'rule';
  });
}

// Attributes a card has on top of its own (Héroe del Caos: "también es de atributo Luz"), read
// from its `rule` effects' gainAttribute actions.
function extraAttributesOf(card) {
  const attrs = [];
  (card && card.effectCodes ? card.effectCodes : []).forEach((id) => {
    const effect = getEffect(id);
    if (!effect || effect.type !== 'rule') return;
    (effect.actions || []).forEach((a) => { if (a.fn === 'gainAttribute' && a.args && a.args.attribute) attrs.push(a.args.attribute); });
  });
  return attrs;
}

module.exports = { loadCardIndex, getCard, getEffect, isIndexLoaded, effectCodesOf, isEffectless, extraAttributesOf };
