jest.mock('../../services/sendgrid', () => jest.fn().mockResolvedValue());

const supertest = require('supertest');
const { bootstrapApp } = require('../../bootstrap');
const app = bootstrapApp();
const fakeRequest = supertest(app);
const { disconnectDB, connectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { User } = require('../../data/Schema/user');
const { Deck } = require('../../data/Schema/deck');
const { Market } = require('../../data/Schema/market');
const { UserCollection } = require('../../data/Schema/userCollection');

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

let seq = 0;
async function player(name, pixelcoins = 1000) {
  const email = `market.${name.toLowerCase()}${seq++}@gmail.com`;
  const registered = await fakeRequest.post('/auth/register').send({ userName: `${name}${seq}`, email, password: '123456Ab' });
  const user = await User.findOneAndUpdate({ email }, { pixelcoins }, { new: true });
  return { token: registered.body.token, id: user._id };
}

async function newCard(name) {
  return Card.create({
    number: 900000 + seq++,
    name,
    attribute: 'water',
    type: 'beast',
    description: 'A card used for tests',
    rarity: 'rare',
    category: 'monster',
    expansion: 'MarketExpansion',
    atk: 1,
    def: 1,
    effect: 'none',
    level: 1,
  });
}

const give = (userId, cardId, amount) => UserCollection.findOneAndUpdate({ userId }, { $push: { cards: { cardId, amount } } });
const copiesOf = async (userId, cardId) => {
  const col = await UserCollection.findOne({ userId });
  const entry = col && col.cards.find((c) => String(c.cardId) === String(cardId));
  return entry ? entry.amount : 0;
};
const coinsOf = async (userId) => (await User.findById(userId)).pixelcoins;

const api = (token) => ({
  get: (path) => fakeRequest.get(`/market${path}`).set('Authorization', `Bearer ${token}`),
  post: (path, body = {}) => fakeRequest.post(`/market${path}`).set('Authorization', `Bearer ${token}`).send(body),
  del: (path) => fakeRequest.delete(`/market${path}`).set('Authorization', `Bearer ${token}`),
});

describe('Card market', () => {
  let seller;
  let buyer;
  let card;

  beforeAll(async () => {
    seller = await player('Seller');
    buyer = await player('Buyer');
    card = await newCard('Sellable Card');
    await give(seller.id, card._id, 5);
    // One of the seller's decks uses 3 copies: those stay out of the market.
    await Deck.create({ deckTitle: 'Keeps three', owner: seller.id, cards: [{ card: card._id, amount: 3 }], fusionCards: [] });
  });

  it('needs a logged-in player', async () => {
    expect((await fakeRequest.get('/market/summary')).status).toBe(401);
  });

  it('only offers the spare copies: at least one is kept, and never fewer than a deck uses', async () => {
    const res = await api(seller.token).get('/sellable');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ owned: 5, inDecks: 3, sellable: 2, card: expect.objectContaining({ name: 'Sellable Card' }) })]);
  });

  it('refuses listing more copies than are spare, or a bad amount or price', async () => {
    const seller2 = api(seller.token);
    expect((await seller2.post('/listings', { cardId: card._id, amount: 3, price: 10 })).status).toBe(400);
    expect((await seller2.post('/listings', { cardId: card._id, amount: 0, price: 10 })).status).toBe(400);
    expect((await seller2.post('/listings', { cardId: card._id, amount: 1, price: 0 })).status).toBe(400);
    expect((await seller2.post('/listings', { cardId: card._id, amount: 1, price: 2.5 })).status).toBe(400);
    expect(await copiesOf(seller.id, card._id)).toBe(5);
  });

  let listingId;
  it('lists spare copies: they leave the collection and show up on the market', async () => {
    const res = await api(seller.token).post('/listings', { cardId: card._id, amount: 2, price: 30 });
    expect(res.status).toBe(201);
    listingId = res.body._id;
    expect(await copiesOf(seller.id, card._id)).toBe(3);

    const summary = await api(buyer.token).get('/summary');
    expect(summary.body).toEqual(expect.arrayContaining([expect.objectContaining({ copies: 2, listings: 1, minPrice: 30, card: expect.objectContaining({ name: 'Sellable Card' }) })]));
    const listings = await api(buyer.token).get(`/listings?cardId=${card._id}`);
    expect(listings.body).toHaveLength(1);
    expect(listings.body[0]).toMatchObject({ amount: 2, price: { pixelcoins: 30 }, userId: { userName: expect.stringContaining('Seller') } });
  });

  it('a player cannot buy their own cards', async () => {
    expect((await api(seller.token).post(`/listings/${listingId}/buy`, { amount: 1 })).status).toBe(400);
  });

  it('refuses a purchase the buyer cannot pay, changing nothing', async () => {
    const poor = await player('Poor', 10);
    const res = await api(poor.token).post(`/listings/${listingId}/buy`, { amount: 1 });
    expect(res.status).toBe(410);
    expect(await coinsOf(poor.id)).toBe(10);
    expect((await Market.findById(listingId)).amount).toBe(2);
  });

  it('a purchase charges the buyer in pixelcoins, pays the seller and hands over the card', async () => {
    const res = await api(buyer.token).post(`/listings/${listingId}/buy`, { amount: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ bought: 1, cost: 30, newBalance: { pixelcoins: 970 } });
    expect(await coinsOf(buyer.id)).toBe(970);
    expect(await coinsOf(seller.id)).toBe(1030);
    expect(await copiesOf(buyer.id, card._id)).toBe(1);
    const listing = await Market.findById(listingId);
    expect(listing).toMatchObject({ amount: 1, status: 'activo' });
    expect(listing.sales).toHaveLength(1);
  });

  it('two buyers racing for the last copy: only one gets it and only one pays', async () => {
    const racerA = await player('RacerA');
    const racerB = await player('RacerB');
    const results = await Promise.all([
      api(racerA.token).post(`/listings/${listingId}/buy`, { amount: 1 }),
      api(racerB.token).post(`/listings/${listingId}/buy`, { amount: 1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await coinsOf(racerA.id)) + (await coinsOf(racerB.id))).toBe(2000 - 30);
    expect((await copiesOf(racerA.id, card._id)) + (await copiesOf(racerB.id, card._id))).toBe(1);
    expect(await Market.findById(listingId)).toMatchObject({ amount: 0, status: 'vendido' });
    expect((await api(buyer.token).post(`/listings/${listingId}/buy`, { amount: 1 })).status).toBe(404);
  });

  it('withdrawing gives back the unsold copies; only the seller can, and only once', async () => {
    const other = await newCard('Withdrawn Card');
    await give(seller.id, other._id, 4);
    const listed = await api(seller.token).post('/listings', { cardId: other._id, amount: 3, price: 5 });
    expect(await copiesOf(seller.id, other._id)).toBe(1);
    await api(buyer.token).post(`/listings/${listed.body._id}/buy`, { amount: 1 });

    expect((await api(buyer.token).del(`/listings/${listed.body._id}`)).status).toBe(403);
    const res = await api(seller.token).del(`/listings/${listed.body._id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ returned: 2 });
    expect(await copiesOf(seller.id, other._id)).toBe(3);
    expect((await api(seller.token).del(`/listings/${listed.body._id}`)).status).toBe(409);
    expect((await api(buyer.token).get(`/listings?cardId=${other._id}`)).body).toHaveLength(0);
  });

  it('shows the seller their own listings with their sales', async () => {
    const res = await api(seller.token).get('/mine');
    expect(res.status).toBe(200);
    const sold = res.body.find((l) => String(l._id) === String(listingId));
    expect(sold).toMatchObject({ status: 'vendido', initialAmount: 2, amount: 0 });
    expect(sold.sales).toHaveLength(2);
  });
});
