import React from 'react';
import Modal from 'react-modal';
import styles from './storemodal.module.css';
import { useUser } from '../../../../../context/userContext';

const PAYMENT_LABELS = {
  pixelcoins: {
    icon: 'https://res.cloudinary.com/dsd7efrba/image/upload/v1739100321/moneda3tcg_hmxpum.png',
    unit: 'Pixelcoins',
  },
  pixelgems: {
    icon: 'https://res.cloudinary.com/dsd7efrba/image/upload/v1739100320/gema4tcg_laiqk5.png',
    unit: 'Pixelgems',
  },
};

const StoreModal = ({ isOpen, onClose, onConfirm, product, paymentMethod }) => {
  const { updateUser } = useUser();

  if (!product) return null;

  const handleConfirm = async () => {
    if (typeof onConfirm !== 'function') {
      return;
    }

    try {
      const response = await onConfirm(product, paymentMethod);
      if (response?.data?.newBalance) {
        updateUser(response.data.newBalance);
      }
      onClose();
    } catch (error) {}
  };

  const amount = paymentMethod ? product.price[paymentMethod] : null;
  const payment = PAYMENT_LABELS[paymentMethod];

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className={styles.modal}
      overlayClassName={styles.overlay}
      ariaHideApp={false}
    >
      <h2 className={styles.title}>Confirmar compra</h2>
      <p className={styles.description}>
        Comprar <strong>{product.name}</strong> por:
      </p>

      <div className={styles.priceContainer}>
        {payment ? (
          <div className={styles.price}>
            <img src={payment.icon} alt={payment.unit} className={styles.icon} />
            <span>
              {amount} {payment.unit}
            </span>
          </div>
        ) : (
          <div className={styles.price}>
            💵 <span>{product.price.euros} Euros</span>
          </div>
        )}
      </div>

      <div className={styles.buttons}>
        <button onClick={handleConfirm} className={styles.confirm}>
          Comprar
        </button>
        <button onClick={onClose} className={styles.cancel}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
};

export default StoreModal;
