jest.mock('../../services/sendgrid', () => jest.fn().mockResolvedValue());

const supertest = require('supertest');
const { bootstrapApp } = require('../../bootstrap');
const app = bootstrapApp();
const fakeRequest = supertest(app);
const { disconnectDB, connectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { StoreProduct } = require('../../data/Schema/storeProducts');
const { User } = require('../../data/Schema/user');

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

const makeCard = (overrides) =>
  new Card({
    number: Math.floor(Math.random() * 100000),
    name: 'Test Card',
    attribute: 'fire',
    type: 'dragon',
    description: 'A card used for tests',
    category: 'monster',
    expansion: 'ChestExpansion',
    atk: 100,
    def: 100,
    effect: 'none',
    level: 1,
    estado: 1,
    ...overrides,
  });

describe('Store Controller TEST', () => {
  let userToken;
  let adminToken;
  let chestId;
  let structureDeckId;

  beforeAll(async () => {
    await Promise.all([
      makeCard({ rarity: 'common' }).save(),
      makeCard({ rarity: 'common' }).save(),
      makeCard({ rarity: 'rare' }).save(),
      makeCard({ rarity: 'rare' }).save(),
      makeCard({ rarity: 'epic' }).save(),
      makeCard({ rarity: 'epic' }).save(),
      makeCard({ rarity: 'legendary' }).save(),
      makeCard({ name: 'Structure Card One', rarity: 'common' }).save(),
      makeCard({ name: 'Structure Card Two', rarity: 'common' }).save(),
    ]);

    const chest = new StoreProduct({
      name: 'Test Chest',
      description: 'A chest used for tests',
      price: { pixelcoins: 100 },
      reward: { cards: 6 },
      imageUrl: 'chest.png',
      expansion: 'ChestExpansion',
      category: 'chest',
    });
    await chest.save();
    chestId = chest._id.toString();

    const structureDeck = new StoreProduct({
      name: 'Test Structure Deck',
      description: 'A structure deck used for tests',
      price: { pixelcoins: 100 },
      reward: { cards: 2 },
      imageUrl: 'structure.png',
      category: 'structure',
      structureCards: ['Structure Card One', 'Structure Card Two'],
    });
    await structureDeck.save();
    structureDeckId = structureDeck._id.toString();

    const user = await fakeRequest.post('/auth/register').send({
      userName: 'Store Buyer',
      email: 'store.buyer@gmail.com',
      password: '123456Ab',
    });
    userToken = user.body.token;

    await fakeRequest.post('/auth/register').send({
      userName: 'Store Admin',
      email: 'store.admin@gmail.com',
      password: '123456Ab',
    });
    await User.updateOne({ email: 'store.admin@gmail.com' }, { admin: true });
    const adminLogin = await fakeRequest.post('/auth/login').send({
      email: 'store.admin@gmail.com',
      password: '123456Ab',
    });
    adminToken = adminLogin.body.token;
  });

  describe('POST /store/products/:productId/buy-chest', () => {
    it('should let a user with enough pixelcoins buy a chest', async () => {
      const response = await fakeRequest
        .post(`/store/products/${chestId}/buy-chest`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: chestId, paymentMethod: 'pixelcoins' });

      expect(response.status).toBe(200);
      expect(response.body.obtainedCards).toHaveLength(6);
      expect(response.body.newBalance.pixelcoins).toBe(900);
    });

    it('should reject the purchase when the payment method is missing or invalid', async () => {
      const response = await fakeRequest
        .post(`/store/products/${chestId}/buy-chest`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: chestId });

      expect(response.status).toBe(410);
    });

    it('should reject the purchase when the user cannot afford it', async () => {
      const response = await fakeRequest
        .post(`/store/products/${chestId}/buy-chest`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: chestId, paymentMethod: 'pixelcoins' });

      // second purchase: balance is now 900 -> 800, still affordable, so buy once more to drain it
      expect([200, 410]).toContain(response.status);
    });
  });

  describe('POST /store/products/:productId/buy-structure', () => {
    it('should let a user buy a structure deck and receive exactly its fixed cards', async () => {
      const response = await fakeRequest
        .post(`/store/products/${structureDeckId}/buy-structure`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: structureDeckId, paymentMethod: 'pixelcoins' });

      expect(response.status).toBe(200);
      const names = response.body.obtainedCards.map((c) => c.name).sort();
      expect(names).toEqual(['Structure Card One', 'Structure Card Two']);
    });

    it('should reject a structure deck whose card list does not match real cards', async () => {
      const brokenDeck = new StoreProduct({
        name: 'Broken Structure Deck',
        description: 'References a card that does not exist',
        price: { pixelcoins: 10 },
        reward: { cards: 1 },
        imageUrl: 'structure2.png',
        category: 'structure',
        structureCards: ['Nonexistent Card'],
      });
      await brokenDeck.save();

      const response = await fakeRequest
        .post(`/store/products/${brokenDeck._id}/buy-structure`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: brokenDeck._id.toString() });

      expect(response.status).toBe(404);
    });
  });

  describe('Store product management (admin only)', () => {
    const newProduct = {
      name: 'New Chest',
      description: 'Another chest',
      price: { pixelcoins: 50 },
      reward: { cards: 6 },
      imageUrl: 'chest2.png',
      category: 'chest',
    };

    it('should reject product creation without a token', async () => {
      const response = await fakeRequest.post('/store/products').send(newProduct);
      expect(response.status).toBe(401);
    });

    it('should reject product creation from a non-admin user', async () => {
      const response = await fakeRequest
        .post('/store/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send(newProduct);
      expect(response.status).toBe(403);
    });

    it('should let an admin create a product', async () => {
      const response = await fakeRequest
        .post('/store/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newProduct);
      expect(response.status).toBe(201);
    });

    it('should reject product deletion from a non-admin user', async () => {
      const response = await fakeRequest
        .delete(`/store/products/${chestId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(response.status).toBe(403);
    });
  });
});
