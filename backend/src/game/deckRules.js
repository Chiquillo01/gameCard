// Single source of truth for deck-size limits, shared by deckController (validates what can be
// saved) and duelController (validates what can actually be played). A deck can be saved while
// still under construction — MIN_DECK_SIZE is only enforced at duel-start time — but it can
// never be saved over the max sizes, since those are hard physical limits either way.
const MIN_DECK_SIZE = 40;
const MAX_DECK_SIZE = 50;
const MAX_FUSION_CARDS = 10;

// Fallback only — used if a Card document somehow has no `state` (banlist value). The real,
// authoritative limit lives on each card's own `state` field (see Schema/card.js), so a card
// can be banned/limited without touching this code.
const MAX_COPIES_BY_RARITY = { legendary: 1, epic: 2, rare: 3, common: 4 };

function maxCopiesOf(card) {
  return card?.state ?? MAX_COPIES_BY_RARITY[card?.rarity] ?? 3;
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
  return totalMain >= MIN_DECK_SIZE && totalMain <= MAX_DECK_SIZE && totalFusion <= MAX_FUSION_CARDS;
}

module.exports = { MIN_DECK_SIZE, MAX_DECK_SIZE, MAX_FUSION_CARDS, MAX_COPIES_BY_RARITY, maxCopiesOf, mergeEntries, deckSizes, isDeckPlayable };
