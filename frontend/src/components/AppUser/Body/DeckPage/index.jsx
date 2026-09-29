import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from 'react-modal';
import styles from './deckPage.module.css';
import { getUserDecks, deleteDecks } from '../../../../lib/utils/apiDeck';
import { isDeckPlayable, deckSizes, MIN_DECK_SIZE, MAX_DECK_SIZE } from '../../../../lib/utils/deckRules';
import { successToast, errorToast } from '../../../../lib/toastify/toast';

const deckImages = [
  '/assets/DeckImg/deck1.png',
  '/assets/DeckImg/deck2.png',
  '/assets/DeckImg/deck3.png',
  '/assets/DeckImg/deck4.png',
  '/assets/DeckImg/deck5.png',
];

const DeckPage = () => {
  const navigate = useNavigate();
  const [decks, setDecks] = useState(null);
  // Picking decks to delete: clicking a deck ticks it instead of opening it.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadDecks = async () => {
    setDecks(await getUserDecks());
  };

  useEffect(() => {
    loadDecks();
  }, []);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
    setConfirming(false);
  };

  const allSelected = !!decks?.length && selected.size === decks.length;

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const { deleted } = await deleteDecks([...selected]);
      successToast(deleted === 1 ? 'Mazo eliminado.' : `${deleted} mazos eliminados.`);
      stopSelecting();
      await loadDecks();
    } catch (e) {
      errorToast(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const selectedDecks = (decks || []).filter((d) => selected.has(d._id));

  return (
    <div className={styles.deckPage}>
      <div className={styles.titleBanner}>
        <div className={styles.titlePlaque}>
          <div className={styles.titleText}>MIS MAZOS</div>
        </div>
      </div>

      <div className={styles.container}>
        <div className={styles.toolbar}>
          {selecting ? (
            <>
              <span className={styles.selectionInfo}>
                {selected.size === 0 ? 'Pulsa los mazos que quieras eliminar' : `${selected.size} seleccionado${selected.size === 1 ? '' : 's'}`}
              </span>
              <button className={styles.secondaryButton} onClick={() => setSelected(allSelected ? new Set() : new Set(decks.map((d) => d._id)))}>
                {allSelected ? 'Quitar selección' : 'Seleccionar todos'}
              </button>
              <button className={styles.dangerButton} disabled={selected.size === 0} onClick={() => setConfirming(true)}>
                Eliminar ({selected.size})
              </button>
              <button className={styles.secondaryButton} onClick={stopSelecting}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button className={styles.primaryButton} onClick={() => navigate('/controldeck')}>
                + Nuevo mazo
              </button>
              <button className={styles.secondaryButton} disabled={!decks?.length} onClick={() => setSelecting(true)}>
                Eliminar mazos
              </button>
            </>
          )}
        </div>

        <div className={styles.panel}>
          {decks === null ? (
            <p className={styles.empty}>Cargando mazos...</p>
          ) : decks.length === 0 ? (
            <p className={styles.empty}>Aún no has creado ningún mazo.</p>
          ) : (
            <ul className={styles.deckGrid}>
              {decks.map((deck, index) => {
                const { totalMain, totalFusion } = deckSizes(deck.cards || [], deck.fusionCards || []);
                const playable = isDeckPlayable(deck);
                const isSelected = selected.has(deck._id);
                return (
                  <li key={deck._id}>
                    <button
                      className={`${styles.deckTile} ${selecting ? styles.deckTileSelecting : ''} ${isSelected ? styles.deckTileSelected : ''}`}
                      onClick={() => (selecting ? toggle(deck._id) : navigate(`/deck/${deck._id}`))}
                      aria-pressed={selecting ? isSelected : undefined}
                      title={selecting ? (isSelected ? 'Quitar de la selección' : 'Seleccionar para eliminar') : `Editar ${deck.deckTitle}`}
                    >
                      {selecting && <span className={styles.checkbox}>{isSelected ? '✔' : ''}</span>}
                      <img src={deckImages[index % deckImages.length]} alt='' className={styles.deckImage} />
                      <span className={styles.deckTitle}>{deck.deckTitle}</span>
                      <span className={styles.deckCount}>
                        {totalMain} cartas{totalFusion ? ` · ${totalFusion} de Compilación` : ''}
                      </span>
                      <span className={playable ? styles.statusOk : styles.statusWarn}>
                        {playable ? 'Listo para jugar' : `Incompleto (${MIN_DECK_SIZE}-${MAX_DECK_SIZE})`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Modal isOpen={confirming} onRequestClose={() => !deleting && setConfirming(false)} className={styles.modal} overlayClassName={styles.overlay} ariaHideApp={false}>
        <h2 className={styles.modalTitle}>¿Eliminar {selectedDecks.length === 1 ? 'este mazo' : `estos ${selectedDecks.length} mazos`}?</h2>
        <ul className={styles.modalList}>
          {selectedDecks.map((d) => (
            <li key={d._id}>{d.deckTitle}</li>
          ))}
        </ul>
        <p className={styles.modalNote}>No se puede deshacer. Las cartas siguen en tu colección.</p>
        <div className={styles.modalActions}>
          <button className={styles.dangerButton} disabled={deleting} onClick={confirmDelete}>
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </button>
          <button className={styles.secondaryButton} disabled={deleting} onClick={() => setConfirming(false)}>
            Cancelar
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default DeckPage;
