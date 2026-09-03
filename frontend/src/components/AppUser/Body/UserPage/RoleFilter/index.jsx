import styles from './roleFilter.module.css';

const RoleFilter = ({ userArray = [], activeFilter, setActiveFilter }) => {
  return (
    <>
      <button
        className={`${styles.filterButton} ${activeFilter === 'all' ? styles.active : ''}`}
        onClick={() => setActiveFilter('all')}
      >
        Todos ({userArray.length || 0})
      </button>
      <button
        className={`${styles.filterButton} ${activeFilter === 'admin' ? styles.active : ''}`}
        onClick={() => setActiveFilter('admin')}
      >
        Admins ({userArray.filter((user) => user.admin === true).length})
      </button>
      <button
        className={`${styles.filterButton} ${activeFilter === 'user' ? styles.active : ''}`}
        onClick={() => setActiveFilter('user')}
      >
        Users ({userArray.filter((user) => user.admin === false).length})
      </button>
    </>
  );
};

export default RoleFilter;
