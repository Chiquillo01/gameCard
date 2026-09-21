import React from 'react';
import { createPortal } from 'react-dom';
import { effectDescriptions } from '../../../../../lib/utils/effectGlossary';
import { CATEGORY_LABELS, getTypeLabel } from '../../../../../lib/utils/cardDisplay';
import CardFace, { EffectDisplay } from './CardFace';
import styles from './cardmodal.module.css';

const CardModal = ({ card, onClose }) => {
  const { name, category, description, effect } = card;

  const translatedCategory = CATEGORY_LABELS[category] || category;
  const translatedType = getTypeLabel(card);

  const detectedEffects = Object.keys(effectDescriptions).filter((keyword) => (effect || '').includes(`{{${keyword}}}`));

  // Rendered on document.body instead of in place: CardItem sits inside elements that get a CSS
  // transform on hover/drag (.cardWrapper, the drag-and-drop card itself), and a transformed
  // ancestor becomes the containing block for `position: fixed` descendants — which trapped this
  // full-screen overlay inside the tiny card tile instead of covering the viewport.
  return createPortal(
    <div className={styles.modalBackground} onClick={onClose}>
      <div className={styles.modalWrapper}>
        <CardFace card={card} onClick={(e) => e.stopPropagation()} />

        {/* Caja de información adicional */}
        <div className={styles.cardInfoBox}>
          <h2 className={styles.cardInfoName}>{name}</h2>
          <div className={styles.infoRow}>
            <p className={styles.cardInfoCategory}>{translatedCategory}</p>
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
    </div>,
    document.body,
  );
};

export default CardModal;
