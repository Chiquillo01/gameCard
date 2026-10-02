// What the Mazo-C window shows for each Compilación: its recipe one requirement at a time, which of
// the player's own cards can be used for each, and whether it can be compiled right now (with a
// suggested set of materials the board then shows already picked).
const { getCard } = require('./cardIndex');
const { findInstanceLocation, corrodedSlots } = require('./zones');
const { matchesCardFilter } = require('./filters');
const { materialCard, materialLocationSatisfies } = require('./summon');
const { violatesUnique, getEffectiveStats } = require('./effectEngine');

const ZONE_LABELS = { field: 'Campo', hand: 'Mano', graveyard: 'Cementerio' };

// "2 × monstruo Insecto", "1 × \"Valkiria\"", "5 × monstruo con «Gigante» en el nombre"...
function requirementLabel(req) {
  const count = req.count || 1;
  const parts = [];
  if (req.name) parts.push(`"${req.name}"`);
  else {
    parts.push(req.category && /compil/i.test(req.category) ? 'Compilación' : 'monstruo');
    if (req.breed) parts.push(req.breed);
    if (req.breedIn) parts.push(req.breedIn.join(' / '));
    if (req.family) parts.push(req.family);
    if (req.attribute) parts.push(`de ${req.attribute}`);
    if (req.level != null) parts.push(`de Nivel ${req.level}`);
    if (req.minLevel != null) parts.push(`de Nivel ${req.minLevel} o más`);
    if (req.nameContains) parts.push(`con «${req.nameContains}» en el nombre`);
  }
  return `${count} × ${parts.join(' ')}`;
}

const zonesOf = (req) => (req.zone ? [].concat(req.zone) : ['field']);

// Every card the player owns that could serve as a material, with where it is.
function ownCards(state, controllerIndex) {
  const pl = state.players[controllerIndex];
  return [
    ...pl.field.monsters.filter(Boolean).map((m) => m.instanceId),
    ...pl.field.support.filter(Boolean).map((s) => s.instanceId),
    ...(pl.field.territory ? [pl.field.territory.instanceId] : []),
    ...pl.hand,
    ...pl.graveyard,
  ];
}

function describeMaterial(state, id) {
  const loc = findInstanceLocation(state, id);
  const card = materialCard(state, id);
  const zone = loc.zone.startsWith('field') ? 'field' : loc.zone;
  const described = { instanceId: id, name: card.name, zone, zoneLabel: ZONE_LABELS[zone] || zone };
  if (loc.zone === 'field:monster') {
    const m = state.players[loc.ownerIndex].field.monsters[loc.slot];
    Object.assign(described, getEffectiveStats(m), { slot: loc.slot });
  }
  return described;
}

// Cheapest first, so the suggestion spends what matters least: Cementerio, then weak monsters on
// the field, then cards from hand.
function materialCost(state, id) {
  const loc = findInstanceLocation(state, id);
  if (loc.zone === 'graveyard') return 0;
  if (loc.zone === 'field:monster') {
    const m = state.players[loc.ownerIndex].field.monsters[loc.slot];
    if (m.isToken) return 0.5;
    const { atk, def } = getEffectiveStats(m);
    return 1 + atk + def;
  }
  return 20;
}

function compileInfo(state, controllerIndex, instanceId) {
  const card = getCard(instanceId.split(':')[1]);
  const reqs = (card.activationCost && card.activationCost.args && card.activationCost.args.materials) || [];
  const owned = ownCards(state, controllerIndex).filter((id) => id !== instanceId);
  const used = new Set();
  let complete = reqs.length > 0;
  const requirements = reqs.map((req) => {
    const count = req.count || 1;
    const zones = zonesOf(req);
    const candidates = owned.filter((id) => {
      const loc = findInstanceLocation(state, id);
      return materialLocationSatisfies(loc, controllerIndex, req) && matchesCardFilter(materialCard(state, id), req);
    });
    const suggested = candidates.filter((id) => !used.has(id)).sort((a, b) => materialCost(state, a) - materialCost(state, b)).slice(0, count);
    suggested.forEach((id) => used.add(id));
    if (suggested.length < count) complete = false;
    return {
      label: requirementLabel(req),
      zones: zones.map((z) => ZONE_LABELS[z] || z),
      count,
      have: candidates.length,
      candidates: candidates.map((id) => describeMaterial(state, id)),
    };
  });

  // Room for it once the field materials leave their zones.
  const pl = state.players[controllerIndex];
  const blocked = corrodedSlots(pl, 'monsters');
  const room = pl.field.monsters.some((m, i) => !blocked.includes(i) && (m === null || used.has(m.instanceId)));
  let blockedBy = null;
  if (!reqs.length) blockedBy = 'Esta carta no tiene receta de Compilación.';
  else if (!complete) blockedBy = 'Te faltan materiales.';
  else if (!room) blockedBy = 'No tienes zona libre de monstruo.';
  else if (violatesUnique(state, controllerIndex, card)) blockedBy = 'Solo puedes tener una en el Campo.';

  return { requirements, ready: !blockedBy, blockedBy, suggested: blockedBy ? [] : [...used] };
}

module.exports = { compileInfo, requirementLabel };
