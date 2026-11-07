import React from 'react';
import styles from './balancebar.module.css';
import { PIXELCOIN_ICON, PIXELGEM_ICON } from '../../../../../lib/utils/storeConstants';

const BalanceBar = ({ balance }) => {
  return (
    <div className={styles.balancebar}>
      <div className={styles.balanceItems}>
        <div className={styles.balanceitem}>
          <img
            src={PIXELCOIN_ICON}
            alt='Pixelcoins'
            className={styles.icon}
          />
          <span>{balance.pixelcoins}</span> Pixelcoins
        </div>
        <div className={styles.balanceitem}>
          <img
            src={PIXELGEM_ICON}
            alt='Pixelgems'
            className={styles.icon}
          />
          <span>{balance.pixelgems}</span> Pixelgems
        </div>
      </div>
    </div>
  );
};

export default BalanceBar;
