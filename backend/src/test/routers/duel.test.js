jest.mock('../../services/sendgrid', () => jest.fn().mockResolvedValue());

const supertest = require('supertest');
const { bootstrapApp } = require('../../bootstrap');
const app = bootstrapApp();
const fakeRequest = supertest(app);
const { disconnectDB, connectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe('Duel Controller TEST', () => {
  let token;
  let legalDeckId;
  let incompleteDeckId;

  beforeAll(async () => {
    const user = await fakeRequest.post('/auth/register').send({
      userName: 'Duel Starter',
      email: 'duel.starter@gmail.com',
      password: '123456Ab',
    });
    token = user.body.token;

    const cards = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        new Card({
          number: 2000 + i,
          name: `Duel Test Card ${i + 1}`,
          attribute: 'fire',
          type: 'dragon',
          description: 'A card used for tests',
          rarity: 'common',
          category: 'monster',
          expansion: 'TestExpansion',
          atk: 100,
          def: 100,
          effect: 'none',
          level: 1,
        }).save(),
      ),
    );
    const legalDeckCards = cards.map((c) => ({ card: c._id.toString(), amount: 4 })); // 10x4 = 40

    const legalDeck = await fakeRequest
      .post('/deck')
      .set('Authorization', `Bearer ${token}`)
      .send({ deckTitle: 'Legal Deck', cards: legalDeckCards });
    legalDeckId = legalDeck.body._id;

    const incompleteDeck = await fakeRequest
      .post('/deck')
      .set('Authorization', `Bearer ${token}`)
      .send({ deckTitle: 'Incomplete Deck', cards: [{ card: cards[0]._id.toString(), amount: 2 }] });
    incompleteDeckId = incompleteDeck.body._id;
  });

  describe('POST /duel/pve', () => {
    it('should reject starting a duel without a token', async () => {
      const response = await fakeRequest.post('/duel/pve').send({ deckId: legalDeckId });
      expect(response.status).toBe(401);
    });

    it('should reject starting a duel with an incomplete deck', async () => {
      const response = await fakeRequest
        .post('/duel/pve')
        .set('Authorization', `Bearer ${token}`)
        .send({ deckId: incompleteDeckId });

      expect(response.status).toBe(400);
    });

    it('should reject starting a duel with a deck that does not belong to the user', async () => {
      const response = await fakeRequest
        .post('/duel/pve')
        .set('Authorization', `Bearer ${token}`)
        .send({ deckId: '64b7f6f6f6f6f6f6f6f6f6f6' });

      expect(response.status).toBe(404);
    });
  });
});
