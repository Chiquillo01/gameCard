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

describe('Market Controller TEST', () => {
  let token;
  let cardId;

  beforeAll(async () => {
    const registered = await fakeRequest.post('/auth/register').send({
      userName: 'Market Seller',
      email: 'market.seller@gmail.com',
      password: '123456Ab',
    });
    token = registered.body.token;

    const user = await User.findOne({ email: 'market.seller@gmail.com' });

    const card = new Card({
      number: 1,
      name: 'Sellable Card',
      attribute: 'water',
      type: 'beast',
      description: 'A card used for tests',
      rarity: 'rare',
      category: 'monster',
      expansion: 'MarketExpansion',
      atk: 100,
      def: 100,
      effect: 'none',
      level: 1,
      estado: 1,
    });
    await card.save();
    cardId = card._id.toString();

    // registration already creates an empty UserCollection for the user; add the card to it
    await UserCollection.findOneAndUpdate(
      { userId: user._id },
      { $push: { cards: { cardId: card._id, amount: 5 } } },
    );
  });

  describe('POST /market/create', () => {
    it('should reject the request without a token', async () => {
      const response = await fakeRequest
        .post('/market/create')
        .send({ newCard: { cardId, price: 50, foil: 'normal', amount: 1 } });
      expect(response.status).toBe(401);
    });

    it('should list a card and deduct it from the collection', async () => {
      const response = await fakeRequest
        .post('/market/create')
        .set('Authorization', `Bearer ${token}`)
        .send({ newCard: { cardId, price: 50, foil: 'normal', amount: 2 } });

      expect(response.status).toBe(201);

      const collection = await UserCollection.findOne({ userId: (await User.findOne({ email: 'market.seller@gmail.com' }))._id });
      const userCard = collection.cards.find((c) => c.cardId.toString() === cardId);
      expect(userCard.amount).toBe(3);
    });

    it('should reject a duplicate listing without deducting the card again', async () => {
      const response = await fakeRequest
        .post('/market/create')
        .set('Authorization', `Bearer ${token}`)
        .send({ newCard: { cardId, price: 50, foil: 'normal', amount: 1 } });

      expect(response.status).toBe(400);

      const user = await User.findOne({ email: 'market.seller@gmail.com' });
      const collection = await UserCollection.findOne({ userId: user._id });
      const userCard = collection.cards.find((c) => c.cardId.toString() === cardId);
      expect(userCard.amount).toBe(3);
    });
  });
});
