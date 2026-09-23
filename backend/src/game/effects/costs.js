const { player, moveToZone, log, getFieldMonster } = require('../zones');
const { matchesFilter, matchesCardFilter } = require('../filters');
const { getCard } = require('../cardIndex');
const { cardIdFromInstance } = require('../deckUtils');

function payPixels(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const amount = args.amount || 0;
  if (pl.pixelcoins < amount) return false;
  pl.pixelcoins -= amount;
  return true;
}

function payVP(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const amount = args.amount || 0;
  if (pl.vp <= amount) return false; // can't pay yourself to 0 or below
  pl.vp -= amount;
  return true;
}

function discardSelf(ctx) {
  const pl = player(ctx.state, ctx.controllerIndex);
  if (!pl.hand.includes(ctx.sourceInstanceId)) return false;
  moveToZone(ctx.state, ctx.sourceInstanceId, 'graveyard');
  return true;
}

// "Descarta [count] carta(s) de tu Mano" with no filter — any hand card qualifies, so this is
// just discardFromHand with an open filter (Rulebook: never random unless the card's own text
// says so — the player picks which of their own cards, same as a filtered discard cost).
function discart(ctx, args, targets) {
  return discardFromHand(ctx, { ...args, filter: {} }, targets);
}

// Combines what the player already chose (in order) with a deterministic fill from whatever's
// left in `pool`, until there are `count` total — used once pendingCostChoice has established
// there's nothing left to ask about (0 or exactly enough candidates remain).
function fillChoice(picked, pool, count) {
  const rest = pool.filter((id) => !picked.includes(id));
  return [...picked, ...rest].slice(0, count);
}

// "Descarta [count] [filter] de tu Mano" (special-summon costs: "descarta un Insecto", "descarta
// 2 Dragones") — always the cards the player picked; support.js/summon.js gate the activation on
// pendingCostChoice first, so by the time this runs there's nothing left to guess at.
function discardFromHand(ctx, args, targets) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const count = args.count || 1;
  const filter = args.filter || { breed: args.breed, family: args.family, attribute: args.attribute };
  const pool = pl.hand.filter((id) => (args.includeSelf || id !== ctx.sourceInstanceId) && matchesCardFilter(getCard(cardIdFromInstance(id)), filter));
  const picked = (targets || []).filter((id) => pool.includes(id));
  const chosen = fillChoice(picked, pool, count);
  if (chosen.length < count) return false;
  chosen.forEach((id) => moveToZone(ctx.state, id, 'graveyard', ctx.controllerIndex));
  return true;
}

// "Sacrifica/sacrificando un monstruo [filter] en tu Campo" (special-summon costs) — always the
// one the player picked (see discardFromHand's note on pendingCostChoice).
function sacrificeFiltered(ctx, args, targets) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = args.filter || { breed: args.breed, family: args.family, attribute: args.attribute };
  const pool = pl.field.monsters.filter((m) => m && matchesFilter(m, filter)).map((m) => m.instanceId);
  const picked = (targets || []).filter((id) => pool.includes(id));
  const chosen = fillChoice(picked, pool, 1);
  if (!chosen.length) return false;
  moveToZone(ctx.state, chosen[0], 'graveyard', ctx.controllerIndex);
  return true;
}

// "Exiliando [count] [filter] del Campo y/o Cementerio" (Lich: 5 NoMuertos) — always the cards
// the player picked, drawn from both zones together (see discardFromHand's note).
function exileFiltered(ctx, args, targets) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = args.filter || { breed: args.breed, family: args.family, attribute: args.attribute };
  const count = args.count || 1;
  const fromField = pl.field.monsters.filter((m) => m && matchesFilter(m, filter)).map((m) => m.instanceId);
  const fromGrave = pl.graveyard.filter((id) => matchesCardFilter(getCard(cardIdFromInstance(id)), filter));
  const pool = [...fromField, ...fromGrave];
  const picked = (targets || []).filter((id) => pool.includes(id));
  const chosen = fillChoice(picked, pool, count);
  if (chosen.length < count) return false;
  chosen.forEach((id) => moveToZone(ctx.state, id, 'banished', ctx.controllerIndex));
  return true;
}

function sacrificeControlled(ctx, args, targets) {
  const amount = args.amount || 1;
  const list = (targets || []).slice(0, amount);
  if (list.length < amount) return false;
  list.forEach((id) => moveToZone(ctx.state, id, 'graveyard'));
  return true;
}

function spendCounter(ctx, args) {
  const holder = ctx.state.players.flatMap((p) => p.field.support.concat(p.field.monsters)).find((x) => x && x.instanceId === ctx.sourceInstanceId);
  if (!holder || !holder.counters || (holder.counters[args.counter] || 0) < args.amount) return false;
  holder.counters[args.counter] -= args.amount;
  return true;
}

