const { randomUUID } = require('crypto');
const { Deck } = require('../data/Schema/deck');
const { User } = require('../data/Schema/user');
const { createMatch, applyAction, viewFor, coinTossFirstPlayer, botStep, matchStore } = require('../game');
const { isDeckPlayable } = require('../game/deckRules');
const { getIo } = require('../socket/socketServer');
const { areFriends } = require('../services/friends');
const { emitToUser } = require('../services/notify');

const { rules } = require('../game/rules');

const unplayableDeckError = () => `Este mazo no cumple el tamaño mínimo (${rules().minDeckSize}-${rules().maxDeckSize} cartas, máx. ${rules().maxFusionCards} de fusión) para poder jugar.`;

// A mirror of a deck (the player's own, when there's nothing else to pick from).
function buildBotDeck(playerDeck) {
  return {
    cards: (playerDeck.cards || []).map((c) => ({ card: c.card, amount: c.amount })),
    fusionCards: (playerDeck.fusionCards || []).map((c) => ({ card: c.card, amount: c.amount })),
  };
}

// The bot plays a deck picked at random among the playable decks of the admin accounts (the
// curated ones), for variety; with none playable it mirrors the player's own deck.
async function pickBotDeck(playerDeck, random = Math.random) {
  const admins = await User.find({ admin: true }).select('_id').lean();
  const decks = admins.length
    ? await Deck.find({ owner: { $in: admins.map((a) => a._id) } }).populate('cards.card').populate('fusionCards.card')
    : [];
  const playable = decks.filter(isDeckPlayable);
  if (!playable.length) return buildBotDeck(playerDeck);
  return buildBotDeck(playable[Math.floor(random() * playable.length)]);
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

// Whether the bot has something to do: it's genuinely its turn, or the human just activated
// something and opened a Pila the bot has to respond to (or pass), or a pick of its own is waiting.
function botIndexToAct(state) {
  if (!state.vsBot || state.status !== 'active') return -1;
  const botIndex = state.players.findIndex((p) => p.userId === 'BOT');
  if (botIndex === -1) return -1;
  const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
  if (pending) return pending.controllerIndex === botIndex ? botIndex : -1;
  if (state.chain.length) return state.priorityPlayer === botIndex ? botIndex : -1;
  if (state.window) return state.window.priorityPlayer === botIndex ? botIndex : -1;
  return state.turnPlayer === botIndex ? botIndex : -1;
}

// The bot plays one move at a time, each broadcast to the player, with a pause in between so its
// turn can be followed (a longer one after a real move than after just changing phase).
const BOT_ACTION_MS = 1100;
const BOT_PHASE_MS = 450;
const botTimers = new Map(); // matchId -> the bot's next scheduled move
function maybeRunBot(state, delay = BOT_ACTION_MS) {
  if (botIndexToAct(state) === -1 || botTimers.has(state.id)) return;
  const timer = setTimeout(() => {
    botTimers.delete(state.id);
    const live = matchStore.get(state.id) || state;
    const botIndex = botIndexToAct(live);
    if (botIndex === -1) return;
    let did = null;
    try {
      did = botStep(live, botIndex);
    } catch (e) {
      console.error('Bot step failed:', e);
    }
    matchStore.save(live);
    broadcastState(live.id);
    if (did) maybeRunBot(live, did === 'phase' ? BOT_PHASE_MS : BOT_ACTION_MS);
  }, delay);
  botTimers.set(state.id, timer);
  // A pending bot move never keeps the process alive on its own (tests, shutdown).
  if (timer.unref) timer.unref();
}

// Cancels every bot move still waiting to happen. unref() keeps those timers from holding the
// process open, but one can still fire after its caller is gone: a test file that started a PvE
// duel ends, Jest unloads the modules, and the late move then crashes on a torn-down require.
function stopAllBots() {
  botTimers.forEach((timer) => clearTimeout(timer));
  botTimers.clear();
}

const startPve = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { deckId } = req.body;
    const deck = await Deck.findOne({ _id: deckId, owner: userId }).populate('cards.card').populate('fusionCards.card');
    if (!deck) return res.status(404).json({ error: 'Mazo no encontrado' });
    if (!isDeckPlayable(deck)) return res.status(400).json({ error: unplayableDeckError() });

    const matchId = randomUUID();
    const user = await User.findById(userId).select('userName');
    const state = await createMatch({
      matchId,
      playerA: userId,
      nameA: user && user.userName,
      deckA: deck,
      playerB: 'BOT',
      deckB: await pickBotDeck(deck),
      vsBot: true,
      ...coinTossFirstPlayer(),
    });
    // The bot may have won the toss: it plays its first turn before the player gets the board.
    maybeRunBot(state);
    matchStore.save(state);
    res.status(201).json(viewFor(state, 0));
  } catch (error) {
    res.status(500).json({ error: 'Error al iniciar la partida PvE' });
  }
};

