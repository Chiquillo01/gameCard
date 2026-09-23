const { getCard } = require('../cardIndex');
const { player, opponentIndex, moveToZone, placeMonster, log, findInstanceLocation, removeFromZone, findEmptySlot, corrodedSlots, releaseEquipment } = require('../zones');
const { addStatus, setStatusDebuff, FREEZE, BURN, POISON } = require('../statuses');
const { matchesFilter, matchesCardFilter } = require('../filters');
const { cardIdFromInstance } = require('../deckUtils');

// ctx = { state, controllerIndex, sourceInstanceId, effect, targets }

function resolvePlayerIndex(ctx, who) {
  if (who === 'opponent') return opponentIndex(ctx.controllerIndex);
  return ctx.controllerIndex; // 'self' or unspecified
}

function drawCards(ctx, args) {
  const idx = resolvePlayerIndex(ctx, args.player);
  const pl = player(ctx.state, idx);
  const amount = args.amount || 1;
  const drawn = [];
  for (let i = 0; i < amount; i++) {
    if (!pl.deck.length) { ctx.state.winnerIndex = opponentIndex(idx); log(ctx.state, `${pl.userId} se quedó sin mazo y pierde.`); break; }
    drawn.push(pl.deck.shift());
  }
  drawn.forEach((id) => pl.hand.push(id));
  log(ctx.state, `${pl.userId} roba ${amount} carta(s).`);
  // Card-effect draws (Olla de la Usura...) count as "added to hand from the Mazo" for Avispa
  // Mutante — the turn's own draw never goes through this action, so no exceptPhase check needed.
  const { fireHandTrigger } = require('../summon');
  drawn.forEach((id) => fireHandTrigger(ctx.state, 'addedToHand', id, idx));
}

function damageOpponent(ctx, args) {
  const idx = opponentIndex(ctx.controllerIndex);
  const pl = player(ctx.state, idx);
  pl.vp = Math.max(0, pl.vp - (args.amount || 0));
  log(ctx.state, `${pl.userId} recibe ${args.amount} de daño (VP: ${pl.vp}).`);
  checkWin(ctx.state);
}

function burnOpponent(ctx, args) {
  damageOpponent(ctx, args);
}

function damageSelf(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  pl.vp = Math.max(0, pl.vp - (args.amount || 0));
  log(ctx.state, `${pl.userId} pierde ${args.amount} VP (VP: ${pl.vp}).`);
  checkWin(ctx.state);
}

function gainVP(ctx, args) {
  const idx = resolvePlayerIndex(ctx, args.player);
  const pl = player(ctx.state, idx);
  pl.vp += args.amount || 0;
  log(ctx.state, `${pl.userId} gana ${args.amount} VP (VP: ${pl.vp}).`);
}

function generatePixels(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  pl.pixelcoins += args.amount || 0;
  log(ctx.state, `${pl.userId} genera ${args.amount} pixel(es).`);
}

function generatePixelsPerCreature(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const count = pl.field.monsters.filter(Boolean).length;
  pl.pixelcoins += (args.amount || 0) * count;
}

function banishSelf(ctx) {
  moveToZone(ctx.state, ctx.sourceInstanceId, 'banished');
  log(ctx.state, `${getCard(cardIdFromInstance(ctx.sourceInstanceId)).name} se exilia.`);
}

function discart(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const amount = args.count || 1;
  for (let i = 0; i < amount && pl.hand.length; i++) {
    const id = pl.hand.pop();
    moveToZone(ctx.state, id, 'graveyard');
  }
}

function discardRandomCard(ctx, args) {
  const idx = resolvePlayerIndex(ctx, args.player || 'opponent');
  const pl = player(ctx.state, idx);
  if (!pl.hand.length) return;
  const i = Math.floor(Math.random() * pl.hand.length);
  const id = pl.hand[i];
  moveToZone(ctx.state, id, 'graveyard');
  log(ctx.state, `${pl.userId} descarta una carta al azar.`);
}

