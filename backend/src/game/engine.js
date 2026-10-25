const { createMatchState } = require('./state');
const { advancePhase, runPhaseEntry } = require('./turns');
const { normalSummon, specialSummon, compileSummon, decompile } = require('./summon');
const { canBeNormalSummoned, cannotBeSummoned } = require('./summonRules');
const { hasStatus, statusesOf, FREEZE } = require('./statuses');
const { activateSupport, activateSetSupport } = require('./support');
const { declareAttack, attackBlockReason, allowedAttacks } = require('./combat');
const { changePosition } = require('./position');
const { isOwnActivation, activateEffect, resolveTriggerChoice, requiredZoneFor, locationIsInZone, effectIdsAt, fieldEntryAt, describeHand, getEffectiveStats } = require('./effectEngine');
const { passPriority, speedOf, linkBlockReason, responseWindowOpen } = require('./chain');
const { checkConditions } = require('./effects/conditions');
const { isNegated } = require('./negation');
const { getCard, getEffect, loadCardIndex } = require('./cardIndex');
const { rules } = require('./rules');
const { describeEffect } = require('./effectLabels');
const { withLocations } = require('./choiceOptions');
const { compileInfo } = require('./compileInfo');
const { player, opponentIndex, findInstanceLocation } = require('./zones');

// Player-initiated effect types (as opposed to 'triggered'/'trigger', which fire automatically,
// 'continuous', which is passive, and 'summon_rule'/'rule', which are static).
const PLAYER_ACTIVATABLE_TYPES = ['activated', 'quick', 'ignition'];

// Effect ids this card instance can send as ACTIVATE_EFFECT right now, from its owner's point of
// view — computed server-side so the client never has to know the effect catalog itself, just
// which buttons to show. Only the ones whose timing is legal right now (the Pila's speed rules and
// "cuando ..." response windows); whether costs/conditions hold is found out when it's tried.
function computeAvailableEffects(state, ownerIndex, instanceId, cardId) {
  const card = getCard(cardId);
  const loc = findInstanceLocation(state, instanceId);
  if (!loc || loc.ownerIndex !== ownerIndex) return [];
  if (hasStatus(state, instanceId, FREEZE)) return [];
  if (loc.zone === 'hand' && card.category === 'support') return []; // played with ACTIVATE_SUPPORT
  const entry = fieldEntryAt(state, loc);
  if (entry && entry.isMonsterEquip) return [];
  // A face-down Normal/Continuo/Equipo support is activated by turning it over (ACTIVATE_SET_SUPPORT),
  // which pays its cost; only Veloz/Contraataque cards act through their own effects while set.
  if (loc.zone === 'field:support' && entry && entry.faceDown && card.subtype !== 'instant' && card.subtype !== 'counter') return [];
  if (loc.zone === 'field:monster' && entry && entry.faceDown) return [];
  const setFast = loc.zone === 'field:support' && entry && entry.faceDown;
  // Set face-down, only what turning it over runs (its "en activación" effects) — never an effect
  // meant for the Cementerio/Exilio (Anillo de Boda's second one).
  const onPlay = setFast ? require('./support').onPlayEffects(card).map((e) => e._id) : null;
  return effectIdsAt(state, instanceId).filter((effectId) => {
    const effect = getEffect(effectId);
    if (!effect || !PLAYER_ACTIVATABLE_TYPES.includes(effect.type)) return false;
    if (setFast && !onPlay.includes(effectId)) return false;
    // A face-up Apoyo's "en activación" effect went on the Pila with the card (a set Veloz still
    // offers it: that's how it's turned face-up).
    if (!setFast && isOwnActivation(card, effect)) return false;
    // Effects that don't say which zone they need (most monster ignition/quick abilities)
    // default to "must be face-up on the field" — the ordinary case for that kind of ability.
    const requiredZone = requiredZoneFor(effect) || 'field';
    if (!setFast && !locationIsInZone(loc, requiredZone)) return false;
    if (linkBlockReason(state, ownerIndex, speedOf(card, effect))) return false;
    return responseWindowOpen(state, ownerIndex, effect);
  });
}

