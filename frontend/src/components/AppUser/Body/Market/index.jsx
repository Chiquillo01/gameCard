import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from 'react-modal';
import styles from './market.module.css';
import CardFace from '../CreateNewDeck/CardModal/CardFace';
import { useUser } from '../../../../context/userContext';
import { successToast, errorToast } from '../../../../lib/toastify/toast';
import {
  getMarketSummary,
  getCardListings,
  getMyListings,
  getSellableCards,
  createListing,
  withdrawListing,
  buyListing,
  marketError,
} from '../../../../lib/utils/apiMarket';

const PIXELCOIN_ICON = 'https://res.cloudinary.com/dsd7efrba/image/upload/v1739100321/moneda3tcg_hmxpum.png';

const TABS = [
  { id: 'buy', label: 'Comprar' },
  { id: 'sell', label: 'Vender' },
  { id: 'mine', label: 'Mis ventas' },
];

const STATUS_LABELS = { activo: 'A la venta', vendido: 'Vendida', retirado: 'Retirada' };

const Coins = ({ amount }) => (
  <span className={styles.coins}>
    <img src={PIXELCOIN_ICON} alt='Pixelcoins' className={styles.coinIcon} /> {amount}
  </span>
);

// A whole card face shrunk to `width` px (the face is drawn at 480x700).
const MiniCard = ({ card, width = 120 }) => {
  const scale = width / 480;
  return (
    <div className={styles.miniCard} style={{ width, height: 700 * scale }}>
      <div style={{ width: 480, height: 700, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <CardFace card={card} />
      </div>
    </div>
  );
};

const MarketPage = () => {
  const { data: user, updateUser } = useUser();
  const [tab, setTab] = useState('buy');
  const [summary, setSummary] = useState(null);
  const [sellable, setSellable] = useState(null);
  const [mine, setMine] = useState(null);
  const [search, setSearch] = useState('');
  const [openCard, setOpenCard] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [s, sel, m] = await Promise.all([getMarketSummary(), getSellableCards(), getMyListings()]);
      setSummary(s);
      setSellable(sel);
      setMine(m);
    } catch (e) {
      errorToast('No se ha podido cargar el mercado.');
      setSummary((prev) => prev || []);
      setSellable((prev) => prev || []);
      setMine((prev) => prev || []);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // After any change: refresh the market, and the player's balance when a purchase changed it.
  const afterChange = async (newBalance) => {
    if (newBalance) updateUser({ ...user, ...newBalance });
    await reload();
  };

  const minPriceOf = useMemo(() => Object.fromEntries((summary || []).map((row) => [String(row.card._id), row.minPrice])), [summary]);

  const visibleSummary = (summary || []).filter((row) => row.card.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className={styles.marketPage}>
      <div className={styles.titleBanner}>
        <div className={styles.titlePlaque}>
          <div className={styles.titleText}>MERCADO DE CARTAS</div>
        </div>
      </div>

      <div className={styles.container}>
        <div className={styles.topRow}>
          <div className={styles.tabs}>
            {TABS.map((t) => (
              <button key={t.id} className={`${styles.tabButton} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className={styles.balance}>
            Tu saldo: <Coins amount={user?.pixelcoins ?? '...'} />
          </div>
        </div>

        {tab === 'buy' && (
          <section className={styles.panel}>
            <p className={styles.hint}>Cartas que otros jugadores venden. Se paga solo con Pixelcoins.</p>
            <input className={styles.search} placeholder='Buscar carta por nombre...' value={search} onChange={(e) => setSearch(e.target.value)} />
            {summary === null ? (
              <p className={styles.empty}>Cargando el mercado...</p>
            ) : visibleSummary.length === 0 ? (
              <p className={styles.empty}>{summary.length ? 'Ninguna carta a la venta con ese nombre.' : 'Todavía no hay cartas a la venta.'}</p>
            ) : (
              <ul className={styles.cardGrid}>
                {visibleSummary.map((row) => (
                  <li key={row.card._id}>
                    <button className={styles.cardTile} onClick={() => setOpenCard(row.card)}>
                      <MiniCard card={row.card} width={150} />
                      <span className={styles.tileName}>{row.card.name}</span>
                      <span className={styles.tileInfo}>
                        {row.copies} {row.copies === 1 ? 'copia' : 'copias'} · desde <Coins amount={row.minPrice} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'sell' && (
          <section className={styles.panel}>
            <p className={styles.hint}>
              Solo puedes vender copias repetidas: siempre te quedas con una, y nunca con menos de las que usa alguno de tus mazos.
              Las copias que pongas a la venta salen de tu colección hasta que se vendan o retires la oferta.
            </p>
            {sellable === null ? (
              <p className={styles.empty}>Cargando tu colección...</p>
            ) : sellable.length === 0 ? (
              <p className={styles.empty}>No tienes copias repetidas que vender.</p>
            ) : (
              <ul className={styles.rows}>
                {sellable.map((row) => (
                  <SellRow key={row.card._id} row={row} marketMin={minPriceOf[String(row.card._id)]} onListed={afterChange} />
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'mine' && (
          <section className={styles.panel}>
            {mine === null ? (
              <p className={styles.empty}>Cargando tus ventas...</p>
            ) : mine.length === 0 ? (
              <p className={styles.empty}>Aún no has puesto ninguna carta a la venta.</p>
            ) : (
              <ul className={styles.rows}>
                {mine.map((listing) => (
                  <MyListingRow key={listing._id} listing={listing} onWithdrawn={afterChange} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <BuyModal card={openCard} user={user} onClose={() => setOpenCard(null)} onBought={afterChange} />
    </div>
  );
};

function SellRow({ row, marketMin, onListed }) {
  const [amount, setAmount] = useState(1);
  const [price, setPrice] = useState(marketMin || 10);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createListing({ cardId: row.card._id, amount: Number(amount), price: Number(price) });
      successToast(`${row.card.name}: ${amount} ${Number(amount) === 1 ? 'copia puesta' : 'copias puestas'} a la venta.`);
      await onListed();
    } catch (err) {
      errorToast(marketError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={styles.row}>
      <MiniCard card={row.card} width={90} />
      <div className={styles.rowInfo}>
        <span className={styles.rowName}>{row.card.name}</span>
        <span>
          Tienes {row.owned}
          {row.inDecks > 0 ? ` · tus mazos usan ${row.inDecks}` : ''} · puedes vender <strong>{row.sellable}</strong>
        </span>
        {marketMin != null && (
          <span className={styles.muted}>
            En el mercado desde <Coins amount={marketMin} />
          </span>
        )}
      </div>
      <form className={styles.sellForm} onSubmit={submit}>
        <label>
          Copias
          <input type='number' min={1} max={row.sellable} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label>
          Precio por copia
          <input type='number' min={1} step={1} value={price} onChange={(e) => setPrice(e.target.value)} required />
        </label>
        <button className={styles.actionButton} disabled={busy}>
          Poner a la venta
        </button>
      </form>
    </li>
  );
}

function MyListingRow({ listing, onWithdrawn }) {
  const [busy, setBusy] = useState(false);
  const earned = (listing.sales || []).reduce((sum, s) => sum + s.amount * s.unitPrice, 0);
  const sold = listing.initialAmount - listing.amount;

  const withdraw = async () => {
    if (!window.confirm('¿Retirar esta oferta? Las copias que no se hayan vendido vuelven a tu colección.')) return;
    setBusy(true);
    try {
      const { returned } = await withdrawListing(listing._id);
      successToast(`Oferta retirada: ${returned} ${returned === 1 ? 'copia vuelve' : 'copias vuelven'} a tu colección.`);
      await onWithdrawn();
    } catch (err) {
      errorToast(marketError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!listing.cardId) return null;
  return (
    <li className={styles.row}>
      <MiniCard card={listing.cardId} width={90} />
      <div className={styles.rowInfo}>
        <span className={styles.rowName}>{listing.cardId.name}</span>
        <span>
          <Coins amount={listing.price.pixelcoins} /> por copia · vendidas {sold} de {listing.initialAmount}
        </span>
        <span className={styles.muted}>
          {STATUS_LABELS[listing.status] || listing.status}
          {earned > 0 && (
            <>
              {' '}
              · has ganado <Coins amount={earned} />
            </>
          )}
        </span>
      </div>
      {listing.status === 'activo' && (
        <button className={styles.secondaryButton} onClick={withdraw} disabled={busy}>
          Retirar
        </button>
      )}
    </li>
  );
}

function BuyModal({ card, user, onClose, onBought }) {
  const [listings, setListings] = useState(null);
  const [amounts, setAmounts] = useState({});
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!card) return;
    setListings(null);
    setConfirming(null);
    setAmounts({});
    getCardListings(card._id)
      .then(setListings)
      .catch(() => setListings([]));
  }, [card]);

  const buy = async (listing) => {
    const amount = Number(amounts[listing._id] || 1);
    setBusy(true);
    try {
      const result = await buyListing(listing._id, amount);
      successToast(`Has comprado ${result.bought} ${result.bought === 1 ? 'copia' : 'copias'} de ${card.name}.`);
      await onBought(result.newBalance);
      setListings(await getCardListings(card._id));
    } catch (err) {
      errorToast(marketError(err));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <Modal isOpen={!!card} onRequestClose={onClose} className={styles.modal} overlayClassName={styles.overlay} ariaHideApp={false}>
      {card && (
        <div className={styles.modalBody}>
          <MiniCard card={card} width={240} />
          <div className={styles.modalListings}>
            <h2 className={styles.modalTitle}>{card.name}</h2>
            {listings === null ? (
              <p className={styles.empty}>Cargando ofertas...</p>
            ) : listings.length === 0 ? (
              <p className={styles.empty}>Ya no quedan copias a la venta.</p>
            ) : (
              <ul className={styles.listingList}>
                {listings.map((l) => {
                  const own = String(l.userId?._id) === String(user?._id);
                  const amount = Number(amounts[l._id] || 1);
                  const total = amount * l.price.pixelcoins;
                  const affordable = (user?.pixelcoins ?? 0) >= total;
                  return (
                    <li key={l._id} className={styles.listing}>
                      <span className={styles.listingSeller}>{own ? 'Tú' : l.userId?.userName}</span>
                      <span>
                        <Coins amount={l.price.pixelcoins} /> / copia
                      </span>
                      <span className={styles.muted}>{l.amount} disp.</span>
                      {own ? (
                        <span className={styles.muted}>Tu oferta</span>
                      ) : (
                        <span className={styles.listingBuy}>
                          <input
                            type='number'
                            min={1}
                            max={l.amount}
                            value={amounts[l._id] || 1}
                            onChange={(e) => {
                              setConfirming(null);
                              setAmounts((a) => ({ ...a, [l._id]: e.target.value }));
                            }}
                          />
                          {confirming === l._id ? (
                            <button className={styles.actionButton} disabled={busy} onClick={() => buy(l)}>
                              Confirmar <Coins amount={total} />
                            </button>
                          ) : (
                            <button
                              className={styles.actionButton}
                              disabled={!affordable || amount < 1 || amount > l.amount}
                              title={affordable ? '' : 'No tienes pixelcoins suficientes'}
                              onClick={() => setConfirming(l._id)}
                            >
                              Comprar
                            </button>
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <button className={styles.secondaryButton} onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default MarketPage;
