const { player, moveToZone, log, getFieldMonster, findInstanceLocation } = require('../zones');
const { matchesFilter, matchesCardFilter } = require('../filters');
const { getCard } = require('../cardIndex');
const { cardIdFromInstance } = require('../deckUtils');

// Every cost fn below takes (ctx, args, picks) and returns true once paid, false if it can't be
// paid (nothing is changed then). The cards a cost used are recorded on `ctx.paidCards`, so the
// effect it pays for can read them ("si el monstruo sacrificado es un Orco", "el Licano enviado").
//
// Rulebook: a cost never picks for the player — they always choose which of their own cards pay
// it, unless the card's own text says it's random (no cost here does). `picks` are the player's
// choices; pendingCostChoice (below) asks for them before paying whenever there's a real choice,
// so by the time a cost runs, filling up from its pool is only ever "take the only ones there are".

const cardOf = (id) => getCard(cardIdFromInstance(id));
const record = (ctx, ids) => { ctx.paidCards = [...(ctx.paidCards || []), ...ids]; };

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
  record(ctx, [ctx.sourceInstanceId]);
  return true;
}

// "Sacrifica esta carta" — the card paying is on the field and goes to the Cementerio.
function tributeSelf(ctx) {
  const m = getFieldMonster(ctx.state, ctx.sourceInstanceId);
  if (!m) return false;
  moveToZone(ctx.state, ctx.sourceInstanceId, 'graveyard');
  record(ctx, [ctx.sourceInstanceId]);
  return true;
}

// "Regresa esta carta al Mazo" (the Licanos at the end of the Battle Phase) — shuffled in.
function returnSelfToDeck(ctx) {
  const loc = findInstanceLocation(ctx.state, ctx.sourceInstanceId);
  if (!loc || !loc.zone.startsWith('field:')) return false;
  moveToZone(ctx.state, ctx.sourceInstanceId, 'deck', undefined, { deckPosition: 'shuffle' });
  record(ctx, [ctx.sourceInstanceId]);
  return true;
}

// "Exilia esta carta de tu Cementerio" (Refuerzos, Chatarra...).
function banishSelf(ctx, args) {
  const loc = findInstanceLocation(ctx.state, ctx.sourceInstanceId);
  const from = args.from || 'graveyard';
  if (!loc || loc.ownerIndex !== ctx.controllerIndex || loc.zone !== from) return false;
  moveToZone(ctx.state, ctx.sourceInstanceId, 'banished');
  record(ctx, [ctx.sourceInstanceId]);
  return true;
}

// Combines what the player already chose (in order) with a deterministic fill from whatever's
// left in `pool`, until there are `count` total.
function fillChoice(picked, pool, count) {
  const rest = pool.filter((id) => !picked.includes(id));
  return [...picked, ...rest].slice(0, count);
}

// Pays by moving `count` cards out of `pool` into `toZone`: the player's picks first.
function payFromPool(ctx, pool, count, picks, toZone) {
  const picked = (picks || []).filter((id) => pool.includes(id));
  const chosen = fillChoice(picked, pool, count);
  if (chosen.length < count) return false;
  chosen.forEach((id) => moveToZone(ctx.state, id, toZone));
  record(ctx, chosen);
  return true;
}

// --- The cost pools: which of the player's cards could pay each cost. Shared by the cost fns
// themselves and by pendingCostChoice, so what's offered and what's paid never drift apart. ---

const filterOf = (args) => args.filter || { breed: args.breed, family: args.family, attribute: args.attribute };
const cleanFilter = (filter) => { const { includeSelf, zone, ...rest } = filter || {}; return rest; };
const includesSelf = (args) => !!(args.includeSelf || args.includesSelf || (args.filter && args.filter.includeSelf));

// Hand cards matching the cost's filter, never counting the card that's paying.
function handPool(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = cleanFilter(filterOf(args));
  return pl.hand.filter((id) => id !== ctx.sourceInstanceId && matchesCardFilter(cardOf(id), filter));
}

function ownMonsterPool(ctx, args, { excludeSelf = true } = {}) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = cleanFilter(filterOf(args));
  const hasFilter = Object.values(filter).some((v) => v !== undefined && v !== null && v !== '');
  return pl.field.monsters
    .filter((m) => m && !(excludeSelf && m.instanceId === ctx.sourceInstanceId) && (!hasFilter || matchesFilter(m, filter)))
    .map((m) => m.instanceId);
}

function deckPool(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = cleanFilter(filterOf(args));
  return pl.deck.filter((id) => matchesCardFilter(cardOf(id), filter));
}

function exilePool(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = cleanFilter(filterOf(args));
  const fromField = pl.field.monsters.filter((m) => m && matchesFilter(m, filter)).map((m) => m.instanceId);
  const fromGrave = pl.graveyard.filter((id) => matchesCardFilter(cardOf(id), filter));
  return [...fromField, ...fromGrave];
}

