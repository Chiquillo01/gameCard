const { getCard } = require('../cardIndex');
const { player, opponentIndex, moveToZone, placeMonster, log, findInstanceLocation, removeFromZone, findEmptySlot, corrodedSlots } = require('../zones');
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
  for (let i = 0; i < amount; i++) {
    if (!pl.deck.length) { ctx.state.winnerIndex = opponentIndex(idx); log(ctx.state, `${pl.userId} se quedó sin mazo y pierde.`); break; }
    pl.hand.push(pl.deck.shift());
  }
  log(ctx.state, `${pl.userId} roba ${amount} carta(s).`);
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
    if (args.position === 'defenseDown') { m.position = 'defense'; m.faceDown = true; }
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

function negateActivation(ctx) {
  ctx.state.chain.pop();
  log(ctx.state, 'Se niega la activación de un efecto en la cadena.');
}

function negateAttack(ctx) {
  ctx.state.pendingAttack = null;
  log(ctx.state, 'Se niega un ataque.');
}

function negateAndSendToGraveyard(ctx) {
  const top = ctx.state.chain.pop();
  if (top) {
    negateActivation(ctx);
    if (args?.sendCard) moveToZone(ctx.state, top.sourceInstanceId, 'graveyard');
  }
}

function grantBuff(ctx, args, targets) {
  const buff = args.buff || { atk: args.atk, def: args.def };
  // "whileStatus": the penalty lives on the status itself, so it ends when the status does.
  if (args.duration === 'whileStatus' && args.status) {
    resolveStatusTargets(ctx, args, targets).forEach((id) => setStatusDebuff(ctx.state, id, args.status, buff));
    return;
  }
  const filter = { attribute: args.attribute || args.atribute, breed: args.breed, family: args.family, name: args.name };
  const list = targets && targets.length ? targets.map((id) => ({ instanceId: id })) : allOwnedMonsters(ctx.state, ctx.controllerIndex);
  list.forEach(({ instanceId }) => {
    const m = ctx.state.players.flatMap((p) => p.field.monsters).find((x) => x && x.instanceId === instanceId);
    if (!m) return;
    if (!matchesFilter(m, filter)) return;
    m.tempBuff = m.tempBuff || { atk: 0, def: 0 };
    m.tempBuff.atk += buff.atk || 0;
    m.tempBuff.def += buff.def || 0;
  });
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

function addCardToHandFromDeck(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = args.filter || { breed: args.breed, family: args.family, name: args.name };
  const count = args.count || 1;
  let moved = 0;
  for (let i = 0; i < pl.deck.length && moved < count; i++) {
    const card = getCard(cardIdFromInstance(pl.deck[i]));
    if (matchesCardFilter(card, filter)) {
      const [id] = pl.deck.splice(i, 1);
      pl.hand.push(id);
      moved++;
      i--;
    }
  }
  log(ctx.state, `${pl.userId} añade ${moved} carta(s) del mazo a la mano.`);
}

function searchDeck(ctx, args) {
  addCardToHandFromDeck(ctx, { count: args.count, filter: { attribute: args.attribute, breed: args.breed, family: args.family } });
}

function searchFromDeck(ctx, args) {
  addCardToHandFromDeck(ctx, { count: 1, filter: args });
}

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
  placeMonster(ctx.state, ctx.sourceInstanceId, ctx.controllerIndex, { position: 'attack' });
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
function applyScaledBuff(ctx, args) {
  const filter = { name: args.name, breed: args.breed || args.family, attribute: args.attribute };
  const controllerMonsters = allOwnedMonsters(ctx.state, ctx.controllerIndex);
  const perUnit = { atk: args.atk || 0, def: args.def || 0 };
  const scaleBy = args.scope === 'field'
    ? ctx.state.players.flatMap((p) => p.field.monsters).filter(Boolean).filter((m) => matchesFilter(m, filter)).length
    : controllerMonsters.filter((m) => matchesFilter(m, filter)).length || 1;
  const targetSet = filter.name || filter.breed || filter.attribute
    ? controllerMonsters.filter((m) => matchesFilter(m, filter))
    : controllerMonsters;
  targetSet.forEach((m) => {
    m.tempBuff = m.tempBuff || { atk: 0, def: 0 };
    m.tempBuff.atk += perUnit.atk * scaleBy;
    m.tempBuff.def += perUnit.def * scaleBy;
  });
}

function disableEffects(ctx, args, targets) {
  (targets && targets.length ? targets : []).forEach((id) => {
    const m = ctx.state.players.flatMap((p) => p.field.monsters).find((x) => x && x.instanceId === id);
    if (m) m.negated = true;
  });
}

function negateActivationOfEffects(ctx) {
  const oppIdx = opponentIndex(ctx.controllerIndex);
  player(ctx.state, oppIdx).field.monsters.filter(Boolean).forEach((m) => { m.negated = true; });
}

function enableDirectAttack(ctx) {
  const m = ctx.state.players.flatMap((p) => p.field.monsters).find((x) => x && x.instanceId === ctx.sourceInstanceId);
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

function recoverCardsToHand(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const scope = Array.isArray(args.scope) ? args.scope : [args.scope || 'graveyard'];
  const filter = { breed: args.breed || args.family, family: args.family };
  let moved = 0;
  scope.forEach((zoneName) => {
    const zone = zoneName === 'banished' ? 'banished' : 'graveyard';
    const arr = pl[zone];
    for (let i = arr.length - 1; i >= 0 && moved < (args.count || 1); i--) {
      const card = getCard(cardIdFromInstance(arr[i]));
      if (matchesCardFilter(card, filter)) {
        const [id] = arr.splice(i, 1);
        pl.hand.push(id);
        moved++;
      }
    }
  });
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
  addCardToHandFromDeck,
  searchDeck,
  searchFromDeck,
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
  recoverCardsToHand,
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

function runAction(ctx, step, targets) {
  const impl = registry[step.fn];
  if (!impl) {
    log(ctx.state, `[motor] acción "${step.fn}" aún no implementada — se ignora.`);
    return;
  }
  impl(ctx, step.args || {}, targets);
}

module.exports = { runAction, registry, checkWin };