// The effect ids a card can activate now, plus a readable label for each button.
function effectsFor(state, ownerIndex, instanceId, cardId) {
  const availableEffects = computeAvailableEffects(state, ownerIndex, instanceId, cardId);
  const effectLabels = Object.fromEntries(availableEffects.map((id) => [id, describeEffect(getEffect(id))]).filter(([, label]) => label));
  return { availableEffects, effectLabels };
}

async function createMatch(opts) {
  await loadCardIndex();
  const state = createMatchState(opts);
  if (opts.coinToss) {
    const { log } = require('./zones');
    log(state, `Sorteo: sale ${opts.coinToss}. Empieza ${state.players[state.turnPlayer].userId}.`);
  }
  runPhaseEntry(state); // processes turn 1's draw phase (no draw/income, per the rulebook) and marks it played
  return state;
}

// Rulebook: who goes first is decided by a coin toss — heads, the player who started the duel
// (playerA); tails, the other one.
function coinTossFirstPlayer(random = Math.random) {
  const heads = random() < 0.5;
  return { firstPlayer: heads ? 0 : 1, coinToss: heads ? 'cara' : 'cruz' };
}

// Single entry point for every player-initiated change. `action.type` selects the handler;
// returns { ok, reason?, state } — callers (socket/REST layer) broadcast `state` on success.
// Rulebook, "Apilar": while anything is on the Pila, the only legal move is whatever the current
// priority holder does about it — add a faster response (ACTIVATE_SUPPORT/ACTIVATE_EFFECT) or
// PASS_CHAIN — nobody, including the turn player, can advance the phase or take any other action
// until it clears.
const CHAIN_RESPONSE_TYPES = ['ACTIVATE_SUPPORT', 'ACTIVATE_EFFECT', 'PASS_CHAIN'];

// Rulebook: every action opens a window for the other player to answer it with a fast effect
// (Speed 2 or more: an Apoyo Veloz from the hand or set, a quick effect) — or to pass. Activations
// and attacks already open a Pila of their own; these are the rest.
const WINDOW_ACTIONS = {
  NORMAL_SUMMON: (a) => (a.faceDown ? 'coloca un monstruo boca abajo' : 'invoca un monstruo'),
  SPECIAL_SUMMON: () => 'invoca un monstruo de forma especial',
  COMPILE_SUMMON: () => 'compila un monstruo',
  CHANGE_POSITION: () => 'cambia la posición de un monstruo',
  DECOMPILE: () => 'descompila un monstruo',
  ACTIVATE_SUPPORT: (a) => (a.setFaceDown ? 'coloca un Apoyo boca abajo' : null),
  ADVANCE_PHASE: () => 'pasa de fase',
};

// Whether the player could answer anything right now: a fast effect they could use (set Veloz,
// quick effect...) or an Apoyo Veloz in their hand. With nothing, the window passes on its own.
function canRespondNow(state, idx) {
  const pl = state.players[idx];
  if (pl.hand.some((id) => { const c = getCard(id.split(':')[1]); return c.category === 'support' && c.subtype === 'instant'; })) return true;
  const ids = [...pl.hand, ...pl.graveyard, ...pl.banished, ...pl.field.monsters.filter(Boolean).map((m) => m.instanceId), ...pl.field.support.filter(Boolean).map((s) => s.instanceId), ...(pl.field.territory ? [pl.field.territory.instanceId] : [])];
  return ids.some((id) => !String(id).startsWith('token:') && computeAvailableEffects(state, idx, id, id.split(':')[1]).length > 0);
}

function openWindow(state, actorIndex, label) {
  const idx = actorIndex === 0 ? 1 : 0;
  state.windowDue = null;
  if (state.status !== 'active' || state.chain.length) return;
  if (!canRespondNow(state, idx)) return;
  state.window = { priorityPlayer: idx, openedBy: actorIndex, label };
  require('./zones').log(state, `${state.players[idx].userId} puede responder (${state.players[actorIndex].userId} ${label}).`);
}

