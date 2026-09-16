const mongoose = require('mongoose');
const { Deck } = require('../data/Schema/deck');
const { User } = require('../data/Schema/user');
const { Card } = require('../data/Schema/card');

const MIN_DECK_SIZE = 40;
const MAX_DECK_SIZE = 50;
// Fallback only — used if a Card document somehow has no `state` (banlist value). The real,
// authoritative limit lives on each card's own `state` field (see Schema/card.js), so a card
// can be banned/limited without touching this code.
const MAX_COPIES_BY_RARITY = { legendary: 1, epic: 2, rare: 3, common: 4 };

// Rulebook: 40-50 cards in the main deck, and max copies per card come from its own banlist
// `state` value (which itself defaults by rarity: Legendaria 1 / Épica 2 / Rara 3 / Común 4).
function validateDeckComposition(cards, cardDocsById) {
  const totalNormalCards = cards.reduce((sum, c) => sum + (c.amount || 0), 0);
  if (totalNormalCards < MIN_DECK_SIZE || totalNormalCards > MAX_DECK_SIZE) {
    return `El mazo principal debe tener entre ${MIN_DECK_SIZE} y ${MAX_DECK_SIZE} cartas (tiene ${totalNormalCards}).`;
  }
  for (const c of cards) {
    const card = cardDocsById.get(c.card.toString());
    const max = card?.state ?? MAX_COPIES_BY_RARITY[card?.rarity] ?? 3;
    if (c.amount > max) {
      return `Solo puedes tener ${max} copias de "${card?.name || c.card}" (rareza ${card?.rarity}).`;
    }
  }
  return null;
}

// Tokens aren't drawn from a deck — an effect conjures them outright — so they only need to be
// real token cards, with no size or per-copy limit (a duel can need more instances of a token
// than the player "owns").
function validateTokenSelection(tokenIds, cardDocsById) {
  for (const id of tokenIds) {
    const card = cardDocsById.get(id.toString());
    if (!card || card.category !== 'token') {
      return `"${card?.name || id}" no es una carta de token válida.`;
    }
  }
  return null;
}

const getDecksUser = async (req, res) => {
  const userId = req.jwtPayload.id;
  try {
    const decks = await Deck.find({ owner: userId })
      .populate('owner')
      .populate('cards.card')
      .populate('fusionCards.card')
      .populate('tokens');

    res.status(200).json(decks);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los mazos' });
  }
};

const getDeckById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID del mazo no proporcionado' });
    }

    const deck = await Deck.findById(id)
      .populate('owner')
      .populate('cards.card')
      .populate('fusionCards.card')
      .populate('tokens');

    if (!deck) {
      return res.status(404).json({ error: 'No se ha podido encontrar el mazo' });
    }

    res.status(200).json(deck);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener el mazo' });
  }
};

const createDeck = async (req, res) => {
  try {
    const userId = req.jwtPayload?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado o token inválido' });
    }

    const { deckTitle, cards = [], fusionCards = [], tokens = [] } = req.body;

    if (!deckTitle || deckTitle.trim() === '') {
      return res.status(400).json({ error: 'El título del mazo es obligatorio' });
    }

    const userDecks = await Deck.countDocuments({ owner: userId });
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (!user.admin && userDecks >= 6) {
      return res.status(400).json({ error: 'Límite de mazos alcanzado (6).' });
    }

    const totalFusionCards = fusionCards.reduce((sum, card) => sum + (card.amount || 0), 0);

    if (totalFusionCards > 10) {
      return res.status(400).json({ error: 'No puedes añadir más de 10 cartas de fusión al mazo.' });
    }

    const allCardIds = [...cards.map((c) => c.card), ...fusionCards.map((c) => c.card), ...tokens];
    const existingCards = await Card.find({ _id: { $in: allCardIds } });

    if (existingCards.length !== new Set(allCardIds.map(String)).size) {
      return res.status(400).json({ error: 'Algunas cartas no existen en la base de datos.' });
    }

    const cardDocsById = new Map(existingCards.map((c) => [c._id.toString(), c]));
    const mainDeckError = validateDeckComposition(cards, cardDocsById);
    if (mainDeckError) return res.status(400).json({ error: mainDeckError });
    for (const c of fusionCards) {
      const card = cardDocsById.get(c.card.toString());
      const max = card?.state ?? MAX_COPIES_BY_RARITY[card?.rarity] ?? 3;
      if (c.amount > max) {
        return res.status(400).json({ error: `Solo puedes tener ${max} copias de "${card?.name || c.card}" (rareza ${card?.rarity}).` });
      }
    }
    const tokenError = validateTokenSelection(tokens, cardDocsById);
    if (tokenError) return res.status(400).json({ error: tokenError });

    const formattedCards = cards.map((c) => ({
      card: new mongoose.Types.ObjectId(c.card),
      amount: c.amount,
    }));

    const formattedFusionCards = fusionCards.map((c) => ({
      card: new mongoose.Types.ObjectId(c.card),
      amount: c.amount,
    }));

    const newDeck = new Deck({
      deckTitle: deckTitle.trim(),
      owner: userId,
      cards: formattedCards,
      fusionCards: formattedFusionCards,
      tokens: tokens.map((id) => new mongoose.Types.ObjectId(id)),
    });

    await newDeck.save();

    const deckToReturn = await Deck.findById(newDeck._id)
      .populate('owner')
      .populate('cards.card')
      .populate('fusionCards.card')
      .populate('tokens');

    res.status(201).json(deckToReturn);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear un mazo' });
  }
};

