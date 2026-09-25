// Rulebook: the player picks — whichever card an effect searches, summons from the Mazo, destroys,
// negates or buffs when its text says "selecciona"/"un monstruo enemigo"/"una carta en el Campo", and
// which of its alternatives a "puedes activar uno de estos efectos" card applies. Only a real choice
// is asked about: with 0 or exactly enough candidates the effect just takes them.
//
// Every choosable action step has a *pool* (stepPool) — the instances it could legally act on right
// now. The same pool drives both sides: pendingEffectChoice offers it before the effect is used, and
// resolveActions (effectEngine) hands each step only the picks that belong to it, in the order the
// player made them. Picks travel in one flat `targets` list next to the cost's own picks and to
// `choice:<n>` tokens for "one of these" effects; each consumer takes only what's in its own pool.
const { getCard, getEffect } = require('./cardIndex');
const { player, opponentIndex } = require('./zones');
const { matchesFilter, matchesCardFilter } = require('./filters');
const { cardIdFromInstance } = require('./deckUtils');

const cardOf = (id) => getCard(cardIdFromInstance(id));

// Target words in the effect data that mean "the player selects".
const SELECT_WORDS = new Set(['selected', 'anyCard', 'fieldCard', 'support', 'Monstruo', 'Compilado', 'fieldMonsterInAttackPosition', 'any', 'enemyMonster']);

function fieldRows(state, side, controllerIndex) {
  const rows = [];
  [0, 1].forEach((idx) => {
    if (side === 'self' && idx !== controllerIndex) return;
    if (side === 'opponent' && idx !== opponentIndex(controllerIndex)) return;
    const pl = player(state, idx);
    pl.field.monsters.forEach((entry) => { if (entry) rows.push({ entry, ownerIndex: idx, kind: 'monster' }); });
    [...pl.field.support, pl.field.territory].forEach((entry) => { if (entry) rows.push({ entry, ownerIndex: idx, kind: 'support' }); });
  });
  return rows;
}

// Whether an effect coming from `ctx` may act on this field entry at all: Motor de Engranaje ("no
// puede ser objetivo de ... efectos de cartas"), Gigante Elemental ("inmune a los efectos de los
// monstruos cuyos atributos se hayan utilizado para su invocación").
function canAffect(ctx, entry) {
  if (!entry) return false;
  if (entry.untargetable && entry.instanceId !== ctx.sourceInstanceId) return false;
  if (entry.immuneAttributes && entry.immuneAttributes.length && ctx.sourceInstanceId && !String(ctx.sourceInstanceId).startsWith('token:')) {
    const source = getCard(cardIdFromInstance(ctx.sourceInstanceId));
    if (['monster', 'fusion'].includes(source.category) && entry.immuneAttributes.includes(source.attribute)) return false;
  }
  return true;
}

// "No puede ser Destruido/Exiliado por efectos (del oponente)".
function protectedFromRemoval(ctx, row) {
  return !!row.entry.immuneToOpponentEffects && row.ownerIndex !== ctx.controllerIndex;
}

// Where a "selected" step looks for its card: the side and zone its args (or the effect's own
// targetSelector) name, defaulting to any card on the field.
function selectRows(ctx, args) {
  const effect = ctx.effect || {};
  const own = effect.targetSelector === 'ownFieldMonster';
  const side = args.side || (own ? 'self' : args.target === 'enemyMonster' || args.target === 'opponentMonster' || args.target === 'opponentField' ? 'opponent' : 'any');
  let rows = fieldRows(ctx.state, side, ctx.controllerIndex).filter((r) => canAffect(ctx, r.entry));
  const wantsSupport = args.target === 'support' || (args.filter && /^(apoyo|support|soporte)$/i.test(args.filter.category || ''));
  const wantsMonster = ['Monstruo', 'Compilado', 'enemyMonster', 'fieldMonsterInAttackPosition'].includes(args.target) || args.zone === 'monster';
  if (wantsSupport) rows = rows.filter((r) => r.kind === 'support');
  if (wantsMonster) rows = rows.filter((r) => r.kind === 'monster');
  if (args.target === 'Compilado') rows = rows.filter((r) => (r.entry.materials || []).length > 0);
  if (args.target === 'fieldMonsterInAttackPosition') rows = rows.filter((r) => r.entry.position === 'attack' && !r.entry.faceDown);
  if (args.excludeSelf !== false) rows = rows.filter((r) => r.entry.instanceId !== ctx.sourceInstanceId);
  const filter = args.filter ? { ...args.filter, category: undefined } : null;
  if (filter && Object.values(filter).some((v) => v !== undefined && v !== null && v !== '')) {
    rows = rows.filter((r) => !r.entry.isToken && (r.kind === 'monster' ? matchesFilter(r.entry, filter) : matchesCardFilter(getCard(r.entry.cardId), filter)));
  }
  if (effect.targetSelector === 'fieldLicantropo' && args.target === 'selected') {
    rows = rows.filter((r) => !r.entry.isToken && r.kind === 'monster' && matchesFilter(r.entry, { nameContains: 'Licántropo' }));
  }
  return rows;
}

