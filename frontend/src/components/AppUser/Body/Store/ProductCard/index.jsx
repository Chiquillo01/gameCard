import { useState } from 'react';
import StoreModal from '../StoreModal';
import { BULK_QUANTITY } from '../../../../../lib/utils/storeConstants';
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
  const [buyingQuantity, setBuyingQuantity] = useState(1);

  const priceOptions = PAYMENT_OPTIONS.filter((option) => product.price[option.method]).map((option) => {
    const suffix = option.method === 'pixelcoins' ? 'Pixelcoins' : 'Pixelgems';
    return {
      ...option,
      amount: product.price[option.method],
      canAfford: product[`canAfford${suffix}`],
      canAffordBulk: product[`canAfford${suffix}Bulk`],
    };
  });

  if (product.price.euros) {
    priceOptions.push({ method: 'euros', icon: null, label: 'Euros', amount: product.price.euros, canAfford: true });
  }

  const openBuyModal = (method, quantity) => {
    setBuyingQuantity(quantity);
    setBuyingWith(method);
  };

  return (
    <div className={styles.productCard}>
      <img src={product.imageUrl} alt={product.name} className={styles.productImage} />
      <h3 className={styles.productTitle}>{product.name}</h3>
      <p className={styles.productDescription}>{product.description}</p>

      <div className={styles.buyOptions}>
        {priceOptions.map((option) => (
          <div key={option.method} className={styles.buyOptionGroup}>
            <button
              onClick={() => openBuyModal(option.method, 1)}
              disabled={!option.canAfford}
              className={styles.buyButton}
              title={option.canAfford ? `Comprar con ${option.label}` : 'Saldo insuficiente'}
            >
              {option.icon && <img src={option.icon} alt={option.label} className={styles.icon} />}
              <span>{option.method === 'euros' ? `${option.amount} €` : option.amount}</span>
            </button>

            {option.canAffordBulk && (
              <button
                onClick={() => openBuyModal(option.method, BULK_QUANTITY)}
                className={styles.bulkButton}
                title={`Comprar ${BULK_QUANTITY} de una vez con ${option.label}`}
              >
                x{BULK_QUANTITY}
              </button>
            )}
          </div>
        ))}
      </div>

      <StoreModal
        isOpen={!!buyingWith}
        paymentMethod={buyingWith}
        quantity={buyingQuantity}
        onClose={() => setBuyingWith(null)}
        onConfirm={(product, paymentMethod, quantity) =>
          onBuy(product, paymentMethod, quantity, () => setBuyingWith(null))
        }
        product={product}
      />
    </div>
  );
};

export default ProductCard;
