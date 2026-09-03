import styles from './commingSoon.module.css';
import { Link } from 'react-router-dom';

const CommingSoon = () => {
    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Próximamente</h1>
            <p className={styles.text}>La página está en desarrollo y no tardará en estar disponible.</p>
            <Link to='/' className={styles.return}>
                Volver a la página principal
            </Link>
        </div>
    );
};

export default CommingSoon;
