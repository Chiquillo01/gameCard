import styles from './storefilter.module.css';
import { STORE_CATEGORIES } from '../../../../../lib/utils/storeConstants';

const StoreFilter = ({ selectedCategory, setSelectedCategory }) => {
  return (
    <div className={styles.filterContainer}>
      <h3 className={styles.filterTitle}>Filtrar por</h3>
      {STORE_CATEGORIES.map(({ id, label }) => (
        <button
          key={id}
          className={`${styles.filterButton} ${selectedCategory === id ? styles.active : ''}`}
          onClick={() => setSelectedCategory(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export default StoreFilter;
