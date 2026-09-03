import styles from './editButton.module.css';
import { MdModeEditOutline } from 'react-icons/md';

const EditButton = ({ onClick }) => {
  return (
    <button className={styles.editButton} onClick={onClick}>
      <MdModeEditOutline className={styles.svg} />
    </button>
  );
};

export default EditButton;
