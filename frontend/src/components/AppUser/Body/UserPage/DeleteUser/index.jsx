import styles from './deleteUser.module.css';
import { IoTrashBin } from 'react-icons/io5';

const DeleteUser = ({ userId, handleDelete }) => {
  return (
    <>
      <button className={styles.deleteButton} onClick={() => handleDelete(userId)}>
        <IoTrashBin className={styles.svg} />
      </button>

      {/* Modal para estar seguro de eliminar esto */}
    </>
  );
};

export default DeleteUser;
