import styles from './createnewdeck.module.css';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import DeckTitle from './DeckTitle';
import { fetchUserCollection } from '../../../../lib/utils/apiUserCollection';
import { fetchDeck, createDeck, updateDeck } from '../../../../lib/utils/apiDeck';
import { getUserToken } from '../../../../lib/utils/localStorage.utils';
import CardsCollectedDisplay from './CardsCollectedDisplay';
import CardsSelectedDisplay from './CardsSelectedDisplay';
import TokenSelector from './TokenSelector';
import { MIN_DECK_SIZE, MAX_DECK_SIZE, MAX_FUSION_CARDS } from '../../../../lib/utils/deckRules';

const TOAST_OPTIONS = {
  autoClose: 3000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
  theme: 'dark',
};

const showToast = (type, message) => toast[type](message, TOAST_OPTIONS);

const CreateNewDeck = () => {
  const { deckId } = useParams();
  const navigate = useNavigate();
  // True while a save is on its way: a second click can't send another one (and create a copy).
  const [saving, setSaving] = useState(false);
  const [deckTitle, setDeckTitle] = useState('');
  const [selectedCards, setSelectedCards] = useState([]);
  const [selectedFusionCards, setSelectedFusionCards] = useState([]);
  const [selectedTokens, setSelectedTokens] = useState([]);
  const [userCards, setUserCards] = useState([]);
  const [loading, setLoading] = useState(true);

  // Tokens are never drawn from a deck — an effect conjures them outright — so they don't belong
  // in the buildable card pool; they get their own selector fed only by the ones the user owns.
  const deckableCards = userCards.filter((c) => c.category !== 'token');
  const ownedTokens = userCards.filter((c) => c.category === 'token');
  const totalMainCards = selectedCards.reduce((sum, c) => sum + c.amount, 0);
  const totalFusionCards = selectedFusionCards.reduce((sum, c) => sum + c.amount, 0);

  // Cards the deck holds more of than it may: over the card's own limit (`state`, its banlist
  // value — it can change after a deck was built), or over the copies the player owns. The server
  // refuses to save such a deck, so it's flagged here with what to remove.
  const overLimit = [...selectedCards, ...selectedFusionCards]
    .map((c) => {
      const owned = userCards.length ? userCards.find((u) => u.id === c.id)?.amount ?? 0 : Infinity;
      const max = Math.min(c.state ?? 3, owned);
      return c.amount > max ? { name: c.name, amount: c.amount, max, byOwned: owned < (c.state ?? 3) } : null;
    })
    .filter(Boolean);

  useEffect(() => {
    const getUserCards = async () => {
      const response = await fetchUserCollection();
      setUserCards(response.map(({ cardId, amount }) => ({ ...cardId, id: cardId._id, amount })));
    };

    getUserCards();
  }, []);

  useEffect(() => {
    if (!deckId) return setLoading(false);

    const loadDeck = async () => {
      try {
        const deckData = await fetchDeck(deckId);
        if (deckData) {
          setDeckTitle(deckData.deckTitle);
          setSelectedCards(deckData.cards.map((c) => ({ id: c.card._id, ...c.card, amount: c.amount })));
          setSelectedFusionCards(deckData.fusionCards.map((c) => ({ id: c.card._id, ...c.card, amount: c.amount })));
          setSelectedTokens((deckData.tokens || []).map((card) => ({ id: card._id, ...card })));
        }
      } catch (error) {
        showToast('error', 'Error al cargar el mazo.');
      } finally {
        setLoading(false);
      }
    };

    loadDeck();
  }, [deckId]);

  const handleTitleChange = (newTitle) => setDeckTitle(newTitle);

  const handleAddCard = (card) => {
    const userCard = userCards.find((c) => c.id === card.id);
    const userCardQuantity = userCard ? userCard.amount : 0;

    const isFusionCard = card.category.toLowerCase() === 'fusion';
    const selectedArray = isFusionCard ? selectedFusionCards : selectedCards;
    const setSelectedArray = isFusionCard ? setSelectedFusionCards : setSelectedCards;
    const cardIndex = selectedArray.findIndex((c) => c.id === card.id);

    // The real per-card ceiling is the card's own banlist value (`state`), not a flat number —
    // it defaults by rarity (Legendaria 1 / Épica 2 / Rara 3 / Común 4) but can be overridden
    // per card, and the backend rejects anything above it.
    const maxCopies = card.state ?? 3;
    const maxTotal = isFusionCard ? MAX_FUSION_CARDS : MAX_DECK_SIZE;
    const totalInArray = selectedArray.reduce((sum, c) => sum + c.amount, 0);
    const totalLabel = isFusionCard
      ? `${MAX_FUSION_CARDS} cartas de fusión`
      : `${MAX_DECK_SIZE} cartas en el mazo principal`;

    if (totalInArray >= maxTotal) {
      showToast('error', `No puedes añadir más de ${totalLabel}.`);
      return;
    }

    if (cardIndex !== -1) {
      const updatedSelection = [...selectedArray];

      if (updatedSelection[cardIndex].amount >= maxCopies) {
        showToast('error', `Solo puedes tener ${maxCopies} copias de "${card.name}" (rareza ${card.rarity}).`);
        return;
      }
      if (updatedSelection[cardIndex].amount >= userCardQuantity) {
        showToast('error', `No puedes añadir más de ${userCardQuantity} copias de "${card.name}" — es lo que tienes.`);
        return;
      }

      updatedSelection[cardIndex] = {
        ...updatedSelection[cardIndex],
        amount: updatedSelection[cardIndex].amount + 1,
      };

      setSelectedArray([...updatedSelection]);
    } else {
      if (maxCopies < 1) {
        showToast('error', `"${card.name}" está prohibida en mazos (0 copias permitidas).`);
        return;
      }
      setSelectedArray([...selectedArray, { ...card, amount: 1 }]);
    }
  };

  const handleToggleToken = (token) => {
    setSelectedTokens((prev) =>
      prev.some((t) => t.id === token.id) ? prev.filter((t) => t.id !== token.id) : [...prev, token],
    );
  };

  const handleRemoveCard = (card) => {
    const isFusionCard = card.category.toLowerCase() === 'fusion';
    const selectedArray = isFusionCard ? selectedFusionCards : selectedCards;
    const setSelectedArray = isFusionCard ? setSelectedFusionCards : setSelectedCards;

    const updatedSelection = selectedArray
      .map((c) => (c.id === card.id ? { ...c, amount: c.amount - 1 } : c))
      .filter((c) => c.amount > 0);

    setSelectedArray(updatedSelection);

    showToast('info', `"${card.name}" eliminada del mazo.`);
  };

  const handleSaveDeck = async () => {
    const formattedDeck = {
      deckTitle: deckTitle.trim(),
      cards: selectedCards.map(({ id, amount }) => ({ card: id, amount })),
      fusionCards: selectedFusionCards.map(({ id, amount }) => ({ card: id, amount })),
      tokens: selectedTokens.map(({ id }) => id),
    };

    const token = getUserToken();

    if (!token) {
      showToast('error', 'No estás autenticado. Inicia sesión nuevamente.');
      return;
    }

    if (saving) return;
    setSaving(true);
    try {
      const savedDeck = deckId ? await updateDeck(deckId, formattedDeck) : await createDeck(formattedDeck);
      showToast('success', `Mazo "${savedDeck.deckTitle}" ${deckId ? 'actualizado' : 'guardado'} con éxito.`);
      // A new deck now has its own page: saving again from here updates it instead of creating
      // another copy (which is how duplicate decks appeared).
      if (!deckId && savedDeck?._id) navigate(`/deck/${savedDeck._id}`, { replace: true });
    } catch (error) {
      showToast('error', error.message || 'Error al guardar el mazo. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.createNewDeck}>
      {loading ? (
        <p className={styles.loadingMessage}>Cargando mazo...</p>
      ) : (
        <>
          <DeckTitle value={deckTitle} onTitleChange={handleTitleChange} />
          <div className={styles.statusRow}>
            <div
              className={`${styles.deckStatus} ${totalMainCards >= MIN_DECK_SIZE && totalMainCards <= MAX_DECK_SIZE ? styles.deckStatusOk : styles.deckStatusWarn}`}
            >
              Mazo Principal: {totalMainCards}/{MIN_DECK_SIZE}-{MAX_DECK_SIZE} · Mazo Secundario: {totalFusionCards}/
              {MAX_FUSION_CARDS}
            </div>
            <TokenSelector availableTokens={ownedTokens} selectedTokens={selectedTokens} onToggleToken={handleToggleToken} />
          </div>
          {overLimit.length > 0 && (
            <div className={styles.limitWarning} role='alert'>
              <strong>No se puede guardar hasta quitar estas copias:</strong>
              <ul>
                {overLimit.map((c) => (
                  <li key={c.name}>
                    {c.name}: tienes {c.amount} en el mazo y el máximo es {c.max}
                    {c.byOwned ? ' (las que tienes en tu colección)' : ''} — quita {c.amount - c.max}.
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={styles.deckContent}>
            <div className={styles.cardsSelectedWrapper}>
              <CardsSelectedDisplay
                normalCards={selectedCards}
                fusionCards={selectedFusionCards}
                onRemoveCard={handleRemoveCard}
                onAddCard={handleAddCard}
              />
            </div>
            <div className={styles.cardsCollectedWrapper}>
              <CardsCollectedDisplay cards={deckableCards} onAddCard={handleAddCard} addCard={true} />
            </div>
          </div>
          {/* A deck under 40 cards can still be saved to keep building later — it just won't be
              usable in a duel yet (see the status bar above and Duel's deck picker). Only the
              hard ceilings (max deck size, max fusion cards) block saving outright. */}
          <button
            className={styles.saveDeckButton}
            disabled={saving || overLimit.length > 0 || deckTitle.trim() === '' || totalMainCards > MAX_DECK_SIZE || totalFusionCards > MAX_FUSION_CARDS}
            title={overLimit.length > 0 ? 'Quita las copias que sobran (ver el aviso de arriba)' : undefined}
            onClick={handleSaveDeck}
          >
            {saving ? 'Guardando...' : deckId ? 'Actualizar Mazo' : 'Guardar Mazo'}
          </button>
        </>
      )}
    </div>
  );
};

export default CreateNewDeck;
