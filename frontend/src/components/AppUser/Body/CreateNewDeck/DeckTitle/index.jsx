import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import styles from './decktitle.module.css';

function DeckTitle({ value, onTitleChange }) {
  const [title, setTitle] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setTitle(value || '');
  }, [value]);

  const handleTextChange = (event) => {
    const newTitle = event.target.value;
    if (newTitle.length > 20) {
      toast.error('El título no puede superar los 20 caracteres.', {
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: 'dark',
      });
    } else {
      setTitle(newTitle);
    }
  };

  const handleSave = () => {
    if (title.trim() === '') {
      toast.error('El título no puede estar vacío.', {
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: 'dark',
      });
      return;
    }
    onTitleChange(title.trim());
    setIsEditing(false);
    toast.success('Título guardado con éxito.', {
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'dark',
    });
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleSave();
    }
  };

  return (
    <div className={styles.deckTitle}>
      {isEditing ? (
        <input
          type='text'
          value={title}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className={styles.titleInput}
          autoFocus
        />
      ) : (
        <h1 className={styles.titleText} onClick={() => setIsEditing(true)}>
          {title || 'Haz click para añadir un título'}
        </h1>
      )}
    </div>
  );
}

export default DeckTitle;
