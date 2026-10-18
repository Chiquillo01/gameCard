import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from 'react-modal';
import styles from './deckPage.module.css';
import { getUserDecks, deleteDecks } from '../../../../lib/utils/apiDeck';
import { isDeckPlayable, deckSizes } from '../../../../lib/utils/deckRules';
import { useGameRules } from '../../../../lib/utils/gameRules';
import { successToast, errorToast } from '../../../../lib/toastify/toast';

const deckImages = [
  '/assets/DeckImg/deck1.png',
  '/assets/DeckImg/deck2.png',
  '/assets/DeckImg/deck3.png',
  '/assets/DeckImg/deck4.png',
  '/assets/DeckImg/deck5.png',
];

// How the deck list can be ordered; the first is the default.
const SORTS = {
  recent: { label: 'Última modificación', compare: (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0) },
  oldest: { label: 'Más antiguos', compare: (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0) },
  nameAsc: { label: 'Nombre (A-Z)', compare: (a, b) => a.deckTitle.localeCompare(b.deckTitle) },
  nameDesc: { label: 'Nombre (Z-A)', compare: (a, b) => b.deckTitle.localeCompare(a.deckTitle) },
  mostCards: { label: 'Más cartas', compare: (a, b) => b.size - a.size },
  fewestCards: { label: 'Menos cartas', compare: (a, b) => a.size - b.size },
};
const STATUSES = { all: 'Todos', ready: 'Listos para jugar', incomplete: 'Incompletos' };

// The viewer's last choice of order and status, kept in this browser only (best effort).
const PREFS_KEY = 'deckPageFilters';
const readPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
};

const DeckPage = () => {
  const { minDeckSize: MIN_DECK_SIZE, maxDeckSize: MAX_DECK_SIZE } = useGameRules(); // re-renders when the server's rules arrive
  const navigate = useNavigate();
  const [decks, setDecks] = useState(null);
  // Picking decks to delete: clicking a deck ticks it instead of opening it.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState(() => (SORTS[readPrefs().sortBy] ? readPrefs().sortBy : 'recent'));
  const [status, setStatus] = useState(() => (STATUSES[readPrefs().status] ? readPrefs().status : 'all'));

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sortBy, status }));
    } catch {
      // storage unavailable: the choice just isn't remembered
    }
  }, [sortBy, status]);

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

  // Each deck with what the filters and the tiles need; the picture stays tied to the deck, not to
  // where it lands after sorting.
  const term = search.trim().toLowerCase();
  const visibleDecks = (decks || [])
    .map((deck, index) => {
      const { totalMain, totalFusion } = deckSizes(deck.cards || [], deck.fusionCards || []);
      return { ...deck, totalMain, totalFusion, size: totalMain + totalFusion, playable: isDeckPlayable(deck), image: deckImages[index % deckImages.length] };
    })
    .filter((deck) => !term || deck.deckTitle.toLowerCase().includes(term))
    .filter((deck) => status === 'all' || (status === 'ready') === deck.playable)
    .sort(SORTS[sortBy].compare);
  const filtering = !!term || status !== 'all';

  const allSelected = visibleDecks.length > 0 && visibleDecks.every((d) => selected.has(d._id));

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
              <button className={styles.secondaryButton} onClick={() => setSelected(allSelected ? new Set() : new Set(visibleDecks.map((d) => d._id)))}>
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

        {!!decks?.length && (
          <div className={styles.filters}>
            <input
              className={styles.filterInput}
              type='search'
              placeholder='Buscar mazo...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label='Buscar mazo por nombre'
            />
            <label className={styles.filterLabel}>
              Ordenar por
              <select className={styles.filterSelect} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                {Object.entries(SORTS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <label className={styles.filterLabel}>
              Mostrar
              <select className={styles.filterSelect} value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(STATUSES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            {filtering && (
              <button className={styles.secondaryButton} onClick={() => { setSearch(''); setStatus('all'); }}>
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        <div className={styles.panel}>
          {decks === null ? (
            <p className={styles.empty}>Cargando mazos...</p>
          ) : decks.length === 0 ? (
            <p className={styles.empty}>Aún no has creado ningún mazo.</p>
          ) : visibleDecks.length === 0 ? (
            <p className={styles.empty}>Ningún mazo coincide con los filtros.</p>
          ) : (
            <ul className={styles.deckGrid}>
              {visibleDecks.map((deck) => {
                const { totalMain, totalFusion, playable } = deck;
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
                      <img src={deck.image} alt='' className={styles.deckImage} />
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
