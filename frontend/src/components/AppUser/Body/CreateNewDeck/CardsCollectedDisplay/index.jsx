import { useState, useRef } from 'react';
import { FaFilter, FaSortAmountDown } from 'react-icons/fa';
import SearchBar from '../SearchBar';
import FilterMenu from '../FilterMenu';
import CardItem from '../CardItem';
import styles from './cardscollecteddisplay.module.css';

const CardsCollectedDisplay = ({ cards, addCard, onAddCard }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [sortVisible, setSortVisible] = useState(false);
  const [filters, setFilters] = useState({
    category: [],
    type: [],
    attribute: [],
    rarity: [],
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
      category: [],
      type: [],
      attribute: [],
      rarity: [],
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

  const filteredCards = cards
    .filter((card) => {
      return (
        card.name.toLowerCase().includes(searchTerm) &&
        (filters.category.length === 0 || filters.category.includes(card.category)) &&
        (filters.type.length === 0 || filters.type.includes(card.type)) &&
        (filters.attribute.length === 0 || filters.attribute.includes(card.attribute)) &&
        (filters.rarity.length === 0 || filters.rarity.includes(card.rarity))
      );
    })
    .sort((a, b) => {
      if (sortOption === 'alphabetical') return a.name.localeCompare(b.name);
      if (sortOption === 'rarity') return b.rarity.localeCompare(a.rarity);
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
              <FilterMenu filters={filters} onFilterChange={handleFilterChange} onClearFilters={clearFilters} />
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
              <CardItem card={card} onAction={() => onAddCard(card)} actionLabel='+ Añadir' addCard={addCard} />
              {card.amount > 1 && (
                <div className={styles.cardAmount}>
                  <span>x{card.amount}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CardsCollectedDisplay;
