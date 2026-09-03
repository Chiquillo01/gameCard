import styles from './userActions.module.css';
import { IoInformationCircleOutline } from 'react-icons/io5';
import EditUser from '../EditUser';
import DeleteUser from '../DeleteUser';

const UserActions = ({ user, handleUpdate, handleDelete }) => {
  return (
    <div className={styles.actionButtons}>
      <button className={styles.extraButton}>
        <IoInformationCircleOutline />
      </button>
      <EditUser user={user} handleUpdate={handleUpdate} />
      <DeleteUser userId={user._id} handleDelete={handleDelete} />
    </div>
  );
};

export default UserActions;
