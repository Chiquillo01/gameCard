// Who is friends with whom, in one place: the friends page and the duel challenge both ask here.
const { Friendship } = require('../data/Schema/friendship');

// A pair always in the same order, so { userA, userB } finds it whichever of the two asks.
function orderedPair(idA, idB) {
  const a = String(idA);
  const b = String(idB);
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

async function areFriends(idA, idB) {
  if (!idA || !idB || String(idA) === String(idB)) return false;
  return !!(await Friendship.exists(orderedPair(idA, idB)));
}

async function makeFriends(idA, idB) {
  const pair = orderedPair(idA, idB);
  await Friendship.updateOne(pair, { $setOnInsert: pair }, { upsert: true });
}

async function removeFriendship(idA, idB) {
  const result = await Friendship.deleteOne(orderedPair(idA, idB));
  return result.deletedCount > 0;
}

module.exports = { orderedPair, areFriends, makeFriends, removeFriendship };
