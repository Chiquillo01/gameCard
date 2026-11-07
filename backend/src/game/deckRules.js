// Single source of truth for deck-size limits, shared by deckController (validates what can be
// saved) and duelController (validates what can actually be played). A deck can be saved while
// still under construction — MIN_DECK_SIZE is only enforced at duel-start time — but it can
// never be saved over the max sizes, since those are hard physical limits either way.
// The sizes and the per-rarity copy limits are game rules (game/rules.js, from the database).
const { rules } = require('./rules');

// The real, authoritative limit lives on each card's own `state` field (see Schema/card.js), so a
// card can be banned/limited without touching anything; the rarity limit is only a fallback.
function maxCopiesOf(card) {
  return card?.state ?? (rules().maxCopiesByRarity || {})[card?.rarity] ?? 3;
}

const entryCardId = (entry) => String(entry.card && entry.card._id ? entry.card._id : entry.card);

// Folds repeated entries of the same card into one { card, amount }, so two "x4" rows of the same
// card count as the 8 copies they really are.
function mergeEntries(entries) {
  const byId = new Map();
  (entries || []).forEach((entry) => {
    const id = entryCardId(entry);
    byId.set(id, (byId.get(id) || 0) + entry.amount);
  });
  return [...byId].map(([card, amount]) => ({ card, amount }));
}

function deckSizes(deck) {
  const totalMain = (deck.cards || []).reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalFusion = (deck.fusionCards || []).reduce((sum, c) => sum + (c.amount || 0), 0);
  return { totalMain, totalFusion };
}

// Also re-checks what saving checks (whole positive amounts, per-card copy limits when the cards
// are populated), so a deck stored before those checks existed can't be taken into a duel.
function isDeckPlayable(deck) {
  const entries = [...(deck.cards || []), ...(deck.fusionCards || [])];
  if (entries.some((c) => !Number.isInteger(c.amount) || c.amount < 1)) return false;
  const byId = new Map(entries.filter((c) => c.card && c.card._id).map((c) => [entryCardId(c), c.card]));
  const overLimit = mergeEntries(entries).some(({ card, amount }) => byId.has(card) && amount > maxCopiesOf(byId.get(card)));
  if (overLimit) return false;
  const { totalMain, totalFusion } = deckSizes(deck);
  const r = rules();
  return totalMain >= r.minDeckSize && totalMain <= r.maxDeckSize && totalFusion <= r.maxFusionCards;
}

module.exports = {
  maxCopiesOf,
  mergeEntries,
  deckSizes,
  isDeckPlayable,
  get MIN_DECK_SIZE() { return rules().minDeckSize; },
  get MAX_DECK_SIZE() { return rules().maxDeckSize; },
  get MAX_FUSION_CARDS() { return rules().maxFusionCards; },
  get MAX_COPIES_BY_RARITY() { return rules().maxCopiesByRarity; },
};
