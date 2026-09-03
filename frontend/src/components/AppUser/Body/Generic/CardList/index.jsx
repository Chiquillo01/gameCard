import styles from './cardList.module.css';
import { Link } from 'react-router-dom';

const CardList = ({ cards }) => {
  return (
    <div className={styles.marketCardsContainer}>
      <ul className={styles.marketCardsRows}>
        {cards.length > 0 ? (
          cards.map((card) => (
            <li key={card._id} className={styles.cardRow}>
              <Link to={`/card-detail/${card._id}`} className={styles.cardLink} state={{ card }}>
                <div className={styles.cardField}>
                  <img className={styles.cardImg} src={card.image} alt={card.name || 'Carta'} />
                </div>
                <div className={styles.cardField}>{card.name}</div>
              </Link>
            </li>
          ))
        ) : (
          <li className={styles.emptyMessage}>No hay cartas.</li>
        )}
      </ul>
    </div>
  );
};

export default CardList;
