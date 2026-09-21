import React from 'react';
import ReactMarkdown from 'react-markdown';
import { FaHeart } from 'react-icons/fa';
import { GiBroadsword } from 'react-icons/gi';
import {
  RARITY_COLORS,
  RARITY_LABELS,
  CATEGORY_COLORS,
  getTypeLabel,
  getTypeIcon,
  getTypeBadgeColor,
  getContrastColor,
} from '../../../../../lib/utils/cardDisplay';
import { LEVEL_BADGE_IMAGES } from '../../../../../lib/utils/levelBadges';
import styles from './cardmodal.module.css';

export const EffectDisplay = ({ effect }) => {
  const formattedEffect = effect
    .replace(/\{\{(.*?)\}\}/g, (match, p1) => `_${p1.toLowerCase()}_`)
    .replace(/\n/g, '\n\n');

  return <ReactMarkdown>{formattedEffect}</ReactMarkdown>;
};

// The card itself (border, name, art, effect text, Atk/Vida) — shared by the card modal and the
// duel's hover preview. `style` lets the caller size/scale it; `onClick` is for the modal.
const CardFace = ({ card, style, onClick }) => {
  const { name, image, rarity, category, expansion, atk, def, effect, level, family, invocationText } = card;

  const rarityColor = RARITY_COLORS[rarity] || 'gray';
  const categoryColor = CATEGORY_COLORS[category] || '#1a1a1a';
  const translatedRarity = RARITY_LABELS[rarity] || rarity;
  const translatedType = getTypeLabel(card);
  const showStats = category === 'monster' || category === 'fusion';
  // A monster/fusion card's breed is already in `translatedType` (e.g. "Dragón") — pairing it
  // with the broader `family` group (e.g. "Marino") gives "Marino · Dragón". A support card has
  // no family, so this just falls back to its subtype (e.g. "Reino").
  const familyClassLabel = [family, translatedType].filter(Boolean).join(' · ');

  const Icon = getTypeIcon(card);
  const badgeColor = getTypeBadgeColor(card, rarityColor);
  const badgeIconColor = getContrastColor(badgeColor);

  return (
    <div
      className={styles.modalContent}
      style={{ borderColor: rarityColor, backgroundColor: categoryColor, ...style }}
      onClick={onClick}
    >
      {/* Rareza */}
      <div className={styles.rarityBadge} style={{ backgroundColor: rarityColor }}>
        {translatedRarity}
      </div>

      {/* Nivel (esquina izquierda) */}
      {level != null && LEVEL_BADGE_IMAGES[level - 1] && (
        <div className={styles.levelBadge}>
          <img src={LEVEL_BADGE_IMAGES[level - 1]} alt={`Nivel ${level}`} />
        </div>
      )}

      {/* Atributo (esquina derecha) */}
      {Icon && (
        <span className={styles.attributeIcon} style={{ backgroundColor: badgeColor, color: badgeIconColor }}>
          <Icon />
        </span>
      )}

      {/* Nombre */}
      <div className={styles.cardTopRow}>
        <h2 className={styles.cardName}>{name}</h2>
      </div>

      {/* Imagen */}
      <div className={styles.cardImageContainer}>
        <img src={image} alt={name} className={styles.modalImage} />
      </div>

      {/* Detalles */}
      <div className={styles.cardDetails}>
        {/* Familia y Clase | Colección */}
        <div className={styles.metaRow}>
          <span className={styles.cardFamily}>{familyClassLabel}</span>
          <span className={styles.cardExpansion}>{expansion}</span>
        </div>

        {/* Texto del efecto + método de invocación, mismo bloque pero con su propio color */}
        <div className={styles.cardText}>
          {effect ? <EffectDisplay effect={effect} /> : <p>Esta carta no tiene efecto.</p>}
          {invocationText && <p className={styles.invocationText}>{invocationText}</p>}
        </div>

        {/* Atk y Vida */}
        {showStats && (
          <div className={styles.cardFooter}>
            <span className={styles.statItem}>
              <GiBroadsword className={styles.atkIcon} />
              {atk || '0'}
            </span>
            <span className={styles.statSeparator}>/</span>
            <span className={styles.statItem}>
              <FaHeart className={styles.lifeIcon} />
              {def || '0'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CardFace;
