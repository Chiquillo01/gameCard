// Re-importing a sheet that renumbers cards keeps each card's document (decks and collections point
// at its _id), follows renames, and only deletes the cards that are gone when asked to.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Deck } = require('../../data/Schema/deck');
const { UserCollection } = require('../../data/Schema/userCollection');
const { renumberByName } = require('../../data/seed/seedCardsAndEffects');

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

const card = (name, number) => ({ name, number, description: '-', rarity: 'common', category: 'monster', expansion: 'X', effect: '-', state: 4 });
const owner = '64b000000000000000000001';

describe('renumberByName', () => {
  beforeEach(async () => {
    await Promise.all([Card.deleteMany({}), Deck.deleteMany({}), UserCollection.deleteMany({})]);
  });

  it('moves every card to its new number, keeping its _id, and follows renames', async () => {
    const [a, b, old] = await Card.insertMany([card('A', 1), card('B', 2), card('Viejo', 3)]);
    // A and B swap numbers; "Viejo" is now called "Nuevo" with number 4; number 3 is a new card.
    const sheet = [card('A', 2), card('B', 1), card('Nuevo', 4), card('Otra', 3)];
    await renumberByName(sheet, { Nuevo: ['Viejo'] });
    expect((await Card.findById(a._id)).number).toBe(2);
    expect((await Card.findById(b._id)).number).toBe(1);
    expect((await Card.findById(old._id)).number).toBe(4);
    expect(await Card.findOne({ number: 3 })).toBeNull(); // free for the new card
  });

  it('keeps a card that is gone aside, and deletes it (and its copies) only with prune', async () => {
    const [a, gone] = await Card.insertMany([card('A', 1), card('Gone', 2)]);
    await UserCollection.create({ userId: owner, cards: [{ cardId: a._id, amount: 1 }, { cardId: gone._id, amount: 2 }] });
    await Deck.create({ deckTitle: 'd', owner, cards: [{ card: gone._id, amount: 1 }, { card: a._id, amount: 1 }] });
    const sheet = [card('A', 1), card('New', 2)];

    await renumberByName(sheet, {});
    const parked = await Card.findById(gone._id);
    expect(parked.number).toBeLessThan(0);

    await renumberByName(sheet, {}, { prune: true });
    expect(await Card.findById(gone._id)).toBeNull();
    const collection = await UserCollection.findOne({ userId: owner }).lean();
    expect(collection.cards.map((c) => c.cardId.toString())).toEqual([a._id.toString()]);
    const deck = await Deck.findOne({ owner }).lean();
    expect(deck.cards.map((c) => c.card.toString())).toEqual([a._id.toString()]);
  });
});
