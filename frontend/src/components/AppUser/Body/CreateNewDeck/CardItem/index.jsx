import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardModal from '../CardModal';
import {
  RARITY_COLORS,
  CATEGORY_COLORS,
  getTypeLabel,
  getTypeIcon,
  getTypeBadgeColor,
  getContrastColor,
} from '../../../../../lib/utils/cardDisplay';
import { LEVEL_BADGE_IMAGES } from '../../../../../lib/utils/levelBadges';
import styles from './carditem.module.css';

const CardItem = ({ card, onAction, actionLabel, addCard, showAmount, compact }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const { name, image, category, rarity, level, atk, def, amount, family } = card;

  const rarityColor = RARITY_COLORS[rarity] || 'gray';
  const categoryColor = CATEGORY_COLORS[category] || '#1a1a1a';
  const typeLabel = getTypeLabel(card);
  // The corner badge shows this card's type either way — its attribute for a monster/fusion,
  // its subtype (Equipo/Reino/Veloz/...) for a support — so a support card isn't left with an
  // empty corner just because it has no elemental attribute.
  const TypeIcon = getTypeIcon(card);
  const badgeColor = getTypeBadgeColor(card, rarityColor);
  const badgeIconColor = getContrastColor(badgeColor);
  // In an inventory-style list (the collection, or the deck-builder's "add a card" browser) how
  // many copies you own is more useful here than combat stats — full stats are still one click
  // away in CardModal. Everywhere else (e.g. a deck's already-picked cards, one tile per copy)
  // keeps showing ATK/DEF.
  const showStats = !showAmount && (category === 'monster' || category === 'fusion');

  const handleCardClick = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // Only the "add a card to the deck" context (the collection browser) is draggable — dragging a
  // card already in the deck, or a read-only collection view, wouldn't have a meaningful target.
  const handleDragStart = (event) => {
    event.dataTransfer.setData('application/json', JSON.stringify(card));
    event.dataTransfer.effectAllowed = 'copy';
  };

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth <= 820);
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <>
      {/* A plain div, not motion.div — framer-motion redefines onDragStart/onDragEnd for its own
          pan-based drag gesture (which only activates with a `drag` prop), so it would swallow
          the native HTML5 drag-and-drop events this needs instead of forwarding them. */}
      <div
        className={`${styles.card} ${compact ? styles.cardCompact : ''}`}
        style={{ borderColor: rarityColor, backgroundColor: categoryColor, cursor: addCard ? 'grab' : 'pointer' }}
        draggable={addCard}
        onDragStart={addCard ? handleDragStart : undefined}
        onClick={handleCardClick}
      >
        {level != null && LEVEL_BADGE_IMAGES[level - 1] && (
          <img src={LEVEL_BADGE_IMAGES[level - 1]} alt={`Nivel ${level}`} className={styles.levelBadge} />
        )}
        {TypeIcon && (
          <span className={styles.attributeBadge} style={{ backgroundColor: badgeColor, color: badgeIconColor }} title={typeLabel}>
            <TypeIcon />
          </span>
        )}

        <div className={styles.cardImageContainer}>
          <img src={image || '/assets/CardImg/cardplaceholdertcg.png'} alt={name} className={styles.cardImage} />
        </div>

        <div className={styles.cardDetails}>
          <div className={styles.cardFooter}>
            <h3 className={styles.cardName}>{name}</h3>
            {showStats && (
              <span className={styles.statBadge}>
                {atk ?? 0}/{def ?? 0}
              </span>
            )}
            {showAmount && <span className={styles.statBadge}>x{amount ?? 1}</span>}
          </div>
          {family && <p className={styles.cardFamily}>{family}</p>}
        </div>

        {actionLabel && onAction && (
          <motion.button
            className={styles.addButton}
            onClick={(event) => {
              event.stopPropagation();
              onAction(card);
            }}
            whileHover={{ scale: 1.1 }}
          >
            {addCard && isSmallScreen ? '+' : actionLabel}
          </motion.button>
        )}
      </div>

      <AnimatePresence>{isModalOpen && <CardModal card={card} onClose={handleCloseModal} />}</AnimatePresence>
    </>
  );
};

export default CardItem;
