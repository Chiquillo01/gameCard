// Shared setup for the engine rule tests: a real match between two throwaway users, plus helpers
// to put named cards exactly where a test needs them (hand, deck, graveyard, field) without relying
// on how the deck happens to shuffle.
const { Card } = require('../../data/Schema/card');
const { Effect } = require('../../data/Schema/effect');
const { User } = require('../../data/Schema/user');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');
const { createMatch, applyAction } = require('../../game/engine');
const { loadCardIndex } = require('../../game/cardIndex');
const { placeMonster } = require('../../game/zones');

async function seedCatalog() {
  await Promise.all(effects.map((e) => Effect.findByIdAndUpdate(e._id, e, { upsert: true })));
  for (let i = 0; i < cards.length; i++) {
    await Card.findOneAndUpdate({ name: cards[i].name }, { ...cards[i], number: i + 1 }, { upsert: true });
  }
  await loadCardIndex(true);
}

let seq = 0;
const idOf = async (name) => {
  const card = await Card.findOne({ name }).lean();
  if (!card) throw new Error(`no card named ${name}`);
  return card._id.toString();
};

// A match whose decks hold `filler` copies of Kraken (a card that does nothing on its own), so the
// named cards a test adds are the only ones that matter. Both hands are emptied.
async function makeDuel() {
  const kraken = await Card.findOne({ name: 'Kraken' }).lean();
  const mk = async (tag) => {
    const user = await User.create({ userName: `Eng${tag}${Date.now()}${seq++}`, email: `eng${tag}${Date.now()}${seq++}@example.com`, password: 'x' });
    // A plain deck object: the engine only needs { cards: [{ card, amount }] }.
    return { user, deck: { cards: [{ card: kraken, amount: 30 }], fusionCards: [] } };
  };
  const a = await mk('A');
  const b = await mk('B');
  const state = await createMatch({ matchId: `eng-${Date.now()}-${seq++}`, playerA: a.user._id.toString(), deckA: a.deck, playerB: b.user._id.toString(), deckB: b.deck, vsBot: false });
  state.players.forEach((p) => { p.hand = []; p.pixelcoins = 12; });
  return state;
}

// A fresh instance of the named card, owned by `p`.
async function instance(p, name) {
  return `${p}:${await idOf(name)}:t${seq++}`;
}

async function toHand(state, p, name) {
  const id = await instance(p, name);
  state.players[p].hand.push(id);
  return id;
}

async function toDeckTop(state, p, name) {
  const id = await instance(p, name);
  state.players[p].deck.unshift(id);
  return id;
}

async function toGraveyard(state, p, name) {
  const id = await instance(p, name);
  state.players[p].graveyard.push(id);
  return id;
}

async function onField(state, p, name, opts = {}) {
  const id = await instance(p, name);
  placeMonster(state, id, p, { position: 'attack', ...opts });
  return id;
}

function toPhase(state, phase, turnPlayer = state.turnPlayer) {
  let guard = 0;
  while ((state.phase !== phase || state.turnPlayer !== turnPlayer) && guard++ < 40) {
    applyAction(state, state.turnPlayer, { type: 'ADVANCE_PHASE' });
  }
}

// Both players pass until the Pila is empty.
function passAll(state) {
  let guard = 0;
  while (state.chain.length && guard++ < 20) applyAction(state, state.priorityPlayer, { type: 'PASS_CHAIN' });
}

const monster = (state, id) => state.players.flatMap((p) => p.field.monsters).find((m) => m && m.instanceId === id);

module.exports = { seedCatalog, makeDuel, instance, toHand, toDeckTop, toGraveyard, onField, toPhase, passAll, monster, idOf };
