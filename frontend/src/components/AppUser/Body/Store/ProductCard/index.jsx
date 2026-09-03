import { useState } from 'react';
import StoreModal from '../StoreModal';
import styles from './productcard.module.css';

const ProductCard = ({ product, onBuy }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className={styles.productCard}>
      <img src={product.imageUrl} alt={product.name} className={styles.productImage} />
      <h3 className={styles.productTitle}>{product.name}</h3>
      <p className={styles.productDescription}>{product.description}</p>

      <div className={styles.priceContainer}>
        {product.price.pixelcoins && (
          <div className={styles.price}>
            <img
              src='https://res.cloudinary.com/dsd7efrba/image/upload/v1739100321/moneda3tcg_hmxpum.png'
              alt='Pixelcoins'
              className={styles.icon}
            />
            <span>{product.price.pixelcoins}</span>
          </div>
        )}
        {product.price.pixelgems && (
          <div className={styles.price}>
            <img
              src='https://res.cloudinary.com/dsd7efrba/image/upload/v1739100320/gema4tcg_laiqk5.png'
              alt='Pixelgems'
              className={styles.icon}
            />
            <span>{product.price.pixelgems}</span>
          </div>
        )}
        {product.price.euros && (
          <div className={styles.price}>
            <span>💵 {product.price.euros} €</span>
          </div>
        )}
      </div>

      <button onClick={() => setIsModalOpen(true)} disabled={!product.canAfford} className={styles.buyButton}>
        {product.canAfford ? 'Comprar' : 'Saldo insuficiente'}
      </button>

      <StoreModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={(product) => onBuy(product, () => setIsModalOpen(false))}
        product={product}
      />
    </div>
  );
};

export default ProductCard;
