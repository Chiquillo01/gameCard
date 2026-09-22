// Actions that pick and remove/move cards on the board. They take the targets a player chose when
// there are any; otherwise they resolve the effect's own rule ("destroy a monster of the
// opponent" -> the strongest one, "a random monster" -> random, ...), because the interface has no
// target picker yet. Registered over the older, simpler versions in actions.js.
const { getCard } = require('../cardIndex');
const { player, opponentIndex, moveToZone, placeMonster, removeFromZone, findEmptySlot, corrodedSlots, log } = require('../zones');
const { matchesFilter, matchesCardFilter } = require('../filters');
const { cardIdFromInstance } = require('../deckUtils');

// A protected monster ignores destroy/exile effects that come from the opponent's cards.
function isProtectedFrom(entry, ownerIndex, ctx) {
  return !!entry.immuneToOpponentEffects && ownerIndex !== ctx.controllerIndex;
}

function fieldEntries(ctx, side, zone) {
  const rows = [];
  const push = (idx, list, kind) => list.filter(Boolean).forEach((entry) => rows.push({ entry, ownerIndex: idx, kind }));
  [0, 1].forEach((idx) => {
    if (side === 'self' && idx !== ctx.controllerIndex) return;
    if (side === 'opponent' && idx !== opponentIndex(ctx.controllerIndex)) return;
    const pl = player(ctx.state, idx);
    if (zone === 'monster' || zone === 'any') push(idx, pl.field.monsters, 'monster');
    if (zone === 'support' || zone === 'any') push(idx, [...pl.field.support, pl.field.territory], 'support');
  });
  return rows;
}

function rowMatches(row, args) {
  const { entry } = row;
  if ((args.faceUp || (args.filter && args.filter.faceUp)) && entry.faceDown) return false;
  if ((args.faceDown || (args.filter && args.filter.faceDown)) && !entry.faceDown) return false;
  if (args.filter && Object.values(args.filter).some((v) => v !== undefined && v !== null && v !== '' && v !== true && v !== false)) {
    if (entry.isToken) return false;
    if (row.kind === 'monster' ? !matchesFilter(entry, args.filter) : !matchesCardFilter(getCard(entry.cardId), args.filter)) return false;
  }
  if (args.maxDef != null && row.kind === 'monster' && (entry.baseDef + ((entry.tempBuff || {}).def || 0)) > args.maxDef) return false;
  return true;
}

function pickRows(rows, args) {
  const power = (r) => (r.entry.baseAtk || 0) + ((r.entry.tempBuff || {}).atk || 0);
  const sorted = [...rows];
  if (args.pick === 'random') sorted.sort(() => Math.random() - 0.5);
  else if (args.pick === 'weakest') sorted.sort((a, b) => power(a) - power(b));
  else if (args.pick === 'strongest') sorted.sort((a, b) => power(b) - power(a));
  return sorted.slice(0, args.count || 1);
}

function sendToGraveyard(ctx, row) {
  const { entry, ownerIndex } = row;
  const card = entry.isToken ? null : getCard(entry.cardId);
  if (entry.isToken) {
    const pl = player(ctx.state, ownerIndex);
    const i = pl.field.monsters.indexOf(entry);
    if (i !== -1) pl.field.monsters[i] = null;
  } else {
    moveToZone(ctx.state, entry.instanceId, 'graveyard', ownerIndex);
  }
  log(ctx.state, `${card ? card.name : 'Una ficha'} es destruida.`);
  if (!entry.isToken) {
    const { fireTrigger } = require('../effectEngine');
    fireTrigger(ctx.state, 'sentToGraveyard', { instanceId: entry.instanceId, cardId: entry.cardId, ownerIndex });
  }
}

// destroy: the chosen targets, or `count` cards matching side/zone/filter picked per `pick`.
// Remembers how many were destroyed in ctx.destroyedCount for a following "y si lo haces" step.
function destroy(ctx, args, targets) {
  ctx.destroyedCount = 0;
  let rows;
  if (targets && targets.length && targets.every((t) => typeof t === 'string')) {
    rows = fieldEntries(ctx, 'any', 'any').filter((r) => targets.includes(r.entry.instanceId));
  } else {
    const own = ctx.effect && ctx.effect.targetSelector === 'ownFieldMonster';
    const side = args.side || (own ? 'self' : args.target === 'opponentMonster' || args.target === 'opponentField' ? 'opponent' : 'any');
    const wantsSupport = args.target === 'support' || (args.filter && /^(apoyo|support|soporte)$/i.test(args.filter.category || ''));
    const zone = args.zone && args.zone !== 'field' ? args.zone : wantsSupport ? 'support' : 'monster';
    const all = args.target === 'allMonsters';
    const wantSelf = args.excludeSelf !== false && !all;
    const filter = wantsSupport && args.filter ? { ...args.filter, category: undefined } : args.filter;
    rows = fieldEntries(ctx, side, zone).filter((r) => rowMatches(r, { ...args, filter }) && !(wantSelf && r.entry.instanceId === ctx.sourceInstanceId));
    // With nothing chosen and no side given, go for the rival's cards first.
    if (side === 'any' && rows.some((r) => r.ownerIndex !== ctx.controllerIndex)) rows = rows.filter((r) => r.ownerIndex !== ctx.controllerIndex);
    rows = pickRows(rows, { pick: own ? 'weakest' : 'strongest', ...args, count: all ? 999 : args.count });
  }
  rows.forEach((row) => {
    if (isProtectedFrom(row.entry, row.ownerIndex, ctx)) {
      log(ctx.state, 'Un monstruo protegido ignora el efecto.');
      return;
    }
    sendToGraveyard(ctx, row);
    ctx.destroyedCount += 1;
  });
}

