import styles from './userFriendsManagement.module.css';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { BsPlusCircleDotted } from 'react-icons/bs';
import {
  fetchFriends,
  sendInvitation,
  acceptInvitation,
  rejectInvitation,
  cancelInvitation,
  removeFriend,
  friendshipError,
} from '../../../../lib/utils/apiFrienship';
import { getDuelChallenges, challengeFriend, acceptChallenge, declineChallenge } from '../../../../lib/utils/apiDuel';
import { getUserDecks } from '../../../../lib/utils/apiDeck';
import { isDeckPlayable } from '../../../../lib/utils/deckRules';
import { useGameRules } from '../../../../lib/utils/gameRules';
import { getSocket } from '../../../../lib/socket';
import { fetchTrades, acceptTrade, rejectTrade, cancelTrade } from '../../../../lib/utils/apiTrade';
import TradeModal, { describeLines } from './TradeModal';
import { successToast, errorToast, infoToast } from '../../../../lib/toastify/toast';

const EMPTY = { friends: [], incoming: [], outgoing: [] };

// Picks one of the player's playable decks, for proposing a duel or accepting one.
const DeckPicker = ({ title, confirmLabel, onConfirm, onClose }) => {
  useGameRules(); // re-render once the server's deck sizes arrive
  const [decks, setDecks] = useState(null);
  const [deckId, setDeckId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getUserDecks().then((all) => {
      const playable = all.filter(isDeckPlayable);
      setDecks(playable);
      if (playable.length) setDeckId(playable[0]._id);
    });
  }, []);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(deckId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalInvitation}>
      <div className={styles.modalInvitationContent}>
        <h3>{title}</h3>
        {decks === null ? (
          <p className={styles.friendNoRequests}>Cargando mazos...</p>
        ) : decks.length ? (
          <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
            {decks.map((d) => (
              <option key={d._id} value={d._id}>
                {d.deckTitle}
              </option>
            ))}
          </select>
        ) : (
          <p className={styles.friendNoRequests}>No tienes ningún mazo completo para jugar.</p>
        )}
        <div className={styles.modalInvitationButtons}>
          <button className={styles.button} onClick={confirm} disabled={!deckId || busy}>
            {busy ? 'Enviando...' : confirmLabel}
          </button>
          <button className={styles.closeButton} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

