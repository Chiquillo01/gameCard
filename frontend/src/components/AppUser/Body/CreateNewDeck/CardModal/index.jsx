import React from 'react';
import ReactMarkdown from 'react-markdown';
import { FaFireAlt, FaWater, FaMoon, FaMountain, FaSun, FaWind, FaInfinity } from 'react-icons/fa';
import { FaArrowsRotate } from 'react-icons/fa6';
import { GiFastArrow } from 'react-icons/gi';
import { FiHexagon } from 'react-icons/fi';
import { GoTools } from 'react-icons/go';
import { effectDescriptions } from '../../../../../lib/utils/effectGlossary';
import styles from './cardmodal.module.css';
import level1 from '/assets/CardImg/1.png';
import level2 from '/assets/CardImg/2.png';
import level3 from '/assets/CardImg/3.png';
import level4 from '/assets/CardImg/4.png';
import level5 from '/assets/CardImg/5.png';
import level6 from '/assets/CardImg/6.png';
import level7 from '/assets/CardImg/7.png';
import level8 from '/assets/CardImg/8.png';

const levelImages = [level1, level2, level3, level4, level5, level6, level7, level8];

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

const rarityTranslations = {
  legendary: 'Legendaria',
  epic: 'Épica',
  rare: 'Rara',
  common: 'Común',
};

const categoryTranslations = {
  monster: 'Monstruo',
  support: 'Apoyo',
  fusion: 'Fusión',
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

const EffectDisplay = ({ effect }) => {
  const formattedEffect = effect
    .replace(/\{\{(.*?)\}\}/g, (match, p1) => `_${p1.toLowerCase()}_`)
    .replace(/\n/g, '\n\n');

  return <ReactMarkdown>{formattedEffect}</ReactMarkdown>;
};

const CardModal = ({ card, onClose }) => {
  const { name, image, type, rarity, attribute, description, category, expansion, atk, def, effect, level } = card;

  const rarityColor = rarityColors[rarity] || 'gray';
  const categoryColor = categoryColors[category] || '#1a1a1a';
  const translatedRarity = rarityTranslations[rarity] || rarity;
  const translatedCategory = categoryTranslations[category] || category;
  const translatedType = typeTranslations[type] || type;

  const Icon =
    category === 'support'
      ? supportTypeIcons[type?.toLowerCase()] || null
      : attributeIcons[attribute?.toLowerCase()] || null;

  const detectedEffects = Object.keys(effectDescriptions).filter((keyword) => effect.includes(`{{${keyword}}}`));

  return (
    <div className={styles.modalBackground} onClick={onClose}>
      <div className={styles.modalWrapper}>
        <div
          className={styles.modalContent}
          style={{
            borderColor: rarityColor,
            backgroundColor: categoryColor,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Nivel */}
          {level && (
            <div className={styles.levelBadge}>
              <img src={levelImages[level - 1]} alt={`Nivel ${level}`} />
            </div>
          )}
          {/* Rareza */}
          <div className={styles.rarityBadge} style={{ backgroundColor: rarityColor }}>
            {translatedRarity}
          </div>
          {/* Imagen */}
          <div className={styles.cardImageContainer}>
            <img src={image} alt={name} className={styles.modalImage} />
          </div>
          {/* Detalles */}
          <div className={styles.cardDetails}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardName}>{name}</h2>
              {Icon && <Icon className={styles.attributeIcon} />}
            </div>

            <p className={styles.cardType}>{translatedType}</p>

            {/* Efecto */}
            <div className={styles.cardText}>
              {effect ? <EffectDisplay effect={effect} /> : <p>Esta carta no tiene efecto.</p>}
            </div>

            <div className={styles.cardFooter}>
              <p className={styles.expansion}>{expansion}</p>
              {(atk || def) && (
                <p className={styles.atkDef}>
                  {atk || '0'} / {def || '0'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Caja de información adicional */}
        <div className={styles.cardInfoBox}>
          <h2 className={styles.cardInfoName}>{name}</h2>
          <div className={styles.infoRow}>
            <p className={styles.cardInfoCategory}>{translatedCategory}</p>
            {Icon && <Icon className={styles.attributeInfoIcon} />}
            <p className={styles.cardInfoType}>{translatedType}</p>
          </div>
          <h3>Descripción</h3>
          <p className={styles.cardDescription}>{description}</p>
          <h3>Efecto</h3>
          <p className={styles.cardEffect}>
            {effect ? <EffectDisplay effect={effect} /> : 'Esta carta no tiene efecto.'}
          </p>

          {/* Glosario */}
          {detectedEffects.length > 0 && (
            <>
              <h3>Glosario</h3>
              {detectedEffects.map((keyword) => {
                const formattedKeyword = keyword
                  .replace(/_/g, ' ')
                  .toLowerCase()
                  .replace(/\b\w/g, (char) => char.toUpperCase());
                return (
                  <p key={keyword} className={styles.cardDescription}>
                    <strong>
                      <em>{formattedKeyword}</em>:
                    </strong>{' '}
                    {effectDescriptions[keyword]}
                  </p>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CardModal;
