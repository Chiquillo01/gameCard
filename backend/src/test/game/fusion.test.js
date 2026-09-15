const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Effect } = require('../../data/Schema/effect');
const { Deck } = require('../../data/Schema/deck');
const { User } = require('../../data/Schema/user');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');
const { createMatch, applyAction } = require('../../game/engine');

beforeAll(async () => {
  await connectDB();
  await Promise.all(effects.map((e) => Effect.findByIdAndUpdate(e._id, e, { upsert: true })));
  for (let i = 0; i < cards.length; i++) {
    await Card.findOneAndUpdate({ name: cards[i].name }, { ...cards[i], number: i + 1 }, { upsert: true });
  }
});

afterAll(async () => {
  await disconnectDB();
});

// Builds a match where player A's hand contains exactly the named cards (x1 each) so the test
// can pick them out deterministically, and player B has an unrelated small deck.
async function makeMatchWithHand(names) {
  const cardDocs = await Card.find({ name: { $in: names } }).lean();
  const byName = new Map(cardDocs.map((c) => [c.name, c]));

  const userA = await User.create({ userName: `FusionA${Date.now()}`, email: `fusiona${Date.now()}@example.com`, password: 'x' });
  const userB = await User.create({ userName: `FusionB${Date.now()}`, email: `fusionb${Date.now()}@example.com`, password: 'x' });

  const deckDocA = await Deck.create({
    deckTitle: 'A',
    owner: userA._id,
    cards: names.map((n) => ({ card: byName.get(n)._id, amount: 1 })),
    fusionCards: [],
  });
  const arboleda = await Card.findOne({ name: 'Arboleda' }).lean();
  const deckDocB = await Deck.create({
    deckTitle: 'B',
    owner: userB._id,
    cards: [{ card: arboleda._id, amount: 2 }],
    fusionCards: [],
  });

  const populatedA = await Deck.findById(deckDocA._id).populate('cards.card').populate('fusionCards.card');
  const populatedB = await Deck.findById(deckDocB._id).populate('cards.card').populate('fusionCards.card');

  const state = await createMatch({
    matchId: `fusion-${Date.now()}-${Math.random()}`,
    playerA: userA._id.toString(),
    deckA: populatedA,
    playerB: userB._id.toString(),
    deckB: populatedB,
    vsBot: false,
  });

  return { state, byName };
}

describe('Compilación (fusion) summon', () => {
  it('consumes the required materials from hand and puts the fusion monster on the field', async () => {
    const names = ['Ciempiés Gigante', 'Avispa gigante', 'Avispa Mutante'];
    const { state, byName } = await makeMatchWithHand(names);

    const findInHand = (name) => state.players[0].hand.find((id) => id.split(':')[1] === byName.get(name)._id.toString());
    const fusionId = findInHand('Ciempiés Gigante');
    const mat1 = findInHand('Avispa gigante');
    const mat2 = findInHand('Avispa Mutante');

    const result = applyAction(state, 0, {
      type: 'COMPILE_SUMMON',
      instanceId: fusionId,
      materialInstanceIds: [mat1, mat2],
    });

    expect(result.ok).toBe(true);
    expect(state.players[0].field.monsters.some((m) => m && m.instanceId === fusionId)).toBe(true);
    expect(state.players[0].hand).not.toContain(mat1);
    expect(state.players[0].hand).not.toContain(mat2);
    expect(state.players[0].graveyard).toContain(mat1);
    expect(state.players[0].graveyard).toContain(mat2);
  });

  it('rejects the summon when materials do not satisfy the requirement', async () => {
    const names = ['Ciempiés Gigante', 'Avispa gigante'];
    const { state, byName } = await makeMatchWithHand(names);

    const findInHand = (name) => state.players[0].hand.find((id) => id.split(':')[1] === byName.get(name)._id.toString());
    const fusionId = findInHand('Ciempiés Gigante');
    const mat1 = findInHand('Avispa gigante');

    // Needs 2 Insecto-family monsters; only supplying 1.
    const result = applyAction(state, 0, {
      type: 'COMPILE_SUMMON',
      instanceId: fusionId,
      materialInstanceIds: [mat1],
    });

    expect(result.ok).toBe(false);
    expect(state.players[0].hand).toContain(mat1);
    expect(state.players[0].field.monsters.every((m) => !m || m.instanceId !== fusionId)).toBe(true);
  });

  it("does not let a player use the opponent's cards as fusion material", async () => {
    const names = ['Ciempiés Gigante', 'Avispa gigante'];
    const { state, byName } = await makeMatchWithHand(names);

    const fusionId = state.players[0].hand.find((id) => id.split(':')[1] === byName.get('Ciempiés Gigante')._id.toString());
    const ownMaterial = state.players[0].hand.find((id) => id.split(':')[1] === byName.get('Avispa gigante')._id.toString());
    // Player B's hand has "Arboleda" cards — a support card, not even a valid material by
    // filter, but the real point is it belongs to the opponent.
    const opponentCard = state.players[1].hand[0];

    const result = applyAction(state, 0, {
      type: 'COMPILE_SUMMON',
      instanceId: fusionId,
      materialInstanceIds: [ownMaterial, opponentCard],
    });

    expect(result.ok).toBe(false);
    // The opponent's card must still be exactly where it was — not stolen into player 0's graveyard.
    expect(state.players[1].hand).toContain(opponentCard);
    expect(state.players[0].graveyard).not.toContain(opponentCard);
  });
});
