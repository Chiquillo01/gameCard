import styles from './createUser.module.css';

const CreateUser = ({ form, setForm, handleSubmit, onClose }) => {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2 className={styles.titleUserForm}>Crear Usuario</h2>
        <form className={styles.formConainer} onSubmit={handleSubmit}>
          <input
            type='text'
            placeholder='Nombre de Usuario'
            value={form.userName}
            onChange={(e) => setForm({ ...form, userName: e.target.value })}
          />
          <input
            type='email'
            placeholder='Correo Electrónico'
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            type='password'
            placeholder='Contraseña'
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <input
            type='number'
            placeholder='Nivel'
            value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value })}
          />
          <select value={form.admin} onChange={(e) => setForm({ ...form, admin: e.target.value === 'true' })}>
            <option value='false'>Usuario</option>
            <option value='true'>Administrador</option>
          </select>
          <div className={styles.buttonContainer}>
            <button type='submit'>Crear</button>
            <button type='button' onClick={onClose} className={styles.cancelButton}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateUser;
