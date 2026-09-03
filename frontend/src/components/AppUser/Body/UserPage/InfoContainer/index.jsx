import styles from './infoContainer.module.css';
import { SlArrowLeft, SlArrowRight } from 'react-icons/sl';
import RoleFilter from '../RoleFilter';
import Sort from '../../Generic/Sort';

const InfoContainer = ({
  userArray,
  activeFilter,
  setActiveFilter,
  handleSortChange,
  currentPage,
  totalPages,
  handlePageChange,
}) => {
  return (
    <div className={styles.userPageInfoContainer}>
      <div className={styles.userPageInfo}>
        <RoleFilter userArray={userArray} activeFilter={activeFilter} setActiveFilter={setActiveFilter} />
      </div>

      <div className={styles.paginationContainer}>
        <button
          className={styles.paginationButton}
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <SlArrowLeft />
        </button>
        <span className={styles.paginationInfo}>
          {currentPage} / {totalPages}
        </span>
        <button
          className={styles.paginationButton}
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <SlArrowRight />
        </button>
      </div>

      <div className={styles.userPageFiltros}>
        <Sort onSortChange={handleSortChange} />
      </div>
    </div>
  );
};

export default InfoContainer;
