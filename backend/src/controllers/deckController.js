const mongoose = require('mongoose');
const { Deck } = require('../data/Schema/deck');
const { User } = require('../data/Schema/user');
const { Card } = require('../data/Schema/card');
const { UserCollection } = require('../data/Schema/userCollection');
const { MAX_DECK_SIZE, MAX_FUSION_CARDS, maxCopiesOf, mergeEntries } = require('../game/deckRules');

// The only owner fields a deck response carries — never the email, admin flag or password hash.
const PUBLIC_OWNER_FIELDS = 'userName profilePicture';

// Validates and normalizes a deck payload before it's saved. A deck can be saved while still under
// construction — the 40-card *minimum* is only enforced at duel-start time (see
// game/deckRules.js's isDeckPlayable) — but everything else is a hard limit:
//   - every entry is a real card with a whole, positive number of copies (a negative amount used
//     to shrink the counted total, letting an oversized deck through);
//   - the same card listed twice counts as one entry (two "x4" rows of a Legendaria used to slip
//     past the per-card limit);
//   - main deck holds no Compilación/token cards, the fusion list holds only Compilación cards;
//   - main deck ≤ 50, fusion ≤ 10, per-card copies ≤ its banlist `state` (rarity default);
//   - the player actually owns that many copies in their collection.
// Returns { error } or the normalized { cards, fusionCards, tokens } to store.
async function validateDeckPayload(userId, { cards, fusionCards, tokens }) {
  if (!Array.isArray(cards) || !Array.isArray(fusionCards) || !Array.isArray(tokens)) {
    return { error: 'Formato de mazo no válido.' };
  }
  const entries = [...cards, ...fusionCards];
  const badEntry = entries.find((c) => !c || !mongoose.Types.ObjectId.isValid(String(c.card)) || !Number.isInteger(c.amount) || c.amount < 1);
  if (badEntry) return { error: 'Cada carta del mazo necesita un número entero de copias mayor que 0.' };
  if (tokens.some((id) => !mongoose.Types.ObjectId.isValid(String(id)))) return { error: 'Token no válido.' };

  const mainCards = mergeEntries(cards);
  const extraCards = mergeEntries(fusionCards);
  const tokenIds = [...new Set(tokens.map(String))];

  const allCardIds = [...new Set([...mainCards.map((c) => c.card), ...extraCards.map((c) => c.card), ...tokenIds])];
  const existingCards = await Card.find({ _id: { $in: allCardIds } });
  if (existingCards.length !== allCardIds.length) return { error: 'Algunas cartas no existen en la base de datos.' };
  const cardDocsById = new Map(existingCards.map((c) => [c._id.toString(), c]));

  const wrongMain = mainCards.find((c) => ['fusion', 'token'].includes(cardDocsById.get(c.card).category));
  if (wrongMain) return { error: `"${cardDocsById.get(wrongMain.card).name}" no puede ir en el mazo principal.` };
  const wrongExtra = extraCards.find((c) => cardDocsById.get(c.card).category !== 'fusion');
  if (wrongExtra) return { error: `"${cardDocsById.get(wrongExtra.card).name}" no es una carta de Compilación.` };
  const wrongToken = tokenIds.find((id) => cardDocsById.get(id).category !== 'token');
  if (wrongToken) return { error: `"${cardDocsById.get(wrongToken).name}" no es una carta de token válida.` };

  const totalMain = mainCards.reduce((sum, c) => sum + c.amount, 0);
  if (totalMain > MAX_DECK_SIZE) return { error: `El mazo principal no puede tener más de ${MAX_DECK_SIZE} cartas (tiene ${totalMain}).` };
  const totalExtra = extraCards.reduce((sum, c) => sum + c.amount, 0);
  if (totalExtra > MAX_FUSION_CARDS) return { error: `No puedes añadir más de ${MAX_FUSION_CARDS} cartas de fusión al mazo.` };

  for (const c of [...mainCards, ...extraCards]) {
    const card = cardDocsById.get(c.card);
    const max = maxCopiesOf(card);
    if (c.amount > max) return { error: `Solo puedes tener ${max} copias de "${card.name}" (rareza ${card.rarity}).` };
  }

  // Tokens aren't drawn from a deck — an effect conjures them outright — so they don't need to be
  // owned; every real card does.
  const collection = await UserCollection.findOne({ userId }).lean();
  const owned = new Map((collection?.cards || []).map((c) => [c.cardId.toString(), c.amount]));
  const notOwned = [...mainCards, ...extraCards].find((c) => (owned.get(c.card) || 0) < c.amount);
  if (notOwned) {
    const card = cardDocsById.get(notOwned.card);
    return { error: `No tienes suficientes copias de "${card.name}" en tu colección (tienes ${owned.get(notOwned.card) || 0}, necesitas ${notOwned.amount}).` };
  }

  const toDoc = (list) => list.map((c) => ({ card: new mongoose.Types.ObjectId(c.card), amount: c.amount }));
  return { cards: toDoc(mainCards), fusionCards: toDoc(extraCards), tokens: tokenIds.map((id) => new mongoose.Types.ObjectId(id)) };
}

const getDecksUser = async (req, res) => {
  const userId = req.jwtPayload.id;
  try {
    const decks = await Deck.find({ owner: userId })
      .populate('owner', PUBLIC_OWNER_FIELDS)
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
      .populate('owner', PUBLIC_OWNER_FIELDS)
      .populate('cards.card')
      .populate('fusionCards.card')
      .populate('tokens');

    // Only the owner can open a private deck; someone else's is reported as missing, so the
    // endpoint can't be used to probe which deck ids exist.
    if (!deck || (!deck.public && deck.owner._id.toString() !== req.jwtPayload.id)) {
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

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const validated = await validateDeckPayload(userId, { cards, fusionCards, tokens });
    if (validated.error) return res.status(400).json({ error: validated.error });

    const newDeck = new Deck({
      deckTitle: deckTitle.trim(),
      owner: userId,
      cards: validated.cards,
      fusionCards: validated.fusionCards,
      tokens: validated.tokens,
    });

    await newDeck.save();

    const deckToReturn = await Deck.findById(newDeck._id)
      .populate('owner', PUBLIC_OWNER_FIELDS)
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

    const validated = await validateDeckPayload(userId, { cards, fusionCards, tokens });
    if (validated.error) return res.status(400).json({ error: validated.error });

    const updatedDeck = await Deck.findByIdAndUpdate(
      id,
      { deckTitle: deckTitle.trim(), cards: validated.cards, fusionCards: validated.fusionCards, tokens: validated.tokens },
      { new: true, runValidators: true },
    )
      .populate('owner', PUBLIC_OWNER_FIELDS)
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
