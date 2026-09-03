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

describe('Deck Controller TEST', () => {
  let ownerToken;
  let otherToken;
  let cardId;
  let deckId;
  let legalDeckCards; // 10 distinct common cards x4 copies = 40, satisfying the rulebook's
  // 40-50 main-deck size and the "max 4 copies of a Común card" limit.

  beforeAll(async () => {
    const owner = await fakeRequest.post('/auth/register').send({
      userName: 'Deck Owner',
      email: 'deck.owner@gmail.com',
      password: '123456Ab',
    });
    ownerToken = owner.body.token;

    const other = await fakeRequest.post('/auth/register').send({
      userName: 'Deck Intruder',
      email: 'deck.intruder@gmail.com',
      password: '123456Ab',
    });
    otherToken = other.body.token;

    const cards = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        new Card({
          number: i + 1,
          name: `Test Card ${i + 1}`,
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
          estado: 1,
        }).save(),
      ),
    );
    cardId = cards[0]._id.toString();
    legalDeckCards = cards.map((c) => ({ card: c._id.toString(), amount: 4 }));
  });

  describe('POST /deck', () => {
    it('should reject deck creation without a token', async () => {
      const response = await fakeRequest.post('/deck').send({ deckTitle: 'My Deck' });
      expect(response.status).toBe(401);
    });

    it('should reject a deck with fewer than 40 cards', async () => {
      const response = await fakeRequest
        .post('/deck')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ deckTitle: 'Too Small', cards: [{ card: cardId, amount: 2 }] });

      expect(response.status).toBe(400);
    });

    it('should reject more copies of a card than its rarity allows', async () => {
      const tooManyCopies = [...legalDeckCards.slice(0, 9), { card: cardId, amount: 5 }];
      const response = await fakeRequest
        .post('/deck')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ deckTitle: 'Too Many Copies', cards: tooManyCopies });

      expect(response.status).toBe(400);
    });

    it('should let an authenticated user create a deck', async () => {
      const response = await fakeRequest
        .post('/deck')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ deckTitle: 'My Deck', cards: legalDeckCards });

      expect(response.status).toBe(201);
      expect(response.body.deckTitle).toBe('My Deck');
      deckId = response.body._id;
    });
  });

  describe('PUT /deck/update/:id', () => {
    it('should reject updating a deck without a token', async () => {
      const response = await fakeRequest.put(`/deck/update/${deckId}`).send({ deckTitle: 'Hacked' });
      expect(response.status).toBe(401);
    });

    it('should reject updating another user\'s deck', async () => {
      const response = await fakeRequest
        .put(`/deck/update/${deckId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ deckTitle: 'Hacked', cards: [] });

      expect(response.status).toBe(403);
    });

    it('should let the owner update their own deck', async () => {
      const response = await fakeRequest
        .put(`/deck/update/${deckId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ deckTitle: 'Updated Deck', cards: legalDeckCards });

      expect(response.status).toBe(200);
      expect(response.body.deckTitle).toBe('Updated Deck');
    });
  });

  describe('DELETE /deck/:id', () => {
    it('should reject deleting a deck without a token', async () => {
      const response = await fakeRequest.delete(`/deck/${deckId}`);
      expect(response.status).toBe(401);
    });

    it('should reject deleting another user\'s deck', async () => {
      const response = await fakeRequest.delete(`/deck/${deckId}`).set('Authorization', `Bearer ${otherToken}`);
      expect(response.status).toBe(403);
    });

    it('should let the owner delete their own deck', async () => {
      const response = await fakeRequest.delete(`/deck/${deckId}`).set('Authorization', `Bearer ${ownerToken}`);
      expect(response.status).toBe(200);

      const getResponse = await fakeRequest.get(`/deck/user/${deckId}`);
      expect(getResponse.status).toBe(404);
    });
  });
});
