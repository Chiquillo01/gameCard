// How good a board is for one player, as a single number (higher = better for `me`). Only uses
// what that player can see: the rival's face-down monsters count with assumed stats and the
// rival's hand only by how many cards it holds.
const { getEffectiveStats } = require('../effectEngine');
const { hasStatus, FREEZE, BURN, POISON } = require('../statuses');
const W = require('./weights').evaluation;

function evaluate(state, me) {
  const opp = 1 - me;
  if (state.status !== 'active') {
    if (state.winnerIndex === me) return W.win;
    if (state.winnerIndex === opp) return -W.win;
    return 0;
  }
  const mine = state.players[me];
  const theirs = state.players[opp];
  let score = W.vp * (mine.vp - theirs.vp);
  score += sideValue(state, me, true) - sideValue(state, opp, false);
  score += W.handCard * mine.hand.length - W.oppHandCard * theirs.hand.length;
  score += W.pixel * mine.pixelcoins;
  score -= W.lowDeck * Math.max(0, W.lowDeckAt - mine.deck.length);
  score -= W.threat * expectedDamage(state, opp, me, me);
  score += W.offense * expectedDamage(state, me, opp, me);
  return score;
}

// A field monster's Atk/Vida as `viewer` sees it.
function visibleStats(m, ownerIndex, viewer) {
  if (m.faceDown && ownerIndex !== viewer) return { atk: W.hiddenAtk, def: W.hiddenDef };
  return getEffectiveStats(m);
}

function monsterValue(state, m, ownerIndex, viewer) {
  const { atk, def } = visibleStats(m, ownerIndex, viewer);
  let value = W.monster + W.atk * atk + W.def * def + W.material * (m.materials || []).length;
  if (hasStatus(state, m.instanceId, BURN)) value -= W.burning;
  if (hasStatus(state, m.instanceId, FREEZE)) value -= W.frozen;
  if (hasStatus(state, m.instanceId, POISON)) value -= W.poisoned;
  return value;
}

function sideValue(state, idx, isMe) {
  const pl = state.players[idx];
  const viewer = isMe ? idx : 1 - idx;
  let value = 0;
  pl.field.monsters.forEach((m) => { if (m) value += monsterValue(state, m, idx, viewer); });
  pl.field.support.forEach((s) => { if (s) value += s.faceDown ? W.setSupport : W.faceUpSupport; });
  if (pl.field.territory) value += W.territory;
  return value;
}

// A rough "how much can `attackerIdx` hurt `defenderIdx` with the monsters already on the field":
// each attacker, strongest first, goes for whichever rival monster gives the most (VP lost plus
// the value of what it destroys), or straight at the VP when the rival has none. An attack that
// would lose is not made. Measured from `viewer`'s point of view (hidden stats for the rival).
function expectedDamage(state, attackerIdx, defenderIdx, viewer) {
  const attackers = state.players[attackerIdx].field.monsters
    .filter(Boolean)
    .map((m) => visibleStats(m, attackerIdx, viewer).atk)
    .filter((atk) => atk > 0)
    .sort((a, b) => b - a);
  const defenders = state.players[defenderIdx].field.monsters.filter(Boolean).map((m) => ({
    position: m.faceDown ? 'defense' : m.position,
    ...visibleStats(m, defenderIdx, viewer),
    value: monsterValue(state, m, defenderIdx, viewer),
  }));
  let total = 0;
  attackers.forEach((atk) => {
    if (!defenders.length) {
      total += atk;
      return;
    }
    let best = -1;
    let bestGain = 0;
    defenders.forEach((d, i) => {
      const gain = d.position === 'attack'
        ? (atk > d.atk ? atk - d.atk + d.value : atk === d.atk ? 0 : -(d.atk - atk))
        : (atk > d.def ? d.value : atk === d.def ? 0 : -(d.def - atk));
      if (gain > bestGain) {
        bestGain = gain;
        best = i;
      }
    });
    if (best === -1) return;
    total += bestGain;
    defenders.splice(best, 1);
  });
  return total;
}

module.exports = { evaluate, expectedDamage };
