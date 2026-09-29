import React from 'react';
import ProductCard from '../ProductCard';
import styles from './productlist.module.css';

// "¡Próximamente!" only once the catalog has arrived and this category really is empty — not
// while it's still loading, and not when loading failed.
const EMPTY_TEXT = {
  loading: 'Cargando productos...',
  error: 'No se ha podido cargar la tienda. Recarga la página para intentarlo de nuevo.',
  ready: '¡Próximamente!',
};

const ProductList = ({ products, onBuy, loadState = 'ready' }) => {
  const showProducts = loadState === 'ready' && products.length > 0;
  return (
    <div className={styles.productlist}>
      <div className={styles.grid}>
        {showProducts ? (
          products.map((product) => <ProductCard key={product._id} product={product} onBuy={onBuy} />)
        ) : (
          <p className={styles.noProducts}>{EMPTY_TEXT[loadState]}</p>
        )}
      </div>
    </div>
  );
};

export default ProductList;