function applyAction(state, playerIndex, action) {
  const res = dispatchAction(state, playerIndex, action);
  // A placement still waiting is asked with the zones that are free after this action (or done at
  // once if only one is left).
  if (res && res.ok) require('./placement').settlePlacements(state);
  if (res && res.ok) {
    // An activation answered the window: the Pila takes over from it.
    if (state.chain.length) state.window = null;
    // A phase change that ends the turn (or waits on the Reinos' upkeep) opens none.
    const label = WINDOW_ACTIONS[action.type] && !res.newTurn && !res.upkeep && WINDOW_ACTIONS[action.type](action);
    if (label && state.status === 'active') state.windowDue = { actorIndex: playerIndex, label };
    // Opened once nothing else is waiting (a pick, a Pila).
    const busy = (state.pendingTriggerChoices && state.pendingTriggerChoices.length) || state.chain.length;
    if (state.windowDue && !busy && !state.window) openWindow(state, state.windowDue.actorIndex, state.windowDue.label);
  }
  // A pick the player still has to make: each option says where that card is (choiceOptions.js).
  if (res && res.reason === 'choose-target') res.options = withLocations(state, res.options, playerIndex);
  return res;
}

function dispatchAction(state, playerIndex, action) {
  if (state.status !== 'active') return { ok: false, reason: 'match-finished' };

  if (action.type === 'SURRENDER') {
    // always allowed, regardless of chain/pending-choice state
  } else if (state.pendingTriggerChoices && state.pendingTriggerChoices.length > 0) {
    // An automatic trigger (Avispa de Obsidiana's on-summon search, say) is waiting on the
    // player's pick — nothing else can happen until they answer.
    if (action.type !== 'RESOLVE_TRIGGER_CHOICE') return { ok: false, reason: 'trigger-choice-pending' };
    if (playerIndex !== state.pendingTriggerChoices[0].controllerIndex) return { ok: false, reason: 'not-your-choice' };
  } else if (state.chain.length > 0) {
    if (!CHAIN_RESPONSE_TYPES.includes(action.type)) return { ok: false, reason: 'chain-open' };
    if (playerIndex !== state.priorityPlayer) return { ok: false, reason: 'not-your-priority' };
  } else if (state.window) {
    // A response window: only its player acts — answer with a fast effect, or pass.
    if (playerIndex !== state.window.priorityPlayer || !CHAIN_RESPONSE_TYPES.includes(action.type)) return { ok: false, reason: 'window-open' };
  } else if (playerIndex !== state.turnPlayer && !['ACTIVATE_EFFECT'].includes(action.type)) {
    return { ok: false, reason: 'not-your-turn' };
  }

  const activating = (action.type === 'ACTIVATE_SUPPORT' && !action.setFaceDown) || action.type === 'ACTIVATE_SET_SUPPORT' ? action.instanceId : action.type === 'ACTIVATE_EFFECT' ? action.sourceInstanceId : null;
  if (activating && !String(activating).startsWith('token:') && (state.bannedNames || []).some((b) => b.turn === state.turnNumber && b.name === getCard(activating.split(':')[1]).name)) {
    return { ok: false, reason: 'name-banned' };
  }

  switch (action.type) {
    case 'ADVANCE_PHASE':
      return advancePhase(state);

    case 'NORMAL_SUMMON':
      return normalSummon(state, playerIndex, action.instanceId, {
        position: action.position || 'attack',
        faceDown: !!action.faceDown,
        slot: action.slot ?? null,
      });

    case 'SPECIAL_SUMMON':
      return specialSummon(state, playerIndex, action.instanceId, action.targets || [], action.slot ?? null);

    case 'ACTIVATE_SUPPORT':
      return activateSupport(state, playerIndex, action.instanceId, {
        targets: action.targets || [],
        setFaceDown: !!action.setFaceDown,
        slot: action.slot ?? null,
      });

    case 'ACTIVATE_SET_SUPPORT':
      return activateSetSupport(state, playerIndex, action.instanceId, { targets: action.targets || [] });

    case 'COMPILE_SUMMON':
      return compileSummon(state, playerIndex, action.instanceId, action.materialInstanceIds || [], action.slot ?? null);

    case 'DECLARE_ATTACK':
      return declareAttack(state, playerIndex, action.attackerInstanceId, action.targetInstanceId || null);

    case 'DECOMPILE':
      return decompile(state, playerIndex, action.instanceId);

    case 'CHANGE_POSITION':
      return changePosition(state, playerIndex, action.instanceId, action.position);

    case 'ACTIVATE_EFFECT':
      return activateEffect(state, playerIndex, action.effectId, action.sourceInstanceId, action.targets || []);

    case 'PASS_CHAIN':
      if (!state.chain.length && state.window) {
        require('./zones').log(state, `${state.players[playerIndex].userId} no responde.`);
        state.window = null;
        return { ok: true };
      }
      return passPriority(state, playerIndex);

    case 'RESOLVE_TRIGGER_CHOICE':
      return resolveTriggerChoice(state, playerIndex, action.targets || [], action.slot ?? null);

    case 'SURRENDER': {
      require('./outcome').surrender(state, playerIndex);
      return { ok: true };
    }

    default:
      return { ok: false, reason: 'unknown-action' };
  }
}

