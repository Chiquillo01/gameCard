// What a finished duel pays each player, in Pixelcoins and Pixelgems.
//
// The amounts live in the game rules (`duelRewards` in GameRules / game_rules_final.json), so they
// can be tuned without touching code:
//   - vsBot / pvp: what the winner and the loser get, against the bot or against another player.
//   - minTurns: a duel that ends before this turn pays nothing, so surrendering on turn 1 over and
//     over (or two accounts trading quick wins) isn't a way to farm currency.
// A player who surrenders gets nothing; the bot never gets anything.
const { User } = require('../data/Schema/user');
const { rules } = require('../game/rules');

const NOTHING = { pixelcoins: 0, pixelgems: 0 };

const amount = (reward) => ({
  pixelcoins: Math.max(0, Math.floor((reward && reward.pixelcoins) || 0)),
  pixelgems: Math.max(0, Math.floor((reward && reward.pixelgems) || 0)),
});

// One entry per player, in the same order as state.players: { pixelcoins, pixelgems } for a human,
// null for the bot. Pure — it reads the state and the rules, and changes nothing.
function computeDuelRewards(state, config = rules().duelRewards) {
  return state.players.map((player, idx) => {
    if (player.userId === 'BOT') return null;
    if (!config || state.status !== 'finished' || state.winnerIndex === null || state.winnerIndex === undefined) return { ...NOTHING };
    if ((state.turnNumber || 0) < (config.minTurns || 0)) return { ...NOTHING };
    if (state.surrenderedBy === idx) return { ...NOTHING };
    const table = state.vsBot ? config.vsBot : config.pvp;
    if (!table) return { ...NOTHING };
    return amount(idx === state.winnerIndex ? table.win : table.loss);
  });
}

// Works out the rewards, keeps them on the state (state.rewards, for the end-of-duel screen) and
// adds them to each player's balance. Runs once per duel: matchStore.save only calls it the first
// time it sees the duel finished.
async function grantDuelRewards(state) {
  const rewards = computeDuelRewards(state);
  state.rewards = rewards;
  await Promise.all(
    state.players.map((player, idx) => {
      const reward = rewards[idx];
      if (!reward || (!reward.pixelcoins && !reward.pixelgems)) return null;
      return User.updateOne({ _id: player.userId }, { $inc: { pixelcoins: reward.pixelcoins, pixelgems: reward.pixelgems } });
    }),
  );
  return rewards;
}

module.exports = { computeDuelRewards, grantDuelRewards };