const ids = (rows) => rows.map((r) => r.entry.instanceId);
const isSelect = (args) => SELECT_WORDS.has(args.target);
const faceUpMonsters = (rows) => rows.filter((r) => r.kind === 'monster' && !r.entry.faceDown);

// Deck/Cementerio/Mano cards a "summon a monster from X" step could bring out.
function summonZonePool(ctx, zones, args) {
  const pl = player(ctx.state, ctx.controllerIndex);
  const filter = { ...(args.filter || {}), zone: undefined, exclude: undefined, level: args.filter?.level ?? args.level };
  if (args.levelOrLower) filter.maxLevel = args.levelOrLower;
  const exclude = args.exclude || (args.filter && args.filter.exclude);
  const excludedName = exclude === 'self' ? cardOf(ctx.sourceInstanceId).name : exclude;
  return zones.flatMap((z) => pl[z] || []).filter((id) => {
    const card = cardOf(id);
    if (!['monster', 'fusion'].includes(card.category)) return false;
    if (excludedName && card.name === excludedName) return false;
    return matchesCardFilter(card, filter);
  });
}

// The pool of one action step, or null when that step doesn't involve a choice.
function stepPool(ctx, step) {
  const args = step.args || {};
  const { searchCandidates, SEARCH_FNS } = require('./effects/fieldActions');
  if (SEARCH_FNS.includes(step.fn)) return searchCandidates(ctx.state, ctx.controllerIndex, step.fn, args, ctx);
  switch (step.fn) {
    case 'sendFromDeckToGY': {
      const pl = player(ctx.state, ctx.controllerIndex);
      return pl.deck.filter((id) => matchesCardFilter(cardOf(id), args.filter || { breed: args.breed, family: args.family }));
    }
    case 'summonFromDeck':
    case 'specialSummonFromDeck':
      return summonZonePool(ctx, ['deck'], args);
    case 'summonFromHand':
      return summonZonePool(ctx, ['hand'], args);
    case 'specialSummonFromGY':
      return args.player === 'opponent' ? null : summonZonePool(ctx, ['graveyard'], args);
    case 'summonFromZones':
      return summonZonePool(ctx, args.zones || ['graveyard'], args);
    case 'summon':
      return summonZonePool(ctx, (args.filter && args.filter.zone) || ['graveyard'], args);
    case 'destroy':
    case 'destroyTarget':
    case 'destroyCards':
      return isSelect(args) ? ids(selectRows(ctx, args).filter((r) => !protectedFromRemoval(ctx, r))) : null;
    case 'exileTarget':
      return args.target === 'self' ? null : ids(selectRows(ctx, { ...args, target: args.target || 'selected' }).filter((r) => !protectedFromRemoval(ctx, r)));
    case 'applyStatus':
    case 'grantBuff':
    case 'damageMonster':
      return isSelect(args) ? ids(faceUpMonsters(selectRows(ctx, args))) : null;
    case 'returnCardToHand':
    case 'bounceToHand':
      return isSelect(args) ? ids(selectRows(ctx, args).filter((r) => !r.entry.isToken)) : null;
    case 'corrodeZone':
    case 'poisonZone':
      return isSelect(args) ? ids(selectRows(ctx, { ...args, side: 'opponent', zone: 'monster' })) : null;
    case 'addCounter':
      return isSelect(args) ? ids(selectRows(ctx, { ...args, side: 'self', excludeSelf: false }).filter((r) => !r.entry.isToken)) : null;
    case 'negateEffect':
    case 'negateEffects':
      return isSelect(args) ? ids(selectRows(ctx, args).filter((r) => !r.entry.isToken && !r.entry.faceDown)) : null;
    case 'changeBeed':
      return ids(faceUpMonsters(selectRows(ctx, { ...args, target: 'selected', excludeSelf: false })).filter((r) => !r.entry.isToken));
    case 'target':
      return ids(faceUpMonsters(selectRows(ctx, { ...args, excludeSelf: false })));
    case 'equipMonster':
    case 'equipMonsterToSelf': {
      const side = args.filter && args.filter.controller === 'opponent' ? 'opponent' : 'any';
      return ids(selectRows(ctx, { ...args, side, target: 'fieldMonsterInAttackPosition', filter: undefined }).filter((r) => !r.entry.isToken));
    }
    case 'destroyAndCopyEffect':
    case 'destroyAndGainVP':
      return ids(selectRows(ctx, { ...args, target: 'selected' }).filter((r) => !protectedFromRemoval(ctx, r)));
    case 'destroyUpToHeroCount':
      return ids(selectRows(ctx, { ...args, side: 'opponent', target: 'selected' }).filter((r) => !protectedFromRemoval(ctx, r)));
    default:
      return null;
  }
}