function destroy(ctx, args, targets) {
  const list = targets && targets.length ? targets : [];
  list.forEach((instanceId) => {
    const loc = findInstanceLocation(ctx.state, instanceId);
    if (!loc || (loc.zone !== 'field:monster' && loc.zone !== 'field:support')) return;
    removeFromZone(ctx.state, instanceId, loc);
    ctx.state.players[loc.ownerIndex].graveyard.push(instanceId);
    log(ctx.state, `${getCard(cardIdFromInstance(instanceId)).name} es destruida.`);
  });
}

function destroyTarget(ctx, args, targets) {
  destroy(ctx, args, targets);
}

function exileTarget(ctx, args, targets) {
  (targets || []).forEach((instanceId) => {
    const loc = findInstanceLocation(ctx.state, instanceId);
    if (!loc) return;
    removeFromZone(ctx.state, instanceId, loc);
    ctx.state.players[loc.ownerIndex].banished.push(instanceId);
  });
}

function changePosition(ctx, args, targets) {
  (targets || []).forEach((instanceId) => {
    const m = ctx.state.players.flatMap((p) => p.field.monsters).find((x) => x && x.instanceId === instanceId);
    if (!m) return;
    if (args.position === 'defenseDown') {
      m.position = 'defense';
      m.faceDown = true;
      releaseEquipment(ctx.state, instanceId); // "volteado boca abajo" also releases its Equipo cards
    }
    else if (args.position === 'defense') m.position = 'defense';
    else if (args.position === 'attack') { m.position = 'attack'; m.faceDown = false; }
  });
}

// Who a status effect lands on: the targets the player picked, else the effect's own rule
// ("attacker" = the monster that attacked; "enemyMonster"/"selected" with nothing picked = the
// opponent's first monster(s)).
function resolveStatusTargets(ctx, args, targets) {
  if (Array.isArray(targets) && targets.length) return targets;
  if (args.target === 'attacker') return ctx.event && ctx.event.attackerInstanceId ? [ctx.event.attackerInstanceId] : [];
  if (args.target === 'enemyMonster' || args.target === 'selected') {
    const enemy = player(ctx.state, opponentIndex(ctx.controllerIndex)).field.monsters.filter(Boolean);
    return enemy.slice(0, args.count || 1).map((m) => m.instanceId);
  }
  return [];
}

function sourceIsCompiled(ctx) {
  if (ctx.fromCompiled) return true;
  if (!ctx.sourceInstanceId || ctx.sourceInstanceId.startsWith('token:')) return false;
  try { return getCard(cardIdFromInstance(ctx.sourceInstanceId)).category === 'fusion'; } catch (e) { return false; }
}

// Rulebook "Estados": Congelado / Quemadura / Envenenado(Veneno). Lasts until the end of the
// turn, or 2 turns when it comes from a compiled monster (see statuses.js).
function applyStatus(ctx, args, targets) {
  if (![FREEZE, BURN, POISON].includes(args.status)) {
    log(ctx.state, `[motor] estado "${args.status}" desconocido — se ignora.`);
    return;
  }
  resolveStatusTargets(ctx, args, targets).forEach((instanceId) => {
    const m = ctx.state.players.flatMap((p) => p.field.monsters).find((x) => x && x.instanceId === instanceId);
    if (!m) return;
    addStatus(ctx.state, instanceId, args.status, {
      sourceInstanceId: ctx.sourceInstanceId,
      fromCompiled: sourceIsCompiled(ctx),
      debuff: args.debuff || null,
    });
    log(ctx.state, `Un monstruo queda en estado ${args.status}.`);
  });
  if (args.burnOpponent) damageOpponent(ctx, { amount: args.burnOpponent });
}

// Rulebook, Corrosión: marks an opponent's zone so nothing can be placed in it while the monster
// that corroded it stays face-up on the field (released in effectEngine.releaseCorrosion).
function corrodeZone(ctx, args, targets) {
  const oppIdx = opponentIndex(ctx.controllerIndex);
  const pl = player(ctx.state, oppIdx);
  pl.corrosion = pl.corrosion || [];
  const zone = args.zone === 'support' ? 'support' : 'monsters';
  let slot = -1;
  if (zone === 'monsters' && Array.isArray(targets) && targets.length) {
    slot = pl.field.monsters.findIndex((m) => m && targets.includes(m.instanceId));
  }
  if (slot === -1) slot = pl.field[zone].findIndex((_, i) => !corrodedSlots(pl, zone).includes(i));
  if (slot === -1) return;
  pl.corrosion.push({ zone, slot, sourceInstanceId: ctx.sourceInstanceId });
  log(ctx.state, 'Una zona del rival queda corroída.');
}