// "Y si lo haces, esta carta gana +X Atk y Vida": a permanent gain, optionally only when the
// previous step destroyed something.
function growSelf(ctx, args) {
  if (args.ifPreviousSucceeded && !(ctx.destroyedCount > 0)) return;
  const entry = player(ctx.state, ctx.controllerIndex).field.monsters.find((m) => m && m.instanceId === ctx.sourceInstanceId);
  if (!entry) return;
  entry.baseAtk += args.atk || 0;
  entry.baseDef += args.def || 0;
  log(ctx.state, `${getCard(entry.cardId).name} gana +${args.atk || 0} Atk y +${args.def || 0} Vida.`);
}

// Takes control of an opponent's monster (the picked one, else the strongest), optionally changing
// its breed and destroying the rest of that player's monsters.
function takeControl(ctx, args, targets) {
  const oppIdx = opponentIndex(ctx.controllerIndex);
  const opp = player(ctx.state, oppIdx);
  const me = player(ctx.state, ctx.controllerIndex);
  const candidates = opp.field.monsters.filter(Boolean).filter((m) => !m.faceDown || true);
  const chosen = (targets && targets.length && candidates.find((m) => targets.includes(m.instanceId)))
    || pickRows(candidates.map((entry) => ({ entry })), { pick: 'strongest', count: 1 }).map((r) => r.entry)[0];
  if (!chosen) return;
  const slot = findEmptySlot(me.field.monsters, corrodedSlots(me, 'monsters'));
  if (slot === -1) {
    log(ctx.state, 'No hay espacio para tomar el control del monstruo.');
    return;
  }
  // Through removeFromZone, not a bare null assignment, so this also releases any Equipo cards
  // that were on the stolen monster (per the rulebook, they don't follow it to the new controller).
  removeFromZone(ctx.state, chosen.instanceId, { zone: 'field:monster', ownerIndex: oppIdx, slot: opp.field.monsters.indexOf(chosen) });
  chosen.hasAttacked = true;
  if (args.changeBreed) chosen.breedOverride = args.changeBreed;
  me.field.monsters[slot] = chosen;
  log(ctx.state, `${me.userId} toma el control de ${getCard(chosen.cardId).name}.`);
  if (args.destroyOthers) {
    opp.field.monsters.filter(Boolean).forEach((m) => sendToGraveyard(ctx, { entry: m, ownerIndex: oppIdx }));
  }
}

// --- Search actions: "añade a tu Mano X del Mazo/Cementerio/Exilio" --------------------------
// Every search-style action step funnels through here, so the candidates offered to the player
// (searchCandidates, below) and the cards an activation actually moves can never drift apart.

// Normalizes the handful of search-action shapes the effect data uses into one { filter, zones, count }.
function normalizeSearchArgs(fn, args = {}) {
  if (fn === 'searchDeck') return { filter: { attribute: args.attribute, breed: args.breed, family: args.family }, zones: ['deck'], count: args.count || 1 };
  if (fn === 'searchFromDeck') return { filter: args, zones: ['deck'], count: 1 };
  if (fn === 'addCardToHandFromGraveyard') return { filter: args.filter || args, zones: ['graveyard'], count: args.count || 1 };
  if (fn === 'recoverCardsToHand') {
    const zones = (Array.isArray(args.scope) ? args.scope : [args.scope || 'graveyard']).map((z) => (z === 'banished' ? 'banished' : 'graveyard'));
    return { filter: args.filter || { breed: args.breed, family: args.family }, zones, count: args.count || 1 };
  }
  // addCardToHandFromDeck (the default/most general one)
  const zones = (Array.isArray(args.scope) ? args.scope : [args.scope || 'deck']).map((z) => (z === 'banished' ? 'banished' : z === 'graveyard' ? 'graveyard' : 'deck'));
  return { filter: args.filter || { breed: args.breed, family: args.family, name: args.name, attribute: args.attribute, nameContains: args.nameContains }, zones, count: args.count || 1 };
}