// A trimmed view safe to send to a given player: hides the opponent's hand/deck contents,
// keeps counts only.
function viewFor(state, viewerIndex) {
  const names = state.players.map(displayName);
  const redactPlayer = (pl, idx) => {
    const isViewer = idx === viewerIndex;
    return {
      userId: pl.userId,
      name: names[idx],
      vp: pl.vp,
      pixelcoins: pl.pixelcoins,
      normalSummonUsed: pl.normalSummonUsed,
      handCount: pl.hand.length,
      hand: isViewer ? pl.hand.map((id) => describeInstance(state, id, idx, isViewer)) : undefined,
      deckCount: pl.deck.length,
      extraCount: pl.extra.length,
      extra: isViewer ? pl.extra.map((id) => describeInstance(state, id, idx, isViewer)) : undefined,
      graveyard: pl.graveyard.map((id) => describeInstance(state, id, idx, isViewer)),
      banished: pl.banished.map((id) => describeInstance(state, id, idx, isViewer)),
      field: {
        monsters: pl.field.monsters.map((m) => (m ? describeFieldMonster(state, m, idx, isViewer) : null)),
        support: pl.field.support.map((s) => (s ? describeFieldSupport(state, s, idx, isViewer) : null)),
        territory: pl.field.territory ? describeFieldSupport(state, pl.field.territory, idx, isViewer) : null,
      },
    };
  };

  return {
    id: state.id,
    status: state.status,
    turnNumber: state.turnNumber,
    turnPlayer: state.turnPlayer,
    phase: state.phase,
    winnerIndex: state.winnerIndex,
    startingVp: rules().startingVp, // what the VP bars are measured against
    // Why the duel ended ("se queda sin VP", "se rinde"...), once it has.
    endReason: state.endReason ? readableLogLine(state, { message: state.endReason }, names).message : null,
    you: viewerIndex,
    players: state.players.map(redactPlayer),
    log: state.log.slice(-80).map((line) => readableLogLine(state, line, names)),
    // The last battle, step by step (who attacked what, the numbers compared, what happened).
    lastBattle: state.lastBattle ? { ...state.lastBattle, steps: state.lastBattle.steps.map((text) => readableLogLine(state, { message: text }, names).message) } : null,
    // Rulebook, "Apilar": null once the Pila is empty; while it isn't, nothing else can happen
    // except the priority holder adding a faster response or passing.
    chain: state.chain.length
      ? {
          priorityPlayer: state.priorityPlayer,
          links: state.chain.map((l) => ({ controllerIndex: l.controllerIndex, instanceId: l.sourceInstanceId, cardName: l.cardName, speed: l.speed, kind: l.kind || 'effect', targetInstanceId: l.targetInstanceId || null })),
        }
      : null,
    // An automatic trigger waiting on this viewer's pick — a search (Avispa de Obsidiana, Nido de
    // Avispas...) or where to place a self-summon (Avispa Mutante, kind 'slot'). Null for the
    // other player, who has nothing to do about it.
    pendingTriggerChoice: describePendingTriggerChoice(state, viewerIndex),
    // A response window: who may answer the last action (with a fast effect) or pass, and what it was.
    window: state.window && !state.chain.length ? { priorityPlayer: state.window.priorityPlayer, label: readableLogLine(state, { message: `${state.players[state.window.openedBy].userId} ${state.window.label}` }, names).message } : null,
  };
}

