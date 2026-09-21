import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import io from 'socket.io-client';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import styles from './duel.module.css';
import { getUserDecks } from '../../../../lib/utils/apiDeck';
import { startPveDuel, getDuelState, sendDuelAction } from '../../../../lib/utils/apiDuel';
import { fetchCards } from '../../../../lib/utils/apiCard';
import CardFace from '../CreateNewDeck/CardModal/CardFace';
import { getUserToken } from '../../../../lib/utils/localStorage.utils';
import { isDeckPlayable } from '../../../../lib/utils/deckRules';

const PIXELCOIN_ICON = 'https://res.cloudinary.com/dsd7efrba/image/upload/v1739100321/moneda3tcg_hmxpum.png';

const PHASE_LABELS = {
  draw: 'Robo',
  standby: 'Espera',
  main1: 'Principal 1',
  battle: 'Batalla',
  main2: 'Principal 2',
  end: 'Final',
};

const PILE_LABELS = { graveyard: 'Cementerio', banished: 'Exilio', extra: 'Mazo-C' };

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
  // One of your own monsters was clicked in a main phase: pick the position to switch it to.
  const [pendingPosition, setPendingPosition] = useState(null);
  // Fusion in progress: the Compilación card plus the material instanceIds picked so far.
  const [fusion, setFusion] = useState(null);
  // A Cementerio/Exilio/Mazo-C pile the player clicked open: { side: 'me'|'enemy', zone }.
  const [openPile, setOpenPile] = useState(null);
  const socketRef = useRef(null);
  // Every card's full data (art, effect text, ...) by id, fetched once for the hover preview, and
  // the card the cursor last rested on.
  const [cardsById, setCardsById] = useState({});
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    fetchCards()
      .then((res) => setCardsById(Object.fromEntries(res.data.map((c) => [c._id, c]))))
      .catch(() => {});
  }, []);
  const logRef = useRef(null);
  const logLength = view ? view.log.length : 0;

  // Keep the newest log line in sight.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLength]);

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
    setPendingPosition(null);
    setFusion(null);
    setSelectedAttacker(null);
  };

  const confirmPositionChange = (position) => {
    if (!pendingPosition) return;
    act({ type: 'CHANGE_POSITION', instanceId: pendingPosition.instanceId, position });
    setPendingPosition(null);
  };

  const startFusion = (card) => {
    setFusion({ instanceId: card.instanceId, materials: new Set() });
    setOpenPile(null);
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
      startFusion(card);
      return;
    }

    if (card.category === 'support') {
      // The Territorio has its own zone and can't be set; every other support can be activated
      // now or set in the support zone.
      if (card.subtype !== 'field') {
        setPendingSupportChoice(card.instanceId);
        return;
      }
      act({ type: 'ACTIVATE_SUPPORT', instanceId: card.instanceId });
      return;
    }

    // Rulebook: a monster whose invocation method says anything can't be Normal Summoned.
    if (card.normalSummonable === false) {
      showToast('error', humanizeReason(card.cannotBeSummoned ? 'cannot-be-summoned' : 'special-summon-only'));
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

  // What the preview panel shows: the hovered card's full data, with the on-board Atk/Vida when it
  // is a monster that has been buffed or debuffed. Tokens have no card data, so they get a stub.
  const previewCard = (() => {
    if (!hovered) return null;
    if (hovered.isToken) return { name: hovered.name, category: 'monster', atk: hovered.atk, def: hovered.def, effect: 'Ficha de monstruo.' };
    const card = cardsById[hovered.cardId];
    if (!card) return null;
    return hovered.atk != null ? { ...card, atk: hovered.atk, def: hovered.def } : card;
  })();

  // Clicking one of your own face-down supports in a main phase activates it (Veloz/Contraataque
  // cards have their own effect buttons instead).
  const onFieldSupportClick = (support) => {
    if (!support.faceDown || support.subtype === 'instant' || support.subtype === 'counter') return;
    if (view.turnPlayer !== view.you) return;
    if (view.phase !== 'main1' && view.phase !== 'main2') return;
    act({ type: 'ACTIVATE_SET_SUPPORT', instanceId: support.instanceId });
  };

  const onFieldMonsterClick = (monster, isOwn) => {
    if (!monster) return;
    if (fusion) {
      if (isOwn) toggleFusionMaterial(monster.instanceId);
      return;
    }
    if (isOwn) {
      if (view.turnPlayer !== view.you) return;
      if (view.phase === 'main1' || view.phase === 'main2') {
        setPendingPosition({ instanceId: monster.instanceId, faceDown: monster.faceDown, position: monster.position });
        return;
      }
      if (view.phase !== 'battle') return;
      setSelectedAttacker(monster.instanceId === selectedAttacker ? null : monster.instanceId);
      return;
    }
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
    setOpenPile(null);
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
                <option key={d._id} value={d._id} disabled={!isDeckPlayable(d)}>
                  {d.deckTitle}
                  {isDeckPlayable(d) ? '' : ' (incompleto)'}
                </option>
              ))}
            </select>
            {selectedDeckId && !isDeckPlayable(decks.find((d) => d._id === selectedDeckId) || {}) && (
              <p className={styles.deckWarning}>
                Este mazo no tiene entre 40 y 50 cartas (o supera las 10 de Compilación) — termínalo antes de jugar.
              </p>
            )}
            <button
              className={styles.startButton}
              disabled={!selectedDeckId || starting || !isDeckPlayable(decks.find((d) => d._id === selectedDeckId) || {})}
              onClick={handleStart}
            >
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

  // `inline` renders plain buttons in a row (for the pile modal's list); the default is a small
  // dropdown that pops up above the card (for a slot out on the field).
  const renderEffectButtons = (card, inline = false) => {
    if (!card.availableEffects || !card.availableEffects.length) return null;
    return (
      <div className={inline ? styles.effectButtonsInline : styles.effectButtons}>
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

      {openPile && (
        <PileModal
          title={PILE_LABELS[openPile.zone]}
          cards={openPile.side === 'me' ? me[openPile.zone] : enemy[openPile.zone]}
          onClose={() => setOpenPile(null)}
          renderCardExtra={(card) =>
            openPile.side === 'me' && openPile.zone === 'extra' ? (
              <button className={styles.effectButton} onClick={() => startFusion(card)}>
                Fusionar
              </button>
            ) : (
              renderEffectButtons(card, true)
            )
          }
        />
      )}

      <div className={styles.topBar}>
        <Link to='/' className={styles.backLink}>
          ← Volver a la taberna
        </Link>
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
        <div className={styles.playerHeader}>
          <span className={styles.vpBadge}>VP: {enemy.vp}</span>
          <span className={styles.handCountBadge}>Mano: {enemy.handCount}</span>
        </div>
        <div className={styles.fieldsRow}>
        <CardPreview card={previewCard} />
        <PlayerField
          player={enemy}
          isOwner={false}
          flipped
          selectedAttacker={selectedAttacker}
          fusion={fusion}
          onMonsterClick={(m) => onFieldMonsterClick(m, false)}
          onOpenPile={(zone) => setOpenPile({ side: 'enemy', zone })}
          renderEffectButtons={renderEffectButtons}
          onHover={setHovered}
        />

        <div className={styles.divider} />

        <PlayerField
          player={me}
          isOwner
          flipped={false}
          selectedAttacker={selectedAttacker}
          fusion={fusion}
          canDecompile={isMyTurn && view.phase === 'battle'}
          onDecompile={(instanceId) => act({ type: 'DECOMPILE', instanceId })}
          onMonsterClick={(m) => onFieldMonsterClick(m, true)}
          onSupportClick={onFieldSupportClick}
          onOpenPile={(zone) => setOpenPile({ side: 'me', zone })}
          renderEffectButtons={renderEffectButtons}
          onHover={setHovered}
        />

        <div className={styles.log}>
          <div className={styles.logScroll} ref={logRef}>
            {view.log.map((l, i) => (
              <div key={i} className={styles.logLine}>
                [T{l.turn} {PHASE_LABELS[l.phase] || l.phase}] {l.message}
              </div>
            ))}
          </div>
        </div>
        </div>

        <div className={styles.playerHeader}>
          <span className={styles.vpBadge}>VP: {me.vp}</span>
          <span className={styles.pixelBadge}>
            <img src={PIXELCOIN_ICON} alt='Pixeles' className={styles.pixelIcon} /> {me.pixelcoins}
          </span>
        </div>

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
              onMouseEnter={() => setHovered({ cardId: card.cardId })}
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

        {pendingPosition && (
          <div className={styles.choiceBar}>
            <span>{pendingPosition.faceDown ? 'Voltear boca arriba en:' : 'Cambiar posición a:'}</span>
            {(pendingPosition.faceDown || pendingPosition.position !== 'attack') && (
              <button className={styles.actionButton} onClick={() => confirmPositionChange('attack')}>
                Ataque
              </button>
            )}
            {(pendingPosition.faceDown || pendingPosition.position !== 'defense') && (
              <button className={styles.actionButton} onClick={() => confirmPositionChange('defense')}>
                Defensa
              </button>
            )}
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

    </div>
  );
};

// Renders one player's side of the board as the rulebook's 7-column grid:
//   row 1: 5 Monster zones, Cementerio, Exilio
//   row 2: Territorio, 4 Apoyo zones, (—), Mazo-C
//   row 3: (—) x6, Mazo
// `flipped` mirrors the row order (used for the opponent) so both players' monster rows sit
// next to the shared battle line in the middle of the screen, backrow/deck furthest from it.
function PlayerField({ player, isOwner, flipped, selectedAttacker, fusion, canDecompile, onDecompile, onMonsterClick, onOpenPile, renderEffectButtons, onHover, onSupportClick }) {
  const row = (r) => (flipped ? 4 - r : r);

  return (
    <div className={styles.fieldGrid}>
      {player.field.monsters.map((m, i) => (
        <div
          key={`m${i}`}
          style={{ gridRow: row(1), gridColumn: i + 1 }}
          className={`${styles.slot} ${styles.monsterSlot} ${m?.position === 'defense' ? styles.defense : ''} ${
            m && (m.instanceId === selectedAttacker || (fusion && isOwner && fusion.materials.has(m.instanceId))) ? styles.selected : ''
          }`}
          onClick={() => m && onMonsterClick(m)}
          onMouseEnter={() => m && (m.isToken ? onHover({ isToken: true, name: m.name, atk: m.atk, def: m.def }) : m.cardId && onHover({ cardId: m.cardId, atk: m.faceDown ? null : m.atk, def: m.faceDown ? null : m.def }))}
        >
          {m && !m.faceDown && (
            <>
              <img src={m.image} alt={m.name} title={m.name} />
              <span className={styles.statBadge}>
                {m.atk} / {m.def}
              </span>
              {m.statuses && m.statuses.length > 0 && (
                <span className={styles.statusBadges}>
                  {m.statuses.map((st) => (
                    <span key={st} className={`${styles.statusBadge} ${styles['status' + st]}`} title={st}>
                      {STATUS_ICONS[st] || st}
                    </span>
                  ))}
                </span>
              )}
              {isOwner && !fusion && renderEffectButtons(m)}
              {isOwner && !fusion && canDecompile && m.canDecompile && (
                <div className={styles.effectButtons}>
                  <button
                    className={styles.effectButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDecompile(m.instanceId);
                    }}
                    title='Devolver este monstruo al Mazo-C e invocar sus materiales'
                  >
                    Descompilar
                  </button>
                </div>
              )}
            </>
          )}
          {m && m.faceDown && <div className={styles.faceDown} />}
        </div>
      ))}

      <PileSlot
        style={{ gridRow: row(1), gridColumn: 6 }}
        label='Cementerio'
        count={player.graveyard.length}
        onClick={() => onOpenPile('graveyard')}
      />
      <PileSlot
        style={{ gridRow: row(1), gridColumn: 7 }}
        label='Exilio'
        count={player.banished.length}
        onClick={() => onOpenPile('banished')}
      />

      <div style={{ gridRow: row(2), gridColumn: 1 }} className={`${styles.slot} ${styles.territorySlot}`} title='Territorio' onMouseEnter={() => player.field.territory && onHover({ cardId: player.field.territory.cardId })}>
        {player.field.territory && (
          <>
            <img src={player.field.territory.image} alt={player.field.territory.name} title={player.field.territory.name} />
            {isOwner && renderEffectButtons(player.field.territory)}
          </>
        )}
      </div>

      {player.field.support.map((s, i) => (
        <div key={`s${i}`} style={{ gridRow: row(2), gridColumn: i + 2 }} className={styles.slot} title='Soporte' onClick={() => s && isOwner && onSupportClick && onSupportClick(s)} onMouseEnter={() => s && s.cardId && onHover({ cardId: s.cardId })}>
          {s && !(s.faceDown && !isOwner) && <img src={s.image} alt={s.name} title={s.name} />}
          {s && s.faceDown && isOwner && <div className={styles.faceDown} />}
          {s && isOwner && renderEffectButtons(s)}
        </div>
      ))}

      {isOwner ? (
        <PileSlot
          style={{ gridRow: row(2), gridColumn: 7 }}
          label='Mazo-C'
          count={player.extra ? player.extra.length : player.extraCount}
          onClick={() => onOpenPile('extra')}
        />
      ) : (
        <PileSlot style={{ gridRow: row(2), gridColumn: 7 }} label='Mazo-C' count={player.extraCount} />
      )}

      <PileSlot style={{ gridRow: row(3), gridColumn: 7 }} label='Mazo' count={player.deckCount} />
    </div>
  );
}

// A single face-down pile with a count badge — Cementerio/Exilio/Mazo-C/Mazo are always exactly
// one board slot each, however many cards they hold (see the rulebook grid). Clickable only when
// `onClick` is given (Cementerio/Exilio are public on both sides; Mazo-C only for its owner).
function PileSlot({ style, label, count, onClick }) {
  return (
    <div
      style={style}
      className={`${styles.slot} ${styles.pileSlot} ${onClick ? styles.pileSlotClickable : ''}`}
      title={label}
      onClick={onClick}
    >
      <div className={styles.faceDown} />
      <span className={styles.pileLabel}>{label}</span>
      <span className={styles.pileCount}>{count}</span>
    </div>
  );
}

function PileModal({ title, cards, onClose, renderCardExtra }) {
  return (
    <div className={styles.pileOverlay} onClick={onClose}>
      <div className={styles.pileModal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.pileModalTitle}>
          {title} ({cards.length})
        </h3>
        <div className={styles.pileModalList}>
          {cards.length === 0 && <p className={styles.pileEmpty}>Vacío.</p>}
          {cards.map((card) => (
            <div key={card.instanceId} className={styles.pileModalCard}>
              <img src={card.image} alt={card.name} />
              <span className={styles.pileModalCardName}>{card.name}</span>
              {renderCardExtra && renderCardExtra(card)}
            </div>
          ))}
        </div>
        <button className={styles.surrenderButton} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

// The card face is drawn at its natural 480x700 and scaled down (never up) to whatever room the
// viewport leaves to the left of the board — the board is at most 900px wide and centered.
const FACE_WIDTH = 480;
const FACE_HEIGHT = 700;
const BOARD_WIDTH = 900;

function usePreviewScale() {
  const compute = () => {
    const room = (window.innerWidth - BOARD_WIDTH) / 2 - 20 - 16; // page padding + gap to the board
    return Math.max(0, Math.min(1, room / FACE_WIDTH, (window.innerHeight - 150) / FACE_HEIGHT));
  };
  const [scale, setScale] = useState(compute);
  useEffect(() => {
    const onResize = () => setScale(compute());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

// Enlarged card shown to the left of the board for whatever the cursor last rested on.
function CardPreview({ card }) {
  const scale = usePreviewScale();
  if (scale < 0.45) return null; // not enough room at this window size
  return (
    <div className={styles.cardPreview} style={{ width: FACE_WIDTH * scale, height: FACE_HEIGHT * scale }}>
      {card ? (
        <div style={{ width: FACE_WIDTH, height: FACE_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <CardFace card={card} />
        </div>
      ) : (
        <div className={styles.cardPreviewEmpty}>Pasa el cursor sobre una carta para verla en grande.</div>
      )}
    </div>
  );
}

const STATUS_ICONS = { Congelado: '❄', Quemadura: '🔥', Veneno: '☠' };

function humanizeReason(reason) {
  const map = {
    'normal-summon-used': 'Ya has hecho tu invocación normal este turno.',
    'cannot-pay-summon-cost': 'No puedes pagar el coste de invocación.',
    'no-field-space': 'No tienes espacio en el campo.',
    'not-in-hand': 'Esa carta no está en tu mano.',
    'invalid-position': 'Esa combinación de posición no es válida.',
    'not-available': 'Esa carta de fusión no está disponible.',
    'already-attacked': 'Ese monstruo ya atacó este turno.',
    'not-main-phase': 'Solo puedes hacer eso en tu Fase Principal.',
    'summoned-this-turn': 'Ese monstruo no puede cambiar de posición el turno en que fue invocado.',
    'already-changed-position': 'Ese monstruo ya cambió de posición este turno.',
    'same-position': 'Ese monstruo ya está en esa posición.',
    'monster-not-found': 'No se encontró ese monstruo.',
    'not-battle-phase': 'Solo puedes atacar en la fase de batalla.',
    'must-target-a-monster': 'El rival tiene monstruos: debes elegir uno como objetivo.',
    'not-your-turn': 'No es tu turno.',
    'not-in-graveyard': 'Esa carta no está en el cementerio.',
    'not-in-exile': 'Esa carta no está en el exilio.',
    'cannot-pay-cost': 'No puedes pagar el coste de este efecto.',
    'once-per-turn': 'Ese efecto ya se activó este turno.',
    'conditions-not-met': 'No se cumplen las condiciones para ese efecto.',
    'unknown-effect': 'Ese efecto no existe.',
    'cannot-be-summoned': 'Esa carta no puede ser invocada.',
    'special-summon-only': 'Esa carta solo puede invocarse de forma especial: cumple el requisito de su método de invocación.',
    'cannot-set-territory': 'Un Territorio no se puede colocar boca abajo.',
    'not-set-support': 'Ese apoyo no está colocado boca abajo.',
    'use-its-effect': 'Ese apoyo se activa con su efecto.',
    frozen: 'Ese monstruo está congelado y no puede activar efectos.',
    'not-compiled': 'Ese monstruo no es un monstruo compilado.',
    'compiled-this-turn': 'No puedes descompilar un monstruo el turno en que fue compilado.',
  };
  if (reason && reason.startsWith('missing-material')) return 'Los materiales elegidos no cumplen el requisito de fusión.';
  return map[reason] || 'Acción no válida.';
}

export default DuelPage;
