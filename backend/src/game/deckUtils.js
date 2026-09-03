function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Expands a deck doc's {cards:[{card,amount}], fusionCards:[{card,amount}]} into a flat,
// shuffled list of unique instance ids, one per physical copy. Fusion/compilado cards start
// in the "extra" pile (they're summoned via materials, not drawn), everything else in "deck".
function buildInstances(deckDoc, ownerIndex) {
  let counter = 0;
  const nextId = (cardId) => `${ownerIndex}:${cardId}:${counter++}`;

  const deck = [];
  (deckDoc.cards || []).forEach(({ card, amount }) => {
    const cardId = (card && card._id ? card._id : card).toString();
    for (let i = 0; i < amount; i++) deck.push(nextId(cardId));
  });

  const extra = [];
  (deckDoc.fusionCards || []).forEach(({ card, amount }) => {
    const cardId = (card && card._id ? card._id : card).toString();
    for (let i = 0; i < amount; i++) extra.push(nextId(cardId));
  });

  return { deck: shuffle(deck), extra };
}

function cardIdFromInstance(instanceId) {
  return instanceId.split(':')[1];
}

module.exports = { shuffle, buildInstances, cardIdFromInstance };
