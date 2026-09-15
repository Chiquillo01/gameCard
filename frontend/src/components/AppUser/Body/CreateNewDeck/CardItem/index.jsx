import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardModal from '../CardModal';
import { ATTRIBUTE_ICONS, RARITY_COLORS, CATEGORY_COLORS, getTypeLabel, getTypeIcon } from '../../../../../lib/utils/cardDisplay';
import { LEVEL_BADGE_IMAGES } from '../../../../../lib/utils/levelBadges';
import styles from './carditem.module.css';

const CardItem = ({ card, onAction, actionLabel, addCard, showAmount }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const { name, image, category, rarity, level, atk, def, amount } = card;

  const rarityColor = RARITY_COLORS[rarity] || 'gray';
  const categoryColor = CATEGORY_COLORS[category] || '#1a1a1a';
  const typeLabel = getTypeLabel(card);
  const Icon = getTypeIcon(card);
  const AttributeIcon = category !== 'support' ? ATTRIBUTE_ICONS[card.attribute] : null;
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
      <motion.div
        className={styles.card}
        style={{ borderColor: rarityColor, backgroundColor: categoryColor }}
        whileHover={{ scale: 1.05 }}
        onClick={handleCardClick}
      >
        {level != null && LEVEL_BADGE_IMAGES[level - 1] && (
          <img src={LEVEL_BADGE_IMAGES[level - 1]} alt={`Nivel ${level}`} className={styles.levelBadge} />
        )}
        {AttributeIcon && (
          <span className={styles.attributeBadge} style={{ backgroundColor: rarityColor }}>
            <AttributeIcon />
          </span>
        )}

        <div className={styles.cardImageContainer}>
          <img src={image || '/assets/CardImg/cardplaceholdertcg.png'} alt={name} className={styles.cardImage} />
        </div>

        <div className={styles.cardDetails}>
          <h3 className={styles.cardName}>{name}</h3>
          <div className={styles.cardFooter}>
            <p className={styles.cardType}>
              {Icon && <Icon className={styles.typeIcon} />}
              {typeLabel}
            </p>
            {showStats && (
              <span className={styles.statBadge}>
                {atk ?? 0}/{def ?? 0}
              </span>
            )}
            {showAmount && <span className={styles.statBadge}>x{amount ?? 1}</span>}
          </div>
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
      </motion.div>

      <AnimatePresence>{isModalOpen && <CardModal card={card} onClose={handleCloseModal} />}</AnimatePresence>
    </>
  );
};

export default CardItem;
