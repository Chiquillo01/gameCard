jest.mock('../../services/sendgrid', () => jest.fn().mockResolvedValue());

const supertest = require('supertest');
const { bootstrapApp } = require('../../bootstrap');
const app = bootstrapApp();
const fakeRequest = supertest(app);
const { disconnectDB, connectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { User } = require('../../data/Schema/user');
const { UserCollection } = require('../../data/Schema/userCollection');

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

    // A deck can only use cards its owner actually has: give the owner 4 of each (plus 4 of an
    // extra card and 1 legendary used below); the intruder keeps an empty collection.
    unownedCard = await new Card({ ...cards[0].toObject(), _id: undefined, number: 90, name: 'Unowned Card' }).save();
    legendary = await new Card({ ...cards[0].toObject(), _id: undefined, number: 91, name: 'Legend Card', rarity: 'legendary', state: 1 }).save();
    fusionCard = await new Card({ ...cards[0].toObject(), _id: undefined, number: 92, name: 'Fusion Card', category: 'fusion' }).save();
    await UserCollection.updateOne(
      { userId: (await User.findOne({ email: 'deck.owner@gmail.com' }))._id },
      { cards: [...cards.map((c) => ({ cardId: c._id, amount: 4 })), { cardId: legendary._id, amount: 3 }, { cardId: fusionCard._id, amount: 2 }] },
    );
  });

  let unownedCard;
  let legendary;
  let fusionCard;

  describe('POST /deck', () => {
    it('should reject deck creation without a token', async () => {
      const response = await fakeRequest.post('/deck').send({ deckTitle: 'My Deck' });
      expect(response.status).toBe(401);
    });

    it('should allow saving an incomplete deck with fewer than 40 cards', async () => {
      // A deck under construction can be saved — the 40-card minimum is only enforced when
      // starting a duel with it (see duelController's isDeckPlayable check).
      const response = await fakeRequest
        .post('/deck')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ deckTitle: 'Too Small', cards: [{ card: cardId, amount: 2 }] });

      expect(response.status).toBe(201);
    });

    it('should reject a deck with more than 50 cards', async () => {
      // The total-size check runs before the per-card copy check, so a single oversized entry
      // is enough to prove the >50 ceiling without needing 11+ distinct legal cards.
      const response = await fakeRequest
        .post('/deck')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ deckTitle: 'Too Big', cards: [{ card: cardId, amount: 51 }] });

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

    const post = (cards, extra = {}) =>
      fakeRequest.post('/deck').set('Authorization', `Bearer ${ownerToken}`).send({ deckTitle: 'Probe', cards, ...extra });

    it('counts the same card listed twice as one entry for the copy limit', async () => {
      // 1 legendary allowed; two rows of 1 used to pass as "1 each".
      const response = await post([{ card: legendary._id.toString(), amount: 1 }, { card: legendary._id.toString(), amount: 1 }]);
      expect(response.status).toBe(400);
    });

    it('rejects negative or fractional amounts (they used to shrink the counted total)', async () => {
      const negative = await post([...legalDeckCards, { card: unownedCard._id.toString(), amount: -10 }]);
      expect(negative.status).toBe(400);
      const fractional = await post([{ card: cardId, amount: 1.5 }]);
      expect(fractional.status).toBe(400);
    });

    it('rejects cards the user does not own, or more copies than owned', async () => {
      const unowned = await post([{ card: unownedCard._id.toString(), amount: 1 }]);
      expect(unowned.status).toBe(400);
      const intruder = await fakeRequest.post('/deck').set('Authorization', `Bearer ${otherToken}`).send({ deckTitle: 'Stolen', cards: [{ card: cardId, amount: 1 }] });
      expect(intruder.status).toBe(400);
    });

    it('keeps Compilación cards out of the main deck and normal cards out of the fusion list', async () => {
      const fusionInMain = await post([{ card: fusionCard._id.toString(), amount: 1 }]);
      expect(fusionInMain.status).toBe(400);
      const normalInFusion = await post([], { fusionCards: [{ card: cardId, amount: 1 }] });
      expect(normalInFusion.status).toBe(400);
      const ok = await post([{ card: cardId, amount: 1 }], { fusionCards: [{ card: fusionCard._id.toString(), amount: 1 }] });
      expect(ok.status).toBe(201);
    });

    it('should let an authenticated user create a deck', async () => {
      const response = await fakeRequest
        .post('/deck')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ deckTitle: 'My Deck', cards: legalDeckCards });

      expect(response.status).toBe(201);
      expect(response.body.deckTitle).toBe('My Deck');
      expect(response.body.owner).toEqual({ _id: expect.any(String), userName: 'Deck Owner', profilePicture: expect.any(String) });
      deckId = response.body._id;
    });
  });

  describe('GET /deck/user/:id', () => {
    it('requires a token', async () => {
      const response = await fakeRequest.get(`/deck/user/${deckId}`);
      expect(response.status).toBe(401);
    });

    it("hides another user's private deck", async () => {
      const response = await fakeRequest.get(`/deck/user/${deckId}`).set('Authorization', `Bearer ${otherToken}`);
      expect(response.status).toBe(404);
    });

    it('lets the owner read it, without leaking private owner data', async () => {
      const response = await fakeRequest.get(`/deck/user/${deckId}`).set('Authorization', `Bearer ${ownerToken}`);
      expect(response.status).toBe(200);
      expect(response.body.owner.password).toBeUndefined();
      expect(response.body.owner.email).toBeUndefined();
      expect(response.body.owner.admin).toBeUndefined();
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

      const getResponse = await fakeRequest.get(`/deck/user/${deckId}`).set('Authorization', `Bearer ${ownerToken}`);
      expect(getResponse.status).toBe(404);
    });
  });
});
