import { useState } from 'react';
import { FaTrashAlt } from 'react-icons/fa';
import CardItem from '../CardItem';
import CardModal from '../CardModal';
import styles from './cardsselecteddisplay.module.css';

// Display order for the deck: monsters first (lowest level to highest), then supports grouped by
// subtype in this order. Only affects how the deck is shown — the saved deck data is untouched.
const SUPPORT_ORDER = ['normal', 'equipment', 'continuous', 'field', 'instant', 'counter'];

const compareForDeck = (a, b) => {
  const aSupport = a.category === 'support';
  const bSupport = b.category === 'support';
  if (aSupport !== bSupport) return aSupport ? 1 : -1;
  if (aSupport) {
    const byType = SUPPORT_ORDER.indexOf(a.type) - SUPPORT_ORDER.indexOf(b.type);
    if (byType !== 0) return byType;
  } else {
    const byLevel = (a.level ?? 0) - (b.level ?? 0);
    if (byLevel !== 0) return byLevel;
  }
  return a.name.localeCompare(b.name);
};

const CardsSelectedDisplay = ({ normalCards, fusionCards, onRemoveCard, onAddCard }) => {
  const [selectedCard, setSelectedCard] = useState(null);
  const [dragOverZone, setDragOverZone] = useState(null);

  const handleCardClick = (card) => setSelectedCard(card);
  const handleCloseModal = () => setSelectedCard(null);

  const expandCards = (cards) => {
    return [...cards].sort(compareForDeck).flatMap((card) =>
      Array.from({ length: card.amount || 1 }).map((_, i) => ({
        ...card,
        keyId: `${card.id}-${i}`,
      })),
    );
  };

  // A card's own category decides which deck it joins (handled by onAddCard) regardless of which
  // of the two boxes it's dropped on, so both zones just need to accept the drop and hand it off.
  const handleDragOver = (zone) => (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragOverZone(zone);
  };

  const handleDragLeave = () => setDragOverZone(null);

  const handleDrop = (event) => {
    event.preventDefault();
    setDragOverZone(null);
    const data = event.dataTransfer.getData('application/json');
    if (!data || !onAddCard) return;
    try {
      onAddCard(JSON.parse(data));
    } catch {
      // Not a card drag (e.g. dragged text/an image) — ignore it.
    }
  };

  return (
    <div className={styles.cardsSelected}>
      <div
        className={`${styles.normalCardsContainer} ${dragOverZone === 'main' ? styles.dragOver : ''}`}
        onDragOver={handleDragOver('main')}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={styles.cardsList}>
          {expandCards(normalCards).map((card) => (
            <div key={card.keyId} className={styles.cardWrapper}>
              <CardItem
                card={card}
                onAction={() => onRemoveCard(card)}
                actionLabel={<FaTrashAlt className={styles.trashIcon} />}
                compact
              />
            </div>
          ))}
        </div>
      </div>

      <div
        className={`${styles.fusionCardsContainer} ${dragOverZone === 'fusion' ? styles.dragOver : ''}`}
        onDragOver={handleDragOver('fusion')}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={styles.cardsList}>
          {expandCards(fusionCards).map((card) => (
            <div key={card.keyId} className={styles.cardWrapper}>
              <CardItem
                card={card}
                onAction={() => onRemoveCard(card)}
                actionLabel={<FaTrashAlt className={styles.trashIcon} />}
                compact
              />
            </div>
          ))}
        </div>
      </div>

      {selectedCard && <CardModal card={selectedCard} onClose={handleCloseModal} />}
    </div>
  );
};

export default CardsSelectedDisplay;
