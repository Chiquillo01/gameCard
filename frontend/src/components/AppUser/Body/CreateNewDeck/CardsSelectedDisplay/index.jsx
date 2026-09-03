import { useState } from 'react';
import { FaTrashAlt } from 'react-icons/fa';
import CardItem from '../CardItem';
import CardModal from '../CardModal';
import styles from './cardsselecteddisplay.module.css';

const CardsSelectedDisplay = ({ normalCards, fusionCards, onRemoveCard }) => {
  const [selectedCard, setSelectedCard] = useState(null);

  const handleCardClick = (card) => setSelectedCard(card);
  const handleCloseModal = () => setSelectedCard(null);

  const totalNormalCards = normalCards.reduce((total, card) => total + (card.amount || 1), 0);
  const totalFusionCards = fusionCards.reduce((total, card) => total + (card.amount || 1), 0);
  const totalCards = totalNormalCards + totalFusionCards;

  const expandCards = (cards) => {
    return cards.flatMap((card) =>
      Array.from({ length: card.amount || 1 }).map((_, i) => ({
        ...card,
        keyId: `${card.id}-${i}`,
      })),
    );
  };

  return (
    <div className={styles.cardsSelected}>
      <div className={styles.normalCardsContainer}>
        <h3 className={styles.sectionTitle}>Monstruos y Apoyos ({totalNormalCards}/40)</h3>
        <div className={styles.cardsList}>
          {expandCards(normalCards).map((card) => (
            <div key={card.keyId} className={styles.cardWrapper}>
              <CardItem
                card={card}
                onAction={() => onRemoveCard(card)}
                actionLabel={<FaTrashAlt className={styles.trashIcon} />}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.fusionCardsContainer}>
        <h3 className={styles.sectionTitle}>Fusión ({totalFusionCards}/10)</h3>
        <div className={styles.cardsList}>
          {expandCards(fusionCards).map((card) => (
            <div key={card.keyId} className={styles.cardWrapper}>
              <CardItem
                card={card}
                onAction={() => onRemoveCard(card)}
                actionLabel={<FaTrashAlt className={styles.trashIcon} />}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.cardCounter}>{totalCards}/50 Cartas Totales</div>

      {selectedCard && <CardModal card={selectedCard} onClose={handleCloseModal} />}
    </div>
  );
};

export default CardsSelectedDisplay;