const updateDeck = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.jwtPayload?.id;

    const { deckTitle, cards = [], fusionCards = [], tokens = [] } = req.body;

    if (!deckTitle || deckTitle.trim() === '') {
      return res.status(400).json({ error: 'El título del mazo es obligatorio' });
    }

    const existingDeck = await Deck.findById(id);

    if (!existingDeck) {
      return res.status(404).json({ error: 'No se ha podido encontrar el mazo' });
    }

    if (existingDeck.owner.toString() !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este mazo' });
    }

    const totalFusionCards = fusionCards.reduce((sum, card) => sum + (card.amount || 0), 0);

    if (totalFusionCards > 10) {
      return res.status(400).json({ error: 'No puedes añadir más de 10 cartas de fusión al mazo' });
    }

    const allCardIds = [...cards.map((c) => c.card), ...fusionCards.map((c) => c.card), ...tokens];
    const existingCards = await Card.find({ _id: { $in: allCardIds } });
    const cardDocsById = new Map(existingCards.map((c) => [c._id.toString(), c]));
    const mainDeckError = validateDeckComposition(cards, cardDocsById);
    if (mainDeckError) return res.status(400).json({ error: mainDeckError });
    for (const c of fusionCards) {
      const card = cardDocsById.get(c.card.toString());
      const max = card?.state ?? MAX_COPIES_BY_RARITY[card?.rarity] ?? 3;
      if (c.amount > max) {
        return res.status(400).json({ error: `Solo puedes tener ${max} copias de "${card?.name || c.card}" (rareza ${card?.rarity}).` });
      }
    }
    const tokenError = validateTokenSelection(tokens, cardDocsById);
    if (tokenError) return res.status(400).json({ error: tokenError });

    const updatedDeck = await Deck.findByIdAndUpdate(
      id,
      { deckTitle: deckTitle.trim(), cards, fusionCards, tokens },
      { new: true, runValidators: true },
    )
      .populate('owner')
      .populate('cards.card')
      .populate('fusionCards.card')
      .populate('tokens');

    res.status(200).json(updatedDeck);
  } catch (error) {
    res.status(400).json([{ error: 'Error al actualizar el mazo' }]);
  }
};

const deleteDeck = async (req, res) => {
  const id = req.params.id;
  const userId = req.jwtPayload?.id;

  try {
    const deck = await Deck.findById(id);

    if (!deck) {
      return res.status(404).json({ error: 'No se ha podido encontrar el mazo' });
    }

    if (deck.owner.toString() !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este mazo' });
    }

    await Deck.findByIdAndDelete(id);

    res.status(200).json({ message: 'Mazo eliminado con éxito' });
  } catch (error) {
    res.status(400).json([{ error: 'Error al eliminar el mazo' }]);
  }
};

module.exports = {
  getDecksUser,
  getDeckById,
  createDeck,
  updateDeck,
  deleteDeck,
};