function decompileMonster(ctx, args, targets) {
  const { decompile } = require('../summon');
  (Array.isArray(targets) ? targets : []).forEach((id) => decompile(ctx.state, ctx.controllerIndex, id, { force: true }));
}

function negateEffect(ctx, args, targets) {
  (targets || []).forEach((instanceId) => {
    const m = ctx.state.players.flatMap((p) => p.field.monsters).find((x) => x && x.instanceId === instanceId);
    if (m) m.negated = true;
  });
  log(ctx.state, 'Un efecto es negado.');
}

// Rulebook, "Apilar": negates the Pila link directly below this one — the effect it's responding
// to — so it never resolves at all (Kraken/Rakshasa's "descarta esta carta y niega dicho efecto",
// Djinni's counter). `state.chain` still holds it at this point: this action's own link was
// already popped by chain.resolveChain before its actions ran.
function negateActivation(ctx) {
  const negated = ctx.state.chain.pop();
  if (negated) log(ctx.state, `Se niega la activación de ${negated.cardName}.`);
  return negated;
}

function negateAttack(ctx) {
  ctx.state.pendingAttack = null;
  log(ctx.state, 'Se niega un ataque.');
}

// Djinni: negates the responded-to link AND sends its card to the graveyard.
function negateAndSendToGraveyard(ctx, args) {
  const negated = negateActivation(ctx);
  if (negated && args && args.sendCard) moveToZone(ctx.state, negated.sourceInstanceId, 'graveyard', negated.controllerIndex);
}

function grantBuff(ctx, args, targets) {
  const buff = args.buff || { atk: args.atk, def: args.def };
  // "whileStatus": the penalty lives on the status itself, so it ends when the status does.
  if (args.duration === 'whileStatus' && args.status) {
    resolveStatusTargets(ctx, args, targets).forEach((id) => setStatusDebuff(ctx.state, id, args.status, buff));
    return;
  }
  if (!buffPhaseActive(ctx.state, args.phase)) return;
  const filter = args.filter || { attribute: args.attribute || args.atribute, breed: args.breed, family: args.family, name: args.name };
  const matched = buffTargets(ctx, args, targets).filter((m) => monsterMatches(m, filter));
  if (args.duration === 'endOfTurn' || args.duration === 'thisTurn') {
    // Recorded on the state so the buff survives the board recomputes until the turn ends.
    require('./fieldActions').grantTimedBuff(ctx, matched.map((m) => m.instanceId), buff, ctx.state.turnNumber);
  }
  matched.forEach((m) => {
    m.tempBuff = m.tempBuff || { atk: 0, def: 0 };
    m.tempBuff.atk += buff.atk || 0;
    m.tempBuff.def += buff.def || 0;
  });
}

// "en la fase de batalla" buffs only count during that phase.
function buffPhaseActive(state, phase) {
  if (!phase) return true;
  return phase === 'batalla' || phase === 'battle' ? state.phase === 'battle' : true;
}

// A token has no card data, so it can only satisfy an empty filter.
function monsterMatches(entry, filter) {
  const hasFilter = Object.values(filter || {}).some((v) => v !== undefined && v !== null && v !== '');
  if (entry.isToken) return !hasFilter;
  return matchesFilter(entry, filter);
}

function allFieldMonsters(state) {
  return state.players.flatMap((p) => p.field.monsters).filter(Boolean);
}

// Which field monsters a buff lands on, before the card filter narrows it:
//   picked targets > "self" (the card with the effect) > the rival's monsters > every monster on
//   the field (scope "field": "en el Campo") > only the controller's monsters (the default).
function buffTargets(ctx, args, targets) {
  const all = allFieldMonsters(ctx.state);
  if (targets && targets.length) return all.filter((m) => targets.includes(m.instanceId));
  if (args.target === 'self') return all.filter((m) => m.instanceId === ctx.sourceInstanceId);
  const enemies = player(ctx.state, opponentIndex(ctx.controllerIndex)).field.monsters.filter(Boolean);
  if (args.target === 'enemyMonster') return enemies.slice(0, args.count || 1);
  if (args.target === 'allEnemyMonsters' || args.target === 'opponentMonsters' || args.scope === 'opponentField') return enemies;
  if (args.scope === 'field') return all;
  return allOwnedMonsters(ctx.state, ctx.controllerIndex);
}

