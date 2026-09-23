const { getCard } = require('../cardIndex');
const { player, opponentIndex, getFieldMonster, findInstanceLocation } = require('../zones');
const { cardIdFromInstance } = require('../deckUtils');
const { matchesFilter } = require('../filters');

function wasOnField(ctx) {
  return true; // by the time a "sent to graveyard" trigger fires we can no longer check the
  // pre-move field state precisely without a snapshot; treated as satisfied, matching the
  // common case (the card really was just on the field when the trigger fired).
}

function faceUp(ctx) {
  const m = getFieldMonster(ctx.state, ctx.sourceInstanceId);
  return !!m && !m.faceDown;
}

function opponentHasMorePixels(ctx) {
  const opp = player(ctx.state, opponentIndex(ctx.controllerIndex));
  const me = player(ctx.state, ctx.controllerIndex);
  return opp.pixelcoins > me.pixelcoins;
}

function noCardsControlled(ctx) {
  const pl = player(ctx.state, ctx.controllerIndex);
  return pl.field.monsters.every((m) => !m) && pl.field.support.every((s) => !s);
}

// A shared budget across a few alternative effects on THIS card ("puedes activar 1 de estos 2
// efectos... una vez por turno") — `args.name` always names the effect's own card, so the key
// still needs the source instance or two copies of that card would wrongly share one budget.
function limitPerTurn(ctx, args) {
  ctx.state.turnLimits = ctx.state.turnLimits || {};
  const key = `${ctx.turnNumberAtCheck || ctx.state.turnNumber}:${args.name}:${ctx.sourceInstanceId}`;
  const used = ctx.state.turnLimits[key] || 0;
  return used < (args.max || 1);
}

function canBeSummonedFrom(ctx, args) {
  const loc = findInstanceLocation(ctx.state, ctx.sourceInstanceId);
  return !!loc && args.zones.includes(loc.zone);
}

function firstTimeSummon(ctx, args) {
  ctx.state.summonHistory = ctx.state.summonHistory || {};
  const key = `${args.breed}`;
  const already = ctx.state.summonHistory[key];
  ctx.state.summonHistory[key] = true;
  return !already;
}

// Where a card's own once-per-copy bookkeeping lives: on its field entry, so it starts fresh every
// time the card is put onto the field again.
function findFieldEntry(state, instanceId) {
  return state.players
    .flatMap((p) => [...p.field.monsters, ...p.field.support, p.field.territory])
    .find((e) => e && e.instanceId === instanceId);
}

// "La primera vez que...": the effect works once for as long as this copy stays on the field.
function oncePerCardOnField(ctx) {
  const entry = findFieldEntry(ctx.state, ctx.sourceInstanceId);
  return !!entry && !(entry.usedEffects && entry.usedEffects[ctx.effect._id]);
}

function markCardEffectUsed(ctx) {
  const entry = findFieldEntry(ctx.state, ctx.sourceInstanceId);
  if (!entry) return;
  entry.usedEffects = { ...(entry.usedEffects || {}), [ctx.effect._id]: true };
}

// "Si controlas a X": a face-up monster or Apoyo of yours with that name.
// "Si controlas [count] monstruo(s) [filter]" (breed/family/attribute/name) — count defaults to 1.
function controlsMonster(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = args.filter || { breed: args.breed, family: args.family, attribute: args.attribute, name: args.name };
  const count = args.count || 1;
  return pl.field.monsters.filter((m) => m && !m.faceDown && matchesFilter(m, filter)).length >= count;
}

// "Si controlas [count] monstruo(s) [filter]" EXCLUDING the card whose own effect this is
// (Avispa gigante's continuous buff: "si controlas OTRO Insecto").
function controlsAnotherOfFamily(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = { family: args.family };
  return pl.field.monsters.some((m) => m && m.instanceId !== ctx.sourceInstanceId && !m.faceDown && matchesFilter(m, filter));
}

// Aboleth's event-based summon window (see zones.js moveToZone) — open for the rest of the turn
// a water monster was destroyed, on either side.
function waterMonsterDestroyedThisTurn(ctx) {
  return !!ctx.state.specialSummonWindows && ctx.state.specialSummonWindows.waterMonsterDestroyed === ctx.state.turnNumber;
}

function controlsCard(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  return [...pl.field.monsters, ...pl.field.support, pl.field.territory].some((e) => e && !e.faceDown && !e.isToken && getCard(e.cardId).name === args.name);
}

function effectIncludes() {
  return true; // negation-style guard evaluated at activation time by effectEngine
}

function canActivateOnOpponentTurn() {
  return true;
}

const registry = {
  wasOnField,
  faceUp,
  opponentHasMorePixels,
  noCardsControlled,
  limitPerTurn,
  canBeSummonedFrom,
  firstTimeSummon,
  oncePerCardOnField,
  controlsCard,
  controlsMonster,
  controlsAnotherOfFamily,
  waterMonsterDestroyedThisTurn,
  effectIncludes,
  canActivateOnOpponentTurn,
};

function checkConditions(ctx, conditions = []) {
  return conditions.every((c) => {
    const impl = registry[c.fn];
    if (!impl) return true; // unknown condition: fail open so new content isn't dead on arrival
    return impl(ctx, c.args || {});
  });
}

function markLimitUsed(state, name, sourceInstanceId) {
  state.turnLimits = state.turnLimits || {};
  const key = `${state.turnNumber}:${name}:${sourceInstanceId}`;
  state.turnLimits[key] = (state.turnLimits[key] || 0) + 1;
}

module.exports = { checkConditions, markLimitUsed, markCardEffectUsed, registry };
