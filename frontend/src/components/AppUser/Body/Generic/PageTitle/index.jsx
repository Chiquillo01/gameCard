import styles from './pageTitle.module.css';
import { BsPlusCircleDotted } from 'react-icons/bs';
import { FaSearch } from 'react-icons/fa';

const PageTitle = ({ title, showAddIcon, showSercher, searchTerm, setSearchTerm, openModal, placeholder }) => {
  return (
    <div className={styles.userPageTitleContainer}>
      <div className={styles.userPageTitle}>
        <h1>{title}</h1>
        {showAddIcon && <BsPlusCircleDotted className={styles.plus} onClick={openModal} />}
      </div>
      {showSercher && (
        <div className={styles.userPageSercherContainer}>
          <input
            className={styles.userPageSercher}
            type='text'
            placeholder={placeholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <FaSearch className={styles.searchIcon} onClick={() => {}} />
        </div>
      )}
    </div>
  );
};

export default PageTitle;