// The name a player goes by on the board: their user name, or "Bot".
function displayName(pl) {
  if (pl.userId === 'BOT') return 'Bot';
  return pl.name || 'Jugador';
}

// The engine logs players by user id; the board shows their names instead, and which player the
// line is about (`actor`) so it can be coloured as "yours" or "the rival's".
function readableLogLine(state, line, names) {
  let message = line.message;
  let actor = null;
  state.players.forEach((pl, idx) => {
    if (!message.includes(pl.userId)) return;
    if (actor === null) actor = idx;
    message = message.split(pl.userId).join(names[idx]);
  });
  return { ...line, message, actor };
}

function describePendingTriggerChoice(state, viewerIndex) {
  const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
  if (!pending || pending.controllerIndex !== viewerIndex) return null;
  if (pending.kind === 'slot') {
    return {
      kind: 'slot',
      zone: pending.zone,
      slots: pending.slots,
      card: describeInstance(state, pending.sourceInstanceId, viewerIndex, true),
      prompt: pending.prompt || 'Se invoca de forma especial: elige dónde',
    };
  }
  if (pending.kind === 'discard') {
    return { kind: 'discard', count: pending.count, options: withLocations(state, describeHand(state, viewerIndex), viewerIndex), prompt: pending.prompt };
  }
  return { kind: 'effect', options: withLocations(state, pending.options, viewerIndex), prompt: pending.prompt };
}

// The card's own summon_rule effect (its "método de invocación especial"), if it has one the
// PLAYER chooses to use — a rule with its own `trigger` (Avispa Mutante's "si es añadida a tu
// Mano...") fires automatically instead (see summon.js fireHandTrigger) and isn't a button here.
function specialSummonRuleFor(card) {
  return (card.effectCodes || []).map(getEffect).find((e) => e && e.type === 'summon_rule' && !e.trigger && (e.actions || []).some((a) => a.fn === 'specialSummon'));
}

// Whether that rule's CONDITIONS are met right now (cost affordability isn't checked here — the
// player finds out when they try, same as any other cost).
function specialSummonAvailable(state, ownerIndex, instanceId, card) {
  const rule = require('./summon').grantedSummonRule(state, ownerIndex, instanceId, card) || specialSummonRuleFor(card);
  if (!rule) return false;
  const ctx = { state, controllerIndex: ownerIndex, sourceInstanceId: instanceId, effect: rule };
  return checkConditions(ctx, rule.conditions);
}

function describeInstance(state, instanceId, ownerIndex, isViewerOwner) {
  const cardId = instanceId.split(':')[1];
  const card = getCard(cardId);
  const base = { instanceId, cardId, name: card.name, image: card.image, category: card.category, subtype: card.subtype };
  if (card.category === 'monster') {
    base.normalSummonable = canBeNormalSummoned(card);
    base.cannotBeSummoned = cannotBeSummoned(card);
    base.specialSummonAvailable = isViewerOwner && specialSummonAvailable(state, ownerIndex, instanceId, card);
  }
  if (!isViewerOwner) return base;
  // A Compilación in the Mazo-C (or hand): its recipe and what the player has for it.
  if (card.category === 'fusion') {
    const loc = findInstanceLocation(state, instanceId);
    if (loc && (loc.zone === 'extra' || loc.zone === 'hand')) base.compile = compileInfo(state, ownerIndex, instanceId);
  }
  return { ...base, ...effectsFor(state, ownerIndex, instanceId, cardId) };
}

