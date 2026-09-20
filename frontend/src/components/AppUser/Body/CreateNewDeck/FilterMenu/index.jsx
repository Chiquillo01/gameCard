import React from 'react';
import { FaTrashAlt } from 'react-icons/fa';
import { CATEGORY_LABELS, RARITY_LABELS, SUPPORT_SUBTYPE_LABELS } from '../../../../../lib/utils/cardDisplay';
import styles from './filtermenu.module.css';

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

// Category and rarity have a small, fixed, known set of values, so they're listed directly —
// but a "type" (a card's breed, e.g. "Dragón") has dozens of possible values and grows as new
// cards are added, so its options come from `availableTypes` (whatever's actually in the
// player's collection right now) instead of a list that would just go stale again.
const FilterMenu = ({ filters, onFilterChange, onClearFilters, availableCategories = [], availableTypes = [], availableAttributes = [], availableFamilies = [] }) => {
  const categoryOptions = availableCategories.length
    ? availableCategories
    : Object.keys(CATEGORY_LABELS);
  const rarityOptions = RARITY_ORDER;

  const typeLabel = (type) => SUPPORT_SUBTYPE_LABELS[type] || type;

  return (
    <div className={styles.filterMenu}>
      <div className={styles.filterSection}>
        <h5>Categoría</h5>
        <select
          value={filters.category}
          onChange={(e) => onFilterChange('category', e.target.value)}
          className={styles.select}
        >
          <option value=''>Todas</option>
          {categoryOptions.map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABELS[key] || key}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterSection}>
        <h5>Tipo</h5>
        <select value={filters.type} onChange={(e) => onFilterChange('type', e.target.value)} className={styles.select}>
          <option value=''>Todos</option>
          {availableTypes.map((type) => (
            <option key={type} value={type}>
              {typeLabel(type)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterSection}>
        <h5>Atributo</h5>
        <select
          value={filters.attribute}
          onChange={(e) => onFilterChange('attribute', e.target.value)}
          className={styles.select}
        >
          <option value=''>Todos</option>
          {availableAttributes.map((attribute) => (
            <option key={attribute} value={attribute}>
              {attribute}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterSection}>
        <h5>Familia</h5>
        <select
          value={filters.family}
          onChange={(e) => onFilterChange('family', e.target.value)}
          className={styles.select}
        >
          <option value=''>Todas</option>
          {availableFamilies.map((family) => (
            <option key={family} value={family}>
              {family}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.filterSection}>
        <h5>Rareza</h5>
        <select
          value={filters.rarity}
          onChange={(e) => onFilterChange('rarity', e.target.value)}
          className={styles.select}
        >
          <option value=''>Todas</option>
          {rarityOptions.map((key) => (
            <option key={key} value={key}>
              {RARITY_LABELS[key]}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.filterSection}>
        <button className={styles.clearButton} onClick={onClearFilters}>
          <FaTrashAlt className={styles.icon} /> Limpiar Filtros
        </button>
      </div>
    </div>
  );
};

export default FilterMenu;
