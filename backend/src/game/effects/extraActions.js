// Action steps the effect data used without the engine knowing them. Registered into the action
// registry by actions.js. Each takes (ctx, args, targets) like every other step; `targets` are the
// picks targets.js assigned to it.
const { getCard } = require('../cardIndex');
const { player, opponentIndex, log, getFieldMonster, findInstanceLocation, removeFromZone, findEmptySlot, corrodedSlots } = require('../zones');
const { cardIdFromInstance } = require('../deckUtils');
const { addTempMod, ctxSource } = require('../statMods');

const isContinuous = (ctx) => !!(ctx.effect && ctx.effect.type === 'continuous');
const allMonsters = (state) => state.players.flatMap((p) => p.field.monsters).filter(Boolean);
const lazy = () => require('./actions');

function fieldRowOf(state, instanceId) {
  const loc = findInstanceLocation(state, instanceId);
  if (!loc || !loc.zone.startsWith('field:')) return null;
  const pl = state.players[loc.ownerIndex];
  const entry = loc.zone === 'field:monster' ? pl.field.monsters[loc.slot] : loc.zone === 'field:support' ? pl.field.support[loc.slot] : pl.field.territory;
  return { entry, ownerIndex: loc.ownerIndex, kind: loc.zone === 'field:monster' ? 'monster' : 'support' };
}

// "Selecciona un [Monstruo/Compilado]: <efecto>" (Sello Temporal, Descompilación): runs the nested
// step on the picked card, with the outer step's duration when the nested one doesn't say.
function target(ctx, args, targets) {
  const nested = args.effect;
  if (!nested || !nested.fn || !(targets && targets.length)) return;
  lazy().runAction(ctx, { fn: nested.fn, args: { duration: args.duration, ...(nested.args || {}) } }, targets);
}

// Fairy leave bonus: "roba N y genera M píxeles", at most `limitPerTurn` times a turn.
function fairyLeaveBonus(ctx, args) {
  const state = ctx.state;
  state.turnLimits = state.turnLimits || {};
  const key = `${state.turnNumber}:fairyLeaveBonus:${ctx.controllerIndex}`;
  if ((state.turnLimits[key] || 0) >= (args.limitPerTurn || Infinity)) return;
  state.turnLimits[key] = (state.turnLimits[key] || 0) + 1;
  if (args.draw) require('../draw').drawCards(state, ctx.controllerIndex, args.draw, { fromEffect: true });
  if (args.pixels) player(state, ctx.controllerIndex).pixelcoins += args.pixels;
}

// Viaje de Unión: "hasta el final del turno, si tu oponente añade cartas de su Mazo a su Mano, roba".
function afterOpponentSearch(ctx) {
  ctx.state.mirrors = ctx.state.mirrors || [];
  ctx.state.mirrors.push({ ownerIndex: ctx.controllerIndex, event: 'search', expiresTurn: ctx.state.turnNumber });
}

// Licántropo Mago: "hasta el final del turno esta carta gana el nombre y nivel del Licano enviado" —
// the card the cost milled (ctx.costPaid) or an earlier step moved (ctx.movedCards).
function copyNameAndLevel(ctx) {
  const source = [...(ctx.movedCards || []), ...(ctx.costPaid || []), ...(ctx.paidCards || [])].find((id) => id !== ctx.sourceInstanceId);
  const self = getFieldMonster(ctx.state, ctx.sourceInstanceId);
  if (!source || !self) return;
  const card = getCard(cardIdFromInstance(source));
  self.nameOverride = { name: card.name, level: card.level, expiresTurn: ctx.state.turnNumber };
  log(ctx.state, `${getCard(self.cardId).name} pasa a llamarse ${card.name} (nivel ${card.level}) hasta el final del turno.`);
}

// --- Monsters equipped as an Equipo (Carnívora Come Hombres / Bestia-Moss) -------------------
// The picked monster leaves its zone and sits in the equipping card's controller's support zone as
// an Equipo attached to it; when the Carnívora leaves, it goes to its owner's Cementerio with the
// rest of its Equipo cards (zones.releaseEquipment).
function equipTo(ctx, holderId, targets) {
  const holder = getFieldMonster(ctx.state, holderId);
  if (!holder) return;
  const pl = player(ctx.state, ctx.controllerIndex);
  const limit = holder.equipLimit || 1;
  (targets || []).forEach((id) => {
    const equipped = lazy().equipsOn(ctx.state, holderId).filter((s) => s.isMonsterEquip).length;
    if (equipped >= limit) {
      log(ctx.state, `${getCard(holder.cardId).name} no puede tener más monstruos equipados.`);
      return;
    }
    const row = fieldRowOf(ctx.state, id);
    if (!row || row.kind !== 'monster' || row.entry.isToken || id === holderId) return;
    const slot = findEmptySlot(pl.field.support, corrodedSlots(pl, 'support'));
    if (slot === -1) {
      log(ctx.state, 'No hay espacio en la zona de Apoyo para equiparlo.');
      return;
    }
    removeFromZone(ctx.state, id, findInstanceLocation(ctx.state, id));
    pl.field.support[slot] = { instanceId: id, cardId: cardIdFromInstance(id), faceDown: false, equippedTo: holderId, isMonsterEquip: true };
    log(ctx.state, `${getCard(cardIdFromInstance(id)).name} queda equipado a ${getCard(holder.cardId).name}.`);
  });
}