// Distinct names among the Héroe monsters on the whole field (Héroe de la Esperanza).
function heroCount(ctx, countBy = {}) {
  const heroes = fieldRows(ctx.state, 'any', ctx.controllerIndex)
    .filter((r) => r.kind === 'monster' && !r.entry.isToken && !r.entry.faceDown && matchesFilter(r.entry, { breed: countBy.breed || 'Héroe' }))
    .map((r) => getCard(r.entry.cardId).name);
  return countBy.uniqueNames === false ? heroes.length : new Set(heroes).size;
}

// How many picks a step takes.
function stepCount(ctx, step) {
  const args = step.args || {};
  if (step.fn === 'destroyUpToHeroCount') return heroCount(ctx, args.countBy);
  const { SEARCH_FNS, normalizeSearchArgs } = require('./effects/fieldActions');
  if (SEARCH_FNS.includes(step.fn)) return normalizeSearchArgs(step.fn, args).count;
  return args.count || 1;
}

// "Puedes activar uno de estos efectos": `choice:<n>` in the picks says which one (`choice:skip`:
// none — only offered for an optional effect).
function chosenIndex(targets) {
  const token = (targets || []).find((t) => typeof t === 'string' && t.startsWith('choice:'));
  if (!token) return null;
  return token === 'choice:skip' ? 'skip' : Number(token.split(':')[1]);
}

// Tokens that travel in `targets` but aren't cards: which alternative, "use it / don't", "that's
// all" for an up-to pick.
const isToken = (t) => typeof t === 'string' && /^(choice|optional|done):/.test(t);

// "Hasta N": the player picks how many, from none up to N (Héroe de la Esperanza).
const isUpTo = (step) => !!((step.args && step.args.upTo) || step.fn === 'destroyUpToHeroCount');

// Whether the player has declined an optional effect ("No usarlo" / "No usar el efecto").
function declined(targets) {
  return (targets || []).some((t) => t === 'optional:no' || t === 'choice:skip');
}

// "Puedes ..." on an automatic effect: ask first whether to use it at all. An optional "uno de
// estos efectos" instead gets a "No usar el efecto" entry among its alternatives.
function pendingOptionalChoice(ctx, effect, targets) {
  if (!effect.optional || effect.choice || declined(targets) || (targets || []).includes('optional:yes')) return null;
  const card = getCard(cardIdFromInstance(ctx.sourceInstanceId));
  return {
    prompt: `¿Usar el efecto de ${card.name}?`,
    options: [
      { instanceId: 'optional:yes', name: 'Usar el efecto', image: card.image },
      { instanceId: 'optional:no', name: 'No usarlo', image: null },
    ],
  };
}

// The steps that will actually run: all of them, or the one alternative chosen.
function activeSteps(effect, targets) {
  const steps = effect.actions || [];
  if (!effect.choice) return steps.map((step, index) => ({ step, index }));
  const idx = chosenIndex(targets);
  return idx === null || idx === 'skip' || !steps[idx] ? [] : [{ step: steps[idx], index: idx }];
}

// Splits `targets` among the steps that have a pool: each takes, in order, up to its count of picks
// that belong to it and weren't taken by an earlier step (or by the cost — `exclude`).
function assignPicks(ctx, effect, targets, exclude = []) {
  const taken = new Set(exclude);
  return activeSteps(effect, targets).map(({ step, index }) => {
    const pool = stepPool(ctx, step);
    if (!pool) return { step, index, pool: null, picks: null };
    const count = stepCount(ctx, step);
    const picks = (targets || []).filter((t) => !taken.has(t) && pool.includes(t)).slice(0, count);
    picks.forEach((t) => taken.add(t));
    return { step, index, pool: pool.filter((t) => !exclude.includes(t)), picks, count, upTo: isUpTo(step), done: (targets || []).includes(`done:${index}`) };
  });
}

// Labels for "one of these" alternatives: the card's own bullet points right after the sentence
// that offers the choice ("puedes activar uno de estos efectos: • ... • ..."), otherwise a plain
// "Opción N".
function choiceLabels(ctx, effect) {
  const text = String(getCard(cardIdFromInstance(ctx.sourceInstanceId)).effect || '');
  const intro = text.search(/\b(uno|1) de (estos|los)\b/i);
  const rest = intro === -1 ? text : text.slice(intro);
  const bullets = rest.split('•').slice(1).map((b) => b.split('\n')[0].trim()).filter(Boolean);
  return (effect.actions || []).map((_, i) => bullets[i] || `Opción ${i + 1}`);
}

