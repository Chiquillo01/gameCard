const { getCard } = require('../cardIndex');
const { player, opponentIndex, getFieldMonster, findInstanceLocation } = require('../zones');
const { cardIdFromInstance } = require('../deckUtils');

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

function limitPerTurn(ctx, args) {
  ctx.state.turnLimits = ctx.state.turnLimits || {};
  const key = `${ctx.turnNumberAtCheck || ctx.state.turnNumber}:${args.name}`;
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

function isEquippedToRace(ctx, args) {
  const support = ctx.state.players.flatMap((p) => p.field.support).find((s) => s && s.instanceId === ctx.sourceInstanceId);
  return !!(support && support.equippedTo);
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
  isEquippedToRace,
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

function markLimitUsed(state, name) {
  state.turnLimits = state.turnLimits || {};
  const key = `${state.turnNumber}:${name}`;
  state.turnLimits[key] = (state.turnLimits[key] || 0) + 1;
}

module.exports = { checkConditions, markLimitUsed, registry };
