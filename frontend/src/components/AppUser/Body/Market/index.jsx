import styles from './marketPage.module.css';
import PageTitle from '../Generic/PageTitle';
import CardList from '../Generic/CardList';
import { useState, useEffect, useMemo } from 'react';
import { fetchCards } from '../../../../lib/utils/apiCard';
import { categories, types, attributes, rarities, expansions } from '../../../../config/cardFilters';
import { errorToast } from '../../../../lib/toastify/toast';

const MarketPage = () => {
  const [cardsArray, setCardsArray] = useState([]);
  const [filters, setFilters] = useState({
    category: '',
    type: '',
    attribute: '',
    rarity: '',
    expansion: '',
  });

  useEffect(() => {
    const fetchAllCards = async () => {
      try {
        const response = await fetchCards();
        setCardsArray(response.data);
      } catch (e) {
        errorToast('Error interno del servidor');
      }
    };

    fetchAllCards();
  }, []);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prevFilters) => ({
      ...prevFilters,
      [name]: value,
    }));
  };
  const clearFilters = () => {
    setFilters({
      category: '',
      type: '',
      attribute: '',
      rarity: '',
      expansion: '',
    });
  };

  const filteredCards = useMemo(() => {
    return cardsArray
      .filter((card) =>
        Object.keys(filters).every((key) =>
          filters[key] ? String(card[key]).toLowerCase() === String(filters[key]).toLowerCase() : true,
        ),
      )
      .slice(0, 80);
  }, [filters, cardsArray]);

  return (
    <div>
      <PageTitle title='Mercado de la Comunidad' showAddIcon={false} showSercher={false} />

      <div className={styles.marketFilterContainer}>
        {[
          { label: 'Categoría', name: 'category', options: categories },
          { label: 'Tipo', name: 'type', options: types },
          { label: 'Atributo', name: 'attribute', options: attributes },
          { label: 'Rareza', name: 'rarity', options: rarities },
          { label: 'Extensión', name: 'expansion', options: expansions },
        ].map(({ label, name, options }) => (
          <div key={name} className={styles.filterSection}>
            <h5>{label}</h5>
            <select name={name} className={styles.select} value={filters[name]} onChange={handleFilterChange}>
              <option value=''>Todas</option>
              {options.map((opt) => (
                <option key={typeof opt === 'string' ? opt : opt.key} value={typeof opt === 'string' ? opt : opt.key}>
                  {typeof opt === 'string' ? opt : opt.value}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button className={styles.clearButton} onClick={clearFilters}>
          Limpiar Filtros
        </button>
      </div>

      <CardList cards={filteredCards} />
    </div>
  );
};

export default MarketPage;
