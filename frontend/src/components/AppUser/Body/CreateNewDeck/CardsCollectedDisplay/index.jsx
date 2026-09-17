import { useState, useRef } from 'react';
import { FaFilter, FaSortAmountDown } from 'react-icons/fa';
import SearchBar from '../SearchBar';
import FilterMenu from '../FilterMenu';
import CardItem from '../CardItem';
import styles from './cardscollecteddisplay.module.css';

const RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3 };

const CardsCollectedDisplay = ({ cards, addCard, onAddCard }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [sortVisible, setSortVisible] = useState(false);
  // Single-select per filter (matches a plain <select>'s value) — matching against `''`
  // (no filter) rather than an array avoids the array/string mismatch that made every filter
  // except rarity silently do nothing.
  const [filters, setFilters] = useState({
    category: '',
    type: '',
    attribute: '',
    rarity: '',
  });

  const [sortOption, setSortOption] = useState('');

  const sortMenuRef = useRef(null);
  const filterMenuRef = useRef(null);

  const handleSearchChange = (term) => {
    setSearchTerm(term.toLowerCase());
  };

  const toggleFilter = () => {
    setFiltersVisible((prev) => !prev);
    setSortVisible(false);
  };

  const handleFilterChange = (type, value) => {
    setFilters((prev) => ({
      ...prev,
      [type]: value,
    }));
  };

  const clearFilters = () => {
    setFilters({
      category: '',
      type: '',
      attribute: '',
      rarity: '',
    });
  };

  const toggleSort = () => {
    setSortVisible((prev) => !prev);
    setFiltersVisible(false);
  };

  const applySort = (option) => {
    const acceptedValues = ['alphabetical', 'rarity'];
    if (!acceptedValues.includes(option)) {
      throw new Error(`Sort option not valid: ${option}`);
    }

    setSortOption(option);
    setSortVisible(false);
  };

  // Options are built from the cards actually on hand, not a hardcoded list — a hardcoded list
  // is exactly what went stale here before (English keys like "fire"/"dragon" against cards
  // that store "Fuego"/"Dragón", and no "token" category at all).
  const availableCategories = [...new Set(cards.map((c) => c.category))].filter(Boolean);
  const availableTypes = [...new Set(cards.map((c) => c.type))].filter(Boolean).sort();
  const availableAttributes = [...new Set(cards.map((c) => c.attribute))].filter((a) => a && a !== 'none').sort();

  const filteredCards = cards
    .filter((card) => {
      return (
        card.name.toLowerCase().includes(searchTerm) &&
        (!filters.category || filters.category === card.category) &&
        (!filters.type || filters.type === card.type) &&
        (!filters.attribute || filters.attribute === card.attribute) &&
        (!filters.rarity || filters.rarity === card.rarity)
      );
    })
    .sort((a, b) => {
      if (sortOption === 'alphabetical') return a.name.localeCompare(b.name);
      // Rarity has a real rank (common < rare < epic < legendary) — sorting the enum string
      // alphabetically ("common","epic","legendary","rare") doesn't reflect that at all.
      if (sortOption === 'rarity') return (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0);
      return 0;
    });

  const groupedCards = filteredCards.reduce((acc, card) => {
    if (!acc[card.name]) {
      acc[card.name] = { ...card, amount: card.amount || 1 };
    } else {
      acc[card.name].amount += card.amount || 1;
    }
    return acc;
  }, {});

  return (
    <div className={styles.cardsCollected}>
      <div className={styles.controls}>
        <div className={styles.buttonWrapper}>
          <button className={styles.controlButton} onClick={toggleFilter}>
            <FaFilter className={styles.icon} />
          </button>
          {filtersVisible && (
            <div className={styles.filterMenuWrapper} ref={filterMenuRef}>
              <FilterMenu
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={clearFilters}
                availableCategories={availableCategories}
                availableTypes={availableTypes}
                availableAttributes={availableAttributes}
              />
            </div>
          )}
        </div>
        <div className={styles.buttonWrapper}>
          <button className={styles.controlButton} onClick={toggleSort}>
            <FaSortAmountDown className={styles.icon} />
          </button>
          {sortVisible && (
            <div className={styles.sortMenu} ref={sortMenuRef}>
              <button className={styles.sortOption} onClick={() => applySort('alphabetical')}>
                A-Z
              </button>
              <button className={styles.sortOption} onClick={() => applySort('rarity')}>
                Rareza
              </button>
            </div>
          )}
        </div>
        <SearchBar onSearch={handleSearchChange} />
      </div>
      <div className={styles.cardsList}>
        {Object.values(groupedCards).length === 0 ? (
          <p>No tienes cartas en tu colección</p>
        ) : (
          Object.values(groupedCards).map((card) => (
            <div key={card.name} className={styles.cardWrapper}>
              <CardItem
                card={card}
                onAction={addCard ? () => onAddCard(card) : undefined}
                actionLabel={addCard ? '+ Añadir' : undefined}
                addCard={addCard}
                showAmount
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CardsCollectedDisplay;
