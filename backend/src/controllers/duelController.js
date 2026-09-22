const { randomUUID } = require('crypto');
const { Deck } = require('../data/Schema/deck');
const { Card } = require('../data/Schema/card');
const { User } = require('../data/Schema/user');
const { createMatch, applyAction, viewFor, runBotTurn, matchStore } = require('../game');
const { isDeckPlayable } = require('../game/deckRules');
const { getIo } = require('../socket/socketServer');

const UNPLAYABLE_DECK_ERROR = 'Este mazo no cumple el tamaño mínimo (40-50 cartas, máx. 10 de fusión) para poder jugar.';

async function buildBotDeck() {
  const monsters = await Card.find({ category: 'monster' }).limit(20).lean();
  const support = await Card.find({ category: 'support' }).limit(10).lean();
  return {
    cards: [...monsters, ...support].map((c) => ({ card: c._id, amount: 2 })),
    fusionCards: [],
  };
}

function broadcastState(matchId) {
  const state = matchStore.get(matchId);
  if (!state) return;
  let io;
  try { io = getIo(); } catch (e) { return; }
  state.players.forEach((p, idx) => {
    if (p.userId === 'BOT') return;
    io.to(`user:${p.userId}`).emit('duel:state', viewFor(state, idx));
  });
}

function maybeRunBot(state) {
  if (!state.vsBot || state.status !== 'active') return;
  const botIndex = state.players.findIndex((p) => p.userId === 'BOT');
  if (botIndex === -1) return;
  // Either it's genuinely the bot's turn, or the human just activated something during their own
  // turn and opened a Pila the bot now has to respond to (or pass), or a trigger on the bot's own
  // card needs a pick — any of which the bot must resolve before anything else can continue.
  const botHasChainPriority = state.chain.length > 0 && state.priorityPlayer === botIndex;
  const botHasPendingChoice = state.pendingTriggerChoices && state.pendingTriggerChoices[0] && state.pendingTriggerChoices[0].controllerIndex === botIndex;
  if (state.turnPlayer !== botIndex && !botHasChainPriority && !botHasPendingChoice) return;
  runBotTurn(state, botIndex);
}

const startPve = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { deckId } = req.body;
    const deck = await Deck.findOne({ _id: deckId, owner: userId }).populate('cards.card').populate('fusionCards.card');
    if (!deck) return res.status(404).json({ error: 'Mazo no encontrado' });
    if (!isDeckPlayable(deck)) return res.status(400).json({ error: UNPLAYABLE_DECK_ERROR });

    const botDeck = await buildBotDeck();
    const matchId = randomUUID();
    const state = await createMatch({
      matchId,
      playerA: userId,
      deckA: deck,
      playerB: 'BOT',
      deckB: botDeck,
      vsBot: true,
    });
    matchStore.save(state);
    res.status(201).json(viewFor(state, 0));
  } catch (error) {
    res.status(500).json({ error: 'Error al iniciar la partida PvE' });
  }
};

const challenge = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { friendUserId, deckId } = req.body;
    const deck = await Deck.findOne({ _id: deckId, owner: userId });
    if (!deck) return res.status(404).json({ error: 'Mazo no encontrado' });
    if (!isDeckPlayable(deck)) return res.status(400).json({ error: UNPLAYABLE_DECK_ERROR });
    const friend = await User.findById(friendUserId);
    if (!friend) return res.status(404).json({ error: 'Usuario no encontrado' });

    const matchId = randomUUID();
    matchStore.savePending({ matchId, challengerId: userId.toString(), challengerDeckId: deckId, opponentId: friendUserId });

    try {
      getIo().to(`user:${friendUserId}`).emit('duel:invitation', { matchId, fromUserId: userId });
    } catch (e) {
      /* socket layer optional */
    }

    res.status(201).json({ matchId, message: 'Desafío enviado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al enviar el desafío' });
  }
};

const acceptChallenge = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { matchId } = req.params;
    const { deckId } = req.body;

    const pending = matchStore.getPending(matchId);
    if (!pending) return res.status(404).json({ error: 'Desafío no encontrado o ya expirado' });
    if (pending.opponentId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Este desafío no es para ti' });
    }

    const [challengerDeck, opponentDeck] = await Promise.all([
      Deck.findOne({ _id: pending.challengerDeckId, owner: pending.challengerId }).populate('cards.card').populate('fusionCards.card'),
      Deck.findOne({ _id: deckId, owner: userId }).populate('cards.card').populate('fusionCards.card'),
    ]);
    if (!challengerDeck || !opponentDeck) return res.status(404).json({ error: 'Mazo no encontrado' });
    if (!isDeckPlayable(challengerDeck) || !isDeckPlayable(opponentDeck)) {
      return res.status(400).json({ error: UNPLAYABLE_DECK_ERROR });
    }

    const state = await createMatch({
      matchId,
      playerA: pending.challengerId,
      deckA: challengerDeck,
      playerB: userId,
      deckB: opponentDeck,
      vsBot: false,
    });
    matchStore.save(state);
    matchStore.removePending(matchId);

    try {
      getIo().to(`user:${pending.challengerId}`).emit('duel:accepted', { matchId });
    } catch (e) {
      /* socket layer optional */
    }

    res.status(200).json(viewFor(state, 1));
  } catch (error) {
    res.status(500).json({ error: 'Error al aceptar el desafío' });
  }
};

const getState = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { matchId } = req.params;
    const state = matchStore.get(matchId);
    if (!state) return res.status(404).json({ error: 'Partida no encontrada' });
    const viewerIndex = state.players.findIndex((p) => p.userId === userId.toString());
    if (viewerIndex === -1) return res.status(403).json({ error: 'No participas en esta partida' });
    res.status(200).json(viewFor(state, viewerIndex));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener el estado de la partida' });
  }
};

const sendAction = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { matchId } = req.params;
    const state = matchStore.get(matchId);
    if (!state) return res.status(404).json({ error: 'Partida no encontrada' });
    const playerIndex = state.players.findIndex((p) => p.userId === userId.toString());
    if (playerIndex === -1) return res.status(403).json({ error: 'No participas en esta partida' });

    const result = applyAction(state, playerIndex, req.body.action || {});
    if (result.ok) {
      maybeRunBot(state);
      matchStore.save(state);
      broadcastState(matchId);
    }
    res.status(result.ok ? 200 : 400).json({ ...result, state: viewFor(state, playerIndex) });
  } catch (error) {
    res.status(500).json({ error: 'Error al procesar la acción' });
  }
};

// Shared by the socket layer (real-time duel actions) and the REST endpoint below.
function _handleSocketAction(userId, matchId, action) {
  const state = matchStore.get(matchId);
  if (!state) return;
  const playerIndex = state.players.findIndex((p) => p.userId === userId.toString());
  if (playerIndex === -1) return;

  const result = applyAction(state, playerIndex, action || {});
  if (result.ok) {
    maybeRunBot(state);
    matchStore.save(state);
  }
  broadcastState(matchId);
}

module.exports = {
  startPve,
  challenge,
  acceptChallenge,
  getState,
  sendAction,
  buildBotDeck,
  broadcastState,
  maybeRunBot,
  _handleSocketAction,
};