// "Descarta [count] [filter] de tu Mano" — any hand card when there's no filter.
function discardFromHand(ctx, args, picks) {
  return payFromPool(ctx, handPool(ctx, args), args.count || 1, picks, 'graveyard');
}

function discart(ctx, args, picks) {
  return discardFromHand(ctx, { ...args, filter: {} }, picks);
}

// "Descarta N cartas [filter]", where the text may count the paying card itself (the baby
// Dragones: "descarta esta carta y otro monstruo Dragón" -> count 2 including itself).
function discardCards(ctx, args, picks) {
  const withSelf = includesSelf(args);
  const pl = player(ctx.state, ctx.controllerIndex);
  if (withSelf && !pl.hand.includes(ctx.sourceInstanceId)) return false;
  const count = (args.count || 1) - (withSelf ? 1 : 0);
  const pool = handPool(ctx, args);
  if (fillChoice((picks || []).filter((id) => pool.includes(id)), pool, count).length < count) return false;
  if (withSelf) discardSelf(ctx);
  return payFromPool(ctx, pool, count, picks, 'graveyard');
}

// "Descarta esta carta y [count] [filter]".
function discardSelfAndCard(ctx, args, picks) {
  return discardCards(ctx, { ...args, count: (args.count || 1) + 1, includeSelf: true }, picks);
}

// "Sacrifica/sacrificando un monstruo [filter] en tu Campo".
function sacrificeFiltered(ctx, args, picks) {
  return payFromPool(ctx, ownMonsterPool(ctx, args, { excludeSelf: false }), 1, picks, 'graveyard');
}

// "Sacrifica [count] monstruo(s) en tu Campo" (Orco Gladiador) — never the card paying.
function tributeMonster(ctx, args, picks) {
  return payFromPool(ctx, ownMonsterPool(ctx, args), args.count || 1, picks, 'graveyard');
}

// "Exiliando [count] [filter] del Campo y/o Cementerio" (Lich: 5 NoMuertos).
function exileFiltered(ctx, args, picks) {
  return payFromPool(ctx, exilePool(ctx, args), args.count || 1, picks, 'banished');
}

// "Envía al Cementerio [count] [filter] de tu Mazo" (Licántropo Mago).
function millSpecific(ctx, args, picks) {
  return payFromPool(ctx, deckPool(ctx, args), args.count || 1, picks, args.destination === 'banished' ? 'banished' : 'graveyard');
}

// "Destruye un monstruo en tu Campo:" — never the card paying.
function destroyOwnMonster(ctx, args, picks) {
  return payFromPool(ctx, ownMonsterPool(ctx, {}), 1, picks, 'graveyard');
}

function sacrificeControlled(ctx, args, picks) {
  return payFromPool(ctx, ownMonsterPool(ctx, {}), args.amount || args.count || 1, picks, 'graveyard');
}

function destroyMonster(ctx, args, picks) {
  return sacrificeControlled(ctx, { amount: 1 }, picks);
}

function spendCounter(ctx, args) {
  const holder = ctx.state.players.flatMap((p) => p.field.support.concat(p.field.monsters)).find((x) => x && x.instanceId === ctx.sourceInstanceId);
  if (!holder || !holder.counters || (holder.counters[args.counter] || 0) < args.amount) return false;
  holder.counters[args.counter] -= args.amount;
  return true;
}

// "Revela esta carta y un [filter] de tu Mano" (Licántropo Albino) — nothing moves, but the
// revealed card is remembered for the effect that follows.
function revealCards(ctx, args, picks) {
  const pl = player(ctx.state, ctx.controllerIndex);
  if (!pl.hand.includes(ctx.sourceInstanceId)) return false;
  const wanted = (args.cards || []).filter((c) => c !== 'self');
  const pool = pl.hand.filter((id) => id !== ctx.sourceInstanceId && wanted.every((w) => matchesCardFilter(cardOf(id), { breed: w })));
  const chosen = fillChoice((picks || []).filter((id) => pool.includes(id)), pool, wanted.length);
  if (chosen.length < wanted.length) return false;
  ctx.revealedCards = chosen;
  log(ctx.state, `${pl.userId} revela ${[ctx.sourceInstanceId, ...chosen].map((id) => cardOf(id).name).join(' y ')}.`);
  return true;
}

const registry = {
  payPixels,
  payVP,
  discardSelf,
  discart,
  discardCard: discart,
  discardFromHand,
  discardCards,
  discardSelfAndCard,
  exileFiltered,
  sacrificeControlled,
  sacrificeFiltered,
  tributeSelf,
  tributeMonster,
  millSpecific,
  returnSelfToDeck,
  banishSelf,
  revealCards,
  spendCounter,
  destroyMonster,
  destroyOwnMonster,
};

