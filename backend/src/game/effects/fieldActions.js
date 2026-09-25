// Actions that pick and remove/move cards on the board. When the effect's text has the player
// select ("selecciona", "un monstruo enemigo"), the step has a pool (targets.js) and gets exactly
// the player's picks; otherwise they resolve the effect's own rule ("destroy all monsters", "a
// random monster" -> random, ...). Registered over the older, simpler versions in actions.js.
const { getCard } = require('../cardIndex');
const { player, opponentIndex, moveToZone, placeMonster, removeFromZone, findEmptySlot, corrodedSlots, log } = require('../zones');
const { matchesFilter, matchesCardFilter } = require('../filters');
const { cardIdFromInstance } = require('../deckUtils');

// A protected card ignores destroy/exile effects that come from the opponent's cards, and nothing
// can affect a card that is immune to the effect's source (targets.js canAffect).
function isProtectedFrom(entry, ownerIndex, ctx) {
  if (!require('../targets').canAffect(ctx, entry)) return true;
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

// A card destroyed by an effect: to its owner's Cementerio, then "cuando es enviada al Cementerio"
// and "cuando es destruido por efecto de una carta" (Gárgola, Pez Leviatán) fire.
function sendToGraveyard(ctx, row) {
  const { entry, ownerIndex } = row;
  const card = entry.isToken ? null : getCard(entry.cardId);
  const wasMonster = row.kind !== 'support' && !!player(ctx.state, ownerIndex).field.monsters.includes(entry);
  if (entry.isToken) {
    const pl = player(ctx.state, ownerIndex);
    const i = pl.field.monsters.indexOf(entry);
    if (i !== -1) pl.field.monsters[i] = null;
  } else {
    moveToZone(ctx.state, entry.instanceId, 'graveyard');
  }
  log(ctx.state, `${card ? card.name : 'Una ficha'} es destruida.`);
  if (!entry.isToken) {
    const { fireTrigger } = require('../effectEngine');
    fireTrigger(ctx.state, 'sentToGraveyard', { instanceId: entry.instanceId, cardId: entry.cardId, ownerIndex });
    if (wasMonster) fireTrigger(ctx.state, 'onMonsterDestroyed', { instanceId: entry.instanceId, cardId: entry.cardId, ownerIndex, reason: 'effect' });
  }
}

// destroy: the player's picks when the step is a "selecciona" one (the only ones there are when
// there was nothing to choose between), else `count` cards matching side/zone/filter per `pick`.
// Remembers how many were destroyed in ctx.destroyedCount for a following "y si lo haces" step.
function destroy(ctx, args, targets) {
  ctx.destroyedCount = 0;
  let rows;
  if (Array.isArray(targets) && require('../targets').stepPool(ctx, { fn: 'destroy', args })) {
    rows = fieldEntries(ctx, 'any', 'any').filter((r) => targets.includes(r.entry.instanceId));
  } else if (targets && targets.length && targets.every((t) => typeof t === 'string')) {
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
  chosen.attackLockTurn = ctx.state.turnNumber;
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
// `excludeAttributesOf` (Licántropo Zombie: "con diferente atributo a los monstruos Licántropo que
// tengas en Cementerio") drops candidates sharing an attribute with those cards.
function searchCandidates(state, controllerIndex, fn, args) {
  const pl = player(state, controllerIndex);
  const { filter, zones } = normalizeSearchArgs(fn, args);
  let taken = [];
  if (args.excludeAttributesOf) {
    const ex = args.excludeAttributesOf;
    taken = (pl[ex.zone || 'graveyard'] || []).map((id) => getCard(cardIdFromInstance(id))).filter((c) => matchesCardFilter(c, ex.filter || {})).map((c) => c.attribute);
  }
  // Refuerzos: "un monstruo que comparta atributo con un monstruo que tengas en Campo".
  const fieldAttributes = filter.matchAttributeWithFieldMonster
    ? pl.field.monsters.filter((m) => m && !m.isToken && !m.faceDown).map((m) => getCard(m.cardId).attribute)
    : null;
  const ids = [];
  zones.forEach((zone) => pl[zone].forEach((id) => {
    const card = getCard(cardIdFromInstance(id));
    if (!matchesCardFilter(card, filter) || taken.includes(card.attribute)) return;
    if (fieldAttributes && !(['monster', 'fusion'].includes(card.category) && fieldAttributes.includes(card.attribute))) return;
    ids.push(id);
  }));
  return ids;
}

// Moves the player's chosen `targets` to hand; with none given (called outside the usual pick
// flow) falls back to the first legal matches.
function runSearch(ctx, fn, args, targets) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const { filter, zones, count } = normalizeSearchArgs(fn, args);
  const candidates = searchCandidates(ctx.state, ctx.controllerIndex, fn, args);
  const picked = (targets && targets.length ? targets.filter((id) => candidates.includes(id)) : candidates).slice(0, count);
  const moved = [];
  picked.forEach((id) => {
    const zone = zones.find((z) => pl[z].includes(id));
    if (!zone || !matchesCardFilter(getCard(cardIdFromInstance(id)), filter)) return;
    pl[zone] = pl[zone].filter((x) => x !== id);
    pl.hand.push(id);
    moved.push(id);
  });
  log(ctx.state, `${pl.userId} añade ${moved.length} carta(s) a la mano.`);
  // Rulebook, Avispa Mutante: "Si es añadida a tu Mano desde el Mazo o Cementerio, invocarlo
  // inmediatamente de forma especial." — every search lands cards from one of those two zones.
  const { fireHandTrigger } = require('../summon');
  moved.forEach((id) => fireHandTrigger(ctx.state, 'addedToHand', id, ctx.controllerIndex));
  // Viaje de Unión: "si tu oponente añade cartas de su Mazo a su Mano, roba".
  if (moved.length && zones.includes('deck')) require('../draw').runMirrors(ctx.state, 'search', ctx.controllerIndex, moved.length);
}

const addCardToHandFromDeck = (ctx, args, targets) => runSearch(ctx, 'addCardToHandFromDeck', args, targets);
const recoverCardsToHand = (ctx, args, targets) => runSearch(ctx, 'recoverCardsToHand', args, targets);
const searchDeck = (ctx, args, targets) => runSearch(ctx, 'searchDeck', args, targets);
const searchFromDeck = (ctx, args, targets) => runSearch(ctx, 'searchFromDeck', args, targets);
const addCardToHandFromGraveyard = (ctx, args, targets) => runSearch(ctx, 'addCardToHandFromGraveyard', args, targets);

const SEARCH_FNS = ['addCardToHandFromDeck', 'recoverCardsToHand', 'searchDeck', 'searchFromDeck', 'addCardToHandFromGraveyard'];

// --- Summoning by a card's effect ("invoca del Mazo/Cementerio/Mano un X") ----------------------
// Every one of these brings out exactly the cards the player picked (targets.js pools them), then
// announces the summon like any other — so its "en invocación" effects fire — and marks it as a
// summon *by an effect*, which "cuando es invocado por el efecto de un Licano" cards react to.
function summonByEffect(ctx, instanceId, { position = 'attack', ownerIndex = ctx.controllerIndex } = {}) {
  if (!placeMonster(ctx.state, instanceId, ownerIndex, { position })) {
    log(ctx.state, 'No hay espacio en el Campo para invocar.');
    return false;
  }
  const card = getCard(cardIdFromInstance(instanceId));
  log(ctx.state, `${player(ctx.state, ownerIndex).userId} invoca a ${card.name} por un efecto.`);
  const { announceSummon } = require('../summon');
  const by = ctx.sourceInstanceId && !String(ctx.sourceInstanceId).startsWith('token:') ? ctx.sourceInstanceId : null;
  announceSummon(ctx.state, ownerIndex, instanceId, card, false, { byEffect: true, bySourceInstanceId: by, bySourceCardId: by ? cardIdFromInstance(by) : null });
  return true;
}

// The generic "summon the picked card(s) from wherever the step's pool looks" action behind
// summonFromDeck / specialSummonFromDeck / summonFromHand / specialSummonFromGY / summonFromZones /
// summon. `targets` are the picks resolveActions handed this step (already inside its pool).
function summonPicked(ctx, args, targets) {
  (targets || []).forEach((id) => summonByEffect(ctx, id, { position: args.position || 'attack' }));
}

// "Envía al Cementerio un [filter] de tu Mazo" (Héroe de Marfil) — the one the player picks.
function sendFromDeckToGY(ctx, args, targets) {
  (targets || []).forEach((id) => {
    moveToZone(ctx.state, id, 'graveyard');
    log(ctx.state, `${getCard(cardIdFromInstance(id)).name} es enviada del Mazo al Cementerio.`);
  });
  ctx.movedCards = [...(ctx.movedCards || []), ...(targets || [])];
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
  summonFromDeck: summonPicked,
  specialSummonFromDeck: summonPicked,
  summonFromHand: summonPicked,
  specialSummonFromGY: summonPicked,
  summonFromZones: summonPicked,
  summon: summonPicked,
  sendFromDeckToGY,
  // Not actions — shared with targets.js / effectEngine.js.
  sendToGraveyard,
  summonByEffect,
  searchCandidates,
  normalizeSearchArgs,
  SEARCH_FNS,
};
