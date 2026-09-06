import { useState } from 'react';
import StoreModal from '../StoreModal';
import styles from './productcard.module.css';

const PAYMENT_OPTIONS = [
  {
    method: 'pixelcoins',
    icon: 'https://res.cloudinary.com/dsd7efrba/image/upload/v1739100321/moneda3tcg_hmxpum.png',
    label: 'Pixelcoins',
  },
  {
    method: 'pixelgems',
    icon: 'https://res.cloudinary.com/dsd7efrba/image/upload/v1739100320/gema4tcg_laiqk5.png',
    label: 'Pixelgems',
  },
];

const ProductCard = ({ product, onBuy }) => {
  const [buyingWith, setBuyingWith] = useState(null);

  const priceOptions = PAYMENT_OPTIONS.filter((option) => product.price[option.method]).map((option) => ({
    ...option,
    amount: product.price[option.method],
    canAfford: product[`canAfford${option.method === 'pixelcoins' ? 'Pixelcoins' : 'Pixelgems'}`],
  }));

  if (product.price.euros) {
    priceOptions.push({ method: 'euros', icon: null, label: 'Euros', amount: product.price.euros, canAfford: true });
  }

  return (
    <div className={styles.productCard}>
      <img src={product.imageUrl} alt={product.name} className={styles.productImage} />
      <h3 className={styles.productTitle}>{product.name}</h3>
      <p className={styles.productDescription}>{product.description}</p>

      <div className={styles.buyOptions}>
        {priceOptions.map((option) => (
          <button
            key={option.method}
            onClick={() => setBuyingWith(option.method)}
            disabled={!option.canAfford}
            className={styles.buyButton}
            title={option.canAfford ? `Comprar con ${option.label}` : 'Saldo insuficiente'}
          >
            {option.icon && <img src={option.icon} alt={option.label} className={styles.icon} />}
            <span>{option.method === 'euros' ? `${option.amount} €` : option.amount}</span>
          </button>
        ))}
      </div>

      <StoreModal
        isOpen={!!buyingWith}
        paymentMethod={buyingWith}
        onClose={() => setBuyingWith(null)}
        onConfirm={(product, paymentMethod) => onBuy(product, paymentMethod, () => setBuyingWith(null))}
        product={product}
      />
    </div>
  );
};

export default ProductCard;
