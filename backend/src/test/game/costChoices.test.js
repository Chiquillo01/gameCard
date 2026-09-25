// Rulebook: a cost never picks for the player — with more than one legal card able to pay it, the
// server refuses to guess and returns { ok: false, reason: 'choose-target', options } instead,
// same shape as the search-choice/Equipo-target flows in interactiveChoices.test.js. A cost
// needing more than one card (Inferno's "descarta 2 Dragones") re-asks for the rest, one pick at
// a time, until enough have been chosen.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Effect } = require('../../data/Schema/effect');
const { Deck } = require('../../data/Schema/deck');
const { User } = require('../../data/Schema/user');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');
const { createMatch, applyAction } = require('../../game/engine');
const { placeMonster } = require('../../game/zones');
const { passChain } = require('./chainHelpers');

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

// Player A's hand is exactly the named cards (x1 each); B gets an unrelated small deck.
async function makeMatch(namesA, namesB = ['Kraken']) {
  const docs = await Card.find({ name: { $in: [...new Set([...namesA, ...namesB])] } }).lean();
  const byName = new Map(docs.map((c) => [c.name, c]));
  const mk = async (tag, names) => {
    const user = await User.create({ userName: `Cc${tag}${Date.now()}`, email: `cc${tag}${Date.now()}@example.com`, password: 'x' });
    const deck = await Deck.create({ deckTitle: tag, owner: user._id, cards: names.map((n) => ({ card: byName.get(n)._id, amount: 1 })), fusionCards: [] });
    return { user, deck: await Deck.findById(deck._id).populate('cards.card').populate('fusionCards.card') };
  };
  const a = await mk('A', namesA);
  const b = await mk('B', namesB);
  const state = await createMatch({
    matchId: `cc-${Date.now()}-${Math.random()}`,
    playerA: a.user._id.toString(),
    deckA: a.deck,
    playerB: b.user._id.toString(),
    deckB: b.deck,
    vsBot: false,
  });
  const inHand = (name) => state.players[0].hand.find((id) => id.split(':')[1] === byName.get(name)._id.toString());
  return { state, inHand, byName };
}

function toMain1(state) {
  while (state.phase !== 'main1') applyAction(state, state.turnPlayer, { type: 'ADVANCE_PHASE' });
}

const monsterOf = (state, p, id) => state.players[p].field.monsters.find((m) => m && m.instanceId === id);

