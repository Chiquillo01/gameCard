import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaFireAlt, FaWater, FaMoon, FaMountain, FaSun, FaWind, FaInfinity } from 'react-icons/fa';
import { FaArrowsRotate } from 'react-icons/fa6';
import { GiFastArrow } from 'react-icons/gi';
import { FiHexagon } from 'react-icons/fi';
import { GoTools } from 'react-icons/go';
import CardModal from '../CardModal';
import styles from './carditem.module.css';

const attributeIcons = {
  fire: FaFireAlt,
  water: FaWater,
  earth: FaMountain,
  darkness: FaMoon,
  light: FaSun,
  wind: FaWind,
};

const supportTypeIcons = {
  normal: FiHexagon,
  continuous: FaInfinity,
  instant: GiFastArrow,
  equipment: GoTools,
  counter: FaArrowsRotate,
};

const rarityColors = {
  legendary: '#ae8d0b',
  epic: 'purple',
  rare: '#B0B0B0',
  common: 'black',
};

const categoryColors = {
  monster: '#5c330a',
  support: '#8892c6',
  fusion: '#543c5a',
};

const typeTranslations = {
  warrior: 'Guerrero',
  zombie: 'Zombie',
  demon: 'Demonio',
  insect: 'Insecto',
  fairy: 'Hada',
  dragon: 'Dragón',
  beast: 'Bestia',
  fish: 'Pez',
  plant: 'Planta',
  machine: 'Máquina',
  rock: 'Roca',
  normal: 'Normal',
  continuous: 'Continua',
  instant: 'Rápida',
  equipment: 'Equipo',
  counter: 'Contrafecto',
};

const CardItem = ({ card, onAction, actionLabel, addCard }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const { name, image, category, rarity, attribute, type, amount } = card;

  const rarityColor = rarityColors[rarity] || 'gray';
  const categoryColor = categoryColors[category] || '#1a1a1a';
  const translatedType = typeTranslations[type] || type;

  const Icon =
    category === 'support'
      ? supportTypeIcons[type?.toLowerCase()] || null
      : attributeIcons[attribute?.toLowerCase()] || null;

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
        className={`${styles.card}`}
        style={{ borderColor: rarityColor, backgroundColor: categoryColor }}
        whileHover={{ scale: 1.05 }}
        onClick={handleCardClick}
      >
        <div className={styles.cardImageContainer}>
          <img src={image || '/assets/CardImg/cardplaceholdertcg.png'} alt={name} className={styles.cardImage} />
        </div>

        <div className={styles.cardDetails}>
          <h3 className={styles.cardName}>{name}</h3>
          <div className={styles.cardFooter}>
            <p className={styles.cardType}>{translatedType}</p>
            {Icon && <Icon className={styles.attributeIcon} />}
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
