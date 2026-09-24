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

// What an effect "includes", in the words Kraken/Rakshasa use ("si se activa un efecto que incluya
// cualquiera de los siguientes"), derived from the action steps it would run.
function actionTags(step) {
  const a = step.args || {};
  const zones = [].concat(a.scope || [], a.zones || [], (a.filter && a.filter.zone) || []);
  const has = (z) => zones.includes(z);
  const tags = [];
  switch (step.fn) {
    case 'addCardToHandFromDeck':
      if (!zones.length || has('deck')) tags.push('addFromDeckToHand');
      if (has('graveyard')) tags.push('addFromGraveyardToHand');
      break;
    case 'searchDeck':
    case 'searchFromDeck':
      tags.push('addFromDeckToHand');
      break;
    case 'recoverCardsToHand':
    case 'addCardToHandFromGraveyard':
      if (!zones.length || has('graveyard')) tags.push('addFromGraveyardToHand');
      break;
    case 'summonFromDeck':
    case 'specialSummonFromDeck':
      tags.push('summonFromDeck');
      break;
    case 'specialSummonFromGY':
      tags.push('specialSummonFromGraveyard');
      break;
    case 'summon':
    case 'summonFromZones':
      if (!zones.length || has('graveyard')) tags.push('specialSummonFromGraveyard');
      if (has('deck')) tags.push('summonFromDeck');
      break;
    case 'millDeck':
    case 'sendFromDeckToGY':
      tags.push('sendFromDeckToGraveyard');
      break;
    case 'returnFromGraveyardToDeck':
      tags.push('returnFromGraveyardToDeck');
      break;
    case 'banishFromGraveyard':
      tags.push('banishFromGraveyard');
      break;
    case 'banishFromDeck':
      tags.push('banishFromDeck');
      break;
    default:
  }
  return tags;
}

// "Si se activa un efecto que incluya X" — X among the actions of the link on top of the Pila
// (the one this card would respond to).
function effectIncludes(ctx, args) {
  const top = ctx.state.chain && ctx.state.chain[ctx.state.chain.length - 1];
  if (!top || top.kind === 'attack') return false;
  const wanted = args.effects || [];
  const tags = (top.effects || []).flatMap((e) => (e.actions || []).flatMap(actionTags));
  // A cost that mills the deck counts too ("envía una carta del Mazo al Cementerio").
  (top.effects || []).forEach((e) => { if (e.cost && e.cost.fn === 'millSpecific') tags.push('sendFromDeckToGraveyard'); });
  return wanted.some((w) => tags.includes(w));
}

// "Esta carta puede ser usada en el turno de tu oponente [si ...]": always fine on your own turn;
// on the rival's, every condition in `requires` must hold too (Sello Temporal: "si no controlas
// cartas").
function canActivateOnOpponentTurn(ctx, args) {
  if (ctx.state.turnPlayer === ctx.controllerIndex) return true;
  return checkConditions(ctx, args.requires || []);
}

const opponentOf = (ctx) => player(ctx.state, opponentIndex(ctx.controllerIndex));

function opponentControlsMonster(ctx) {
  return opponentOf(ctx).field.monsters.some(Boolean);
}

function opponentHasMoreMonsters(ctx) {
  const mine = player(ctx.state, ctx.controllerIndex).field.monsters.filter(Boolean).length;
  return opponentOf(ctx).field.monsters.filter(Boolean).length > mine;
}

function opponentHasMoreCardsInHand(ctx) {
  return opponentOf(ctx).hand.length > player(ctx.state, ctx.controllerIndex).hand.length;
}

function ownVPBelowOrEqual(ctx, args) {
  return player(ctx.state, ctx.controllerIndex).vp <= (args.amount || 0);
}

// "Una vez por duelo" — per player and per named use (marked by markDuelLimitUsed once it happens).
function onceDuelLimit(ctx, args) {
  const used = ((ctx.state.duelLimits || {})[`${ctx.controllerIndex}:${args.name}`]) || 0;
  return used < (args.max || 1);
}

function markDuelLimitUsed(state, controllerIndex, conditions = []) {
  conditions.filter((c) => c.fn === 'onceDuelLimit').forEach((c) => {
    state.duelLimits = state.duelLimits || {};
    const key = `${controllerIndex}:${c.args.name}`;
    state.duelLimits[key] = (state.duelLimits[key] || 0) + 1;
  });
}

// "Si esta carta tiene al menos N [counter]".
function hasCounter(ctx, args) {
  const entry = findFieldEntry(ctx.state, ctx.sourceInstanceId);
  return !!entry && ((entry.counters || {})[args.counter] || 0) >= (args.min || 1);
}

// "Excepto el turno que fue enviada al Cementerio".
function notSameTurnSentToGraveyard(ctx) {
  return ((ctx.state.graveyardTurn || {})[ctx.sourceInstanceId]) !== ctx.state.turnNumber;
}

// An Equipo card equipped to a monster of a given breed (args.breed; any monster if none given).
function isEquippedToRace(ctx, args) {
  const entry = findFieldEntry(ctx.state, ctx.sourceInstanceId);
  const target = entry && entry.equippedTo && getFieldMonster(ctx.state, entry.equippedTo);
  if (!target) return false;
  return !args.breed || matchesFilter(target, { breed: args.breed });
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
  opponentControlsMonster,
  opponentHasMoreMonsters,
  opponentHasMoreCardsInHand,
  ownVPBelowOrEqual,
  onceDuelLimit,
  hasCounter,
  notSameTurnSentToGraveyard,
  isEquippedToRace,
};

// A condition the engine doesn't know is never met: an effect whose requirement can't be checked
// stays unusable rather than firing when it shouldn't.
function checkConditions(ctx, conditions = []) {
  return conditions.every((c) => {
    const impl = registry[c.fn];
    if (!impl) return false;
    return impl(ctx, c.args || {});
  });
}

function markLimitUsed(state, name, sourceInstanceId) {
  state.turnLimits = state.turnLimits || {};
  const key = `${state.turnNumber}:${name}:${sourceInstanceId}`;
  state.turnLimits[key] = (state.turnLimits[key] || 0) + 1;
}

module.exports = { checkConditions, markLimitUsed, markCardEffectUsed, markDuelLimitUsed, actionTags, registry };
