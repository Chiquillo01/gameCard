// Single source of truth for deck-size limits, shared by deckController (validates what can be
// saved) and duelController (validates what can actually be played). A deck can be saved while
// still under construction — MIN_DECK_SIZE is only enforced at duel-start time — but it can
// never be saved over the max sizes, since those are hard physical limits either way.
const MIN_DECK_SIZE = 40;
const MAX_DECK_SIZE = 50;
const MAX_FUSION_CARDS = 10;

function deckSizes(deck) {
  const totalMain = (deck.cards || []).reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalFusion = (deck.fusionCards || []).reduce((sum, c) => sum + (c.amount || 0), 0);
  return { totalMain, totalFusion };
}

function isDeckPlayable(deck) {
  const { totalMain, totalFusion } = deckSizes(deck);
  return totalMain >= MIN_DECK_SIZE && totalMain <= MAX_DECK_SIZE && totalFusion <= MAX_FUSION_CARDS;
}

module.exports = { MIN_DECK_SIZE, MAX_DECK_SIZE, MAX_FUSION_CARDS, deckSizes, isDeckPlayable };