function equipMonster(ctx, args, targets) {
  equipTo(ctx, ctx.sourceInstanceId, targets);
}

function equipMonsterToSelf(ctx, args, targets) {
  equipTo(ctx, ctx.sourceInstanceId, targets);
}

// "Por cada carta equipada, gana +X Atk" — continuous, so it follows the equips as they come and go.
function buffPerEquip(ctx, args) {
  const self = getFieldMonster(ctx.state, ctx.sourceInstanceId);
  if (!self) return;
  const count = lazy().equipsOn(ctx.state, ctx.sourceInstanceId).length;
  addTempMod(self, { atk: (args.atk || 0) * count, def: (args.def || 0) * count }, `${count} equipo(s)`);
}

// How many monsters it can have equipped at once (1 for Carnívora Come Hombres, 2 for Bestia-Moss).
function limitEquipCount(ctx, args) {
  const self = getFieldMonster(ctx.state, ctx.sourceInstanceId);
  if (self) self.equipLimit = Math.max(self.equipLimit || 0, args.max || 1);
}

function raiseEquipLimit(ctx, args) {
  limitEquipCount(ctx, args);
}

// --- Engranaje counters ----------------------------------------------------------------------
function countersOnField(state, counter) {
  return state.players.flatMap((p) => [...p.field.monsters, ...p.field.support, p.field.territory]).filter(Boolean)
    .reduce((sum, e) => sum + ((e.counters || {})[counter] || 0), 0);
}

function countersFor(ctx, args) {
  if (args.scope === 'field') return countersOnField(ctx.state, args.counter);
  const self = lazy().fieldEntry(ctx.state, ctx.sourceInstanceId);
  return self ? ((self.counters || {})[args.counter] || 0) : 0;
}

// "Gana +X Atk/Vida por cada Engranaje" (continuous).
function statFromCounterCount(ctx, args) {
  const self = getFieldMonster(ctx.state, ctx.sourceInstanceId);
  if (!self) return;
  const count = countersFor(ctx, args);
  const amount = count * (args.multiplier || 1);
  const stats = args.stats || ['atk'];
  addTempMod(self, { atk: stats.includes('atk') ? amount : 0, def: stats.includes('def') ? amount : 0 }, `${count} contador(es)`);
}

// "Su Atk/Vida es igual a X por cada Engranaje" (continuous) — overrides the printed value.
function setStatsByCounters(ctx, args) {
  const self = getFieldMonster(ctx.state, ctx.sourceInstanceId);
  if (!self) return;
  const count = countersFor(ctx, args);
  const value = count * (args.multiplier || 1);
  const stats = args.stats || [];
  addTempMod(self, { atk: stats.includes('atk') ? value - self.baseAtk : 0, def: stats.includes('def') ? value - self.baseDef : 0 }, `${count} contador(es)`);
}

// "Si es usado como material, sus Engranajes pasan al monstruo compilado".
function transferCounters(ctx, args) {
  const compiled = ctx.event && getFieldMonster(ctx.state, ctx.event.compiledInstanceId);
  const from = (ctx.materialCounters || {})[args.counter] || 0;
  if (!compiled || !from) return;
  compiled.counters = compiled.counters || {};
  compiled.counters[args.counter] = (compiled.counters[args.counter] || 0) + from;
}

// Banshee: "tira un dado e inflige X por el resultado".
function damageOpponentByDiceRoll(ctx, args) {
  const roll = 1 + Math.floor(Math.random() * 6);
  log(ctx.state, `El dado sale ${roll}.`);
  lazy().registry.damageOpponent(ctx, { amount: roll * (args.multiplier || 1) });
}

// Íncubo: "Los monstruos que estén en la misma columna que esta carta pierden -2 Atk/Vida".
function debuffColumn(ctx, args) {
  lazy().columnMonsters(ctx.state, ctx.sourceInstanceId).forEach((m) => addTempMod(m, { atk: args.atk, def: args.def }, ctxSource(ctx)));
}

// Héroe de la Esperanza: destroys the picked rival cards, up to the number of Héroe monsters with
// different names on the field (targets.js sizes the pick); ctx.destroyedCount feeds the next step.
function destroyUpToHeroCount(ctx, args, targets) {
  require('./fieldActions').destroy(ctx, { ...args, target: 'selected', side: 'opponent' }, targets || []);
}

// "Genera N píxel por cada carta destruida" / "roba 1 carta por cada carta destruida".
function generatePixelsPerCardDestroyed(ctx, args) {
  const n = (ctx.destroyedCount || 0) * (args.amount || 1);
  if (n) player(ctx.state, ctx.controllerIndex).pixelcoins += n;
}