function allOwnedMonsters(state, controllerIndex) {
  return state.players[controllerIndex].field.monsters.filter(Boolean);
}

function summonTokenEntry(ctx, tokenDef) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const slot = findEmptySlot(pl.field.monsters, corrodedSlots(pl, 'monsters'));
  if (slot === -1) return;
  const instanceId = `token:${tokenDef.name}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
  pl.field.monsters[slot] = {
    instanceId,
    cardId: null,
    isToken: true,
    tokenDef,
    position: 'attack',
    faceDown: false,
    baseAtk: tokenDef.atk || 0,
    baseDef: tokenDef.def || 0,
    summonedTurn: ctx.state.turnNumber,
    hasAttacked: false,
    equips: [],
    counters: {},
    negated: false,
  };
}

function summonTokens(ctx, args) {
  const count = args.count || 1;
  for (let i = 0; i < count; i++) summonTokenEntry(ctx, args.token);
}

function summonToken(ctx, args) {
  summonTokenEntry(ctx, args.token);
}

// addCardToHandFromDeck / searchDeck / searchFromDeck / recoverCardsToHand / addCardToHandFromGraveyard
// all live in fieldActions.js now (Object.assign(registry, require('./fieldActions')) below pulls
// them in) — they need the same targets-aware, player-chosen search logic.

function specialSummonFromGY(ctx, args) {
  const idx = resolvePlayerIndex(ctx, args.player);
  const pl = player(ctx.state, idx);
  const levelOrLower = args.levelOrLower;
  const gyIdx = pl.graveyard.findIndex((id) => {
    const c = getCard(cardIdFromInstance(id));
    return levelOrLower ? (c.level || 0) <= levelOrLower : true;
  });
  if (gyIdx === -1) return;
  const [instanceId] = pl.graveyard.splice(gyIdx, 1);
  placeMonster(ctx.state, instanceId, idx, { position: 'attack' });
}

function specialSummon(ctx) {
  placeMonster(ctx.state, ctx.sourceInstanceId, ctx.controllerIndex, { position: 'attack', slot: ctx.slot ?? null });
}

function mirrorEvent(ctx, args) {
  ctx.state.mirrors = ctx.state.mirrors || [];
  ctx.state.mirrors.push({ ownerIndex: ctx.controllerIndex, event: args.event, expiresEndOfTurn: true });
}

function addCounter(ctx, args, targets) {
  const instanceId = (targets && targets[0]) || ctx.sourceInstanceId;
  const m = ctx.state.players.flatMap((p) => p.field.support.concat(p.field.monsters)).find((x) => x && x.instanceId === instanceId);
  if (!m) return;
  m.counters = m.counters || {};
  m.counters[args.counter] = (m.counters[args.counter] || 0) + (args.amount || 1);
}

function millDeck(ctx, args) {
  const idx = resolvePlayerIndex(ctx, args.target);
  const pl = player(ctx.state, idx);
  const amount = args.amount || 1;
  for (let i = 0; i < amount && pl.deck.length; i++) moveToZone(ctx.state, pl.deck[0], 'graveyard', idx);
}

function grantExtraAttack(ctx, args) {
  const m = ctx.state.players.flatMap((p) => p.field.monsters).find((x) => x && x.instanceId === ctx.sourceInstanceId);
  if (m) m.extraAttacks = (m.extraAttacks || 0) + (args.amount || 1);
}

function winMatch(ctx) {
  ctx.state.winnerIndex = ctx.controllerIndex;
  ctx.state.status = 'finished';
  log(ctx.state, `${player(ctx.state, ctx.controllerIndex).userId} gana la partida por efecto de carta.`);
}

function cannotBeNegated() {
  // enforced by effectEngine.canRespond checking this flag on the source effect; no state change
}

// --- generic filtered-buff family: buffAllies / buffAtkPerMonster / buffPerCount /
// modifyStatPerCreature / modifyStatsPerMonsterOnField all boil down to "add atk/def to some
// filtered set of your monsters", optionally scaled by how many matches there are on the field.
//   scope "field"         : count the matches on the whole field (else only the controller's);
//   scope "opponentField" : count and buff the rival's monsters;
//   target "self"         : the buff lands on the card that has the effect;
//   excludeSelf           : that card doesn't count itself ("excepto el mismo").
function applyScaledBuff(ctx, args, targets) {
  const filter = args.filter || { name: args.name, nameContains: args.nameContains, breed: args.breed, family: args.family, attribute: args.attribute };
  const hasFilter = Object.values(filter).some((v) => v !== undefined && v !== null && v !== '');
  const controllerMonsters = allOwnedMonsters(ctx.state, ctx.controllerIndex);
  const enemyMonsters = player(ctx.state, opponentIndex(ctx.controllerIndex)).field.monsters.filter(Boolean);
  const perUnit = { atk: args.atk || 0, def: args.def || 0 };
  const pool = args.scope === 'field' ? allFieldMonsters(ctx.state) : args.scope === 'opponentField' ? enemyMonsters : controllerMonsters;
  const counted = pool.filter((m) => monsterMatches(m, filter) && !(args.excludeSelf && m.instanceId === ctx.sourceInstanceId));
  const scaleBy = args.scope === 'field' || args.scope === 'opponentField' ? counted.length : counted.length || 1;
  // Explicit targets (an equipped monster, a picked one) always win over the filter-based default.
  let targetSet = targets && targets.length ? allFieldMonsters(ctx.state).filter((m) => targets.includes(m.instanceId)) : hasFilter ? controllerMonsters.filter((m) => monsterMatches(m, filter)) : controllerMonsters;
  if (!(targets && targets.length)) {
    if (args.target === 'self') targetSet = controllerMonsters.filter((m) => m.instanceId === ctx.sourceInstanceId);
    else if (args.scope === 'opponentField') targetSet = enemyMonsters;
  }
  targetSet.forEach((m) => {
    m.tempBuff = m.tempBuff || { atk: 0, def: 0 };
    m.tempBuff.atk += perUnit.atk * scaleBy;
    m.tempBuff.def += perUnit.def * scaleBy;
  });
}

function disableEffects(ctx, args, targets) {
  const filter = args.filter || {};
  const hasFilter = Object.values(filter).some((v) => v !== undefined && v !== null && v !== '');
  const list = targets && targets.length
    ? ctx.state.players.flatMap((p) => p.field.monsters).filter((m) => m && targets.includes(m.instanceId))
    : hasFilter
      ? allFieldMonsters(ctx.state).filter((m) => monsterMatches(m, filter))
      : [];
  list.forEach((m) => { m.negated = true; });
}

function negateActivationOfEffects(ctx) {
  const oppIdx = opponentIndex(ctx.controllerIndex);
  player(ctx.state, oppIdx).field.monsters.filter(Boolean).forEach((m) => { m.negated = true; });
}

// enableDirectAttack lands on whoever the effect actually names: the equipped monster when there
// is one, else the card carrying the effect itself.
function enableDirectAttack(ctx, args, targets) {
  const id = (targets && targets[0]) || ctx.sourceInstanceId;
  const m = ctx.state.players.flatMap((p) => p.field.monsters).find((x) => x && x.instanceId === id);
  if (m) m.canAttackDirectly = true;
}

function limitUnique(ctx, args) {
  // enforced as a summon-time check would be more correct; recorded here so the UI/engine can
  // surface it, actual enforcement point is `normalSummon`/`compileSummon` reading this flag.
  ctx.state.uniqueLimited = ctx.state.uniqueLimited || {};
  ctx.state.uniqueLimited[args.filter?.name || args.name] = true;
}

function preventBattleDestruction(ctx, args) {
  allOwnedMonsters(ctx.state, ctx.controllerIndex)
    .filter((m) => matchesFilter(m, { attribute: args.attribute }))
    .forEach((m) => { m.cannotBeDestroyedByBattle = true; });
}

function setWinLoseLock(ctx, args) {
  ctx.state.players[ctx.controllerIndex].cantLose = !!(args.owner && args.owner.cantLose);
  ctx.state.players[opponentIndex(ctx.controllerIndex)].cantWin = !!(args.opponent && args.opponent.cantWin);
}

function returnFromGraveyardToDeck(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const amount = args.count || 1;
  for (let i = 0; i < amount && pl.graveyard.length; i++) moveToZone(ctx.state, pl.graveyard[pl.graveyard.length - 1], 'deck');
}

function returnToDeck(ctx, args, targets) {
  (targets || [ctx.sourceInstanceId]).forEach((id) => moveToZone(ctx.state, id, 'deck'));
}

function returnCardToHand(ctx, args, targets) {
  (targets || []).forEach((id) => moveToZone(ctx.state, id, 'hand'));
}

function bounceToHand(ctx, args, targets) {
  returnCardToHand(ctx, args, targets);
}

function relocateSelf(ctx) {
  returnCardToHand(ctx, {}, [ctx.sourceInstanceId]);
}

function setCardFaceDown(ctx, args, targets) {
  (targets || []).forEach((id) => {
    const s = ctx.state.players.flatMap((p) => p.field.support).find((x) => x && x.instanceId === id);
    if (s) s.faceDown = true;
    const m = ctx.state.players.flatMap((p) => p.field.monsters).find((x) => x && x.instanceId === id);
    if (m) { m.faceDown = true; m.position = 'defense'; }
  });
}

function summonFromDeck(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = args.filter || { level: args.level };
  const idx = pl.deck.findIndex((id) => matchesCardFilter(getCard(cardIdFromInstance(id)), filter));
  if (idx === -1) return;
  const [instanceId] = pl.deck.splice(idx, 1);
  placeMonster(ctx.state, instanceId, ctx.controllerIndex, { position: 'attack' });
}

function summonFromHand(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = args.filter || {};
  const idx = pl.hand.findIndex((id) => matchesCardFilter(getCard(cardIdFromInstance(id)), filter));
  if (idx === -1) return;
  const [instanceId] = pl.hand.splice(idx, 1);
  placeMonster(ctx.state, instanceId, ctx.controllerIndex, { position: 'attack' });
}

function specialSummonFromDeck(ctx, args) {
  summonFromDeck(ctx, args);
}

function summonFromZones(ctx, args) {
  specialSummonFromGY(ctx, args);
}

function summon(ctx, args) {
  const idx = resolvePlayerIndex(ctx, args.player);
  const pl = player(ctx.state, idx);
  const zones = Array.isArray(args.filter?.zone) ? args.filter.zone : ['graveyard'];
  for (const zoneName of zones) {
    const zone = zoneName === 'banished' ? pl.banished : pl.graveyard;
    const i = zone.findIndex((id) => matchesCardFilter(getCard(cardIdFromInstance(id)), args.filter || {}));
    if (i !== -1) {
      const [instanceId] = zone.splice(i, 1);
      placeMonster(ctx.state, instanceId, idx, { position: 'attack' });
      break;
    }
  }
}

function coinFlip(ctx, args, targets) {
  const heads = Math.random() < 0.5;
  ctx.state.lastCoinFlip = heads;
  log(ctx.state, heads ? 'Cara' : 'Cruz');
  return heads;
}

function changeBeed(ctx, args, targets) {
  const targetId = (targets && targets[0]) || ctx.sourceInstanceId;
  const target = getFieldMonsterOf(ctx, targetId);
  if (target) target.breedOverride = args.breed || args.family;
}

function getFieldMonsterOf(ctx, instanceId) {
  return ctx.state.players.flatMap((p) => p.field.monsters).find((x) => x && x.instanceId === instanceId);
}

function gainAllTypes(ctx) {
  const m = getFieldMonsterOf(ctx, ctx.sourceInstanceId);
  if (m) m.gainsAllTypes = true;
}

function endTurn(ctx) {
  ctx.state.forceEndTurn = true;
}

function setAtk(ctx, args, targets) {
  (targets && targets.length ? targets : [ctx.sourceInstanceId]).forEach((id) => {
    const m = getFieldMonsterOf(ctx, id);
    if (m) m.baseAtk = args.amount || args.value || 0;
  });
}

function setStatValue(ctx, args, targets) {
  setAtk(ctx, args, targets);
}

function damageMonster(ctx, args, targets) {
  (targets || []).forEach((id) => {
    const m = getFieldMonsterOf(ctx, id);
    if (m) m.baseDef = Math.max(0, m.baseDef - (args.amount || 0));
  });
}

function grantAbility(ctx, args, targets) {
  const filter = { attribute: args.attribute || args.atribute, breed: args.breed, name: args.name };
  const list = targets && targets.length ? targets.map((id) => getFieldMonsterOf(ctx, id)).filter(Boolean) : allOwnedMonsters(ctx.state, ctx.controllerIndex).filter((m) => matchesFilter(m, filter));
  list.forEach((m) => {
    m.abilities = m.abilities || [];
    m.abilities.push(args.ability);
  });
}

function destroyAndCopyEffect(ctx, args, targets) {
  destroy(ctx, args, targets);
}

function chooseEffect(ctx, args, targets) {
  resolveChosenIndex(ctx, args, targets);
}

function opponentChoosesEffect(ctx, args, targets) {
  resolveChosenIndex(ctx, args, targets);
}

function resolveChosenIndex() {
  // actual branching for "pick one of N" effects is handled by effect.choice in effectEngine;
  // this fn exists so an authored effect that names it explicitly doesn't hit the fallback.
}

function checkWin(state) {
  if (state.winnerIndex !== null) return;
  state.players.forEach((p, i) => {
    if (state.winnerIndex !== null) return;
    const opp = state.players[opponentIndex(i)];
    if (p.vp <= 0) {
      state.winnerIndex = opponentIndex(i);
      state.status = 'finished';
    } else if (opp.vp > 0 && p.vp >= opp.vp * 3) {
      // Rulebook win condition: reach triple your opponent's VP.
      state.winnerIndex = i;
      state.status = 'finished';
    }
  });
}

const registry = {
  drawCards,
  damageOpponent,
  burnOpponent,
  damageSelf,
  gainVP,
  generatePixels,
  generatePixelsPerCreature,
  banishSelf,
  discart,
  discardRandomCard,
  destroy,
  destroyTarget,
  exileTarget,
  changePosition,
  applyStatus,
  corrodeZone,
  poisonZone: corrodeZone,
  decompileMonster,
  negateEffect,
  negateActivation,
  negateAttack,
  negateAndSendToGraveyard,
  grantBuff,
  summonTokens,
  summonToken,
  specialSummonFromGY,
  specialSummon,
  mirrorEvent,
  addCounter,
  millDeck,
  grantExtraAttack,
  winMatch,
  cannotBeNegated,
  flying: () => {},
  deathTouch: () => {},
  buffAllies: applyScaledBuff,
  buffAtkPerMonster: applyScaledBuff,
  buffPerCount: applyScaledBuff,
  modifyStatPerCreature: applyScaledBuff,
  modifyStatsPerMonsterOnField: applyScaledBuff,
  disableEffects,
  negateActivationOfEffects,
  enableDirectAttack,
  limitUnique,
  preventBattleDestruction,
  setWinLoseLock,
  returnFromGraveyardToDeck,
  returnToDeck,
  returnCardToHand,
  bounceToHand,
  relocateSelf,
  setCardFaceDown,
  summonFromDeck,
  summonFromHand,
  specialSummonFromDeck,
  summonFromZones,
  summon,
  coinFlip,
  changeBeed,
  gainAllTypes,
  endTurn,
  setAtk,
  setStatValue,
  damageMonster,
  grantAbility,
  destroyAndCopyEffect,
  chooseEffect,
  opponentChoosesEffect,
};

Object.assign(registry, require('./fieldActions'));

function runAction(ctx, step, targets) {
  const impl = registry[step.fn];
  if (!impl) {
    log(ctx.state, `[motor] acción "${step.fn}" aún no implementada — se ignora.`);
    return;
  }
  impl(ctx, step.args || {}, targets);
}

module.exports = { runAction, registry, checkWin };
