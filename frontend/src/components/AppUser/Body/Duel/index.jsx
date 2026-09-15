import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import styles from './duel.module.css';
import { getUserDecks } from '../../../../lib/utils/apiDeck';
import { startPveDuel, getDuelState, sendDuelAction } from '../../../../lib/utils/apiDuel';
import { getUserToken } from '../../../../lib/utils/localStorage.utils';

const PIXELCOIN_ICON = 'https://res.cloudinary.com/dsd7efrba/image/upload/v1739100321/moneda3tcg_hmxpum.png';

const PHASE_LABELS = {
  draw: 'Robo',
  standby: 'Espera',
  main1: 'Principal 1',
  battle: 'Batalla',
  main2: 'Principal 2',
  end: 'Final',
};

const showToast = (type, message) =>
  toast[type](message, {
    position: 'top-right',
    autoClose: 2500,
    hideProgressBar: true,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    theme: 'dark',
  });

const DuelPage = () => {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [decks, setDecks] = useState([]);
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [starting, setStarting] = useState(false);
  const [view, setView] = useState(null);
  const [selectedAttacker, setSelectedAttacker] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (matchId) return;
    getUserDecks().then(setDecks);
  }, [matchId]);

  const refreshState = useCallback(async (id) => {
    try {
      const data = await getDuelState(id);
      setView(data);
    } catch (e) {
      showToast('error', 'No se pudo cargar la partida.');
    }
  }, []);

  useEffect(() => {
    if (!matchId) return;
    refreshState(matchId);

    const socket = io('http://localhost:3001');
    socketRef.current = socket;
    socket.emit('auth', getUserToken());
    socket.on('duel:state', (data) => {
      if (data.id === matchId) setView(data);
    });

    return () => socket.disconnect();
  }, [matchId, refreshState]);

  const handleStart = async () => {
    if (!selectedDeckId) return;
    setStarting(true);
    try {
      const data = await startPveDuel(selectedDeckId);
      navigate(`/duel/${data.id}`);
    } catch (e) {
      showToast('error', 'No se pudo iniciar la partida. ¿Tu mazo cumple los requisitos?');
    } finally {
      setStarting(false);
    }
  };

  const act = async (action) => {
    if (!matchId) return;
    try {
      const result = await sendDuelAction(matchId, action);
      setView(result.state);
      if (!result.ok) showToast('error', humanizeReason(result.reason));
    } catch (e) {
      showToast('error', 'Error al procesar la acción.');
    }
  };

  if (!matchId) {
    return (
      <div className={styles.duelPage}>
        <div className={styles.pickerWrapper}>
          <div className={styles.titleBanner}>
            <div className={styles.titlePlaque}>
              <div className={styles.titleText}>Nueva Partida</div>
            </div>
          </div>

          <div className={styles.picker}>
            <select
              className={styles.deckSelect}
              value={selectedDeckId}
              onChange={(e) => setSelectedDeckId(e.target.value)}
            >
              <option value=''>Elige un mazo</option>
              {decks.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.deckTitle}
                </option>
              ))}
            </select>
            <button className={styles.startButton} disabled={!selectedDeckId || starting} onClick={handleStart}>
              {starting ? 'Iniciando...' : 'Jugar contra la IA'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!view) return <div className={styles.duelPage}>Cargando partida...</div>;

  const you = view.you;
  const opp = you === 0 ? 1 : 0;
  const isMyTurn = view.turnPlayer === you;
  const me = view.players[you];
  const enemy = view.players[opp];

  const onHandCardClick = (card) => {
    if (!isMyTurn || (view.phase !== 'main1' && view.phase !== 'main2')) {
      showToast('info', 'Solo puedes jugar cartas en tu fase principal.');
      return;
    }
    if (card.category === 'support') {
      act({ type: 'ACTIVATE_SUPPORT', instanceId: card.instanceId });
    } else {
      act({ type: 'NORMAL_SUMMON', instanceId: card.instanceId, position: 'attack' });
    }
  };

  const onOwnMonsterClick = (monster) => {
    if (!isMyTurn || view.phase !== 'battle' || !monster) return;
    setSelectedAttacker(monster.instanceId === selectedAttacker ? null : monster.instanceId);
  };

  const onEnemyMonsterClick = (monster) => {
    if (!selectedAttacker) return;
    act({ type: 'DECLARE_ATTACK', attackerInstanceId: selectedAttacker, targetInstanceId: monster.instanceId });
    setSelectedAttacker(null);
  };

  const onDirectAttack = () => {
    if (!selectedAttacker) return;
    act({ type: 'DECLARE_ATTACK', attackerInstanceId: selectedAttacker, targetInstanceId: null });
    setSelectedAttacker(null);
  };

  return (
    <div className={styles.duelPage}>
      {view.status === 'finished' && (
        <div className={styles.gameOverOverlay}>
          <div className={styles.gameOverPlaque}>
            {view.winnerIndex === you ? '¡Victoria!' : view.winnerIndex === opp ? 'Derrota' : 'Partida terminada'}
          </div>
        </div>
      )}

      <div className={styles.topBar}>
        <span className={styles.turnInfo}>
          Turno {view.turnNumber} · {isMyTurn ? 'Tu turno' : 'Turno del rival'} · Fase: {PHASE_LABELS[view.phase] || view.phase}
        </span>
        <div className={styles.topBarActions}>
          <button
            className={styles.actionButton}
            disabled={!isMyTurn || view.status !== 'active'}
            onClick={() => act({ type: 'ADVANCE_PHASE' })}
          >
            Avanzar fase
          </button>
          {selectedAttacker && enemy.field.monsters.every((m) => !m) && (
            <button className={styles.directAttackButton} onClick={onDirectAttack}>
              Ataque directo
            </button>
          )}
          <button className={styles.surrenderButton} onClick={() => act({ type: 'SURRENDER' })}>
            Rendirse
          </button>
        </div>
      </div>

      <div className={styles.board}>
        <div className={`${styles.playerRow} ${styles.enemyRow}`}>
          <div className={styles.playerHeader}>
            <span className={styles.vpBadge}>VP: {enemy.vp}</span>
            <span className={styles.handCountBadge}>Mano: {enemy.handCount}</span>
          </div>
          <div className={styles.zoneRow}>
            {enemy.field.support.map((s, i) => (
              <div key={`es${i}`} className={styles.slot} title='Soporte'>
                {s && <div className={styles.faceDown} />}
              </div>
            ))}
            <div className={`${styles.slot} ${styles.territorySlot}`} title='Territorio'>
              {enemy.field.territory && (
                <img src={enemy.field.territory.image} alt={enemy.field.territory.name} title={enemy.field.territory.name} />
              )}
            </div>
          </div>
          <div className={styles.zoneRow}>
            {enemy.field.monsters.map((m, i) => (
              <div
                key={`em${i}`}
                className={`${styles.slot} ${styles.monsterSlot} ${m?.position === 'defense' ? styles.defense : ''}`}
                onClick={() => m && !m.faceDown && onEnemyMonsterClick(m)}
              >
                {m && !m.faceDown && (
                  <>
                    <img src={m.image} alt={m.name} title={m.name} />
                    <span className={styles.statBadge}>
                      {m.atk} / {m.def}
                    </span>
                  </>
                )}
                {m && m.faceDown && <div className={styles.faceDown} />}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.divider} />

        <div className={`${styles.playerRow} ${styles.ownRow}`}>
          <div className={styles.zoneRow}>
            {me.field.monsters.map((m, i) => (
              <div
                key={`mm${i}`}
                className={`${styles.slot} ${styles.monsterSlot} ${m?.position === 'defense' ? styles.defense : ''} ${
                  m && m.instanceId === selectedAttacker ? styles.selected : ''
                }`}
                onClick={() => onOwnMonsterClick(m)}
              >
                {m && (
                  <>
                    <img src={m.image} alt={m.name} title={m.name} />
                    <span className={styles.statBadge}>
                      {m.atk} / {m.def}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className={styles.zoneRow}>
            {me.field.support.map((s, i) => (
              <div key={`ms${i}`} className={styles.slot} title='Soporte'>
                {s && <img src={s.image} alt={s.name} title={s.name} />}
              </div>
            ))}
            <div className={`${styles.slot} ${styles.territorySlot}`} title='Territorio'>
              {me.field.territory && <img src={me.field.territory.image} alt={me.field.territory.name} title={me.field.territory.name} />}
            </div>
          </div>
          <div className={styles.playerHeader}>
            <span className={styles.vpBadge}>VP: {me.vp}</span>
            <span className={styles.pixelBadge}>
              <img src={PIXELCOIN_ICON} alt='Pixeles' className={styles.pixelIcon} /> {me.pixelcoins}
            </span>
          </div>
        </div>

        <div className={styles.hand}>
          {me.hand.map((card) => (
            <div key={card.instanceId} className={styles.handCard} onClick={() => onHandCardClick(card)} title={card.name}>
              <img src={card.image} alt={card.name} />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.log}>
        {view.log.map((l, i) => (
          <div key={i} className={styles.logLine}>
            [T{l.turn} {PHASE_LABELS[l.phase] || l.phase}] {l.message}
          </div>
        ))}
      </div>
    </div>
  );
};

function humanizeReason(reason) {
  const map = {
    'normal-summon-used': 'Ya has hecho tu invocación normal este turno.',
    'cannot-pay-summon-cost': 'No puedes pagar el coste de invocación.',
    'no-field-space': 'No tienes espacio en el campo.',
    'not-in-hand': 'Esa carta no está en tu mano.',
    'summoning-sickness': 'Ese monstruo no puede atacar el turno en que fue invocado.',
    'already-attacked': 'Ese monstruo ya atacó este turno.',
    'not-battle-phase': 'Solo puedes atacar en la fase de batalla.',
    'must-target-a-monster': 'El rival tiene monstruos: debes elegir uno como objetivo.',
    'not-your-turn': 'No es tu turno.',
  };
  return map[reason] || 'Acción no válida.';
}

export default DuelPage;