function describeFieldMonster(state, m, ownerIndex, isViewerOwner) {
  const base = {
    instanceId: m.instanceId,
    position: m.position,
    faceDown: m.faceDown,
    hasAttacked: m.hasAttacked,
    counters: m.counters,
    statuses: statusesOf(state, m.instanceId),
    negated: !m.faceDown && (isNegated(state, m) || !!m.effectsLost),
    materialCount: (m.materials || []).length,
    // Only a compiled monster from an earlier turn can be decompiled from the UI (Pez dorado's
    // same-turn exception is left to the server to accept or reject).
    canDecompile: (m.materials || []).length > 0,
    // Whether its owner can attack the rival's VP with it right now — the board offers the rival's
    // VP as a target only then (empty board, only untargetable monsters, or "puede atacar directamente").
    canAttackDirectly: isViewerOwner && !attackBlockReason(state, ownerIndex, m, null),
  };
  if (m.isToken) return { ...base, isToken: true, name: m.tokenDef.name, ...describeStats(state, m, m.tokenDef) };
  // The owner knows which card their face-down monster is (for the hover preview); the rival doesn't.
  if (m.faceDown) return isViewerOwner ? { ...base, cardId: m.cardId, name: getCard(m.cardId).name, ...describeStats(state, m, getCard(m.cardId)), availableEffects: [] } : base;
  const card = getCard(m.cardId);
  // The materials under a face-up Compilación are face-up too: both players can look at them.
  const materials = (m.materials || []).map((id) => {
    const mat = getCard(id.split(':')[1]);
    return { instanceId: id, cardId: mat._id.toString(), name: mat.name, image: mat.image, category: mat.category, effect: mat.effect, atk: mat.atk, def: mat.def, level: mat.level };
  });
  const described = { ...base, cardId: m.cardId, name: card.name, image: card.image, materials, ...describeStats(state, m, card) };
  if (!isViewerOwner) return described;
  return { ...described, ...effectsFor(state, ownerIndex, m.instanceId, m.cardId) };
}

// What the board shows about a monster's numbers: the current Atk/Vida (what battles use), the
// printed ones, and every change in between with the card it came from.
function describeStats(state, m, printed) {
  const { atk, def } = getEffectiveStats(m);
  return {
    atk,
    def,
    printedAtk: printed.atk || 0,
    printedDef: printed.def || 0,
    statMods: [...(m.permanentMods || []), ...(m.statMods || [])],
    equips: state.players.flatMap((p) => p.field.support).filter((s) => s && !s.faceDown && s.equippedTo === m.instanceId).map((s) => getCard(s.cardId).name),
    statusInfo: statusDetails(state, m.instanceId),
    attacksLeft: m.attackLockTurn === state.turnNumber ? 0 : Math.max(0, allowedAttacks(state, m) - (m.attacksThisTurn || 0)),
  };
}

// Each status with how long it lasts ("hasta el final del turno" / "del próximo turno").
function statusDetails(state, instanceId) {
  return ((state.statuses && state.statuses[instanceId]) || []).map((s) => ({
    type: s.type,
    until: s.expiresTurn > state.turnNumber ? 'nextTurn' : 'endOfTurn',
  }));
}

function describeFieldSupport(state, s, ownerIndex, isViewerOwner) {
  if (s.faceDown && !isViewerOwner) return { instanceId: s.instanceId, faceDown: true };
  const card = getCard(s.cardId);
  const equippedTo = s.equippedTo && require('./zones').getFieldMonster(state, s.equippedTo);
  const described = { instanceId: s.instanceId, faceDown: s.faceDown, cardId: s.cardId, name: card.name, image: card.image, subtype: card.subtype, equippedToName: equippedTo ? (equippedTo.isToken ? equippedTo.tokenDef.name : getCard(equippedTo.cardId).name) : null, counters: s.counters };
  if (!isViewerOwner) return described;
  return { ...described, ...effectsFor(state, ownerIndex, s.instanceId, s.cardId) };
}

module.exports = { createMatch, applyAction, viewFor, coinTossFirstPlayer, computeAvailableEffects, specialSummonAvailable };