// A duel against another player can only be proposed to a friend. The challenge waits in memory
// (matchStore, PENDING_CHALLENGE_MS) until the friend accepts it with a deck of their own, or
// declines it.
const challenge = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { friendUserId, deckId } = req.body;
    const deck = await Deck.findOne({ _id: deckId, owner: userId }).populate('cards.card').populate('fusionCards.card');
    if (!deck) return res.status(404).json({ error: 'Mazo no encontrado' });
    if (!isDeckPlayable(deck)) return res.status(400).json({ error: unplayableDeckError() });
    if (String(friendUserId) === String(userId)) return res.status(400).json({ error: 'No puedes desafiarte a ti mismo' });
    const friend = require('mongoose').Types.ObjectId.isValid(friendUserId) ? await User.findById(friendUserId) : null;
    if (!friend) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!(await areFriends(userId, friendUserId))) return res.status(403).json({ error: 'Solo puedes desafiar a tus amigos' });

    const challenger = await User.findById(userId).select('userName');
    const matchId = randomUUID();
    matchStore.savePending({
      matchId,
      challengerId: userId.toString(),
      challengerName: challenger && challenger.userName,
      challengerDeckId: deckId,
      opponentId: friendUserId.toString(),
    });

    emitToUser(friendUserId, 'duel:invitation', { matchId, fromUserId: userId, fromUserName: challenger && challenger.userName });

    res.status(201).json({ matchId, message: 'Desafío enviado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al enviar el desafío' });
  }
};

// GET /duel/challenges — the duels friends have proposed to the player, still waiting on an answer.
const listChallenges = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const challenges = matchStore.pendingFor(userId).map((p) => ({
      matchId: p.matchId,
      fromUserId: p.challengerId,
      fromUserName: p.challengerName,
      createdAt: p.createdAt,
    }));
    res.status(200).json(challenges);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar los desafíos' });
  }
};

// POST /duel/:matchId/decline — the challenged player says no; the challenger is told.
const declineChallenge = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { matchId } = req.params;
    const pending = matchStore.getPending(matchId);
    if (!pending) return res.status(404).json({ error: 'Desafío no encontrado o ya expirado' });
    if (pending.opponentId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Este desafío no es para ti' });
    }
    matchStore.removePending(matchId);
    const me = await User.findById(userId).select('userName');
    emitToUser(pending.challengerId, 'duel:declined', { matchId, byUserName: me && me.userName });
    res.status(200).json({ message: 'Desafío rechazado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al rechazar el desafío' });
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
      return res.status(400).json({ error: unplayableDeckError() });
    }

    const [challenger, opponent] = await Promise.all([User.findById(pending.challengerId).select('userName'), User.findById(userId).select('userName')]);
    const state = await createMatch({
      matchId,
      playerA: pending.challengerId,
      nameA: challenger && challenger.userName,
      deckA: challengerDeck,
      playerB: userId,
      nameB: opponent && opponent.userName,
      deckB: opponentDeck,
      vsBot: false,
      ...coinTossFirstPlayer(),
    });
    matchStore.save(state);
    matchStore.removePending(matchId);

    emitToUser(pending.challengerId, 'duel:accepted', { matchId });

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
  listChallenges,
  declineChallenge,
  acceptChallenge,
  getState,
  sendAction,
  buildBotDeck,
  pickBotDeck,
  broadcastState,
  maybeRunBot,
  stopAllBots,
  _handleSocketAction,
};
