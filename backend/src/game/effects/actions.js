const { getCard } = require('../cardIndex');
const { player, opponentIndex, moveToZone, log, findInstanceLocation, removeFromZone, findEmptySlot, corrodedSlots, releaseEquipment, getFieldMonster } = require('../zones');
const { addStatus, setStatusDebuff, FREEZE, BURN, POISON } = require('../statuses');
const { matchesFilter } = require('../filters');
const { cardIdFromInstance } = require('../deckUtils');
const { checkWin, declareWin } = require('../outcome');
const { negateCard, END_OF_TURN } = require('../negation');

// ctx = { state, controllerIndex, sourceInstanceId, effect, event?, costPaid? }
// `targets` = the picks resolveActions handed this step (targets.js decides which are its own).

function resolvePlayerIndex(ctx, who) {
  if (who === 'opponent') return opponentIndex(ctx.controllerIndex);
  return ctx.controllerIndex; // 'self' or unspecified
}

const isContinuous = (ctx) => !!(ctx.effect && ctx.effect.type === 'continuous');

function drawCards(ctx, args) {
  require('../draw').drawCards(ctx.state, resolvePlayerIndex(ctx, args.player), args.amount || 1, { fromEffect: true });
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
  const amount = args.amount || 0;
  pl.vp += amount;
  log(ctx.state, `${pl.userId} gana ${amount} VP (VP: ${pl.vp}).`);
  // Anillo de Boda: "si tu oponente gana VP, tú también lo harás".
  if (amount > 0) require('../draw').runMirrors(ctx.state, 'gainVP', idx, amount);
  checkWin(ctx.state);
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

// "Descarta N cartas de tu Mano" / "tu oponente descarta una carta de su Mano a su elección"
// (Esqueleto de relámpago): whoever discards chooses which (Rulebook — never random unless the
// card says so). With no real choice to make it happens at once; otherwise it waits for them.
function discart(ctx, args) {
  const idx = resolvePlayerIndex(ctx, args.player);
  requestDiscard(ctx.state, idx, args.count || 1, args.player === 'opponent' ? 'Tu oponente te obliga a descartar: elige qué carta' : 'Elige qué carta descartas');
}

// Queues a discard the player picks (or does it right away when there's nothing to choose).
function requestDiscard(state, playerIndex, count, prompt) {
  const pl = player(state, playerIndex);
  if (!pl.hand.length) return;
  if (pl.hand.length <= count) {
    [...pl.hand].forEach((id) => moveToZone(state, id, 'graveyard'));
    log(state, `${pl.userId} descarta ${count} carta(s).`);
    return;
  }
  state.pendingTriggerChoices = state.pendingTriggerChoices || [];
  state.pendingTriggerChoices.push({ kind: 'discard', controllerIndex: playerIndex, count, prompt });
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

// "Exilia esa carta" — the picked cards (targets.js pools them), never a protected one.
function exileTarget(ctx, args, targets) {
  const { canAffect } = require('../targets');
  (targets || []).forEach((instanceId) => {
    const loc = findInstanceLocation(ctx.state, instanceId);
    if (!loc) return;
    const entry = loc.zone.startsWith('field:') ? [...ctx.state.players[loc.ownerIndex].field.monsters, ...ctx.state.players[loc.ownerIndex].field.support, ctx.state.players[loc.ownerIndex].field.territory].find((e) => e && e.instanceId === instanceId) : null;
    if (entry && (!canAffect(ctx, entry) || (entry.immuneToOpponentEffects && loc.ownerIndex !== ctx.controllerIndex))) return;
    moveToZone(ctx.state, instanceId, 'banished');
    log(ctx.state, `${getCard(cardIdFromInstance(instanceId)).name} es exiliada.`);
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
    } else if (args.position === 'defense') m.position = 'defense';
    else if (args.position === 'attack') { m.position = 'attack'; m.faceDown = false; }
  });
}

// Who a status effect lands on: the targets the player picked, else the effect's own rule
// ("attacker" = the monster that attacked).
function resolveStatusTargets(ctx, args, targets) {
  if (Array.isArray(targets) && targets.length) return targets;
  if (args.target === 'attacker') return ctx.event && ctx.event.attackerInstanceId ? [ctx.event.attackerInstanceId] : [];
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
    const m = getFieldMonster(ctx.state, instanceId);
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
  (Array.isArray(targets) ? targets : []).forEach((id) => {
    const loc = findInstanceLocation(ctx.state, id);
    if (loc) decompile(ctx.state, loc.ownerIndex, id, { force: true });
  });
}

// Negates the picked cards' effects for as long as the card doing it says (negation.js):
// "hasta el final del turno", while a continuous/Equipo source stays, or permanently. Relicario
// de Engranaje also destroys the card when you control "Enano Constructor" (`destroyIfControls`).
function negateEffect(ctx, args, targets) {
  const { canAffect } = require('../targets');
  (targets || []).forEach((instanceId) => {
    const entry = fieldEntry(ctx.state, instanceId);
    if (!entry || !canAffect(ctx, entry)) return;
    if (isContinuous(ctx)) entry.negatedByContinuous = true;
    else negateCard(ctx.state, instanceId, { sourceInstanceId: ctx.sourceInstanceId, duration: args.duration });
    if (!isContinuous(ctx)) log(ctx.state, `Se niegan los efectos de ${entry.isToken ? 'una ficha' : getCard(entry.cardId).name}${END_OF_TURN.includes(args.duration) ? ' hasta el final del turno' : ''}.`);
    if (args.destroyIfControls && controlsNamed(ctx, args.destroyIfControls)) {
      const loc = findInstanceLocation(ctx.state, instanceId);
      require('./fieldActions').sendToGraveyard(ctx, { entry, ownerIndex: loc.ownerIndex, kind: loc.zone === 'field:monster' ? 'monster' : 'support' });
    }
  });
}

function fieldEntry(state, instanceId) {
  return state.players.flatMap((p) => [...p.field.monsters, ...p.field.support, p.field.territory]).find((e) => e && e.instanceId === instanceId) || null;
}

function controlsNamed(ctx, name) {
  const pl = player(ctx.state, ctx.controllerIndex);
  return [...pl.field.monsters, ...pl.field.support, pl.field.territory].some((e) => e && !e.faceDown && !e.isToken && getCard(e.cardId).name === name);
}

// Loto de Obsidiana: "Los efectos de esta carta no pueden ser negados por efectos de cartas" — a
// `rule` effect with cannotBeNegated on the card.
function cannotBeNegatedCard(instanceId) {
  if (!instanceId || String(instanceId).startsWith('token:')) return false;
  const { getEffect } = require('../cardIndex');
  return (getCard(cardIdFromInstance(instanceId)).effectCodes || []).some((id) => {
    const effect = getEffect(id);
    return effect && (effect.actions || []).some((a) => a.fn === 'cannotBeNegated');
  });
}

// Rulebook, "Apilar": negates the Pila link directly below this one — the effect it's responding
// to — so it never resolves at all (Kraken/Rakshasa's "descarta esta carta y niega dicho efecto",
// Djinni's counter). `state.chain` still holds it at this point: this action's own link was
// already popped by chain.resolveChain before its actions ran.
function negateActivation(ctx) {
  const chain = ctx.state.chain;
  const below = chain[chain.length - 1];
  if (!below || below.kind === 'attack') return null;
  if (cannotBeNegatedCard(below.sourceInstanceId)) {
    log(ctx.state, `${below.cardName} no puede ser negada.`);
    return null;
  }
  chain.pop();
  log(ctx.state, `Se niega la activación de ${below.cardName}.`);
  // A negated Apoyo Normal/Veloz/Contraataque still leaves the field, as if it had resolved.
  if (below.afterResolve === 'graveyard') moveToZone(ctx.state, below.sourceInstanceId, 'graveyard');
  return below;
}

// Trampa de Madera: "Niega el ataque" — the attack waiting at the bottom of the Pila never happens.
function negateAttack(ctx) {
  const attack = [...ctx.state.chain].reverse().find((l) => l.kind === 'attack');
  if (!attack) return;
  attack.negated = true;
  log(ctx.state, 'Se niega un ataque.');
}

// "...y termina la Fase de Batalla": ends once the Pila that asked for it has resolved.
function endBattlePhase(ctx) {
  if (ctx.state.phase === 'battle') ctx.state.endBattlePhaseRequested = true;
}

// Djinni: negates the responded-to link AND sends its card to the graveyard.
function negateAndSendToGraveyard(ctx, args) {
  const negated = negateActivation(ctx);
  if (negated && args && args.sendCard) moveToZone(ctx.state, negated.sourceInstanceId, 'graveyard');
}

function grantBuff(ctx, args, targets) {
  const buff = args.buff || { atk: args.atk, def: args.def };
  // "whileStatus": the penalty lives on the status itself, so it ends when the status does.
  if (args.duration === 'whileStatus' && args.status) {
    resolveStatusTargets(ctx, args, targets).forEach((id) => setStatusDebuff(ctx.state, id, args.status, buff));
    return;
  }
  // Orco Gladiador: "si el monstruo sacrificado es un Orco" — read from the cost that was paid.
  if (args.condition && args.condition.costCardBreed) {
    const paid = (ctx.costPaid || ctx.paidCards || []).map((id) => getCard(cardIdFromInstance(id)));
    if (!paid.some((c) => matchesFilter({ cardId: c._id.toString() }, { breed: args.condition.costCardBreed }))) return;
  }
  if (!buffPhaseActive(ctx.state, args.phase)) return;
  const filter = args.filter || { attribute: args.attribute || args.atribute, breed: args.breed, family: args.family, name: args.name };
  const matched = buffTargets(ctx, args, targets).filter((m) => monsterMatches(m, filter));
  if (args.duration === 'endOfTurn' || args.duration === 'thisTurn') {
    // Recorded on the state so the buff survives the board recomputes until the turn ends.
    require('./fieldActions').grantTimedBuff(ctx, matched.map((m) => m.instanceId), buff, ctx.state.turnNumber);
  } else if (!isContinuous(ctx) && !(ctx.effect && ctx.effect.trigger && ctx.effect.trigger.fn === 'whileEquipped')) {
    // A one-off "gana +X" (Acechador Invisible, Orco Gladiador) stays with the card while it's on
    // the field, instead of vanishing at the next board recompute.
    matched.forEach((m) => { m.baseAtk += buff.atk || 0; m.baseDef += buff.def || 0; });
    return;
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

// The monsters in the same column as `instanceId` (same zone index on both sides of the board, as
// the board shows them), not counting it (Íncubo/Súcubo).
function columnMonsters(state, instanceId) {
  for (const pl of state.players) {
    const slot = pl.field.monsters.findIndex((m) => m && m.instanceId === instanceId);
    if (slot !== -1) return state.players.map((p) => p.field.monsters[slot]).filter((m) => m && m.instanceId !== instanceId);
  }
  return [];
}

// Which field monsters a buff lands on, before the card filter narrows it:
//   picked targets > "self" (the card with the effect) > the rival's monsters > its column >
//   every monster on the field (scope "field": "en el Campo") > only the controller's monsters.
function buffTargets(ctx, args, targets) {
  const all = allFieldMonsters(ctx.state);
  if (targets && targets.length) return all.filter((m) => targets.includes(m.instanceId));
  if (args.target === 'self') return all.filter((m) => m.instanceId === ctx.sourceInstanceId);
  const enemies = player(ctx.state, opponentIndex(ctx.controllerIndex)).field.monsters.filter(Boolean);
  if (args.target === 'allEnemyMonsters' || args.target === 'opponentMonsters' || args.scope === 'opponentField') return enemies;
  if (args.scope === 'column') return columnMonsters(ctx.state, ctx.sourceInstanceId);
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
    attacksThisTurn: 0,
    equips: [],
    counters: {},
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
// and every "invoca del Mazo/Cementerio/Mano" step live in fieldActions.js (registered over these
// below) — they need the same pick-driven logic.

// A monster's own summon_rule putting it on the field (specialSummon in its rule's actions).
function specialSummon(ctx) {
  require('../zones').placeMonster(ctx.state, ctx.sourceInstanceId, ctx.controllerIndex, { position: 'attack', slot: ctx.slot ?? null });
}

// Anillo de Boda: "para el resto del turno, si tu oponente roba/gana VP, tú también".
function mirrorEvent(ctx, args) {
  ctx.state.mirrors = ctx.state.mirrors || [];
  ctx.state.mirrors.push({ ownerIndex: ctx.controllerIndex, event: args.event, expiresTurn: ctx.state.turnNumber });
  log(ctx.state, `${player(ctx.state, ctx.controllerIndex).userId} copiará lo que haga su oponente este turno.`);
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

// "Gana un ataque extra": for this turn when it's an activated effect (Bálor, Orco Gladiador), for
// as long as it stays when it's continuous (Héroe del Caos "puede pegar dos veces"). Damarco's
// "gana ataques igual a la cantidad de materiales" (`perMaterial`) counts its materials.
function grantExtraAttack(ctx, args) {
  const m = getFieldMonster(ctx.state, ctx.sourceInstanceId);
  if (!m) return;
  const amount = args.perMaterial ? (m.materials || []).length : (args.amount || 1);
  if (isContinuous(ctx)) {
    m.extraAttacksContinuous = (m.extraAttacksContinuous || 0) + amount;
    return;
  }
  const current = m.extraAttacksTurn && m.extraAttacksTurn.turn === ctx.state.turnNumber ? m.extraAttacksTurn.count : 0;
  m.extraAttacksTurn = { turn: ctx.state.turnNumber, count: current + amount };
  log(ctx.state, `${getCard(m.cardId).name} gana ${amount} ataque(s) extra este turno.`);
}

function winMatch(ctx) {
  declareWin(ctx.state, ctx.controllerIndex, `${player(ctx.state, ctx.controllerIndex).userId} gana la partida por efecto de carta.`);
}

function cannotBeNegated() {
  // read statically by negateActivation (cannotBeNegatedCard); no state change
}

// --- generic filtered-buff family: buffAllies / buffAtkPerMonster / buffPerCount /
// modifyStatPerCreature / modifyStatsPerMonsterOnField all boil down to "add atk/def to some
// filtered set of your monsters", optionally scaled by how many matches there are on the field.
//   scope "field"         : count the matches on the whole field (else only the controller's);
//   scope "opponentField" : count and buff the rival's monsters;
//   scope "equippedToSelf": count the cards equipped to this one (Carnívora Bestia-Moss);
//   target "self"         : the buff lands on the card that has the effect;
//   excludeSelf           : that card doesn't count itself ("excepto el mismo").
// The buff it applied is kept on ctx.lastScaledBuff for a following mirrorStatToOpponent step.
function applyScaledBuff(ctx, args, targets) {
  const filter = args.filter || { name: args.name, nameContains: args.nameContains, breed: args.breed, family: args.family, attribute: args.attribute };
  const hasFilter = Object.values(filter).some((v) => v !== undefined && v !== null && v !== '');
  const controllerMonsters = allOwnedMonsters(ctx.state, ctx.controllerIndex);
  const enemyMonsters = player(ctx.state, opponentIndex(ctx.controllerIndex)).field.monsters.filter(Boolean);
  const perUnit = { atk: args.atk || 0, def: args.def || 0 };
  let scaleBy;
  if (args.scope === 'equippedToSelf') {
    scaleBy = equipsOn(ctx.state, ctx.sourceInstanceId).length;
  } else {
    const pool = args.scope === 'field' ? allFieldMonsters(ctx.state) : args.scope === 'opponentField' ? enemyMonsters : controllerMonsters;
    const counted = pool.filter((m) => monsterMatches(m, filter) && !(args.excludeSelf && m.instanceId === ctx.sourceInstanceId));
    scaleBy = args.scope === 'field' || args.scope === 'opponentField' ? counted.length : counted.length || 1;
  }
  // Explicit targets (an equipped monster, a picked one) always win over the filter-based default.
  let targetSet = targets && targets.length ? allFieldMonsters(ctx.state).filter((m) => targets.includes(m.instanceId)) : hasFilter ? controllerMonsters.filter((m) => monsterMatches(m, filter)) : controllerMonsters;
  if (!(targets && targets.length)) {
    if (args.target === 'self' || args.scope === 'equippedToSelf') targetSet = controllerMonsters.filter((m) => m.instanceId === ctx.sourceInstanceId);
    else if (args.scope === 'opponentField') targetSet = enemyMonsters;
  }
  ctx.lastScaledBuff = { atk: perUnit.atk * scaleBy, def: perUnit.def * scaleBy };
  targetSet.forEach((m) => {
    m.tempBuff = m.tempBuff || { atk: 0, def: 0 };
    m.tempBuff.atk += perUnit.atk * scaleBy;
    m.tempBuff.def += perUnit.def * scaleBy;
  });
}

// Cards equipped to a field entry (Equipo supports, and monsters equipped as an Equipo).
function equipsOn(state, instanceId) {
  return state.players.flatMap((p) => p.field.support).filter((s) => s && s.equippedTo === instanceId);
}

// "Pierde sus efectos" / "niega los efectos de ..." — the picked monsters, or the ones the filter
// names (Seraphine: "todos los monstruos de Oscuridad en el Campo"). Continuous sources (Fuegos
// Fatuos, while equipped) only last as long as they do; the rest are permanent.
function disableEffects(ctx, args, targets) {
  const { canAffect } = require('../targets');
  const filter = args.filter || {};
  const hasFilter = Object.values(filter).some((v) => v !== undefined && v !== null && v !== '');
  const list = targets && targets.length
    ? allFieldMonsters(ctx.state).filter((m) => targets.includes(m.instanceId))
    : hasFilter
      ? allFieldMonsters(ctx.state).filter((m) => monsterMatches(m, filter))
      : [];
  list.filter((m) => canAffect(ctx, m)).forEach((m) => {
    if (isContinuous(ctx)) m.negatedByContinuous = true;
    else negateCard(ctx.state, m.instanceId, { sourceInstanceId: ctx.sourceInstanceId, duration: args.duration });
  });
}

// Continuous negation of a whole group, for as long as its source stays: Espectro ("los monstruos
// en el Campo"), Héroe del Caos ("los monstruos boca arriba en el Campo del oponente"), Caballo de
// Paja ("tus Apoyos").
function negateActivationOfEffects(ctx, args) {
  const opp = player(ctx.state, opponentIndex(ctx.controllerIndex));
  const mine = player(ctx.state, ctx.controllerIndex);
  let list;
  if (args.target === 'opponentFaceUpMonsters') list = opp.field.monsters.filter((m) => m && !m.faceDown);
  else if (args.target === 'controller' && args.cardType === 'support') list = mine.field.support.filter(Boolean);
  else list = allFieldMonsters(ctx.state);
  list.forEach((m) => { m.negatedByContinuous = true; });
}

// "Puede atacar directamente" — the equipped monster when there is one, else the card itself.
function enableDirectAttack(ctx, args, targets) {
  const id = (targets && targets[0]) || ctx.sourceInstanceId;
  const m = getFieldMonster(ctx.state, id);
  if (m) m.canAttackDirectly = true;
}

function limitUnique() {
  // read statically at summon/activation time (effectEngine.violatesUnique); no state change
}

function preventBattleDestruction(ctx, args) {
  allOwnedMonsters(ctx.state, ctx.controllerIndex)
    .filter((m) => matchesFilter(m, { attribute: args.attribute }))
    .forEach((m) => { m.cannotBeDestroyedByBattle = true; });
}

// Ángel de Platino: flags recomputed with the board (outcome.js reads them), so they end the moment
// the card leaves.
function setWinLoseLock(ctx, args) {
  if (args.owner && args.owner.cantLose) ctx.state.players[ctx.controllerIndex].cantLose = true;
  if (args.opponent && args.opponent.cantWin) ctx.state.players[opponentIndex(ctx.controllerIndex)].cantWin = true;
}

// "Baraja al Mazo N monstruos del Cementerio" (Refuerzos) — records how many for a following
// "y si lo haces" step.
function returnFromGraveyardToDeck(ctx, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const amount = args.count || 1;
  const monsters = pl.graveyard.filter((id) => ['monster', 'fusion'].includes(getCard(cardIdFromInstance(id)).category) && id !== ctx.sourceInstanceId);
  const moved = monsters.slice(-amount);
  moved.forEach((id) => moveToZone(ctx.state, id, 'deck', undefined, { deckPosition: args.shuffled ? 'shuffle' : 'top' }));
  ctx.previousSucceeded = moved.length === amount;
}

// "Regresa esta carta / la carta al Mazo".
function returnToDeck(ctx, args, targets) {
  const list = args.target === 'self' || !(targets && targets.length) ? [ctx.sourceInstanceId] : targets;
  list.forEach((id) => moveToZone(ctx.state, id, 'deck', undefined, { deckPosition: 'shuffle' }));
}

// Back to its owner's hand (a token just leaves the field).
function returnCardToHand(ctx, args, targets) {
  if (args.conditionalOn && ctx.previousSucceeded === false) return;
  let done = 0;
  (targets || []).forEach((id) => {
    const loc = findInstanceLocation(ctx.state, id);
    if (!loc) return;
    if (String(id).startsWith('token:')) removeFromZone(ctx.state, id, loc);
    else moveToZone(ctx.state, id, 'hand');
    done++;
  });
  ctx.previousSucceeded = done > 0;
}

// Serpiente de Muelle: "Sube a la Mano esta carta y al defensor del ataque" — `args.targets`
// names them ("self", "opponentBattlingMonster").
function bounceToHand(ctx, args, targets) {
  const named = (args.targets || []).map((t) => (t === 'self' ? ctx.sourceInstanceId : t === 'opponentBattlingMonster' ? ctx.event && ctx.event.defenderInstanceId : null)).filter(Boolean);
  returnCardToHand(ctx, args, [...named, ...(targets || [])]);
}

// "Desplaza esta carta a una nueva ubicación en el tablero" (Íncubo, Súcubo): to another free zone
// of its own side — the player picks which when there's more than one.
function relocateSelf(ctx) {
  const loc = findInstanceLocation(ctx.state, ctx.sourceInstanceId);
  if (!loc || loc.zone !== 'field:monster') return;
  const pl = player(ctx.state, loc.ownerIndex);
  const blocked = corrodedSlots(pl, 'monsters');
  const slots = pl.field.monsters.reduce((acc, m, i) => (m === null && !blocked.includes(i) ? [...acc, i] : acc), []);
  if (!slots.length) return;
  if (slots.length === 1) {
    moveMonsterToSlot(ctx.state, ctx.sourceInstanceId, slots[0]);
    return;
  }
  ctx.state.pendingTriggerChoices = ctx.state.pendingTriggerChoices || [];
  ctx.state.pendingTriggerChoices.push({ kind: 'slot', purpose: 'relocate', zone: 'monster', controllerIndex: loc.ownerIndex, sourceInstanceId: ctx.sourceInstanceId, slots, prompt: 'Elige a qué zona se desplaza' });
}

function moveMonsterToSlot(state, instanceId, slot) {
  const loc = findInstanceLocation(state, instanceId);
  if (!loc || loc.zone !== 'field:monster') return false;
  const pl = player(state, loc.ownerIndex);
  if (pl.field.monsters[slot] !== null) return false;
  pl.field.monsters[slot] = pl.field.monsters[loc.slot];
  pl.field.monsters[loc.slot] = null;
  log(state, `${getCard(cardIdFromInstance(instanceId)).name} se desplaza a otra zona.`);
  return true;
}

function relocateSelfFromChoice(state, pending, slot) {
  return moveMonsterToSlot(state, pending.sourceInstanceId, slot);
}

function setCardFaceDown(ctx, args, targets) {
  (targets || []).forEach((id) => {
    const s = ctx.state.players.flatMap((p) => p.field.support).find((x) => x && x.instanceId === id);
    if (s) s.faceDown = true;
    const m = getFieldMonster(ctx.state, id);
    if (m) { m.faceDown = true; m.position = 'defense'; }
  });
}

// Moneda de la Fortuna: "Cara: ganas 3 VP. Cruz: pierdes 3 VP" — runs the step the coin picks.
function coinFlip(ctx, args) {
  const heads = Math.random() < 0.5;
  ctx.state.lastCoinFlip = heads;
  log(ctx.state, heads ? 'La moneda sale cara.' : 'La moneda sale cruz.');
  const step = heads ? args.heads : args.tails;
  if (step && step.fn) runAction(ctx, step, []);
  return heads;
}

// Pegaso: "Convierte al objetivo en un Hada" — it counts as that breed while it's on the field.
function changeBeed(ctx, args, targets) {
  const list = targets && targets.length ? targets : [];
  list.forEach((id) => {
    const target = getFieldMonster(ctx.state, id);
    if (!target) return;
    target.breedOverride = args.breed || args.family;
    log(ctx.state, `${getCard(target.cardId).name} se convierte en ${target.breedOverride}.`);
  });
}

// Doppelganger: "es considerado de todos los tipos" (filters.js reads the flag).
function gainAllTypes(ctx) {
  const m = getFieldMonster(ctx.state, ctx.sourceInstanceId);
  if (m) m.gainsAllTypes = true;
}

// "El Atk de esta carta se convierte en X" — for good, or until the end of this/the next turn.
function setAtk(ctx, args, targets) {
  const value = args.amount ?? args.value ?? 0;
  (targets && targets.length ? targets : [ctx.sourceInstanceId]).forEach((id) => {
    const m = getFieldMonster(ctx.state, id);
    if (!m) return;
    if (args.duration === 'endOfTurn' || args.duration === 'endOfNextTurn') {
      m.atkOverride = { value, expiresTurn: ctx.state.turnNumber + (args.duration === 'endOfNextTurn' ? 1 : 0) };
    } else {
      m.baseAtk = value;
    }
  });
}

function setStatValue(ctx, args, targets) {
  setAtk(ctx, args, targets);
}

function damageMonster(ctx, args, targets) {
  (targets || []).forEach((id) => {
    const m = getFieldMonster(ctx.state, id);
    if (m) m.baseDef = Math.max(0, m.baseDef - (args.amount || 0));
  });
}

// "Tus monstruos de Metal pueden atacar este turno en Posición de Defensa" (Relicario): an ability
// kept on each monster until the turn ends (combat.js reads `attackInDefense`).
function grantAbility(ctx, args, targets) {
  const filter = { attribute: args.attribute || args.atribute, breed: args.breed, name: args.name };
  const list = targets && targets.length ? targets.map((id) => getFieldMonster(ctx.state, id)).filter(Boolean) : allOwnedMonsters(ctx.state, ctx.controllerIndex).filter((m) => monsterMatches(m, filter));
  const expiresTurn = END_OF_TURN.includes(args.duration) ? ctx.state.turnNumber : null;
  list.forEach((m) => {
    m.abilities = (m.abilities || []).filter((a) => a.name !== args.ability);
    m.abilities.push({ name: args.ability, expiresTurn });
  });
}

// Doppelganger: "Destruye 1 carta en el Campo, y si lo haces, el efecto de este monstruo es el del
// monstruo destruido" — copies the destroyed monster's effects onto itself (cardIndex.effectCodesOf).
function destroyAndCopyEffect(ctx, args, targets) {
  const destroyedIds = (targets || []).slice(0, 1);
  const before = destroyedIds.map((id) => ({ id, entry: getFieldMonster(ctx.state, id) }));
  require('./fieldActions').destroy(ctx, { ...args, target: 'selected' }, destroyedIds);
  if (!ctx.destroyedCount) return;
  const self = getFieldMonster(ctx.state, ctx.sourceInstanceId);
  const copied = before.find((b) => b.entry && !b.entry.isToken);
  if (!self || !copied) return;
  const { getEffect } = require('../cardIndex');
  self.copiedEffectCodes = (getCard(copied.entry.cardId).effectCodes || []).filter((id) => {
    const e = getEffect(id);
    return e && e.type !== 'summon_rule';
  });
  log(ctx.state, `${getCard(self.cardId).name} copia el efecto de ${getCard(copied.entry.cardId).name}.`);
}

function chooseEffect() {
  // "uno de estos efectos": handled by effect.choice (targets.js / effectEngine.resolveActions)
}

function opponentChoosesEffect() {
  // same as chooseEffect — kept so an authored effect naming it doesn't hit the fallback
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
  exileTarget,
  changePosition,
  applyStatus,
  corrodeZone,
  poisonZone: corrodeZone,
  decompileMonster,
  negateEffect,
  negateEffects: negateEffect,
  negateActivation,
  negateAttack,
  endBattlePhase,
  negateAndSendToGraveyard,
  grantBuff,
  summonTokens,
  summonToken,
  specialSummon,
  mirrorEvent,
  addCounter,
  millDeck,
  grantExtraAttack,
  winMatch,
  cannotBeNegated,
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
  coinFlip,
  changeBeed,
  gainAllTypes,
  setAtk,
  setStatValue,
  damageMonster,
  grantAbility,
  destroyAndCopyEffect,
  chooseEffect,
  opponentChoosesEffect,
};

const fieldActions = require('./fieldActions');
['destroy', 'destroyTarget', 'destroyCards', 'growSelf', 'takeControl', 'addCardToHandFromDeck', 'recoverCardsToHand', 'searchDeck', 'searchFromDeck', 'addCardToHandFromGraveyard', 'preventBattleDestruction', 'cannotBeDestroyedOrExiled', 'cannotBeDestroyedByOpponentEffects', 'summonFromDeck', 'specialSummonFromDeck', 'summonFromHand', 'specialSummonFromGY', 'summonFromZones', 'summon', 'sendFromDeckToGY']
  .forEach((fn) => { registry[fn] = fieldActions[fn]; });
Object.assign(registry, require('./extraActions'));

function runAction(ctx, step, targets) {
  const impl = registry[step.fn];
  if (!impl) {
    log(ctx.state, `[motor] acción "${step.fn}" aún no implementada — se ignora.`);
    return;
  }
  impl(ctx, step.args || {}, targets);
}

module.exports = { runAction, registry, checkWin, requestDiscard, relocateSelfFromChoice, equipsOn, columnMonsters, allFieldMonsters, fieldEntry };
