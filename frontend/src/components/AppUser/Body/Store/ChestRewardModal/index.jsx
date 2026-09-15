import React, { useEffect, useState } from 'react';
import Modal from 'react-modal';
import styles from './chestrewardmodal.module.css';

// Small opening sequence: the product image shakes like it's about to pop open, then bursts
// into a flash, and only after that do the obtained cards reveal one by one.
const PHASE_SHAKING = 'shaking';
const PHASE_BURST = 'burst';
const PHASE_REVEALED = 'revealed';

const SHAKE_DURATION_MS = 650;
const BURST_DURATION_MS = 350;

const ChestRewardModal = ({ isOpen, onClose, obtainedCards = [], productImage }) => {
  const [phase, setPhase] = useState(PHASE_SHAKING);

  useEffect(() => {
    if (!isOpen) return undefined;

    setPhase(PHASE_SHAKING);
    const toBurst = setTimeout(() => setPhase(PHASE_BURST), SHAKE_DURATION_MS);
    const toRevealed = setTimeout(() => setPhase(PHASE_REVEALED), SHAKE_DURATION_MS + BURST_DURATION_MS);

    return () => {
      clearTimeout(toBurst);
      clearTimeout(toRevealed);
    };
  }, [isOpen]);

  const isRevealed = phase === PHASE_REVEALED;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={isRevealed ? onClose : undefined}
      shouldCloseOnOverlayClick={isRevealed}
      className={styles.modal}
      overlayClassName={styles.overlay}
      ariaHideApp={false}
    >
      <h2 className={styles.title}>{isRevealed ? '¡Has obtenido estas cartas!' : 'Abriendo...'}</h2>

      {!isRevealed && productImage && (
        <div className={styles.openingStage}>
          <img
            src={productImage}
            alt="Abriendo producto"
            className={phase === PHASE_SHAKING ? styles.chestShaking : styles.chestBurst}
          />
          {phase === PHASE_BURST && <div className={styles.burstFlash} />}
        </div>
      )}

      {isRevealed && (
        <ul className={styles.cardsList}>
          {obtainedCards.map((card, index) => (
            <li
              key={index}
              className={styles.cardName}
              style={{ animationDelay: `${index * 0.08}s` }}
            >
              {card.name}
            </li>
          ))}
        </ul>
      )}

      <button className={styles.closeButton} onClick={onClose} disabled={!isRevealed}>
        Aceptar
      </button>
    </Modal>
  );
};

export default ChestRewardModal;
