import styles from './cardDetailPage.module.css';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { getMarketProducts, createNewProductMarket, deleteProductMarket } from '../../../../../lib/utils/apiMarket';

const CardDetailPage = () => {
  const { state } = useLocation();
  const [card, setCard] = useState(state.card || null);
  const [averagePrice, setAveragePrice] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const queryClient = useQueryClient();
  const { data: marketCards, refetch } = useQuery(['marketCards', card?._id], () => getMarketProducts(card?._id), {
    enabled: !!card,
  });

  useEffect(() => {
    if (marketCards?.length > 0) {
      const totalPrice = marketCards.reduce((sum, card) => sum + parseFloat(card.price.pixelcoins), 0);
      const avgPrice = totalPrice / marketCards.length;
      setAveragePrice(avgPrice.toFixed(2));
    } else {
      setAveragePrice(null);
    }
  }, [marketCards]);

  useEffect(() => {
    if (card) {
      refetch();
    }
  }, [card, refetch]);

  const deleteMutation = useMutation(deleteProductMarket, {
    onSuccess: () => {
      queryClient.invalidateQueries(['marketCards', card?._id]);
    },
  });

  const mutation = useMutation(createNewProductMarket, {
    onSuccess: () => {
      queryClient.invalidateQueries(['marketCards', card?._id]);
    },
  });

  const handleDeleteCard = (productId) => {
    if (window.confirm('¿Seguro que quieres eliminar esta carta del mercado?')) {
      deleteMutation.mutate(productId);
    }
  };

  const handleSellCard = async (formData) => {
    const newCard = {
      ...formData,
      cardId: card._id,
    };
    mutation.mutate(newCard);
  };

  if (!card) {
    return <div className={styles.loading}>Cargando detalles...</div>;
  }

  return (
    <div>
      <div className={styles.cardDetailContainer}>
        <img className={styles.cardImage} src={card.image} alt={card.name} />

        <ul className={styles.cardAttributes}>
          <li>
            <strong>Nombre:</strong> {card.name}
          </li>
          <li>
            <strong>Rareza:</strong> {card.rarity}
          </li>
          <li>
            <strong>Nº:</strong> 001
          </li>
          <li>
            <strong>Expansión:</strong> {card.expansion}
          </li>
          <li>
            <strong>Media:</strong> {averagePrice ? `${averagePrice} PC` : 'No disponible'}
          </li>
        </ul>

        <div className={styles.sellContainer}>
          <h1>Poner a la venta</h1>
          <form onSubmit={handleSubmit(handleSellCard)} className={styles.sellForm}>
            <label htmlFor='amount'>Cantidad:</label>
            <input
              type='number'
              id='amount'
              {...register('amount', { required: 'Este campo es obligatorio', min: 1 })}
              placeholder='Cantidad'
            />
            {errors.amount && <span className={styles.error}>{errors.amount.message}</span>}

            <label htmlFor='foil'>Foil:</label>
            <select id='foil' {...register('foil', { required: 'Selecciona una rareza' })} defaultValue='normal'>
              <option value=''>Selecciona una rareza</option>
              <option value='normal'>Normal</option>
              <option value='secreta'>Secreta</option>
              <option value='collector'>Collector</option>
            </select>
            {errors.foil && <span className={styles.error}>{errors.foil.message}</span>}

            <label htmlFor='price'>Precio (€):</label>
            <input
              type='number'
              id='price'
              {...register('price', { required: 'Este campo es obligatorio', min: 0 })}
              placeholder='Precio en pixelcoins'
              step='0.01'
            />
            {errors.price && <span className={styles.error}>{errors.price.message}</span>}

            <button type='submit' className={styles.sellButton}>
              Poner en venta
            </button>
          </form>
        </div>
      </div>

      <div className={styles.marketContainer}>
        {marketCards?.length === 0 ? (
          <p className={styles.noCardsMessage}>No hay cartas en venta actualmente.</p>
        ) : (
          <ul className={styles.marketList}>
            {marketCards?.map((item) => (
              <li key={item._id} className={styles.marketItem}>
                <img src={item.cardId.image} alt={item.cardId.name} className={styles.marketCardImage} />
                <div className={styles.marketCardDetails}>
                  <p>
                    <strong>Vendedor:</strong> {item.userId.userName}
                  </p>
                  <p>
                    <strong>Rareza:</strong> {item.foil}
                  </p>
                  <p>
                    <strong>Cantidad:</strong> {item.amount}
                  </p>
                  <p>
                    <strong>Precio:</strong> {item.price.pixelcoins} €
                  </p>
                  <button className={styles.buyButton}>Comprar</button>
                  <button className={styles.deleteButton} onClick={() => handleDeleteCard(item._id)}>
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CardDetailPage;