function destroyMonster(ctx, args, targets) {
  return sacrificeControlled(ctx, { amount: 1 }, targets);
}

// "Destruye un monstruo en tu Campo:" — always the one the player picked (never the card paying;
// see discardFromHand's note on pendingCostChoice).
function destroyOwnMonster(ctx, args, targets) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const pool = pl.field.monsters.filter((m) => m && m.instanceId !== ctx.sourceInstanceId).map((m) => m.instanceId);
  const picked = (targets || []).filter((id) => pool.includes(id));
  const chosen = fillChoice(picked, pool, 1);
  if (!chosen.length) return false;
  moveToZone(ctx.state, chosen[0], 'graveyard', ctx.controllerIndex);
  return true;
}

const registry = { payPixels, payVP, discardSelf, discart, discardFromHand, exileFiltered, sacrificeControlled, sacrificeFiltered, spendCounter, destroyMonster, destroyOwnMonster };

// Returns true if the cost could be (and was) paid; false means activation fails and nothing
// should be mutated beyond what already ran (costs run first, before the effect's actions).
function payCost(ctx, cost, targets) {
  if (!cost) return true;
  const impl = registry[cost.fn];
  if (!impl) {
    log(ctx.state, `[motor] coste "${cost.fn}" aún no implementado — se permite gratis.`);
    return true;
  }
  return impl(ctx, cost.args || {}, targets);
}

// Rulebook: a cost never picks for the player — they always choose which of their own cards pay
// it, unless the card's own text says the pick is random (no cost fn here does that). Given the
// same ctx/args a cost fn above would use, this returns its legal candidate pool so callers
// (support.js, summon.js) can ask before paying instead of after.
const CHOICE_COST_POOLS = {
  discart: (ctx, args) => discardPool(ctx, { ...args, filter: {} }),
  discardFromHand: (ctx, args) => discardPool(ctx, args),
  sacrificeFiltered: (ctx, args) => player(ctx.state, ctx.controllerIndex).field.monsters.filter((m) => m && matchesFilter(m, args.filter || { breed: args.breed, family: args.family, attribute: args.attribute })).map((m) => m.instanceId),
  exileFiltered: (ctx, args) => {
    const pl = player(ctx.state, ctx.controllerIndex);
    const filter = args.filter || { breed: args.breed, family: args.family, attribute: args.attribute };
    const fromField = pl.field.monsters.filter((m) => m && matchesFilter(m, filter)).map((m) => m.instanceId);
    const fromGrave = pl.graveyard.filter((id) => matchesCardFilter(getCard(cardIdFromInstance(id)), filter));
    return [...fromField, ...fromGrave];
  },
  destroyOwnMonster: (ctx) => player(ctx.state, ctx.controllerIndex).field.monsters.filter((m) => m && m.instanceId !== ctx.sourceInstanceId).map((m) => m.instanceId),
};

function discardPool(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = args.filter || { breed: args.breed, family: args.family, attribute: args.attribute };
  return pl.hand.filter((id) => (args.includeSelf || id !== ctx.sourceInstanceId) && matchesCardFilter(getCard(cardIdFromInstance(id)), filter));
}

// A field instance describes as a token or a real card; a hand/graveyard/exile one is never a
// token (tokens only ever live on the field).
function describeCostCandidate(state, id) {
  const m = getFieldMonster(state, id);
  if (m) return m.isToken ? { instanceId: id, name: m.tokenDef.name, image: null } : { instanceId: id, cardId: m.cardId, name: getCard(m.cardId).name, image: getCard(m.cardId).image };
  const card = getCard(cardIdFromInstance(id));
  return { instanceId: id, cardId: card._id.toString(), name: card.name, image: card.image };
}

// Used right before payCost, by anything that pays a cost off a player pick (SPECIAL_SUMMON's own
// rule.cost, an Apoyo's activationCost, an effect-level cost): null once there's nothing left to
// ask (this cost fn doesn't need a pick, or 0/exactly-enough candidates remain for what's still
// needed) — otherwise the remaining legal candidates to offer as a choose-target.
function pendingCostChoice(ctx, cost, targets) {
  if (!cost) return null;
  const poolFn = CHOICE_COST_POOLS[cost.fn];
  if (!poolFn) return null;
  const args = cost.args || {};
  const count = args.count || args.amount || 1;
  const chosenSoFar = (targets || []).filter((id) => id != null);
  if (chosenSoFar.length >= count) return null;
  const remaining = poolFn(ctx, args).filter((id) => !chosenSoFar.includes(id));
  if (remaining.length <= count - chosenSoFar.length) return null;
  return remaining.map((id) => describeCostCandidate(ctx.state, id));
}

module.exports = { payCost, pendingCostChoice, registry };