describe('Cost payments ask the player instead of picking for them', () => {
  it('Avispa gigante: with 2 legal Insectos to discard, asks which one', async () => {
    const { state, inHand } = await makeMatch(['Avispa gigante', 'Avispa Mutante', 'Avispa de Obsidiana', 'Kraken']);
    toMain1(state);
    const avispa = inHand('Avispa gigante');
    const mutante = inHand('Avispa Mutante');
    const obsidiana = inHand('Avispa de Obsidiana');

    const res = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: avispa });
    expect(res).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(new Set(res.options.map((o) => o.instanceId))).toEqual(new Set([mutante, obsidiana]));

    const res2 = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: avispa, targets: [obsidiana] });
    expect(res2).toMatchObject({ ok: true });
    expect(monsterOf(state, 0, avispa)).toBeDefined();
    expect(state.players[0].graveyard).toContain(obsidiana);
    expect(state.players[0].hand).toContain(mutante); // the one NOT picked stays put
  });

  it('Inferno: discarding 2 Dragones asks one at a time and accumulates the picks', async () => {
    const { state, inHand } = await makeMatch([
      'Inferno, el Dragón de Fuego',
      'Oscuro, el Dragón de Oscuridad',
      'Roco, el Dragón de Tierra',
      'Sky, el Dragón de Viento',
      'Kraken',
    ]);
    toMain1(state);
    const inferno = inHand('Inferno, el Dragón de Fuego');
    const oscuro = inHand('Oscuro, el Dragón de Oscuridad');
    const roco = inHand('Roco, el Dragón de Tierra');
    const sky = inHand('Sky, el Dragón de Viento');

    const res1 = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: inferno });
    expect(res1).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(new Set(res1.options.map((o) => o.instanceId))).toEqual(new Set([oscuro, roco, sky]));

    // First pick: still one short of the 2 needed, so it asks again — excluding what's chosen.
    const res2 = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: inferno, targets: [roco] });
    expect(res2).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(new Set(res2.options.map((o) => o.instanceId))).toEqual(new Set([oscuro, sky]));

    const res3 = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: inferno, targets: [roco, sky] });
    expect(res3).toMatchObject({ ok: true });
    expect(monsterOf(state, 0, inferno)).toBeDefined();
    expect(state.players[0].graveyard).toContain(roco);
    expect(state.players[0].graveyard).toContain(sky);
    expect(state.players[0].hand).toContain(oscuro); // never picked, never touched
  });

  it('Fire Giant: with 2 Fuego monsters on the field, asks which to sacrifice', async () => {
    const { state, inHand } = await makeMatch(['Fire Giant', 'Kraken']);
    toMain1(state);
    const fireCards = await Card.find({ attribute: 'Fuego', category: 'monster' }).limit(2).lean();
    const fireA = `0:${fireCards[0]._id}:fa`;
    const fireB = `0:${fireCards[1]._id}:fb`;
    placeMonster(state, fireA, 0, { position: 'attack' });
    placeMonster(state, fireB, 0, { position: 'attack' });
    const giant = inHand('Fire Giant');

    const res = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: giant });
    expect(res).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(new Set(res.options.map((o) => o.instanceId))).toEqual(new Set([fireA, fireB]));

    const res2 = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: giant, targets: [fireB] });
    expect(res2).toMatchObject({ ok: true });
    expect(monsterOf(state, 0, fireB)).toBeUndefined();
    expect(monsterOf(state, 0, fireA)).toBeDefined(); // untouched — not the one picked
    expect(state.players[0].graveyard).toContain(fireB);
  });

  it('Lich: with more than 5 NoMuertos available, asks for each pick past what is unambiguous', async () => {
    const { state, inHand } = await makeMatch(['Lich', 'Kraken']);
    const skeleton = await Card.findOne({ name: 'Esqueleto' }).lean();
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => `0:${skeleton._id}:${s}`);
    ids.forEach((id) => state.players[0].graveyard.push(id));
    toMain1(state);
    const lich = inHand('Lich');

    const res = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: lich });
    expect(res).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(res.options).toHaveLength(6); // 6 legal, only 5 needed — genuinely ambiguous

    const picked = ids.slice(0, 5);
    const res2 = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: lich, targets: picked });
    expect(res2).toMatchObject({ ok: true });
    picked.forEach((id) => expect(state.players[0].banished).toContain(id));
    expect(state.players[0].graveyard).toContain(ids[5]); // the one left out stays in the graveyard
  });

  it('Sacrificio Innecesario: with 2 monsters on the field, asks which to sacrifice', async () => {
    const { state, inHand } = await makeMatch(['Sacrificio Innecesario', 'Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const kraken = await Card.findOne({ name: 'Kraken' }).lean();
    const monA = `0:${kraken._id}:ma`;
    const monB = `0:${kraken._id}:mb`;
    placeMonster(state, monA, 0, { position: 'attack' });
    placeMonster(state, monB, 0, { position: 'attack' });
    const sacrificio = inHand('Sacrificio Innecesario');

    const res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: sacrificio });
    expect(res).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(new Set(res.options.map((o) => o.instanceId))).toEqual(new Set([monA, monB]));

    const before = state.players[0].pixelcoins;
    const res2 = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: sacrificio, targets: [monA] });
    expect(res2).toMatchObject({ ok: true });
    passChain(state);
    expect(monsterOf(state, 0, monA)).toBeUndefined();
    expect(monsterOf(state, 0, monB)).toBeDefined();
    expect(state.players[0].graveyard).toContain(monA);
    expect(state.players[0].pixelcoins).toBe(before + 3);
  });
});
