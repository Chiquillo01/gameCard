// Every option the player is asked to pick from (a target, a cost, a card to discard...) says where
// that card is, so two copies of the same card can be told apart: whose it is, which zone and
// which zone number, its position and Atk/Vida, what an Equipo is attached to. A card the viewer
// isn't allowed to see (the rival's face-down cards, or their hand/Mazo) keeps its location but
// not its name or image.
const { findInstanceLocation, getFieldMonster } = require('./zones');
const { getEffectiveStats } = require('./effectEngine');
const { getCard } = require('./cardIndex');

const ZONES = {
  'field:monster': 'monster',
  'field:support': 'support',
  'field:territory': 'territory',
  hand: 'hand',
  deck: 'deck',
  extra: 'extra',
  graveyard: 'graveyard',
  banished: 'banished',
};

function withLocation(state, option, viewerIndex) {
  if (!option || typeof option.instanceId !== 'string') return option;
  const loc = findInstanceLocation(state, option.instanceId);
  if (!loc) return option;
  const owner = loc.ownerIndex === viewerIndex ? 'self' : 'rival';
  const where = { owner, zone: ZONES[loc.zone], slot: loc.slot === undefined ? null : loc.slot };
  const pl = state.players[loc.ownerIndex];

  if (loc.zone === 'field:monster') {
    const m = pl.field.monsters[loc.slot];
    where.position = m.position;
    where.faceDown = !!m.faceDown;
    if (!(m.faceDown && owner === 'rival')) Object.assign(where, getEffectiveStats(m));
  } else if (loc.zone === 'field:support') {
    const s = pl.field.support[loc.slot];
    where.faceDown = !!s.faceDown;
    const holder = s.equippedTo && getFieldMonster(state, s.equippedTo);
    const holderIsMine = holder && findInstanceLocation(state, holder.instanceId).ownerIndex === viewerIndex;
    if (holder && (holderIsMine || !holder.faceDown)) where.equippedTo = holder.isToken ? holder.tokenDef.name : getCard(holder.cardId).name;
  }

  const hidden = owner === 'rival' && (where.faceDown || ['hand', 'deck', 'extra'].includes(where.zone));
  if (!hidden) return { ...option, where };
  const name = where.zone === 'monster' ? 'Monstruo boca abajo' : where.zone === 'support' ? 'Apoyo boca abajo' : 'Carta oculta';
  return { instanceId: option.instanceId, name, image: null, where };
}

const withLocations = (state, options, viewerIndex) => (Array.isArray(options) ? options.map((o) => withLocation(state, o, viewerIndex)) : options);

module.exports = { withLocation, withLocations };
