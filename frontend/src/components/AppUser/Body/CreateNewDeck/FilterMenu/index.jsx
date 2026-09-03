import React from 'react';
import { FaTrashAlt } from 'react-icons/fa';
import styles from './filtermenu.module.css';

const FilterMenu = ({ filters, onFilterChange, onClearFilters }) => {
  const categories = [
    { key: 'monster', value: 'Monstruo' },
    { key: 'support', value: 'Apoyo' },
    { key: 'fusion', value: 'Fusión' },
  ];
  const types = [
    { key: 'beast', value: 'Bestia' },
    { key: 'warrior', value: 'Guerrero' },
    { key: 'demon', value: 'Demonio' },
    { key: 'fairy', value: 'Hada' },
    { key: 'zombie', value: 'Zombie' },
    { key: 'plant', value: 'Planta' },
    { key: 'machine', value: 'Máquina' },
    { key: 'insect', value: 'Insecto' },
    { key: 'dragon', value: 'Dragón' },
    { key: 'fish', value: 'Pez' },
    { key: 'rock', value: 'Roca' },
    { key: 'normal', value: 'Normal' },
    { key: 'instant', value: 'Rápida' },
    { key: 'equipment', value: 'Equipo' },
    { key: 'continuous', value: 'Continua' },
    { key: 'counter', value: 'Contraefecto' },
  ];
  const attributes = [
    { key: 'water', value: 'Agua' },
    { key: 'fire', value: 'Fuego' },
    { key: 'darkness', value: 'Oscuridad' },
    { key: 'light', value: 'Luz' },
    { key: 'earth', value: 'Tierra' },
    { key: 'wind', value: 'Viento' },
  ];
  const rarities = [
    { key: 'common', value: 'Común' },
    { key: 'rare', value: 'Rara' },
    { key: 'epic', value: 'Épica' },
    { key: 'legendary', value: 'Legendaria' },
  ];

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
          {categories.map(({ key, value }) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.filterSection}>
        <h5>Tipo</h5>
        <select value={filters.type} onChange={(e) => onFilterChange('type', e.target.value)} className={styles.select}>
          <option value=''>Todos</option>
          {types.map(({ key, value }) => (
            <option key={key} value={key}>
              {value}
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
          {attributes.map(({ key, value }) => (
            <option key={key} value={key}>
              {value}
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
          {rarities.map(({ key, value }) => (
            <option key={key} value={key}>
              {value}
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
