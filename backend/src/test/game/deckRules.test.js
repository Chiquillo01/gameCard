const { isDeckPlayable, deckSizes, MIN_DECK_SIZE, MAX_DECK_SIZE, MAX_FUSION_CARDS } = require('../../game/deckRules');

describe('deckRules', () => {
  it('sums main and fusion card amounts', () => {
    const deck = { cards: [{ amount: 3 }, { amount: 4 }], fusionCards: [{ amount: 2 }] };
    expect(deckSizes(deck)).toEqual({ totalMain: 7, totalFusion: 2 });
  });

  it('rejects a deck under the minimum main-deck size', () => {
    const deck = { cards: [{ amount: MIN_DECK_SIZE - 1 }], fusionCards: [] };
    expect(isDeckPlayable(deck)).toBe(false);
  });

  it('rejects a deck over the maximum main-deck size', () => {
    const deck = { cards: [{ amount: MAX_DECK_SIZE + 1 }], fusionCards: [] };
    expect(isDeckPlayable(deck)).toBe(false);
  });

  it('rejects a deck with too many fusion cards', () => {
    const deck = { cards: [{ amount: MIN_DECK_SIZE }], fusionCards: [{ amount: MAX_FUSION_CARDS + 1 }] };
    expect(isDeckPlayable(deck)).toBe(false);
  });

  it('accepts a deck within every limit', () => {
    const deck = { cards: [{ amount: MIN_DECK_SIZE }], fusionCards: [{ amount: MAX_FUSION_CARDS }] };
    expect(isDeckPlayable(deck)).toBe(true);
  });
});
