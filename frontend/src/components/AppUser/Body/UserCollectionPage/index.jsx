import styles from './userCollectionPage.module.css';
import PageTitle from '../Generic/PageTitle';
import CardsCollectedDisplay from '../CreateNewDeck/CardsCollectedDisplay';
import { useEffect, useState } from 'react';
import { fetchUserCollection } from '../../../../lib/utils/apiUserCollection';
import { errorToast } from '../../../../lib/toastify/toast';

const UserCollectionPage = () => {
  const [userCards, setUserCards] = useState([]);

  useEffect(() => {
    getUserCards();
  }, []);

  const getUserCards = async () => {
    try {
      const response = await fetchUserCollection();
      setUserCards(response.map(({ cardId, amount }) => ({ ...cardId, id: cardId._id, amount: amount })));
    } catch (e) {
      if (e.status === 404) {
        errorToast('Recurso no existe');
      } else {
        errorToast('Error interno del servidor');
      }
    }
  };

  return (
    <div className={styles.bodyUserCollectionPageContainer}>
      <PageTitle title='Tu Colección' showAddIcon={false} showSercher={false} />
      <div className={styles.cardsCollectedWrapper}>
        <CardsCollectedDisplay cards={Array.isArray(userCards) ? userCards : []} addCard={false} />
      </div>
    </div>
  );
};

export default UserCollectionPage;
