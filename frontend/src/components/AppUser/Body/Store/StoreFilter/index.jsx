import styles from './storefilter.module.css';

const StoreFilter = ({ selectedCategory, setSelectedCategory }) => {
  return (
    <div className={styles.filterContainer}>
      <h3 className={styles.filterTitle}>Filtrar por</h3>
      <button
        className={`${styles.filterButton} ${selectedCategory === 'all' ? styles.active : ''}`}
        onClick={() => setSelectedCategory('all')}
      >
        Todos los productos
      </button>
      <button
        className={`${styles.filterButton} ${selectedCategory === 'chest' ? styles.active : ''}`}
        onClick={() => setSelectedCategory('chest')}
      >
        Cofres
      </button>
      <button
        className={`${styles.filterButton} ${selectedCategory === 'structure' ? styles.active : ''}`}
        onClick={() => setSelectedCategory('structure')}
      >
        Mazos de Estructura
      </button>
      <button
        className={`${styles.filterButton} ${selectedCategory === 'pixelgems' ? styles.active : ''}`}
        onClick={() => setSelectedCategory('pixelgems')}
      >
        Packs de Pixelgems
      </button>
    </div>
  );
};

export default StoreFilter;
