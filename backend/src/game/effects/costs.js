const { player, moveToZone, log } = require('../zones');
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

function discart(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const amount = args.amount || 1;
  if (pl.hand.length < amount) return false;
  for (let i = 0; i < amount; i++) moveToZone(ctx.state, pl.hand[0], 'graveyard');
  return true;
}

// "Descarta [count] [filter] de tu Mano" (special-summon costs: "descarta un Insecto", "descarta
// 2 Dragones") — the picked cards if they match, else the first that do.
function discardFromHand(ctx, args, targets) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const count = args.count || 1;
  const filter = args.filter || { breed: args.breed, family: args.family, attribute: args.attribute };
  const pool = pl.hand.filter((id) => args.includeSelf || id !== ctx.sourceInstanceId);
  const matches = (id) => matchesCardFilter(getCard(cardIdFromInstance(id)), filter);
  const picked = (targets || []).filter((id) => pool.includes(id) && matches(id));
  const chosen = picked.length >= count ? picked.slice(0, count) : pool.filter(matches).slice(0, count);
  if (chosen.length < count) return false;
  chosen.forEach((id) => moveToZone(ctx.state, id, 'graveyard', ctx.controllerIndex));
  return true;
}

// "Sacrifica/sacrificando un monstruo [filter] en tu Campo" (special-summon costs) — the picked
// one if it matches, else the weakest match.
function sacrificeFiltered(ctx, args, targets) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = args.filter || { breed: args.breed, family: args.family, attribute: args.attribute };
  const candidates = pl.field.monsters.filter((m) => m && matchesFilter(m, filter));
  const picked = (targets || []).length ? candidates.find((m) => targets.includes(m.instanceId)) : null;
  const weakest = [...candidates].sort((a, b) => (a.baseAtk || 0) - (b.baseAtk || 0))[0];
  const chosen = picked || weakest;
  if (!chosen) return false;
  moveToZone(ctx.state, chosen.instanceId, 'graveyard', ctx.controllerIndex);
  return true;
}

// "Exiliando [count] [filter] del Campo y/o Cementerio" (Lich: 5 NoMuertos) — the picked cards if
// they match, else the first that do, drawn from both zones together.
function exileFiltered(ctx, args, targets) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = args.filter || { breed: args.breed, family: args.family, attribute: args.attribute };
  const count = args.count || 1;
  const fromField = pl.field.monsters.filter((m) => m && matchesFilter(m, filter)).map((m) => m.instanceId);
  const fromGrave = pl.graveyard.filter((id) => matchesCardFilter(getCard(cardIdFromInstance(id)), filter));
  const pool = [...fromField, ...fromGrave];
  const picked = (targets || []).filter((id) => pool.includes(id));
  const chosen = picked.length >= count ? picked.slice(0, count) : pool.slice(0, count);
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

// "Destruye un monstruo en tu Campo:" — the picked one, else your weakest (never the card paying).
function destroyOwnMonster(ctx, args, targets) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const mine = pl.field.monsters.filter((m) => m && m.instanceId !== ctx.sourceInstanceId);
  const picked = (targets || []).length ? mine.find((m) => targets.includes(m.instanceId)) : null;
  const weakest = [...mine].sort((a, b) => (a.baseAtk || 0) - (b.baseAtk || 0))[0];
  const chosen = picked || weakest;
  if (!chosen) return false;
  moveToZone(ctx.state, chosen.instanceId, 'graveyard', ctx.controllerIndex);
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

module.exports = { payCost, registry };