const UserFriendsManagement = () => {
  const navigate = useNavigate();
  const [lists, setLists] = useState(EMPTY);
  const [challenges, setChallenges] = useState([]);
  const [trades, setTrades] = useState({ incoming: [], outgoing: [] });
  // The friend a card swap is being proposed to (the trade window is open).
  const [tradeWith, setTradeWith] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [friendName, setFriendName] = useState('');
  // The deck picker, when open: { kind: 'challenge', friend } or { kind: 'accept', challenge }.
  const [deckPicker, setDeckPicker] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [friendData, duelChallenges, tradeData] = await Promise.all([fetchFriends(), getDuelChallenges(), fetchTrades()]);
      setLists(friendData);
      setChallenges(duelChallenges);
      setTrades(tradeData);
      // A friend who's gone (removed elsewhere) can't stay selected.
      setSelectedFriend((current) => (current && friendData.friends.some((f) => f._id === current._id) ? current : null));
    } catch (e) {
      errorToast(friendshipError(e, 'No se pudieron cargar tus amigos'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const socket = getSocket();
    const events = ['friends:changed', 'duel:invitation', 'trades:changed'];
    events.forEach((event) => socket.on(event, reload));
    return () => events.forEach((event) => socket.off(event, reload));
  }, [reload]);

  // Runs a request, shows the server's answer and reloads the lists.
  const run = async (request, okMessage, fallbackError) => {
    try {
      const result = await request();
      if (okMessage) successToast(typeof okMessage === 'function' ? okMessage(result) : okMessage);
      return result;
    } catch (e) {
      errorToast(friendshipError(e, fallbackError));
      return null;
    } finally {
      reload();
    }
  };

  const sendFriendRequest = async () => {
    const name = friendName.trim();
    if (!name) return;
    const result = await run(() => sendInvitation(name), (r) => r.message, 'No se pudo enviar la solicitud');
    if (result) {
      setFriendName('');
      setIsModalOpen(false);
    }
  };

  const selectFriend = (friend) => {
    setSelectedFriend(friend);
    setConfirmRemove(false);
  };

  const handleRemove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    await run(() => removeFriend(selectedFriend._id), `${selectedFriend.userName} ya no es tu amigo`, 'No se pudo eliminar');
    setSelectedFriend(null);
    setConfirmRemove(false);
  };

  const handleDeckChosen = async (deckId) => {
    if (deckPicker.kind === 'challenge') {
      const { friend } = deckPicker;
      const result = await run(() => challengeFriend(friend._id, deckId), null, 'No se pudo enviar el desafío');
      if (result) infoToast(`Desafío enviado a ${friend.userName}. Empezará en cuanto lo acepte.`);
      setDeckPicker(null);
    } else {
      const { challenge } = deckPicker;
      try {
        await acceptChallenge(challenge.matchId, deckId);
        setDeckPicker(null);
        navigate(`/duel/${challenge.matchId}`);
      } catch (e) {
        errorToast(friendshipError(e, 'No se pudo aceptar el desafío'));
        setDeckPicker(null);
        reload();
      }
    }
  };

  const { friends, incoming, outgoing } = lists;

  return (
    <div className={styles.friendContainer}>
      <div className={styles.sidebar}>
        <h2 className={styles.friendsTitle}>Amigos</h2>
        {!loading && !friends.length && <p className={styles.friendNoRequests}>Aún no tienes amigos.</p>}
        <ul className={styles.friendsList}>
          {friends.map((friend) => (
            <li
              key={friend._id}
              className={`${styles.friendItem} ${selectedFriend?._id === friend._id ? styles.friendItemSelected : ''}`}
              onClick={() => selectFriend(friend)}
            >
              {friend.userName}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.friendMainContent}>
        {selectedFriend && (
          <div className={styles.friendOptions}>
            <div className={styles.optionsHeader}>
              <h3 className={styles.optionsTitle}>{selectedFriend.userName}</h3>
              <FaTimesCircle className={styles.closeIcon} onClick={() => setSelectedFriend(null)} />
            </div>
            <div className={styles.optionsButtons}>
              <button className={styles.button} onClick={() => setDeckPicker({ kind: 'challenge', friend: selectedFriend })}>
                Desafiar a un duelo
              </button>
              <button className={styles.button} onClick={() => setTradeWith(selectedFriend)}>
                Intercambiar cartas
              </button>
              <button className={styles.dangerButton} onClick={handleRemove}>
                {confirmRemove ? '¿Seguro? Pulsa otra vez' : 'Eliminar de amigos'}
              </button>
            </div>
          </div>
        )}

        <div className={styles.friendSectionTitle}>
          <h3>Desafíos a duelo</h3>
        </div>
        {challenges.length ? (
          <ul className={styles.friendRequestList}>
            {challenges.map((challenge) => (
              <li key={challenge.matchId} className={styles.friendRequestItem}>
                <p>{challenge.fromUserName || 'Un amigo'} te desafía a un duelo.</p>
                <div className={styles.actionButtons}>
                  <FaCheckCircle title='Aceptar' className={styles.acceptIcon} onClick={() => setDeckPicker({ kind: 'accept', challenge })} />
                  <FaTimesCircle
                    title='Rechazar'
                    className={styles.rejectIcon}
                    onClick={() => run(() => declineChallenge(challenge.matchId), 'Desafío rechazado', 'No se pudo rechazar el desafío')}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.friendNoRequests}>Nadie te ha desafiado.</p>
        )}

        <div className={styles.friendSectionTitle}>
          <h3>Intercambios</h3>
        </div>
        {trades.incoming.length || trades.outgoing.length ? (
          <ul className={styles.friendRequestList}>
            {trades.incoming.map((trade) => (
              <li key={trade._id} className={styles.friendRequestItem}>
                <div className={styles.tradeSummary}>
                  <p>
                    <strong>{trade.proposer?.userName || 'Un amigo'}</strong> te propone un intercambio.
                  </p>
                  <p>Te da: {describeLines(trade.offer)}</p>
                  <p>Te pide: {describeLines(trade.request)}</p>
                </div>
                <div className={styles.actionButtons}>
                  <FaCheckCircle
                    title='Aceptar'
                    className={styles.acceptIcon}
                    onClick={() => run(() => acceptTrade(trade._id), '¡Intercambio hecho! Las cartas ya están en tu colección.', 'No se pudo hacer el intercambio')}
                  />
                  <FaTimesCircle
                    title='Rechazar'
                    className={styles.rejectIcon}
                    onClick={() => run(() => rejectTrade(trade._id), 'Intercambio rechazado', 'No se pudo rechazar')}
                  />
                </div>
              </li>
            ))}
            {trades.outgoing.map((trade) => (
              <li key={trade._id} className={styles.friendRequestItem}>
                <div className={styles.tradeSummary}>
                  <p>
                    Esperando a <strong>{trade.receiver?.userName || 'tu amigo'}</strong>.
                  </p>
                  <p>Das: {describeLines(trade.offer)}</p>
                  <p>Pides: {describeLines(trade.request)}</p>
                </div>
                <div className={styles.actionButtons}>
                  <FaTimesCircle
                    title='Cancelar'
                    className={styles.rejectIcon}
                    onClick={() => run(() => cancelTrade(trade._id), 'Intercambio cancelado', 'No se pudo cancelar')}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.friendNoRequests}>No tienes intercambios pendientes.</p>
        )}

        <div className={styles.friendSectionTitle}>
          <h3>Solicitudes de amistad</h3>
          <BsPlusCircleDotted className={styles.plus} title='Añadir amigo' onClick={() => setIsModalOpen(true)} />
        </div>
        {incoming.length ? (
          <ul className={styles.friendRequestList}>
            {incoming.map((request) => (
              <li key={request._id} className={styles.friendRequestItem}>
                <p>{request.user.userName} quiere ser tu amigo.</p>
                <div className={styles.actionButtons}>
                  <FaCheckCircle
                    title='Aceptar'
                    className={styles.acceptIcon}
                    onClick={() => run(() => acceptInvitation(request._id), `Ahora eres amigo de ${request.user.userName}`, 'No se pudo aceptar')}
                  />
                  <FaTimesCircle
                    title='Rechazar'
                    className={styles.rejectIcon}
                    onClick={() => run(() => rejectInvitation(request._id), 'Solicitud rechazada', 'No se pudo rechazar')}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.friendNoRequests}>No tienes solicitudes de amistad.</p>
        )}

        {outgoing.length > 0 && (
          <>
            <div className={styles.friendSectionTitle}>
              <h3>Solicitudes enviadas</h3>
            </div>
            <ul className={styles.friendRequestList}>
              {outgoing.map((request) => (
                <li key={request._id} className={styles.friendRequestItem}>
                  <p>Esperando a {request.user.userName}.</p>
                  <div className={styles.actionButtons}>
                    <FaTimesCircle
                      title='Cancelar'
                      className={styles.rejectIcon}
                      onClick={() => run(() => cancelInvitation(request._id), 'Solicitud cancelada', 'No se pudo cancelar')}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {isModalOpen && (
          <div className={styles.modalInvitation}>
            <div className={styles.modalInvitationContent}>
              <h3>Enviar solicitud de amistad</h3>
              <input
                type='text'
                value={friendName}
                onChange={(e) => setFriendName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendFriendRequest()}
                placeholder='Escribe el nombre del usuario'
                autoFocus
              />
              <div className={styles.modalInvitationButtons}>
                <button className={styles.button} onClick={sendFriendRequest} disabled={!friendName.trim()}>
                  Enviar solicitud
                </button>
                <button className={styles.closeButton} onClick={() => setIsModalOpen(false)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {tradeWith && (
          <TradeModal
            friend={tradeWith}
            onClose={() => setTradeWith(null)}
            onSent={() => {
              setTradeWith(null);
              reload();
            }}
          />
        )}

        {deckPicker && (
          <DeckPicker
            title={deckPicker.kind === 'challenge' ? `Desafiar a ${deckPicker.friend.userName}` : `Duelo contra ${deckPicker.challenge.fromUserName || 'tu amigo'}`}
            confirmLabel={deckPicker.kind === 'challenge' ? 'Enviar desafío' : 'Aceptar y jugar'}
            onConfirm={handleDeckChosen}
            onClose={() => setDeckPicker(null)}
          />
        )}
      </div>
    </div>
  );
};

export default UserFriendsManagement;
