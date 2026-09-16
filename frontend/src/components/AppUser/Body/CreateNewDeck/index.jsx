import styles from './createnewdeck.module.css';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import DeckTitle from './DeckTitle';
import { fetchUserCollection } from '../../../../lib/utils/apiUserCollection';
import { fetchDeck, createDeck, updateDeck } from '../../../../lib/utils/apiDeck';
import { getUserToken } from '../../../../lib/utils/localStorage.utils';
import CardsCollectedDisplay from './CardsCollectedDisplay';
import CardsSelectedDisplay from './CardsSelectedDisplay';
import TokenSelector from './TokenSelector';

// Rulebook limits (mirrored in backend/src/controllers/deckController.js, the source of truth):
// the main deck holds 40-50 cards, the secondary/fusion deck holds up to 10, and how many
// copies of any one card are allowed comes from that card's own `state` field (banlist value,
// which itself defaults by rarity — Legendaria 1 / Épica 2 / Rara 3 / Común 4).
const MIN_DECK_SIZE = 40;
const MAX_DECK_SIZE = 50;
const MAX_FUSION_CARDS = 10;

const TOAST_OPTIONS = {
  position: 'top-right',
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

    try {
      const savedDeck = deckId ? await updateDeck(deckId, formattedDeck) : await createDeck(formattedDeck);
      showToast('success', `Mazo "${savedDeck.deckTitle}" ${deckId ? 'actualizado' : 'guardado'} con éxito.`);
    } catch (error) {
      showToast('error', 'Error al guardar el mazo. Inténtalo de nuevo.');
    }
  };

  return (
    <div className={styles.createNewDeck}>
      {loading ? (
        <p className={styles.loadingMessage}>Cargando mazo...</p>
      ) : (
        <>
          <DeckTitle value={deckTitle} onTitleChange={handleTitleChange} />
          <TokenSelector availableTokens={ownedTokens} selectedTokens={selectedTokens} onToggleToken={handleToggleToken} />
          <div className={styles.deckContent}>
            <div className={styles.cardsSelectedWrapper}>
              <CardsSelectedDisplay
                normalCards={selectedCards}
                fusionCards={selectedFusionCards}
                onRemoveCard={handleRemoveCard}
              />
            </div>
            <div className={styles.cardsCollectedWrapper}>
              <CardsCollectedDisplay cards={deckableCards} onAddCard={handleAddCard} addCard={true} />
            </div>
          </div>
          <div
            className={`${styles.deckStatus} ${totalMainCards >= MIN_DECK_SIZE && totalMainCards <= MAX_DECK_SIZE ? styles.deckStatusOk : styles.deckStatusWarn}`}
          >
            Mazo Principal: {totalMainCards}/{MIN_DECK_SIZE}-{MAX_DECK_SIZE} · Mazo Secundario: {totalFusionCards}/
            {MAX_FUSION_CARDS}
          </div>
          <button
            className={styles.saveDeckButton}
            disabled={
              deckTitle.trim() === '' ||
              totalMainCards < MIN_DECK_SIZE ||
              totalMainCards > MAX_DECK_SIZE ||
              totalFusionCards > MAX_FUSION_CARDS
            }
            onClick={handleSaveDeck}
          >
            {deckId ? 'Actualizar Mazo' : 'Guardar Mazo'}
          </button>
        </>
      )}
    </div>
  );
};

export default CreateNewDeck;
