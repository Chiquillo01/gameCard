// Mirrors backend/src/game/deckRules.js — a deck can be SAVED while still under construction
// (the deck-builder only blocks going over the max sizes), but it can only be PLAYED once it
// actually meets every size rule, checked here the same way the backend checks it before
// starting a duel.
export const MIN_DECK_SIZE = 40;
export const MAX_DECK_SIZE = 50;
export const MAX_FUSION_CARDS = 10;

export function deckSizes(cards, fusionCards) {
  const totalMain = cards.reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalFusion = fusionCards.reduce((sum, c) => sum + (c.amount || 0), 0);
  return { totalMain, totalFusion };
}

export function isDeckPlayable(deck) {
  const totalMain = (deck.cards || []).reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalFusion = (deck.fusionCards || []).reduce((sum, c) => sum + (c.amount || 0), 0);
  return totalMain >= MIN_DECK_SIZE && totalMain <= MAX_DECK_SIZE && totalFusion <= MAX_FUSION_CARDS;
}
