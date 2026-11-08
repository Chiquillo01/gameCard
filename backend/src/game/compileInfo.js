// What the Mazo-C window shows for each Compilación: its recipe one requirement at a time, which of
// the player's own cards can be used for each, and whether it can be compiled right now (with a
// suggested set of materials the board then shows already picked).
const { getCard } = require('./cardIndex');
const { findInstanceLocation, corrodedSlots } = require('./zones');
const { materialCard, materialMatches, materialLocationSatisfies, assignMaterials } = require('./summon');
const { violatesUnique, getEffectiveStats } = require('./effectEngine');

const ZONE_LABELS = { field: 'Campo', hand: 'Mano', graveyard: 'Cementerio', banished: 'Exilio' };

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

const zonesOf = (req, defaultZones = ['field']) => (req.zone ? [].concat(req.zone) : defaultZones);

// Every card the player owns that could serve as a material, with where it is.
function ownCards(state, controllerIndex) {
  const pl = state.players[controllerIndex];
  return [
    ...pl.field.monsters.filter(Boolean).map((m) => m.instanceId),
    ...pl.field.support.filter(Boolean).map((s) => s.instanceId),
    ...(pl.field.territory ? [pl.field.territory.instanceId] : []),
    ...pl.hand,
    ...pl.graveyard,
    ...pl.banished,
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
  if (loc.zone === 'graveyard' || loc.zone === 'banished') return 0;
  if (loc.zone === 'field:monster') {
    const m = state.players[loc.ownerIndex].field.monsters[loc.slot];
    if (m.isToken) return 0.5;
    const { atk, def } = getEffectiveStats(m);
    return 1 + atk + def;
  }
  return 20;
}

// `defaultZones`: where a material whose recipe names no zone may come from (the Campo; Grover, el
// Goblin's effect also takes them from the Mano).
function compileInfo(state, controllerIndex, instanceId, { defaultZones = ['field'] } = {}) {
  const card = getCard(instanceId.split(':')[1]);
  const reqs = (card.activationCost && card.activationCost.args && card.activationCost.args.materials) || [];
  const owned = ownCards(state, controllerIndex).filter((id) => id !== instanceId);
  // The cheapest way to share the cards out among the requirements, each card used once.
  const assigned = assignMaterials(state, controllerIndex, reqs, owned, { defaultZones, cost: (id) => materialCost(state, id) });
  const used = new Set(assigned || []);
  const complete = !!assigned;
  const requirements = reqs.map((req) => {
    const count = req.count || 1;
    const zones = zonesOf(req, defaultZones);
    const candidates = owned.filter((id) => {
      const loc = findInstanceLocation(state, id);
      return materialLocationSatisfies(loc, controllerIndex, req, defaultZones) && materialMatches(state, id, req);
    });
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
