// A deck can be SAVED while still under construction (the deck-builder only blocks going over the
// max sizes), but it can only be PLAYED once it meets every size rule — checked here the same way
// the backend checks it before starting a duel, with the sizes the server sends (gameRules.js).
import { getGameRules } from './gameRules';

export function deckSizes(cards, fusionCards) {
  const totalMain = cards.reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalFusion = fusionCards.reduce((sum, c) => sum + (c.amount || 0), 0);
  return { totalMain, totalFusion };
}

export function isDeckPlayable(deck) {
  const totalMain = (deck.cards || []).reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalFusion = (deck.fusionCards || []).reduce((sum, c) => sum + (c.amount || 0), 0);
  const { minDeckSize, maxDeckSize, maxFusionCards } = getGameRules();
  return totalMain >= minDeckSize && totalMain <= maxDeckSize && totalFusion <= maxFusionCards;
}
