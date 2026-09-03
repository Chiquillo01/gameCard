import React from 'react';
import ProductCard from '../ProductCard';
import styles from './productlist.module.css';

const ProductList = ({ products, onBuy }) => {
  return (
    <div className={styles.productlist}>
      <div className={styles.grid}>
        {products.length > 0 ? (
          products.map((product) => <ProductCard key={product._id} product={product} onBuy={onBuy} />)
        ) : (
          <p className={styles.noProducts}>¡Próximamente!</p>
        )}
      </div>
    </div>
  );
};

export default ProductList;
