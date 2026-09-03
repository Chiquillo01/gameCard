import { useEffect, useState } from 'react';
import { getUserOrders } from '../../../../../../../lib/utils/apiOrder';
import PageTitle from '../../../../../Body/Generic/PageTitle';
import styles from './purchasehistory.module.css';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

const PurchaseHistory = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [ordersPerPage] = useState(10);

  useEffect(() => {
    const fetchOrders = async () => {
      const data = await getUserOrders();

      const sortedOrders = Array.isArray(data)
        ? data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        : [];

      setOrders(sortedOrders);
      setLoading(false);
    };

    fetchOrders();
  }, []);

  const totalPages = Math.ceil(orders.length / ordersPerPage);
  const indexOfLastOrder = currentPage * ordersPerPage;
  const indexOfFirstOrder = indexOfLastOrder - ordersPerPage;
  const currentOrders = orders.slice(indexOfFirstOrder, indexOfLastOrder);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  const renderPagination = () => {
    const pageNumbers = [];
    const maxPageNumbersToShow = 3;
    const hasLeftDots = currentPage > maxPageNumbersToShow;
    const hasRightDots = currentPage < totalPages - (maxPageNumbersToShow - 1);

    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      if (hasLeftDots && !hasRightDots) {
        pageNumbers.push(1, '...', totalPages - 2, totalPages - 1, totalPages);
      } else if (!hasLeftDots && hasRightDots) {
        pageNumbers.push(1, 2, 3, '...', totalPages);
      } else if (hasLeftDots && hasRightDots) {
        pageNumbers.push(1, '...', currentPage, '...', totalPages);
      }
    }

    return (
      <div className={styles.pagination}>
        <button
          onClick={() => paginate(currentPage - 1)}
          disabled={currentPage === 1}
          className={styles.paginationButton}
        >
          <FaChevronLeft />
        </button>

        {pageNumbers.map((number, index) => (
          <button
            key={index}
            onClick={() => typeof number === 'number' && paginate(number)}
            className={`${styles.paginationButton} ${currentPage === number ? styles.activePage : ''}`}
            disabled={number === '...'}
          >
            {number}
          </button>
        ))}

        <button
          onClick={() => paginate(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={styles.paginationButton}
        >
          <FaChevronRight />
        </button>
      </div>
    );
  };

  if (loading) return <p className={styles.loading}>Cargando historial de compras...</p>;

  return (
    <>
      <PageTitle title='Historial de compras' />
      <div className={styles.purchaseHistoryContainer}>
        {orders.length === 0 ? (
          <p>No tienes compras registradas.</p>
        ) : (
          <>
            <table className={styles.orderTable}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>Saldo previo</th>
                  <th>Saldo posterior</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {currentOrders.map((order) => (
                  <tr key={order._id}>
                    <td>
                      {new Date(order.createdAt).toLocaleString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      {order.products.map((product) => (
                        <div key={product.productId}>{product.name}</div>
                      ))}
                    </td>
                    <td>
                      {order.totalPrice.pixelcoins > 0 && (
                        <span className={styles.priceItem}>
                          <img
                            src='https://res.cloudinary.com/dsd7efrba/image/upload/v1739100321/moneda3tcg_hmxpum.png'
                            alt='Pixelcoins'
                            className={styles.coinIcon}
                          />
                          {order.totalPrice.pixelcoins}
                        </span>
                      )}
                      {order.totalPrice.pixelgems > 0 && (
                        <span className={styles.priceItem}>
                          <img
                            src='https://res.cloudinary.com/dsd7efrba/image/upload/v1739100320/gema4tcg_laiqk5.png'
                            alt='Pixelgems'
                            className={styles.gemIcon}
                          />
                          {order.totalPrice.pixelgems}
                        </span>
                      )}
                    </td>
                    <td>{order.previousBalance.pixelcoins}</td>
                    <td>{order.newBalance.pixelcoins}</td>
                    <td className={order.status === 'completada' ? styles.completed : styles.failed}>{order.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {renderPagination()}
          </>
        )}
      </div>
    </>
  );
};

export default PurchaseHistory;
