import styles from './sort.module.css';
import { useState } from 'react';
import { FaSortAmountDown, FaArrowUp, FaArrowDown } from 'react-icons/fa';

const Sort = ({ onSortChange }) => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  const togglePopup = () => {
    setIsPopupOpen((prev) => !prev);
  };

  const handleSortChange = (field, order) => {
    onSortChange({ field, order });
    setIsPopupOpen(false);
  };

  return (
    <div className={styles.sortPopupContainer}>
      <button className={styles.sortButton} onClick={togglePopup}>
        <FaSortAmountDown />
      </button>

      {isPopupOpen && (
        <div className={styles.popupMenu}>
          <h4>Ordenar por:</h4>
          <div className={styles.sortOptionRow}>
            <span>Nivel:</span>
            <div className={styles.iconButtons}>
              <FaArrowUp className={styles.sortIcon} onClick={() => handleSortChange('level', 'asc')} />
              <FaArrowDown className={styles.sortIcon} onClick={() => handleSortChange('level', 'desc')} />
            </div>
          </div>
          <div className={styles.sortOptionRow}>
            <span>Fecha de creación:</span>
            <div className={styles.iconButtons}>
              <FaArrowUp className={styles.sortIcon} onClick={() => handleSortChange('createdAt', 'asc')} />
              <FaArrowDown className={styles.sortIcon} onClick={() => handleSortChange('createdAt', 'desc')} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sort;
