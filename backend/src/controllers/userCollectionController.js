const { UserCollection } = require('../data/Schema/userCollection');

const getUserCollection = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;

    const userCollection = await UserCollection.findOne({ userId }).populate('userId', 'userName profilePicture').populate('cards.cardId');
    if (!userCollection) {
      return res.status(404).send();
    }
    // A card the collection references can be gone from the Card collection (e.g. a full
    // re-import that reassigns ids) — populate() then leaves cardId as null. Drop those instead
    // of shipping a dangling reference the client can't render.
    const cleaned = userCollection.toObject();
    cleaned.cards = cleaned.cards.filter((c) => c.cardId);
    res.status(200).json(cleaned);
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

module.exports = {
  getUserCollection,
  cardForUserDeleteById,
};