// Returns true if the cost could be (and was) paid; false means activation fails. A cost the
// engine doesn't know can't be paid — it never lets the card through for free.
function payCost(ctx, cost, picks) {
  if (!cost || !cost.fn) return true;
  const impl = registry[cost.fn];
  if (!impl) {
    log(ctx.state, `[motor] coste "${cost.fn}" desconocido — no se puede pagar.`);
    return false;
  }
  return impl(ctx, cost.args || {}, picks);
}

// Candidate pools for the costs that are paid with cards the player chooses, and how many of
// them each needs.
const CHOICE_COST_POOLS = {
  discart: (ctx, args) => handPool(ctx, { ...args, filter: {} }),
  discardCard: (ctx, args) => handPool(ctx, { ...args, filter: {} }),
  discardFromHand: (ctx, args) => handPool(ctx, args),
  discardCards: (ctx, args) => handPool(ctx, args),
  discardSelfAndCard: (ctx, args) => handPool(ctx, args),
  sacrificeFiltered: (ctx, args) => ownMonsterPool(ctx, args, { excludeSelf: false }),
  tributeMonster: (ctx, args) => ownMonsterPool(ctx, args),
  sacrificeControlled: (ctx) => ownMonsterPool(ctx, {}),
  destroyMonster: (ctx) => ownMonsterPool(ctx, {}),
  destroyOwnMonster: (ctx) => ownMonsterPool(ctx, {}),
  exileFiltered: (ctx, args) => exilePool(ctx, args),
  millSpecific: (ctx, args) => deckPool(ctx, args),
};

function costPickCount(cost) {
  const args = cost.args || {};
  if (cost.fn === 'discardCards') return (args.count || 1) - (includesSelf(args) ? 1 : 0);
  if (cost.fn === 'discardSelfAndCard') return args.count || 1;
  if (cost.fn === 'destroyMonster' || cost.fn === 'destroyOwnMonster' || cost.fn === 'sacrificeFiltered') return 1;
  return args.count || args.amount || 1;
}

// The cards this cost would take given the player's `picks` (their choices first, then the only
// ones left): lets the rest of an activation keep those out of its own target choices.
function costPicks(ctx, cost, picks) {
  if (!cost || !CHOICE_COST_POOLS[cost.fn]) return [];
  const pool = CHOICE_COST_POOLS[cost.fn](ctx, cost.args || {});
  return fillChoice((picks || []).filter((id) => pool.includes(id)), pool, costPickCount(cost));
}

// A field instance describes as a token or a real card; a hand/graveyard/deck one is never a
// token (tokens only ever live on the field).
function describeCostCandidate(state, id) {
  const m = getFieldMonster(state, id);
  if (m) return m.isToken ? { instanceId: id, name: m.tokenDef.name, image: null } : { instanceId: id, cardId: m.cardId, name: getCard(m.cardId).name, image: getCard(m.cardId).image };
  const card = cardOf(id);
  return { instanceId: id, cardId: card._id.toString(), name: card.name, image: card.image };
}

const COST_PROMPTS = {
  millSpecific: 'Elige la carta de tu Mazo que pagará el coste',
  tributeMonster: 'Elige el monstruo que sacrificas',
  sacrificeFiltered: 'Elige el monstruo que sacrificas',
  sacrificeControlled: 'Elige el monstruo que sacrificas',
  destroyMonster: 'Elige el monstruo que destruyes',
  destroyOwnMonster: 'Elige el monstruo que destruyes',
  exileFiltered: 'Elige las cartas que exilias',
};

// Used right before payCost by anything that pays a cost off a player pick: null once there's
// nothing left to ask (this cost fn doesn't need a pick, or 0/exactly-enough candidates remain for
// what's still needed) — otherwise the remaining legal candidates to offer as a choose-target.
// Only picks that are actually in this cost's pool count, so a target picked for the effect
// itself is never mistaken for a cost payment.
function pendingCostChoice(ctx, cost, targets) {
  if (!cost) return null;
  const poolFn = CHOICE_COST_POOLS[cost.fn];
  if (!poolFn) return null;
  const pool = poolFn(ctx, cost.args || {});
  const count = costPickCount(cost);
  const chosenSoFar = (targets || []).filter((id) => pool.includes(id));
  if (chosenSoFar.length >= count) return null;
  const remaining = pool.filter((id) => !chosenSoFar.includes(id));
  if (remaining.length <= count - chosenSoFar.length) return null;
  const options = remaining.map((id) => describeCostCandidate(ctx.state, id));
  options.prompt = COST_PROMPTS[cost.fn] || 'Elige la carta que pagará el coste';
  return options;
}

module.exports = { payCost, pendingCostChoice, costPicks, registry, CHOICE_COST_POOLS };
