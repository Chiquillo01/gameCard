jest.mock('../../services/sendgrid', () => jest.fn().mockResolvedValue());

const supertest = require('supertest');
const { bootstrapApp } = require('../../bootstrap');
const app = bootstrapApp();
const fakeRequest = supertest(app);
const { disconnectDB, connectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { User } = require('../../data/Schema/user');
const { Deck } = require('../../data/Schema/deck');
const { UserCollection } = require('../../data/Schema/userCollection');
const { makeFriends } = require('../../services/friends');

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

let seq = 0;
async function player(name) {
  const userName = `${name}${seq++}`;
  const email = `trade.${userName.toLowerCase()}@gmail.com`;
  const res = await fakeRequest.post('/auth/register').send({ userName, email, password: '123456Ab!' });
  const user = await User.findOne({ email });
  return { token: res.body.token, id: String(user._id), userName };
}

async function newCard(name) {
  return Card.create({
    number: 950000 + seq++,
    name: `${name} ${seq}`,
    attribute: 'water',
    type: 'beast',
    description: 'A card used for tests',
    rarity: 'common',
    category: 'monster',
    expansion: 'TradeExpansion',
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

const api = (p) => ({
  get: (path) => fakeRequest.get(`/trade${path}`).set('Authorization', `Bearer ${p.token}`),
  post: (path, body = {}) => fakeRequest.post(`/trade${path}`).set('Authorization', `Bearer ${p.token}`).send(body),
  del: (path) => fakeRequest.delete(`/trade${path}`).set('Authorization', `Bearer ${p.token}`),
});

// Two friends: Ana owns 3 Dragons, Beto owns 4 Krakens.
async function setup() {
  const ana = await player('Ana');
  const beto = await player('Beto');
  await makeFriends(ana.id, beto.id);
  const dragon = await newCard('Dragon');
  const kraken = await newCard('Kraken');
  await give(ana.id, dragon._id, 3);
  await give(beto.id, kraken._id, 4);
  return { ana, beto, dragon, kraken };
}

describe('Card trades between friends', () => {
  it('needs a token', async () => {
    expect((await fakeRequest.get('/trade')).status).toBe(401);
  });

  it('a friend\'s spare copies can be looked at; a stranger\'s cannot', async () => {
    const { ana, beto, kraken } = await setup();
    const stranger = await player('Carla');
    const res = await api(ana).get(`/cards/${beto.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ owned: 4, sellable: 3, card: expect.objectContaining({ _id: String(kraken._id) }) })]);
    expect((await api(stranger).get(`/cards/${beto.id}`)).status).toBe(403);
    expect((await api(ana).get('/cards/me')).body[0].sellable).toBe(2);
  });

  it('proposing moves nothing; accepting swaps the copies', async () => {
    const { ana, beto, dragon, kraken } = await setup();
    const proposed = await api(ana).post('/', {
      friendId: beto.id,
      offer: [{ cardId: dragon._id, amount: 2 }],
      request: [{ cardId: kraken._id, amount: 3 }],
    });
    expect(proposed.status).toBe(201);
    expect(await copiesOf(ana.id, dragon._id)).toBe(3);

    const incoming = (await api(beto).get('')).body.incoming;
    expect(incoming).toHaveLength(1);
    expect(incoming[0].offer[0].cardId.name).toBe(dragon.name);

    expect((await api(ana).post(`/${proposed.body._id}/accept`)).status).toBe(404); // not hers to accept
    const accepted = await api(beto).post(`/${proposed.body._id}/accept`);
    expect(accepted.status).toBe(200);

    expect(await copiesOf(ana.id, dragon._id)).toBe(1);
    expect(await copiesOf(beto.id, dragon._id)).toBe(2);
    expect(await copiesOf(beto.id, kraken._id)).toBe(1);
    expect(await copiesOf(ana.id, kraken._id)).toBe(3);
    expect((await api(beto).post(`/${proposed.body._id}/accept`)).status).toBe(404); // only once
    expect((await api(ana).get('')).body.history[0].status).toBe('ACCEPTED');
  });

  it('only spare copies: the last copy and copies a deck uses stay', async () => {
    const { ana, beto, dragon, kraken } = await setup();
    expect((await api(ana).post('/', { friendId: beto.id, offer: [{ cardId: dragon._id, amount: 3 }] })).status).toBe(400);
    expect((await api(ana).post('/', { friendId: beto.id, request: [{ cardId: kraken._id, amount: 4 }] })).status).toBe(400);

    await Deck.create({ deckTitle: 'Usa dragones', owner: ana.id, cards: [{ card: dragon._id, amount: 2 }] });
    expect((await api(ana).post('/', { friendId: beto.id, offer: [{ cardId: dragon._id, amount: 2 }] })).status).toBe(400);
    expect((await api(ana).post('/', { friendId: beto.id, offer: [{ cardId: dragon._id, amount: 1 }] })).status).toBe(201);
  });

  it('if the cards are gone by the time it is accepted, nothing moves and the trade stays pending', async () => {
    const { ana, beto, dragon, kraken } = await setup();
    const proposed = await api(ana).post('/', {
      friendId: beto.id,
      offer: [{ cardId: dragon._id, amount: 2 }],
      request: [{ cardId: kraken._id, amount: 3 }],
    });
    // Beto uses his Krakens in a deck meanwhile: he can no longer give 3.
    await Deck.create({ deckTitle: 'Usa krakens', owner: beto.id, cards: [{ card: kraken._id, amount: 4 }] });

    const res = await api(beto).post(`/${proposed.body._id}/accept`);
    expect(res.status).toBe(409);
    expect(await copiesOf(ana.id, dragon._id)).toBe(3);
    expect(await copiesOf(beto.id, kraken._id)).toBe(4);
    expect(await copiesOf(beto.id, dragon._id)).toBe(0);
    expect((await api(beto).get('')).body.incoming).toHaveLength(1);
  });

  it('only between friends, never empty, and with valid amounts', async () => {
    const { ana, beto, dragon } = await setup();
    const stranger = await player('Carla');
    expect((await api(ana).post('/', { friendId: stranger.id, offer: [{ cardId: dragon._id, amount: 1 }] })).status).toBe(403);
    expect((await api(ana).post('/', { friendId: ana.id, offer: [{ cardId: dragon._id, amount: 1 }] })).status).toBe(400);
    expect((await api(ana).post('/', { friendId: beto.id })).status).toBe(400);
    expect((await api(ana).post('/', { friendId: beto.id, offer: [{ cardId: dragon._id, amount: 1.5 }] })).status).toBe(400);
    expect((await api(ana).post('/', { friendId: 'x', offer: [{ cardId: dragon._id, amount: 1 }] })).status).toBe(404);
  });

  it('the receiver can reject and the proposer can cancel', async () => {
    const { ana, beto, dragon } = await setup();
    const a = await api(ana).post('/', { friendId: beto.id, offer: [{ cardId: dragon._id, amount: 1 }] });
    const b = await api(ana).post('/', { friendId: beto.id, offer: [{ cardId: dragon._id, amount: 1 }] });
    expect((await api(ana).post(`/${a.body._id}/reject`)).status).toBe(404);
    expect((await api(beto).post(`/${a.body._id}/reject`)).status).toBe(200);
    expect((await api(beto).del(`/${b.body._id}`)).status).toBe(404);
    expect((await api(ana).del(`/${b.body._id}`)).status).toBe(200);
    expect((await api(beto).get('')).body.incoming).toEqual([]);
  });

  it('removing a friend cancels the trades still pending between them', async () => {
    const { ana, beto, dragon } = await setup();
    await api(ana).post('/', { friendId: beto.id, offer: [{ cardId: dragon._id, amount: 1 }] });
    await fakeRequest.delete(`/friendship/${beto.id}`).set('Authorization', `Bearer ${ana.token}`);
    expect((await api(beto).get('')).body.incoming).toEqual([]);
    expect((await api(ana).get('')).body.history[0].status).toBe('CANCELLED');
  });
});
