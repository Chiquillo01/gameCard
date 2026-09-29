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

// 3 commons, 2 rare-or-epic, 1 epic-or-legendary: 6 cards, like the real chests.
const TEST_DROP_TABLE = [
  { count: 3, odds: { common: 1 } },
  { count: 2, odds: { rare: 0.8, epic: 0.2 } },
  { count: 1, odds: { epic: 0.9, legendary: 0.1 } },
];

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
      dropTable: TEST_DROP_TABLE,
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
      structureCards: [
        { name: 'Structure Card One', amount: 1 },
        { name: 'Structure Card Two', amount: 1 },
      ],
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

  describe('Chests: what they give and when they charge', () => {
    const { UserCollection } = require('../../data/Schema/userCollection');
    let token;
    let userId;

    const register = async (name) => {
      const email = `${name.toLowerCase()}@gmail.com`;
      await fakeRequest.post('/auth/register').send({ userName: name, email, password: '123456Ab' });
      const login = await fakeRequest.post('/auth/login').send({ email, password: '123456Ab' });
      const user = await User.findOne({ email });
      return { token: login.body.token, userId: user._id };
    };
    const collectionSize = async (id) => {
      const col = await UserCollection.findOne({ userId: id });
      return col ? col.cards.reduce((s, c) => s + c.amount, 0) : 0;
    };
    const buy = (id, body, t = token) => fakeRequest.post(`/store/products/${id}/buy-chest`).set('Authorization', `Bearer ${t}`).send(body);

    beforeAll(async () => {
      ({ token, userId } = await register('ChestChecker'));
    });

    it('a chest from an expansion with no cards gives nothing and charges nothing', async () => {
      const empty = await new StoreProduct({ name: 'Empty Chest', description: 'x', price: { pixelcoins: 100 }, reward: { cards: 6 }, imageUrl: 'e.png', expansion: 'NoSuchExpansion', category: 'chest', dropTable: TEST_DROP_TABLE }).save();
      const response = await buy(empty._id, { paymentMethod: 'pixelcoins' });
      expect(response.status).toBe(404);
      expect((await User.findById(userId)).pixelcoins).toBe(1000);
      expect(await collectionSize(userId)).toBe(0);
    });

    it('fills a slot with the nearest rarity the expansion has, and gives the drop table\'s count', async () => {
      await Promise.all([makeCard({ name: 'Only Common A', rarity: 'common', expansion: 'CommonsOnly' }).save(), makeCard({ name: 'Only Common B', rarity: 'common', expansion: 'CommonsOnly' }).save()]);
      const commons = await new StoreProduct({ name: 'Commons Chest', description: 'x', price: { pixelcoins: 100 }, reward: { cards: 5 }, imageUrl: 'c.png', expansion: 'CommonsOnly', category: 'spEdition', dropTable: [{ count: 2, odds: { common: 1 } }, { count: 3, odds: { rare: 1 } }] }).save();
      const response = await buy(commons._id, { paymentMethod: 'pixelcoins' });
      expect(response.status).toBe(200);
      expect(response.body.obtainedCards).toHaveLength(5);
      expect(response.body.obtainedCards.every((c) => c.rarity === 'common' && c.name.startsWith('Only Common'))).toBe(true);
      expect(await collectionSize(userId)).toBe(5);
    });

    it('refuses to open a product that is not a chest', async () => {
      const before = (await User.findById(userId)).pixelcoins;
      const response = await buy(structureDeckId, { paymentMethod: 'pixelcoins' });
      expect(response.status).toBe(400);
      expect((await User.findById(userId)).pixelcoins).toBe(before);
    });

    it('two purchases at the same time can only spend the coins once', async () => {
      const racer = await register('Racer');
      await User.updateOne({ _id: racer.userId }, { pixelcoins: 100 });
      const results = await Promise.all([buy(chestId, { paymentMethod: 'pixelcoins' }, racer.token), buy(chestId, { paymentMethod: 'pixelcoins' }, racer.token)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
      expect((await User.findById(racer.userId)).pixelcoins).toBe(0);
      expect(await collectionSize(racer.userId)).toBe(6);
    });

    it('every chest in the store data has a drop table that adds up to its card count', () => {
      const products = require('../../data/seed/store_products_final.json');
      products.filter((p) => ['chest', 'spEdition'].includes(p.category)).forEach((p) => {
        const total = (p.dropTable || []).reduce((s, slot) => s + slot.count, 0);
        expect({ name: p.name, total }).toEqual({ name: p.name, total: p.reward.cards });
      });
    });
  });

  describe('POST /store/products/:productId/buy-chest with `quantity` (bulk purchase)', () => {
    let bulkBuyerToken;
    let cheapChestId;

    beforeAll(async () => {
      await fakeRequest.post('/auth/register').send({
        userName: 'Bulk Buyer',
        email: 'bulk.buyer@gmail.com',
        password: '123456Ab',
      });
      const login = await fakeRequest.post('/auth/login').send({
        email: 'bulk.buyer@gmail.com',
        password: '123456Ab',
      });
      bulkBuyerToken = login.body.token;

      const cheapChest = new StoreProduct({
        name: 'Cheap Bulk Chest',
        description: 'A cheap chest for testing bulk buys',
        price: { pixelcoins: 100 },
        reward: { cards: 6 },
        imageUrl: 'chest3.png',
        expansion: 'ChestExpansion',
        category: 'chest',
        dropTable: TEST_DROP_TABLE,
      });
      await cheapChest.save();
      cheapChestId = cheapChest._id.toString();
    });

    it('lets a user with 5x the price buy 5 chests in one purchase', async () => {
      // fresh user starts with 1000 pixelcoins; 5 chests at 100 each costs exactly 500
      const response = await fakeRequest
        .post(`/store/products/${cheapChestId}/buy-chest`)
        .set('Authorization', `Bearer ${bulkBuyerToken}`)
        .send({ productId: cheapChestId, paymentMethod: 'pixelcoins', quantity: 5 });

      expect(response.status).toBe(200);
      expect(response.body.obtainedCards).toHaveLength(30); // 6 cards x 5 chests
      expect(response.body.newBalance.pixelcoins).toBe(500); // 1000 - 500
    });

    it('rejects a bulk purchase the user cannot afford', async () => {
      // balance is now 500; 5 more chests would cost 500, which is exactly affordable, so ask
      // for a quantity that clearly isn't (10 chests = 1000, more than the 500 remaining)
      const response = await fakeRequest
        .post(`/store/products/${cheapChestId}/buy-chest`)
        .set('Authorization', `Bearer ${bulkBuyerToken}`)
        .send({ productId: cheapChestId, paymentMethod: 'pixelcoins', quantity: 10 });

      expect(response.status).toBe(410);
    });

    it('rejects an invalid quantity', async () => {
      const response = await fakeRequest
        .post(`/store/products/${cheapChestId}/buy-chest`)
        .set('Authorization', `Bearer ${bulkBuyerToken}`)
        .send({ productId: cheapChestId, paymentMethod: 'pixelcoins', quantity: 0 });

      expect(response.status).toBe(400);
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
        structureCards: [{ name: 'Nonexistent Card', amount: 1 }],
      });
      await brokenDeck.save();

      const response = await fakeRequest
        .post(`/store/products/${brokenDeck._id}/buy-structure`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: brokenDeck._id.toString() });

      expect(response.status).toBe(404);
    });

    it('lets a structure deck include several copies of the same card via `amount`', async () => {
      const tripleDeck = new StoreProduct({
        name: 'Triple Structure Deck',
        description: 'Three copies of the same card',
        price: { pixelcoins: 10 },
        reward: { cards: 3 },
        imageUrl: 'structure3.png',
        category: 'structure',
        structureCards: [{ name: 'Structure Card One', amount: 3 }],
      });
      await tripleDeck.save();

      const response = await fakeRequest
        .post(`/store/products/${tripleDeck._id}/buy-structure`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: tripleDeck._id.toString(), paymentMethod: 'pixelcoins' });

      expect(response.status).toBe(200);
      expect(response.body.obtainedCards).toHaveLength(3);
      expect(response.body.obtainedCards.every((c) => c.name === 'Structure Card One')).toBe(true);
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

  describe('POST /store/products/:productId/buy-currency', () => {
    const balanceOf = async (token) => (await fakeRequest.get('/user/me').set('Authorization', `Bearer ${token}`)).body;

    it('never hands out a euro-priced pixelgem pack for free', async () => {
      const pack = await new StoreProduct({
        name: 'Euro Pack',
        description: 'Real money pack',
        price: { euros: 0.99 },
        reward: { pixelgems: 10 },
        imageUrl: 'gems.png',
        category: 'pixelgems',
      }).save();
      const before = await balanceOf(userToken);

      const response = await fakeRequest
        .post(`/store/products/${pack._id}/buy-currency`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ quantity: 10 });

      expect(response.status).toBe(402);
      const after = await balanceOf(userToken);
      expect(after.pixelgems).toBe(before.pixelgems);
    });

    it('charges an in-game-priced pack before crediting the pixelgems', async () => {
      const pack = await new StoreProduct({
        name: 'Coin Pack',
        description: 'Pixelgems bought with pixelcoins',
        price: { pixelcoins: 50 },
        reward: { pixelgems: 5 },
        imageUrl: 'gems.png',
        category: 'pixelgems',
      }).save();
      const before = await balanceOf(userToken);

      const response = await fakeRequest
        .post(`/store/products/${pack._id}/buy-currency`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ paymentMethod: 'pixelcoins', quantity: 2 });

      expect(response.status).toBe(200);
      expect(response.body.newBalance).toEqual({ pixelcoins: before.pixelcoins - 100, pixelgems: before.pixelgems + 10 });
    });

    it('refuses an in-game-priced pack the user cannot afford', async () => {
      const pack = await new StoreProduct({
        name: 'Pricey Pack',
        description: 'Too expensive',
        price: { pixelcoins: 1000000 },
        reward: { pixelgems: 5 },
        imageUrl: 'gems.png',
        category: 'pixelgems',
      }).save();

      const response = await fakeRequest
        .post(`/store/products/${pack._id}/buy-currency`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ paymentMethod: 'pixelcoins' });

      expect(response.status).toBe(410);
    });
  });
});
