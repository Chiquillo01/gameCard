import { useEffect, useState } from 'react';
import styles from './userFriendsManagement.module.css';
import { fetchTradeableCards, proposeTrade, tradeError } from '../../../../lib/utils/apiTrade';
import { successToast, errorToast } from '../../../../lib/toastify/toast';

// One side of the swap: the spare copies someone has, each with a - / + to pick how many.
const CardPicker = ({ title, rows, picked, onChange, emptyText }) => (
  <div className={styles.tradeColumn}>
    <h4 className={styles.tradeColumnTitle}>{title}</h4>
    {rows === null ? (
      <p className={styles.friendNoRequests}>Cargando cartas...</p>
    ) : rows.length ? (
      <ul className={styles.tradeCardList}>
        {rows.map(({ card, sellable }) => {
          const n = picked[card._id] || 0;
          return (
            <li key={card._id} className={`${styles.tradeCardRow} ${n ? styles.tradeCardPicked : ''}`}>
              {card.image && <img src={card.image} alt='' className={styles.tradeCardThumb} />}
              <span className={styles.tradeCardName} title={card.name}>
                {card.name}
              </span>
              <span className={styles.tradeCardSpare}>x{sellable}</span>
              <div className={styles.tradeStepper}>
                <button type='button' onClick={() => onChange(card._id, Math.max(0, n - 1))} disabled={!n}>
                  −
                </button>
                <span>{n}</span>
                <button type='button' onClick={() => onChange(card._id, Math.min(sellable, n + 1))} disabled={n >= sellable}>
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    ) : (
      <p className={styles.friendNoRequests}>{emptyText}</p>
    )}
  </div>
);

const toLines = (picked) =>
  Object.entries(picked)
    .filter(([, amount]) => amount > 0)
    .map(([cardId, amount]) => ({ cardId, amount }));

// Proposing a swap to a friend: what you give (your spare copies) and what you ask for (theirs).
// Only spare copies show up: the last copy of a card, and the ones your decks use, never leave.
const TradeModal = ({ friend, onClose, onSent }) => {
  const [mine, setMine] = useState(null);
  const [theirs, setTheirs] = useState(null);
  const [offer, setOffer] = useState({});
  const [request, setRequest] = useState({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchTradeableCards('me').then(setMine).catch(() => setMine([]));
    fetchTradeableCards(friend._id).then(setTheirs).catch(() => setTheirs([]));
  }, [friend._id]);

  const offerLines = toLines(offer);
  const requestLines = toLines(request);
  const empty = !offerLines.length && !requestLines.length;

  const send = async () => {
    setSending(true);
    try {
      await proposeTrade(friend._id, offerLines, requestLines);
      successToast(`Intercambio propuesto a ${friend.userName}`);
      onSent();
    } catch (e) {
      errorToast(tradeError(e, 'No se pudo proponer el intercambio'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.modalInvitation}>
      <div className={`${styles.modalInvitationContent} ${styles.tradeModal}`}>
        <h3>Intercambiar cartas con {friend.userName}</h3>
        <p className={styles.tradeHint}>Solo aparecen las copias repetidas: siempre os quedáis con una, y con las que usen vuestros mazos.</p>
        <div className={styles.tradeColumns}>
          <CardPicker
            title='Tú das'
            rows={mine}
            picked={offer}
            onChange={(id, n) => setOffer((o) => ({ ...o, [id]: n }))}
            emptyText='No tienes cartas repetidas para dar.'
          />
          <CardPicker
            title={`Pides a ${friend.userName}`}
            rows={theirs}
            picked={request}
            onChange={(id, n) => setRequest((r) => ({ ...r, [id]: n }))}
            emptyText={`${friend.userName} no tiene cartas repetidas.`}
          />
        </div>
        <div className={styles.modalInvitationButtons}>
          <button className={styles.button} onClick={send} disabled={empty || sending}>
            {sending ? 'Enviando...' : 'Proponer intercambio'}
          </button>
          <button className={styles.closeButton} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

// "2x Kraken, 1x Dragón" — or a dash when that side is empty.
export const describeLines = (lines) =>
  lines && lines.length ? lines.map((l) => `${l.amount}x ${l.cardId ? l.cardId.name : 'carta retirada'}`).join(', ') : 'nada';

export default TradeModal;
