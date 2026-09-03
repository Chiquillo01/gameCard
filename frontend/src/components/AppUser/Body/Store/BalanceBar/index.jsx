import React from 'react';
import styles from './balancebar.module.css';

const BalanceBar = ({ balance }) => {
  return (
    <div className={styles.balancebar}>
      <div className={styles.balanceitem}>
        <img
          src='https://res.cloudinary.com/dsd7efrba/image/upload/v1739100321/moneda3tcg_hmxpum.png'
          alt='Pixelcoins'
          className={styles.icon}
        />
        <span>{balance.pixelcoins}</span> Pixelcoins
      </div>
      <div className={styles.balanceitem}>
        <img
          src='https://res.cloudinary.com/dsd7efrba/image/upload/v1739100320/gema4tcg_laiqk5.png'
          alt='Pixelgems'
          className={styles.icon}
        />
        <span>{balance.pixelgems}</span> Pixelgems
      </div>
    </div>
  );
};

export default BalanceBar;
