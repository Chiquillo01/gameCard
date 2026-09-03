const { player, moveToZone, log } = require('../zones');

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

const registry = { payPixels, payVP, discardSelf, discart, sacrificeControlled, spendCounter, destroyMonster };

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
