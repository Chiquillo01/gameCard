import React from 'react';
import Modal from 'react-modal';
import styles from './chestrewardmodal.module.css';

const ChestRewardModal = ({ isOpen, onClose, obtainedCards }) => {
  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className={styles.modal}
      overlayClassName={styles.overlay}
      ariaHideApp={false}
    >
      <h2 className={styles.title}>¡Has obtenido estas cartas!</h2>

      <ul className={styles.cardsList}>
        {obtainedCards.map((card, index) => (
          <li key={index} className={styles.cardName}>
            {card.name}
          </li>
        ))}
      </ul>

      <button className={styles.closeButton} onClick={onClose}>
        Aceptar
      </button>
    </Modal>
  );
};

export default ChestRewardModal;
