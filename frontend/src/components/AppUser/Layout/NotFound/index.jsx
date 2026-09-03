import styles from './notFound.module.css';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Error 404</h1>
      <p className={styles.text}>La página que estás buscando no existe.</p>
      <Link to='/' className={styles.return}>
        Volver a la página principal
      </Link>
    </div>
  );
};

export default NotFound;