// Every card instance a search step could legally pick right now — what the player gets to choose
// from, and also what a plain automatic resolution (no choice offered) falls back to.
function searchCandidates(state, controllerIndex, fn, args) {
  const pl = player(state, controllerIndex);
  const { filter, zones } = normalizeSearchArgs(fn, args);
  const ids = [];
  zones.forEach((zone) => pl[zone].forEach((id) => {
    if (matchesCardFilter(getCard(cardIdFromInstance(id)), filter)) ids.push(id);
  }));
  return ids;
}

// Moves the player's chosen `targets` to hand; with none given (a triggered effect that resolves
// on its own, with no interactive step) falls back to the first legal matches.
function runSearch(ctx, fn, args, targets) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const { filter, zones, count } = normalizeSearchArgs(fn, args);
  const picked = (targets && targets.length ? targets : searchCandidates(ctx.state, ctx.controllerIndex, fn, args)).slice(0, count);
  let moved = 0;
  picked.forEach((id) => {
    const zone = zones.find((z) => pl[z].includes(id));
    if (!zone || !matchesCardFilter(getCard(cardIdFromInstance(id)), filter)) return;
    pl[zone] = pl[zone].filter((x) => x !== id);
    pl.hand.push(id);
    moved++;
  });
  log(ctx.state, `${pl.userId} añade ${moved} carta(s) a la mano.`);
}

const addCardToHandFromDeck = (ctx, args, targets) => runSearch(ctx, 'addCardToHandFromDeck', args, targets);
const recoverCardsToHand = (ctx, args, targets) => runSearch(ctx, 'recoverCardsToHand', args, targets);
const searchDeck = (ctx, args, targets) => runSearch(ctx, 'searchDeck', args, targets);
const searchFromDeck = (ctx, args, targets) => runSearch(ctx, 'searchFromDeck', args, targets);
const addCardToHandFromGraveyard = (ctx, args, targets) => runSearch(ctx, 'addCardToHandFromGraveyard', args, targets);

const SEARCH_FNS = ['addCardToHandFromDeck', 'recoverCardsToHand', 'searchDeck', 'searchFromDeck', 'addCardToHandFromGraveyard'];

// Rulebook doesn't say a search is random — the player picks. Used by support.js/effectEngine.js
// right before an effect would resolve: if its search step has more legal matches than the
// player has already picked for, this hands back the options instead of letting the effect grab
// whichever came first.
function pendingSearchChoice(state, controllerIndex, effect, targets) {
  if (targets && targets.length) return null; // already chosen
  const step = (effect.actions || []).find((s) => SEARCH_FNS.includes(s.fn));
  if (!step) return null;
  const { count } = normalizeSearchArgs(step.fn, step.args || {});
  const candidates = searchCandidates(state, controllerIndex, step.fn, step.args || {});
  if (candidates.length <= count) return null; // 0 or exactly enough — nothing to choose between
  return candidates.map((id) => {
    const card = getCard(cardIdFromInstance(id));
    return { instanceId: id, cardId: card._id.toString(), name: card.name, image: card.image };
  });
}

// "No puede ser destruido en batalla": flags are recomputed every board change (see
// effectEngine.recomputeContinuous), so they vanish with the effect.
function preventBattleDestruction(ctx, args) {
  const mine = player(ctx.state, ctx.controllerIndex).field.monsters.filter(Boolean);
  const targets = args.target === 'self' ? mine.filter((m) => m.instanceId === ctx.sourceInstanceId) : mine.filter((m) => !args.attribute || matchesFilter(m, { attribute: args.attribute }));
  targets.forEach((m) => { m.cannotBeDestroyedByBattle = true; });
}

function protectFromOpponentEffects(ctx) {
  const entry = player(ctx.state, ctx.controllerIndex).field.monsters.find((m) => m && m.instanceId === ctx.sourceInstanceId);
  if (entry) entry.immuneToOpponentEffects = true;
}

// Timed buff: a "hasta el final del turno" effect is stored on the state and re-applied by
// effectEngine.recomputeContinuous until that turn ends.
function grantTimedBuff(ctx, ids, buff, expiresTurn) {
  ctx.state.timedBuffs = ctx.state.timedBuffs || [];
  ctx.state.timedBuffs.push({ ids, buff, expiresTurn });
}

module.exports = {
  destroy,
  destroyTarget: destroy,
  destroyCards: destroy,
  growSelf,
  takeControl,
  addCardToHandFromDeck,
  recoverCardsToHand,
  searchDeck,
  searchFromDeck,
  addCardToHandFromGraveyard,
  preventBattleDestruction,
  cannotBeDestroyedOrExiled: protectFromOpponentEffects,
  cannotBeDestroyedByOpponentEffects: protectFromOpponentEffects,
  grantTimedBuff,
  pendingSearchChoice,
};
