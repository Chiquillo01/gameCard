const { applyAction } = require('./engine');
const { getCard } = require('./cardIndex');
const { cardIdFromInstance } = require('./deckUtils');
const { canBeNormalSummoned } = require('./summonRules');

// A simple, deterministic-ish heuristic opponent for PvE. It plays through its own turn via the
// exact same `applyAction` calls a human client would send — the bot is not a separate rules
// path, it's just another caller of the public engine API.
function runBotTurn(state, botIndex) {
  let guard = 0;
  while (state.status === 'active' && guard < 50) {
    guard++;

    // Rulebook, "Apilar": while a Pila is open, only the player holding priority can act. The bot
    // has no chain strategy yet (v1) — it always passes, which either hands priority back to the
    // human or, if they'd already passed, resolves the chain and lets the loop carry on below.
    if (state.chain.length) {
      if (state.priorityPlayer !== botIndex) break; // waiting on the human to respond or pass
      applyAction(state, botIndex, { type: 'PASS_CHAIN' });
      continue;
    }

    if (state.turnPlayer !== botIndex) break;
    const pl = state.players[botIndex];

    if (state.phase === 'main1' || state.phase === 'main2') {
      let actedThisIteration = false;

      if (!pl.normalSummonUsed) {
        const bestHandMonster = pickBestMonsterToSummon(pl);
        if (bestHandMonster) {
          const result = applyAction(state, botIndex, { type: 'NORMAL_SUMMON', instanceId: bestHandMonster, position: 'attack' });
          if (result.ok) actedThisIteration = true;
        }
      }

      if (!actedThisIteration) {
        const supportToPlay = pl.hand.find((id) => getCard(cardIdFromInstance(id)).category === 'support');
        if (supportToPlay) {
          const result = applyAction(state, botIndex, { type: 'ACTIVATE_SUPPORT', instanceId: supportToPlay });
          if (result.ok) actedThisIteration = true;
        }
      }

      if (actedThisIteration) continue;
    }

    if (state.phase === 'battle') {
      const eligibleAttackers = pl.field.monsters.filter(
        (m) => m && !m.hasAttacked && m.position === 'attack',
      );
      if (eligibleAttackers.length) {
        const attacker = eligibleAttackers[0];
        const oppIdx = botIndex === 0 ? 1 : 0;
        const oppMonsters = state.players[oppIdx].field.monsters.filter(Boolean);
        const weakestTarget = oppMonsters.sort((a, b) => (a.baseDef + (a.tempBuff?.def || 0)) - (b.baseDef + (b.tempBuff?.def || 0)))[0];
        const result = applyAction(state, botIndex, {
          type: 'DECLARE_ATTACK',
          attackerInstanceId: attacker.instanceId,
          targetInstanceId: weakestTarget ? weakestTarget.instanceId : null,
        });
        if (result.ok) continue;
      }
    }

    applyAction(state, botIndex, { type: 'ADVANCE_PHASE' });
    if (state.turnPlayer !== botIndex) break;
  }
}

function canAffordSummon(pl, card) {
  if (!card.summonCost || !card.summonCost.fn) return true;
  if (card.summonCost.fn === 'payPixels') return pl.pixelcoins >= (card.summonCost.args?.amount || 0);
  return true; // other cost types (sacrifices etc.) — let the engine reject it if it can't be paid
}

function pickBestMonsterToSummon(pl) {
  const monsters = pl.hand
    .map((id) => ({ id, card: getCard(cardIdFromInstance(id)) }))
    .filter(({ card }) => canBeNormalSummoned(card) && canAffordSummon(pl, card));
  if (!monsters.length) return null;
  monsters.sort((a, b) => (b.card.atk || 0) - (a.card.atk || 0));
  return monsters[0].id;
}

module.exports = { runBotTurn };
