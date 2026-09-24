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
    // A deck can only use cards the player owns.
    await UserCollection.updateOne(
      { userId: (await User.findOne({ email: 'duel.starter@gmail.com' }))._id },
      { cards: cards.map((c) => ({ cardId: c._id, amount: 4 })) },
    );

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

    it('starts a PvE duel: a coin toss decides who goes first and the bot plays a mirror of the deck', async () => {
      const { matchStore } = require('../../game');
      const firsts = new Set();
      for (let i = 0; i < 12 && firsts.size < 2; i++) {
        const response = await fakeRequest.post('/duel/pve').set('Authorization', `Bearer ${token}`).send({ deckId: legalDeckId });
        expect(response.status).toBe(201);
        const state = matchStore.get(response.body.id);
        expect(state.log[0].message).toMatch(/^Sorteo: sale (cara|cruz)\. Empieza /);
        // Whoever lost the toss... the bot, if it won, has already played its first turn.
        const bot = state.players[1];
        expect(bot.deck.length + bot.hand.length + bot.graveyard.length + bot.field.monsters.filter(Boolean).length + bot.field.support.filter(Boolean).length + (bot.field.territory ? 1 : 0))
          .toBe(40);
        expect(new Set([...bot.deck, ...bot.hand].map((id) => id.split(':')[1]))).toEqual(new Set([...state.players[0].deck, ...state.players[0].hand].map((id) => id.split(':')[1])));
        firsts.add(state.log[0].message.includes('BOT') ? 'bot' : 'player');
        if (firsts.has('bot')) expect(state.turnPlayer === 0 || state.turnNumber > 1).toBe(true);
      }
      expect(firsts.size).toBe(2); // 12 tosses: both outcomes show up (odds of failing ~0.05%)
    });
  });
});

describe('Match store cleanup', () => {
  const matchStore = require('../../game/matchStore');

  it('drops a match nobody has touched for a long time, and keeps an active one', () => {
    const fake = (id) => ({ id, status: 'active', players: [{ userId: `u-${id}` }, { userId: 'BOT' }] });
    matchStore.save(fake('old'));
    matchStore.save(fake('fresh'));
    matchStore.get('old').updatedAt = Date.now() - matchStore.ABANDONED_MATCH_MS - 1000;
    matchStore.sweep();
    expect(matchStore.get('old')).toBeNull();
    expect(matchStore.get('fresh')).not.toBeNull();
  });

  it('expires a challenge nobody answered', () => {
    matchStore.savePending({ matchId: 'ch1', challengerId: 'a', challengerDeckId: 'd', opponentId: 'b' });
    expect(matchStore.getPending('ch1')).not.toBeNull();
    matchStore.sweep(Date.now() + 16 * 60 * 1000);
    expect(matchStore.getPending('ch1')).toBeNull();
  });
});