function drawCardsPerDestroyed(ctx, args) {
  const n = (ctx.destroyedCount || 0) * (args.amount || 1);
  if (n) require('../draw').drawCards(ctx.state, ctx.controllerIndex, n, { fromEffect: true });
}

// Motor de Engranaje: "no puede ser objetivo de ataques ni efectos de cartas" (continuous flag,
// read by targets.canAffect and combat.js).
function cannotBeTargeted(ctx) {
  const self = getFieldMonster(ctx.state, ctx.sourceInstanceId);
  if (self) self.untargetable = true;
}

// Héroe Berserker: "Todos los monstruos oponentes pierden Atk igual al combinado de los materiales
// usados para la invocación de este monstruo".
function debuffAllByMaterialsAtk(ctx) {
  const self = getFieldMonster(ctx.state, ctx.sourceInstanceId);
  if (!self) return;
  const total = (self.materials || []).reduce((sum, id) => sum + (getCard(cardIdFromInstance(id)).atk || 0), 0);
  if (!total) return;
  player(ctx.state, opponentIndex(ctx.controllerIndex)).field.monsters.filter(Boolean).forEach((m) => addTempMod(m, { atk: -total }, ctxSource(ctx)));
}

// Gigante Elemental: "Inmune a los efectos de los monstruos cuyos atributos se hayan utilizado para
// la invocación de este monstruo" (targets.canAffect reads `immuneAttributes`).
function immuneToEffectsFromMaterialsAttributes(ctx) {
  const self = getFieldMonster(ctx.state, ctx.sourceInstanceId);
  if (!self) return;
  self.immuneAttributes = [...new Set((self.materials || []).map((id) => getCard(cardIdFromInstance(id)).attribute))];
}

// Héroe Corrupto: "Los monstruos de tu oponente pierden el mismo Atk/Vida que esta carta" — the
// change the previous step (its own per-Héroe loss) just applied to it.
function mirrorStatToOpponent(ctx) {
  const change = ctx.lastScaledBuff;
  if (!change) return;
  player(ctx.state, opponentIndex(ctx.controllerIndex)).field.monsters.filter(Boolean).forEach((m) => addTempMod(m, change, ctxSource(ctx)));
}

// Lich: "Tu oponente pierde 5 VP cada vez que activa un efecto" — continuous; chain.addLink charges it.
function imposeActivationCost(ctx, args) {
  const who = args.target === 'self' ? ctx.controllerIndex : opponentIndex(ctx.controllerIndex);
  const pl = player(ctx.state, who);
  pl.activationTax = (pl.activationTax || 0) + ((args.cost && args.cost.vp) || 0);
}

// Static rules read straight from the card data elsewhere (cardIndex.extraAttributesOf,
// summon.allowsSameTurnDecompile): nothing to do when "run".
function gainAttribute() {}
function allowDecompileSameTurn() {}

// Drácula: "Destruye una carta en el Campo y recupera VP igual a su Atk".
function destroyAndGainVP(ctx, args, targets) {
  const id = (targets || [])[0];
  if (!id) return;
  const m = getFieldMonster(ctx.state, id);
  const atk = m ? Math.max(0, m.baseAtk + ((m.tempBuff || {}).atk || 0)) : 0;
  require('./fieldActions').destroy(ctx, { target: 'selected' }, [id]);
  if (ctx.destroyedCount && atk) lazy().registry.gainVP(ctx, { amount: atk });
}

// Paseo Temporal: "Añade otro turno después de este pero no puedes atacar este turno".
function addExtraTurn(ctx, args) {
  const who = args.player === 'opponent' ? opponentIndex(ctx.controllerIndex) : ctx.controllerIndex;
  ctx.state.extraTurns = ctx.state.extraTurns || {};
  ctx.state.extraTurns[who] = (ctx.state.extraTurns[who] || 0) + (args.count || 1);
  log(ctx.state, `${player(ctx.state, who).userId} jugará otro turno después de este.`);
}

function disableAttacks(ctx, args) {
  const who = args.player === 'opponent' ? opponentIndex(ctx.controllerIndex) : ctx.controllerIndex;
  ctx.state.attackBans = ctx.state.attackBans || {};
  ctx.state.attackBans[who] = ctx.state.turnNumber;
}

module.exports = {
  target,
  fairyLeaveBonus,
  afterOpponentSearch,
  copyNameAndLevel,
  equipMonster,
  equipMonsterToSelf,
  buffPerEquip,
  limitEquipCount,
  raiseEquipLimit,
  statFromCounterCount,
  setStatsByCounters,
  transferCounters,
  damageOpponentByDiceRoll,
  debuffColumn,
  destroyUpToHeroCount,
  generatePixelsPerCardDestroyed,
  drawCardsPerDestroyed,
  cannotBeTargeted,
  debuffAllByMaterialsAtk,
  immuneToEffectsFromMaterialsAttributes,
  mirrorStatToOpponent,
  imposeActivationCost,
  gainAttribute,
  allowDecompileSameTurn,
  destroyAndGainVP,
  addExtraTurn,
  disableAttacks,
};
