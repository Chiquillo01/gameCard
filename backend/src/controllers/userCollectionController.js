const { UserCollection } = require('../data/Schema/userCollection');
const { Card } = require('../data/Schema/card');

const getUserCollection = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;

    const userCollection = await UserCollection.findOne({ userId }).populate('userId').populate('cards.cardId');
    if (!userCollection) {
      return res.status(404).send();
    }
    res.status(200).json(userCollection);
  } catch (e) {
    res.status(500).send();
  }
};

const cardForUserDeleteById = async (req, res) => {
  const userId = req.jwtPayload.id;
  const { cardId } = req.params;

  try {
    const userCollection = await UserCollection.findOneAndUpdate(
      { userId },
      { $pull: { cards: { cardId } } },
      { new: true },
    );

    if (!userCollection) {
      return res.status(404).json({ e: 'No se encontró la carta en la colección del usuario' });
    }

    res.status(200).json({ message: 'Carta eliminada de la colección', userCollection });
  } catch (e) {
    res.status(400).json([{ e: 'Error al eliminar la carta del usuario' }]);
  }
};

const cardsObtainedFromChests = async (userId, chestData) => {
  try {
    const allCards = await Card.find();
    const chestCards = allCards.filter((card) => card.expansion === chestData.expansion);
    const cardsRarityInChest = {
      common: chestCards.filter((card) => card.rarity === 'common'),
      rare: chestCards.filter((card) => card.rarity === 'rare'),
      epic: chestCards.filter((card) => card.rarity === 'epic'),
      legendary: chestCards.filter((card) => card.rarity === 'legendary'),
    };

    const getRandomCard = (cardList) => {
      if (cardList.length === 0) return null;
      const selectedCard = cardList[Math.floor(Math.random() * cardList.length)];
      return { cardId: selectedCard._id, name: selectedCard.name };
    };

    let selectedCards = [];

    for (let i = 0; i < 3; i++) {
      selectedCards.push({ ...getRandomCard(cardsRarityInChest.common), rarity: 'common' });
    }

    for (let i = 0; i < 2; i++) {
      let rarity = Math.random() < 0.2 ? 'epic' : 'rare';
      selectedCards.push({ ...getRandomCard(cardsRarityInChest[rarity]), rarity });
    }

    let finalRarity = Math.random() < 0.1 ? 'legendary' : 'epic';
    selectedCards.push({ ...getRandomCard(cardsRarityInChest[finalRarity]), rarity: finalRarity });
    selectedCards = selectedCards.filter((card) => card.cardId !== null);

    let userCollection = await UserCollection.findOne({ userId });
    if (!userCollection) {
      userCollection = new UserCollection({ userId, cards: [] });
    }

    selectedCards.forEach(({ cardId }) => {
      const existingCard = userCollection.cards.find((card) => card.cardId.toString() === cardId.toString());

      if (existingCard) {
        existingCard.amount += 1;
      } else {
        userCollection.cards.push({ cardId, amount: 1 });
      }
    });

    userCollection.markModified('cards');
    await userCollection.save();
    return selectedCards;
  } catch (e) {
    return res.status(500).send();
  }
};

module.exports = {
  getUserCollection,
  cardForUserDeleteById,
  cardsObtainedFromChests,
};
