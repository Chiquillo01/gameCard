import styles from './editUser.module.css';
import { useState } from 'react';
import { useUser } from '../../../../../context/userContext';
import { updateUser } from '../../../../../lib/utils/apiUser';
import { toast, ToastContainer } from 'react-toastify';
import EditButton from '../../Generic/EditButton';

const EditUser = ({ user, handleUpdate }) => {
  const { data } = useUser();
  const [form, setForm] = useState({
    userName: user.userName,
    email: user.email,
    level: user.level,
    pixelcoins: user.pixelcoins,
    pixelgems: user.pixelgems,
    admin: user.admin,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: updatedUser } = await updateUser(user._id, form, data);
      handleUpdate(updatedUser);
      setIsModalOpen(false);
      toast.success('Usuario actualizado correctamente');
    } catch (e) {
      toast.error('Error al editar el usuario');
    }
  };

  return (
    <>
      <EditButton onClick={() => setIsModalOpen(true)} />

      {isModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 className={styles.titleUserForm}>Editar Usuario</h2>
            <form className={styles.formConainer} onSubmit={handleSubmit}>
              <input
                type='text'
                value={form.userName}
                onChange={(e) => setForm({ ...form, userName: e.target.value })}
              />
              <input type='email' value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input
                type='number'
                value={form.level}
                onChange={(e) => setForm({ ...form, level: parseInt(e.target.value, 10) })}
              />
              <input
                type='number'
                value={form.pixelcoins}
                onChange={(e) => setForm({ ...form, pixelcoins: parseInt(e.target.value, 10) })}
              />
              <input
                type='number'
                value={form.pixelgems}
                onChange={(e) => setForm({ ...form, pixelgems: parseInt(e.target.value, 10) })}
              />
              <select value={form.admin} onChange={(e) => setForm({ ...form, admin: e.target.value === 'true' })}>
                <option value='false'>Usuario</option>
                <option value='true'>Administrador</option>
              </select>
              <div className={styles.buttonContainer}>
                <button type='submit' className={styles.saveButton}>
                  Guardar
                </button>
                <button type='button' onClick={() => setIsModalOpen(false)} className={styles.cancelButton}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default EditUser;
