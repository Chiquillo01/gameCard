// The PvE bot plays a random playable deck of the admin accounts, or mirrors the player's deck.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Deck } = require('../../data/Schema/deck');
const { User } = require('../../data/Schema/user');
const { pickBotDeck } = require('../../controllers/duelController');
const { seedCatalog } = require('./engineHelpers');
const { isDeckPlayable } = require('../../game/deckRules');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

let seq = 0;
async function makeUser(admin) {
  seq += 1;
  return User.create({ userName: `Bd${Date.now()}${seq}`, email: `bd${Date.now()}${seq}@example.com`, password: 'x', admin });
}

describe('Bot deck', () => {
  it('a random playable deck of an admin, never an unplayable one; the player\'s own deck as a fallback', async () => {
    const commons = await Card.find({ category: 'monster', rarity: 'common' }).limit(10).lean();
    const playable = { cards: commons.map((card) => ({ card: card._id, amount: 4 })), fusionCards: [] };
    const tooSmall = { cards: commons.slice(0, 2).map((card) => ({ card: card._id, amount: 1 })), fusionCards: [] };
    const player = { cards: [{ card: commons[0], amount: 40 }], fusionCards: [] };

    // No admin decks at all yet: mirror the player's deck.
    await User.updateMany({}, { admin: false });
    expect((await pickBotDeck(player)).cards[0].amount).toBe(40);

    const admin = await makeUser(true);
    const other = await makeUser(false);
    const good = await Deck.create({ deckTitle: 'Bueno', owner: admin._id, ...playable });
    await Deck.create({ deckTitle: 'Corto', owner: admin._id, ...tooSmall });
    await Deck.create({ deckTitle: 'Ajeno', owner: other._id, ...playable });
    for (let i = 0; i < 5; i++) {
      const picked = await pickBotDeck(player, () => i / 5);
      expect(isDeckPlayable(picked)).toBe(true);
      expect(picked.cards.map((c) => String(c.card._id))).toEqual(good.cards.map((c) => String(c.card)));
    }
  });
});