const STEP_PROMPTS = {
  destroy: 'Elige la carta que se destruye',
  destroyTarget: 'Elige la carta que se destruye',
  destroyCards: 'Elige la carta que se destruye',
  destroyAndCopyEffect: 'Elige la carta que se destruye',
  destroyAndGainVP: 'Elige la carta que se destruye',
  destroyUpToHeroCount: 'Elige las cartas que se destruyen',
  exileTarget: 'Elige la carta que se exilia',
  negateEffect: 'Elige la carta cuyos efectos se niegan',
  negateEffects: 'Elige la carta cuyos efectos se niegan',
  target: 'Elige el objetivo',
  applyStatus: 'Elige el monstruo afectado',
  grantBuff: 'Elige el monstruo afectado',
  damageMonster: 'Elige el monstruo afectado',
  changeBeed: 'Elige el monstruo que cambia de tipo',
  equipMonster: 'Elige el monstruo que se equipa',
  equipMonsterToSelf: 'Elige el monstruo que se equipa',
  returnCardToHand: 'Elige la carta que vuelve a la mano',
  bounceToHand: 'Elige la carta que vuelve a la mano',
  addCounter: 'Elige la carta que recibe los contadores',
  corrodeZone: 'Elige la zona que se corroe',
  poisonZone: 'Elige la zona que se corroe',
  sendFromDeckToGY: 'Elige la carta de tu Mazo que envías al Cementerio',
  summonFromDeck: 'Elige el monstruo que invocas',
  specialSummonFromDeck: 'Elige el monstruo que invocas',
  summonFromHand: 'Elige el monstruo que invocas',
  specialSummonFromGY: 'Elige el monstruo que invocas',
  summonFromZones: 'Elige el monstruo que invocas',
  summon: 'Elige el monstruo que invocas',
};

function describeCandidate(state, id) {
  const { getFieldMonster } = require('./zones');
  const m = getFieldMonster(state, id);
  if (m && m.isToken) return { instanceId: id, name: m.tokenDef.name, image: null };
  const card = cardOf(id);
  return { instanceId: id, cardId: card._id.toString(), name: card.name, image: card.image };
}

// What the player still has to decide before this effect can be used (an alternative to apply, or
// a pick for one of its steps), as { options, prompt } — or null when nothing's left to ask.
// `exclude`: cards already spoken for (the cost's picks).
function pendingEffectChoice(ctx, effect, targets = [], exclude = []) {
  if (effect.choice && chosenIndex(targets) === null) {
    const image = getCard(cardIdFromInstance(ctx.sourceInstanceId)).image;
    const options = choiceLabels(ctx, effect).map((name, i) => ({ instanceId: `choice:${i}`, name, image }));
    if (effect.optional) options.push({ instanceId: 'choice:skip', name: 'No usar el efecto', image: null });
    return { prompt: 'Elige qué efecto aplicar', options };
  }
  for (const { step, index, pool, picks, count, upTo, done } of assignPicks(ctx, effect, targets, exclude)) {
    if (!pool) continue;
    if (picks.length >= count) continue;
    const remaining = pool.filter((t) => !(targets || []).includes(t));
    if (upTo) {
      // "Hasta N": always the player's call — one pick at a time, until they say that's all.
      if (done || remaining.length === 0) continue;
      return {
        prompt: `${STEP_PROMPTS[step.fn] || 'Elige un objetivo'} (hasta ${count}; llevas ${picks.length})`,
        options: [...remaining.map((id) => describeCandidate(ctx.state, id)), { instanceId: `done:${index}`, name: picks.length ? 'Terminar' : 'No elegir ninguna', image: null }],
      };
    }
    if (pool.length <= count || remaining.length === 0) continue; // nothing to choose between
    return {
      prompt: STEP_PROMPTS[step.fn] || 'Elige un objetivo',
      options: remaining.map((id) => describeCandidate(ctx.state, id)),
    };
  }
  return null;
}

// Every effect of `effectIds` that needs targets — used to refuse activating something that has
// nothing to act on ("Solo si hay un objetivo válido").
function hasNoLegalTarget(ctx, effect) {
  return assignPicks(ctx, effect, [], []).some(({ step, pool }) => pool && pool.length === 0 && TARGET_REQUIRED.has(step.fn));
}
const TARGET_REQUIRED = new Set(['negateEffect', 'negateEffects', 'target', 'changeBeed', 'equipMonster', 'equipMonsterToSelf', 'destroyAndCopyEffect', 'destroyAndGainVP']);

module.exports = { stepPool, stepCount, assignPicks, activeSteps, chosenIndex, pendingEffectChoice, pendingOptionalChoice, declined, isToken, isUpTo, hasNoLegalTarget, canAffect, selectRows, fieldRows, describeCandidate, getEffect };
