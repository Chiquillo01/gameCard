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

// "WASP_SWARM_GRAVE" -> "Wasp Swarm Grave" — the server only sends an effect id, no human label.
const formatEffectId = (id) =>
  id
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

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
  // A monster from hand is waiting on the player to pick attack/defense/set.
  const [pendingSummon, setPendingSummon] = useState(null);
  // A Veloz/Contraataque support from hand is waiting on activate-now-vs-set-face-down.
  const [pendingSupportChoice, setPendingSupportChoice] = useState(null);
  // Fusion in progress: the Compilación card plus the material instanceIds picked so far.
  const [fusion, setFusion] = useState(null);
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
      return result;
    } catch (e) {
      showToast('error', 'Error al procesar la acción.');
      return { ok: false };
    }
  };

  const cancelPendingChoices = () => {
    setPendingSummon(null);
    setPendingSupportChoice(null);
    setFusion(null);
    setSelectedAttacker(null);
  };

  const onHandCardClick = (card) => {
    const isMyTurn = view.turnPlayer === view.you;
    const isMainPhase = view.phase === 'main1' || view.phase === 'main2';
    if (!isMyTurn || !isMainPhase) {
      showToast('info', 'Solo puedes jugar cartas en tu fase principal.');
      return;
    }

    if (fusion) {
      if (card.instanceId === fusion.instanceId || card.category !== 'monster') return;
      toggleFusionMaterial(card.instanceId);
      return;
    }

    if (card.category === 'fusion') {
      setFusion({ instanceId: card.instanceId, materials: new Set() });
      return;
    }

    if (card.category === 'support') {
      if (card.subtype === 'instant' || card.subtype === 'counter') {
        setPendingSupportChoice(card.instanceId);
        return;
      }
      act({ type: 'ACTIVATE_SUPPORT', instanceId: card.instanceId });
      return;
    }

    setPendingSummon(card.instanceId);
  };

  const toggleFusionMaterial = (instanceId) => {
    setFusion((prev) => {
      if (!prev) return prev;
      const materials = new Set(prev.materials);
      if (materials.has(instanceId)) materials.delete(instanceId);
      else materials.add(instanceId);
      return { ...prev, materials };
    });
  };

  const confirmSummon = (position, faceDown) => {
    if (!pendingSummon) return;
    act({ type: 'NORMAL_SUMMON', instanceId: pendingSummon, position, faceDown });
    setPendingSummon(null);
  };

  const confirmSupportChoice = (setFaceDown) => {
    if (!pendingSupportChoice) return;
    act({ type: 'ACTIVATE_SUPPORT', instanceId: pendingSupportChoice, setFaceDown });
    setPendingSupportChoice(null);
  };

  const confirmFusion = async () => {
    if (!fusion) return;
    const result = await act({
      type: 'COMPILE_SUMMON',
      instanceId: fusion.instanceId,
      materialInstanceIds: [...fusion.materials],
    });
    if (result?.ok) setFusion(null);
  };

  const onOwnMonsterClick = (monster) => {
    if (!monster) return;
    if (fusion) {
      toggleFusionMaterial(monster.instanceId);
      return;
    }
    if (view.turnPlayer !== view.you || view.phase !== 'battle') return;
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

  const activateEffect = (effectId, sourceInstanceId) => {
    act({ type: 'ACTIVATE_EFFECT', effectId, sourceInstanceId });
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

  const renderEffectButtons = (card) => {
    if (!card.availableEffects || !card.availableEffects.length) return null;
    return (
      <div className={styles.effectButtons}>
        {card.availableEffects.map((effectId) => (
          <button
            key={effectId}
            className={styles.effectButton}
            onClick={(e) => {
              e.stopPropagation();
              activateEffect(effectId, card.instanceId);
            }}
            title={`Activar ${formatEffectId(effectId)}`}
          >
            {formatEffectId(effectId)}
          </button>
        ))}
      </div>
    );
  };

  const isFusionMaterialCandidate = (card) => !!fusion && card.instanceId !== fusion.instanceId && card.category === 'monster';

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
          <ZoneStrip label='Cementerio' cards={enemy.graveyard} />
          <ZoneStrip label='Exilio' cards={enemy.banished} />
        </div>

        <div className={styles.divider} />

        <div className={`${styles.playerRow} ${styles.ownRow}`}>
          <ZoneStrip label='Exilio' cards={me.banished} onEffect={renderEffectButtons} />
          <ZoneStrip label='Cementerio' cards={me.graveyard} onEffect={renderEffectButtons} />

          <div className={styles.zoneRow}>
            {me.field.monsters.map((m, i) => (
              <div
                key={`mm${i}`}
                className={`${styles.slot} ${styles.monsterSlot} ${m?.position === 'defense' ? styles.defense : ''} ${
                  m && (m.instanceId === selectedAttacker || (fusion && fusion.materials.has(m.instanceId))) ? styles.selected : ''
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
                {m && !fusion && renderEffectButtons(m)}
              </div>
            ))}
          </div>
          <div className={styles.zoneRow}>
            {me.field.support.map((s, i) => (
              <div key={`ms${i}`} className={styles.slot} title='Soporte'>
                {s && <img src={s.image} alt={s.name} title={s.name} />}
                {s && renderEffectButtons(s)}
              </div>
            ))}
            <div className={`${styles.slot} ${styles.territorySlot}`} title='Territorio'>
              {me.field.territory && <img src={me.field.territory.image} alt={me.field.territory.name} title={me.field.territory.name} />}
              {me.field.territory && renderEffectButtons(me.field.territory)}
            </div>
          </div>
          <div className={styles.playerHeader}>
            <span className={styles.vpBadge}>VP: {me.vp}</span>
            <span className={styles.pixelBadge}>
              <img src={PIXELCOIN_ICON} alt='Pixeles' className={styles.pixelIcon} /> {me.pixelcoins}
            </span>
          </div>
        </div>

        {me.extra && me.extra.length > 0 && (
          <div className={styles.extraRow}>
            <span className={styles.extraLabel}>Extra:</span>
            {me.extra.map((card) => (
              <div
                key={card.instanceId}
                className={`${styles.handCard} ${fusion?.instanceId === card.instanceId ? styles.selected : ''}`}
                onClick={() => onHandCardClick(card)}
                title={card.name}
              >
                <img src={card.image} alt={card.name} />
              </div>
            ))}
          </div>
        )}

        <div className={styles.hand}>
          {me.hand.map((card) => (
            <div
              key={card.instanceId}
              className={`${styles.handCard} ${
                fusion && (fusion.instanceId === card.instanceId || (isFusionMaterialCandidate(card) && fusion.materials.has(card.instanceId)))
                  ? styles.selected
                  : ''
              }`}
              onClick={() => onHandCardClick(card)}
              title={card.name}
            >
              <img src={card.image} alt={card.name} />
            </div>
          ))}
        </div>

        {fusion && (
          <div className={styles.choiceBar}>
            <span>Selecciona los materiales en tu mano o campo ({fusion.materials.size} elegidos)</span>
            <button className={styles.directAttackButton} onClick={confirmFusion}>
              Confirmar Fusión
            </button>
            <button className={styles.surrenderButton} onClick={cancelPendingChoices}>
              Cancelar
            </button>
          </div>
        )}

        {pendingSummon && (
          <div className={styles.choiceBar}>
            <span>¿Cómo invocas esta carta?</span>
            <button className={styles.actionButton} onClick={() => confirmSummon('attack', false)}>
              Ataque
            </button>
            <button className={styles.actionButton} onClick={() => confirmSummon('defense', false)}>
              Defensa
            </button>
            <button className={styles.actionButton} onClick={() => confirmSummon('defense', true)}>
              Boca abajo
            </button>
            <button className={styles.surrenderButton} onClick={cancelPendingChoices}>
              Cancelar
            </button>
          </div>
        )}

        {pendingSupportChoice && (
          <div className={styles.choiceBar}>
            <span>¿Activar ahora o colocar boca abajo?</span>
            <button className={styles.actionButton} onClick={() => confirmSupportChoice(false)}>
              Activar
            </button>
            <button className={styles.actionButton} onClick={() => confirmSupportChoice(true)}>
              Boca abajo
            </button>
            <button className={styles.surrenderButton} onClick={cancelPendingChoices}>
              Cancelar
            </button>
          </div>
        )}
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

// A compact strip for graveyard/exile: just names in a scrollable row, since there can be many.
// `onEffect` (own zones only) renders activation buttons for cards that offer one right now.
function ZoneStrip({ label, cards, onEffect }) {
  if (!cards || !cards.length) return null;
  return (
    <div className={styles.zoneStrip}>
      <span className={styles.zoneStripLabel}>
        {label} ({cards.length}):
      </span>
      <div className={styles.zoneStripCards}>
        {cards.map((card) => (
          <div key={card.instanceId} className={styles.zoneStripCard} title={card.name}>
            <img src={card.image} alt={card.name} />
            {onEffect && onEffect(card)}
          </div>
        ))}
      </div>
    </div>
  );
}

function humanizeReason(reason) {
  const map = {
    'normal-summon-used': 'Ya has hecho tu invocación normal este turno.',
    'cannot-pay-summon-cost': 'No puedes pagar el coste de invocación.',
    'no-field-space': 'No tienes espacio en el campo.',
    'not-in-hand': 'Esa carta no está en tu mano.',
    'not-available': 'Esa carta de fusión no está disponible.',
    'summoning-sickness': 'Ese monstruo no puede atacar el turno en que fue invocado.',
    'already-attacked': 'Ese monstruo ya atacó este turno.',
    'not-battle-phase': 'Solo puedes atacar en la fase de batalla.',
    'must-target-a-monster': 'El rival tiene monstruos: debes elegir uno como objetivo.',
    'not-your-turn': 'No es tu turno.',
    'not-in-graveyard': 'Esa carta no está en el cementerio.',
    'not-in-exile': 'Esa carta no está en el exilio.',
    'cannot-pay-cost': 'No puedes pagar el coste de este efecto.',
    'once-per-turn': 'Ese efecto ya se activó este turno.',
    'conditions-not-met': 'No se cumplen las condiciones para ese efecto.',
    'unknown-effect': 'Ese efecto no existe.',
  };
  if (reason && reason.startsWith('missing-material')) return 'Los materiales elegidos no cumplen el requisito de fusión.';
  return map[reason] || 'Acción no válida.';
}

export default DuelPage;
