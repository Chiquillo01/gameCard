import React, { useEffect, useState } from 'react';
import Modal from 'react-modal';
import CardFace from '../../CreateNewDeck/CardModal/CardFace';
import styles from './chestrewardmodal.module.css';

// Small opening sequence: the product image shakes like it's about to pop open, then bursts
// into a flash, and only after that do the obtained cards reveal one by one.
const PHASE_SHAKING = 'shaking';
const PHASE_BURST = 'burst';
const PHASE_REVEALED = 'revealed';

const SHAKE_DURATION_MS = 650;
const BURST_DURATION_MS = 350;

// The card face is drawn at its natural size and scaled to fit.
const FACE_WIDTH = 480;
const FACE_HEIGHT = 700;
const GAP = 12;
const MAX_SCALE = 0.5;
// Room the modal keeps around the cards: its padding/border, the title and the button.
const CHROME_WIDTH = 64;
const CHROME_HEIGHT = 190;

// Copies of the same card shown once with a "×N" (a structure deck brings 2 of most cards).
function groupCards(cards) {
  const groups = new Map();
  cards.forEach((card) => {
    const key = String(card.cardId || card._id || card.name);
    if (groups.has(key)) groups.get(key).count += 1;
    else groups.set(key, { card, count: 1 });
  });
  return [...groups.values()];
}

// The grid that shows every card as big as possible without scrolling: tries every column count
// and keeps the one giving the largest cards that still fit the window.
function fitGrid(count, viewportWidth, viewportHeight) {
  const width = Math.min(viewportWidth * 0.96, 1500) - CHROME_WIDTH;
  const height = viewportHeight * 0.9 - CHROME_HEIGHT;
  let best = { columns: count, scale: 0 };
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const scale = Math.min((width - GAP * (columns - 1)) / (columns * FACE_WIDTH), (height - GAP * (rows - 1)) / (rows * FACE_HEIGHT), MAX_SCALE);
    if (scale > best.scale) best = { columns, scale };
  }
  return best;
}

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

const ChestRewardModal = ({ isOpen, onClose, obtainedCards = [], productImage }) => {
  const [phase, setPhase] = useState(PHASE_SHAKING);
  const viewport = useWindowSize();

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
  const groups = groupCards(obtainedCards);
  const { columns, scale } = fitGrid(Math.max(groups.length, 1), viewport.width, viewport.height);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={isRevealed ? onClose : undefined}
      shouldCloseOnOverlayClick={isRevealed}
      className={`${styles.modal} ${isRevealed ? styles.modalRevealed : ''}`}
      overlayClassName={styles.overlay}
      ariaHideApp={false}
    >
      <h2 className={styles.title}>
        {isRevealed ? `¡Has obtenido ${obtainedCards.length} ${obtainedCards.length === 1 ? 'carta' : 'cartas'}!` : 'Abriendo...'}
      </h2>

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
        <ul className={styles.cardsGrid} style={{ gridTemplateColumns: `repeat(${columns}, ${FACE_WIDTH * scale}px)`, gap: GAP }}>
          {groups.map(({ card, count }, index) => (
            <li
              key={String(card.cardId || card._id || index)}
              className={styles.cardSlot}
              style={{ width: FACE_WIDTH * scale, height: FACE_HEIGHT * scale, animationDelay: `${index * 0.08}s` }}
            >
              <div style={{ width: FACE_WIDTH, height: FACE_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <CardFace card={card} />
              </div>
              {count > 1 && <span className={styles.copies}>×{count}</span>}
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
