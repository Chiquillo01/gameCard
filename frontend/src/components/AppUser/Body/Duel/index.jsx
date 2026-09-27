import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
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
import { PHASE_LABELS, STATUS_ICONS, PhaseTracker, GuideBar, guideFor, forecastBattle, ChainBar, DetailsPanel, LastBattlePanel, trend, advanceLabel } from './DuelInfo';

const PIXELCOIN_ICON = 'https://res.cloudinary.com/dsd7efrba/image/upload/v1739100321/moneda3tcg_hmxpum.png';
const STARTING_VP = 80;

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
  // Rulebook: the player chooses where on the board a card lands. Set once what to place is known
  // (a Normal/Special Summon, a support placement, a Compilación) but before it's sent: the board's
  // own empty zones become clickable — { zone: 'monster'|'support', action, freeing }.
  const [pendingBoardSlot, setPendingBoardSlot] = useState(null);
  // A Cementerio/Exilio/Mazo-C pile the player clicked open: { side: 'me'|'enemy', zone }.
  const [openPile, setOpenPile] = useState(null);
  // The server asked us to pick a target for the action we just sent (a search effect's matches
  // from the deck/cementerio, or an Equipo card's legal monsters): { action, options }.
  const [pendingChoice, setPendingChoice] = useState(null);
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
  const lastLogAt = view && view.log.length ? view.log[view.log.length - 1].at : 0;

  // Keep the newest log line in sight.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lastLogAt]);

  // Atk/Vida and VP changes between two updates float over the card/badge for a moment
  // ("+2 Atk", "-3 VP"), so a buff, a debuff or a hit is seen as it happens.
  const flashes = useStatFlashes(view);

  const boardRef = useRef(null);
  const fieldsRef = useRef(null);
  const handCount = view ? view.players[view.you].hand.length : 0;
  const boardWidth = useBoardWidth(boardRef, fieldsRef, [!!view, handCount]);

  // A short banner when the turn passes from one player to the other.
  const [turnBanner, setTurnBanner] = useState(null);
  const turnKey = view ? `${view.turnNumber}:${view.turnPlayer}` : null;
  const prevTurnKey = useRef(null);
  useEffect(() => {
    if (!view || view.status !== 'active') return undefined;
    const first = prevTurnKey.current === null;
    prevTurnKey.current = turnKey;
    if (first) return undefined;
    setTurnBanner(view.turnPlayer === view.you ? `Turno ${view.turnNumber} · ¡Tu turno!` : `Turno ${view.turnNumber} · Turno de ${view.players[view.turnPlayer].name}`);
    const t = setTimeout(() => setTurnBanner(null), 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);

  useEffect(() => {
    if (matchId) return;
    getUserDecks().then(setDecks);
  }, [matchId]);

  // A view update can itself carry a pending choice — an automatic trigger's search (Avispa de
  // Obsidiana, Nido de Avispas...) waiting on this viewer's pick, not just a failed action's
  // choose-target. Reuses the same picker modal as ACTIVATE_SUPPORT/ACTIVATE_EFFECT's.
  const applyView = (data) => {
    setView(data);
    // A 'slot' choice (Avispa Mutante summoning itself) is answered on the board, not in the modal.
    if (data && data.pendingTriggerChoice && data.pendingTriggerChoice.kind === 'slot') {
      setPendingChoice(null);
    } else if (data && data.pendingTriggerChoice) {
      // An automatic effect's pick, or which cards to discard (hand limit, a rival's effect).
      setPendingChoice({ action: { type: 'RESOLVE_TRIGGER_CHOICE' }, options: data.pendingTriggerChoice.options, prompt: data.pendingTriggerChoice.prompt, forced: true });
    }
  };

  const refreshState = useCallback(async (id) => {
    try {
      const data = await getDuelState(id);
      applyView(data);
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
      if (data.id === matchId) applyView(data);
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
      applyView(result.state); // may itself open the picker if the new state has a trigger waiting
      if (!result.ok) {
        // Not a rule violation — the server needs the player to pick which of these it means.
        if (result.reason === 'choose-target' && result.options && result.options.length) {
          setPendingChoice({ action, options: result.options, prompt: result.prompt, forced: action.type === 'RESOLVE_TRIGGER_CHOICE' });
        } else {
          showToast('error', humanizeReason(result.reason));
        }
      } else if (!(result.state && result.state.pendingTriggerChoice) || result.state.pendingTriggerChoice.kind === 'slot') {
        setPendingChoice(null);
      }
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
    setPendingBoardSlot(null);
  };

  // The player picked one of the options the server offered for a pending choose-target action:
  // resend the same action with that pick added to whatever was already chosen — a cost needing
  // more than one card (Inferno's "descarta 2 Dragones") re-asks for the rest instead of grabbing
  // them itself, so this has to accumulate picks across rounds rather than replace them.
  const chooseTarget = (instanceId) => {
    if (!pendingChoice) return;
    const targets = [...(pendingChoice.action.targets || []), instanceId];
    act({ ...pendingChoice.action, targets });
  };

  // Only one decision can be open at a time: opening a new one replaces whatever was pending, so the
  // single panel always shows the card that was just picked.
  const closeChoices = () => {
    setPendingSummon(null);
    setPendingSupportChoice(null);
    setPendingPosition(null);
    setFusion(null);
    setPendingChoice(null);
    setPendingBoardSlot(null);
  };

  const confirmPositionChange = (position) => {
    if (!pendingPosition) return;
    act({ type: 'CHANGE_POSITION', instanceId: pendingPosition.instanceId, position });
    setPendingPosition(null);
  };

  const startFusion = (card) => {
    closeChoices();
    setFusion({ instanceId: card.instanceId, materials: new Set() });
    setOpenPile(null);
  };

  const onHandCardClick = (card) => {
    const isMyTurn = view.turnPlayer === view.you;
    const isMainPhase = view.phase === 'main1' || view.phase === 'main2';
    const chainOpen = !!view.chain;
    const canRespondToChain = chainOpen && view.chain.priorityPlayer === view.you;
    // Rulebook, Velocidades: an Apoyo Veloz/Contraataque (Speed 2/3) can be activated from hand in
    // any phase of its controller's own turn, not just Main Phase — and, like any Speed 2+ card,
    // as a response whenever it's this player's priority on an open Pila.
    const isFastSupport = card.category === 'support' && (card.subtype === 'instant' || card.subtype === 'counter');
    const canPlayNow = canRespondToChain || (isMyTurn && (isMainPhase || isFastSupport));
    if (!canPlayNow) {
      showToast('info', chainOpen ? 'Ahora mismo le toca responder al rival.' : 'Solo puedes jugar cartas en tu fase principal.');
      return;
    }

    if (fusion) {
      if (card.instanceId === fusion.instanceId || card.category !== 'monster') return;
      // Rulebook: Compilación materials come from the field, not hand, unless the card's own
      // recipe names "hand" for a specific requirement — check the real data instead of assuming.
      const fusionCardData = cardsById[cardInPlay(fusion.instanceId)?.cardId];
      const materialReqs = fusionCardData?.activationCost?.args?.materials || [];
      const allowsHand = materialReqs.some((m) => (m.zone ? [].concat(m.zone).includes('hand') : false));
      if (!allowsHand) {
        showToast('info', 'Esta Compilación solo acepta materiales que ya estén en tu Campo.');
        return;
      }
      toggleFusionMaterial(card.instanceId);
      return;
    }

    if (card.category === 'fusion') {
      startFusion(card);
      return;
    }

    closeChoices();

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

    // Rulebook: a monster whose invocation method says "Solo puede..." can only be special
    // summoned — with no Normal Summon option at all, its own card click just does that directly.
    if (card.normalSummonable === false) {
      if (card.specialSummonAvailable) {
        placeOnBoard('monster', { type: 'SPECIAL_SUMMON', instanceId: card.instanceId });
      } else {
        showToast('error', humanizeReason(card.cannotBeSummoned ? 'cannot-be-summoned' : 'special-summon-only'));
      }
      return;
    }

    // With both ways open (e.g. Avispa gigante), ask which one first — the Normal Summon slot for
    // the turn is only checked once that's the one picked.
    setPendingSummon({ instanceId: card.instanceId, stage: card.specialSummonAvailable ? 'method' : 'position' });
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

  // Which of the player's own board zones are empty right now — `freeing` lets a Compilación
  // count the slots its own field materials are about to vacate as available too.
  const emptySlots = (zone, freeing = []) => {
    const arr = zone === 'monster' ? me.field.monsters : me.field.support;
    return arr.reduce((acc, entry, i) => (entry === null || (entry && freeing.includes(entry.instanceId)) ? [...acc, i] : acc), []);
  };

  // Rulebook: the player chooses where on the board a card lands, not the engine — same "ask only
  // when it's a real choice" rule as everywhere else (cost payers, search picks): with 0 or 1
  // legal empty zone there's nothing to decide, otherwise the board's own empty zones light up.
  const placeOnBoard = async (zone, action, { freeing = [], onSuccess } = {}) => {
    const free = emptySlots(zone, freeing);
    if (free.length > 1) {
      setPendingBoardSlot({ zone, action, freeing, onSuccess });
      return;
    }
    const result = await act({ ...action, slot: free[0] });
    if (result?.ok && onSuccess) onSuccess();
  };

  // A card that summons itself (Avispa Mutante: "Si es añadida a tu Mano... invocarlo
  // inmediatamente") still lands where the player says — the server holds the duel until they
  // pick one of its legal zones. It comes from the view, so no local cancel can drop it.
  const triggerSlot = view?.pendingTriggerChoice?.kind === 'slot' ? view.pendingTriggerChoice : null;
  const boardSlotPicker = triggerSlot
    ? { zone: triggerSlot.zone, action: { type: 'RESOLVE_TRIGGER_CHOICE' }, freeing: [], slots: triggerSlot.slots, card: triggerSlot.card, forced: true, prompt: triggerSlot.prompt }
    : pendingBoardSlot;

  const pickBoardSlot = async (slot) => {
    if (!boardSlotPicker) return;
    const { action, onSuccess } = boardSlotPicker;
    setPendingBoardSlot(null);
    const result = await act({ ...action, slot });
    if (result?.ok && onSuccess) onSuccess();
  };

  const confirmSummon = (position, faceDown) => {
    if (!pendingSummon) return;
    const instanceId = pendingSummon.instanceId;
    setPendingSummon(null);
    placeOnBoard('monster', { type: 'NORMAL_SUMMON', instanceId, position, faceDown });
  };

  const confirmSpecialSummon = () => {
    if (!pendingSummon) return;
    const instanceId = pendingSummon.instanceId;
    setPendingSummon(null);
    placeOnBoard('monster', { type: 'SPECIAL_SUMMON', instanceId });
  };

  const confirmSupportChoice = (setFaceDown) => {
    if (!pendingSupportChoice) return;
    const instanceId = pendingSupportChoice;
    setPendingSupportChoice(null);
    placeOnBoard('support', { type: 'ACTIVATE_SUPPORT', instanceId, setFaceDown });
  };

  const confirmFusion = () => {
    if (!fusion) return;
    // A material already on the board frees its own slot — the compiled monster can land there too.
    const freeing = [...fusion.materials].filter((id) => me.field.monsters.some((m) => m && m.instanceId === id));
    placeOnBoard(
      'monster',
      { type: 'COMPILE_SUMMON', instanceId: fusion.instanceId, materialInstanceIds: [...fusion.materials] },
      { freeing, onSuccess: () => setFusion(null) }
    );
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
        closeChoices();
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
  const attackerView = selectedAttacker && me.field.monsters.find((m) => m && m.instanceId === selectedAttacker);
  const canAttackDirectly = !!attackerView && attackerView.canAttackDirectly && !view.chain;

  // `inline` renders plain buttons in a row (for the pile modal's list); the default is a small
  // dropdown that pops up above the card (for a slot out on the field).
  const renderEffectButtons = (card, inline = false) => {
    if (!card.availableEffects || !card.availableEffects.length) return null;
    return (
      <div className={inline ? styles.effectButtonsInline : styles.effectButtons}>
        {card.availableEffects.map((effectId) => {
          const label = (card.effectLabels && card.effectLabels[effectId]) || formatEffectId(effectId);
          return (
            <button
              key={effectId}
              className={styles.effectButton}
              onClick={(e) => {
                e.stopPropagation();
                activateEffect(effectId, card.instanceId);
              }}
              title={`Activar: ${label}`}
            >
              ⚡ {label}
            </button>
          );
        })}
      </div>
    );
  };

  // One panel for every pending decision (summon, position change, support, compilation): the card
  // it is about plus the options that make sense for it right now.
  const cardInPlay = (instanceId) => me.hand.find((c) => c.instanceId === instanceId) || me.field.monsters.find((m) => m && m.instanceId === instanceId);
  const choicePanel = (() => {
    const cancel = { label: 'Cancelar', variant: 'cancel', onClick: cancelPendingChoices };
    if (boardSlotPicker) {
      const zoneLabel = boardSlotPicker.zone === 'monster' ? 'zona de Monstruos' : 'zona de Apoyo';
      return {
        card: boardSlotPicker.card || cardInPlay(boardSlotPicker.action.instanceId),
        prompt: boardSlotPicker.forced ? boardSlotPicker.prompt || 'Se invoca de forma especial: elige dónde' : 'Elige dónde colocarla',
        hint: `Haz click en una casilla vacía de tu ${zoneLabel}`,
        options: boardSlotPicker.forced ? [] : [cancel],
      };
    }
    if (fusion) {
      const fusionCard = cardInPlay(fusion.instanceId);
      const requirement = cardsById[fusionCard?.cardId]?.invocationText;
      return {
        card: fusionCard,
        prompt: 'Compilar',
        hint: `${requirement ? `${requirement} — ` : ''}Selecciona los materiales en tu Campo (${fusion.materials.size} elegidos)`,
        options: [{ label: 'Confirmar compilación', variant: 'confirm', onClick: confirmFusion }, cancel],
      };
    }
    if (pendingSummon && pendingSummon.stage === 'method') {
      return {
        card: cardInPlay(pendingSummon.instanceId),
        prompt: '¿Invocas de forma normal o especial?',
        options: [
          { label: 'Invocar normal', onClick: () => setPendingSummon({ ...pendingSummon, stage: 'position' }) },
          { label: 'Invocar especial', variant: 'confirm', onClick: confirmSpecialSummon },
          cancel,
        ],
      };
    }
    if (pendingSummon) {
      return {
        card: cardInPlay(pendingSummon.instanceId),
        prompt: '¿Cómo invocas esta carta?',
        options: [
          { label: 'Ataque', onClick: () => confirmSummon('attack', false) },
          { label: 'Defensa', onClick: () => confirmSummon('defense', false) },
          { label: 'Boca abajo', onClick: () => confirmSummon('defense', true) },
          cancel,
        ],
      };
    }
    if (pendingPosition) {
      const options = [];
      if (pendingPosition.faceDown || pendingPosition.position !== 'attack') options.push({ label: 'Ataque', onClick: () => confirmPositionChange('attack') });
      if (pendingPosition.faceDown || pendingPosition.position !== 'defense') options.push({ label: 'Defensa', onClick: () => confirmPositionChange('defense') });
      return {
        card: pendingPosition.faceDown ? null : cardInPlay(pendingPosition.instanceId),
        prompt: pendingPosition.faceDown ? 'Voltear boca arriba en:' : 'Cambiar posición a:',
        options: [...options, cancel],
      };
    }
    if (pendingSupportChoice) {
      return {
        card: cardInPlay(pendingSupportChoice),
        prompt: '¿Activar ahora o colocar boca abajo?',
        options: [
          { label: 'Activar', onClick: () => confirmSupportChoice(false) },
          { label: 'Boca abajo', onClick: () => confirmSupportChoice(true) },
          cancel,
        ],
      };
    }
    return null;
  })();

  const isFusionMaterialCandidate = (card) => !!fusion && card.instanceId !== fusion.instanceId && card.category === 'monster';

  const names = view.players.map((p, idx) => (idx === you ? 'Tú' : p.name));
  const guide = guideFor({ view, me, enemy, isMyTurn, attacker: attackerView, canAttackDirectly, choicePending: !!pendingChoice || !!view.pendingTriggerChoice });
  // While an attacker is picked, resting the cursor on a rival monster previews the battle.
  const forecast =
    attackerView && !view.chain && hovered && hovered.owner === 'enemy' && hovered.kind === 'monster' && hovered.entry
      ? forecastBattle(attackerView, hovered.entry, cardsById)
      : null;
  const isMyBattle = isMyTurn && view.phase === 'battle';

  return (
    <div className={styles.duelPage} style={{ "--board-w": `${boardWidth}px` }}>
      {view.status === 'finished' && (
        <div className={styles.gameOverOverlay}>
          <div className={styles.gameOverPlaque}>
            <div>{view.winnerIndex === you ? '¡Victoria!' : view.winnerIndex === opp ? 'Derrota' : 'Partida terminada'}</div>
            <div className={styles.gameOverActions}>
              <button className={styles.actionButton} onClick={() => navigate('/duel')}>
                Jugar de nuevo
              </button>
              <button className={styles.surrenderButton} onClick={() => navigate('/')}>
                Salir
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingChoice && (
        <PileModal
          title={pendingChoice.prompt || 'Elige un objetivo'}
          cards={pendingChoice.options}
          // A choice the duel is waiting on (an automatic effect's pick, a forced discard) can't be
          // dismissed — nothing else can happen until it's answered.
          onClose={pendingChoice.forced ? null : () => setPendingChoice(null)}
          renderCardExtra={(card) => (
            <button className={styles.effectButton} onClick={() => chooseTarget(card.instanceId)}>
              Elegir
            </button>
          )}
        />
      )}

      {openPile && (
        <PileModal
          title={PILE_LABELS[openPile.zone]}
          cards={openPile.side === 'me' ? me[openPile.zone] : enemy[openPile.zone]}
          onClose={() => setOpenPile(null)}
          renderCardExtra={(card) =>
            openPile.side === 'me' && openPile.zone === 'extra' ? (
              <button className={styles.effectButton} onClick={() => startFusion(card)}>
                Compilar
              </button>
            ) : openPile.side === 'me' && card.specialSummonAvailable ? (
              // Aboleth, Perro Esqueleto: their invocation method names the Cementerio/Exilio as
              // a legal source, not just the Mano.
              <button
                className={styles.effectButton}
                onClick={() => {
                  placeOnBoard('monster', { type: 'SPECIAL_SUMMON', instanceId: card.instanceId });
                  setOpenPile(null);
                }}
              >
                Invocar especial
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
        <PhaseTracker phase={view.phase} isMyTurn={isMyTurn} turnNumber={view.turnNumber} turnPlayerName={view.players[view.turnPlayer].name} />
        <div className={styles.topBarActions}>
          <button
            className={styles.actionButton}
            disabled={!isMyTurn || view.status !== 'active' || !!view.chain}
            onClick={() => act({ type: 'ADVANCE_PHASE' })}
          >
            {advanceLabel(view.phase, view.turnNumber)}
          </button>
          <button className={styles.surrenderButton} onClick={() => act({ type: 'SURRENDER' })}>
            Rendirse
          </button>
        </div>
      </div>

      {turnBanner && <div className={styles.turnBanner}>{turnBanner}</div>}

      {/* On wide screens these two move into the column beside the board (sidePanel), leaving the
          height above the board to the board itself. */}
      {view.chain && <ChainBar className={styles.topOnly} chain={view.chain} you={you} names={names} onPass={() => act({ type: 'PASS_CHAIN' })} />}
      <GuideBar className={styles.topOnly} guide={guide} forecast={forecast} />

      <div className={styles.board} ref={boardRef}>
        <div className={styles.playerHeader}>
          <span className={styles.playerName}>{enemy.name}</span>
          {/* A direct attack hits the rival's VP, so their VP is where the player clicks for it —
              lit up only while the selected attacker can legally attack directly. */}
          <VpBadge vp={enemy.vp} flash={flashes[`vp${opp}`]} onDirectAttack={canAttackDirectly ? onDirectAttack : null} />
          <span className={styles.handCountBadge} title='Cartas en la Mano del rival'>✋ {enemy.handCount}</span>
          <span className={styles.handCountBadge} title='Píxeles del rival: sirven para pagar las activaciones de los apoyos'>
            <img src={PIXELCOIN_ICON} alt='Pixeles' className={styles.pixelIcon} /> {enemy.pixelcoins}
          </span>
          {view.turnPlayer === opp && (
            <span className={`${styles.handCountBadge} ${enemy.normalSummonUsed ? styles.badgeMuted : ''}`}>{enemy.normalSummonUsed ? 'Invocación normal usada' : 'Invocación normal disponible'}</span>
          )}
        </div>
        <div className={styles.fieldsRow} ref={fieldsRef}>
        <CardPreview card={previewCard} boardWidth={boardWidth} />
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
          flashes={flashes}
          attackTargetMode={!!attackerView && !view.chain}
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
          slotPicker={boardSlotPicker}
          onPickSlot={pickBoardSlot}
          flashes={flashes}
          isMyBattle={isMyBattle && !view.chain}
        />

        <div className={styles.sidePanel}>
          {view.chain && <ChainBar className={styles.sideOnly} chain={view.chain} you={you} names={names} onPass={() => act({ type: 'PASS_CHAIN' })} />}
          <GuideBar className={styles.sideOnly} guide={guide} forecast={forecast} />
          <DetailsPanel hovered={hovered} isMyBattle={isMyBattle} />
          <LastBattlePanel battle={view.lastBattle} you={you} names={names} />
          <div className={styles.log}>
            <span className={styles.logTitle}>Registro</span>
            <div className={styles.logScroll} ref={logRef}>
              {view.log.map((l, i) => (
                <div key={`${l.at}-${i}`}>
                  {(i === 0 || view.log[i - 1].turn !== l.turn) && <div className={styles.logTurn}>── Turno {l.turn} ──</div>}
                  <div className={`${styles.logLine} ${l.actor === you ? styles.logMine : l.actor === opp ? styles.logRival : ''}`}>
                    <span className={styles.logPhase}>{PHASE_LABELS[l.phase] || l.phase}</span> {l.message}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {choicePanel && (
            <div className={styles.actionSlot}>
              <ChoicePanel panel={choicePanel} />
            </div>
          )}
        </div>
        </div>

        <div className={styles.playerHeader}>
          <span className={styles.playerName}>{me.name} (tú)</span>
          <VpBadge vp={me.vp} flash={flashes[`vp${you}`]} />
          <span className={styles.pixelBadge} title='Sirven para pagar las activaciones de los apoyos'>
            <img src={PIXELCOIN_ICON} alt='Pixeles' className={styles.pixelIcon} /> {me.pixelcoins}
          </span>
          {isMyTurn && (
            <span className={`${styles.handCountBadge} ${me.normalSummonUsed ? styles.badgeMuted : ''}`}>{me.normalSummonUsed ? 'Invocación normal usada' : 'Invocación normal disponible'}</span>
          )}
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
              onMouseEnter={() => setHovered({ cardId: card.cardId, owner: 'me', kind: 'hand' })}
              title={card.name}
            >
              <img src={card.image} alt={card.name} />
              {!fusion && renderEffectButtons(card)}
            </div>
          ))}
        </div>
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
function PlayerField({ player, isOwner, flipped, selectedAttacker, fusion, canDecompile, onDecompile, onMonsterClick, onOpenPile, renderEffectButtons, onHover, onSupportClick, slotPicker, onPickSlot, flashes, isMyBattle, attackTargetMode }) {
  const row = (r) => (flipped ? 3 - r : r);
  // In your Battle Phase your monsters that can still attack glow and the spent ones fade; once an
  // attacker is picked, the rival's monsters are marked as targets.
  const attackStateClass = (m) => {
    if (!m) return '';
    if (!isOwner) return attackTargetMode ? styles.attackTarget : '';
    if (!isMyBattle || m.faceDown) return '';
    return m.attacksLeft > 0 && m.position === 'attack' ? styles.canAttack : styles.spent;
  };
  // A zone the player can click to place the card they're summoning/compiling/setting — either
  // empty, or one of a Compilación's own field materials that's about to vacate it.
  // `slots`, when the server sent them, is the exact legal list (it already skips corroded zones).
  const isPickable = (zone, m, i) =>
    isOwner && slotPicker && slotPicker.zone === zone && (slotPicker.slots ? slotPicker.slots.includes(i) : m === null || (m && slotPicker.freeing.includes(m.instanceId)));

  return (
    <div className={styles.fieldGrid}>
      {player.field.monsters.map((m, i) => (
        <div
          key={`m${i}`}
          style={{ gridRow: row(1), gridColumn: i + 1 }}
          className={`${styles.slot} ${styles.monsterSlot} ${m?.position === 'defense' ? styles.defense : ''} ${
            m && (m.instanceId === selectedAttacker || (fusion && isOwner && fusion.materials.has(m.instanceId))) ? styles.selected : ''
          } ${isPickable('monster', m, i) ? styles.pickable : ''} ${attackStateClass(m)}`}
          onClick={() => (isPickable('monster', m, i) ? onPickSlot(i) : m && onMonsterClick(m))}
          onMouseEnter={() =>
            m &&
            onHover({
              cardId: m.cardId,
              isToken: m.isToken,
              name: m.name,
              atk: m.atk,
              def: m.def,
              entry: m,
              owner: isOwner ? 'me' : 'enemy',
              kind: 'monster',
            })
          }
        >
          {m && (flashes || {})[m.instanceId] && <FlashDelta flash={flashes[m.instanceId]} />}
          {m && m.faceDown && isOwner && m.atk != null && <StatBar m={m} />}
          {m && !m.faceDown && (
            <>
              {m.isToken ? <div className={styles.tokenFace}>{m.name}</div> : <img src={m.image} alt={m.name} title={m.name} />}
              <StatBar m={m} />
              <SlotTags m={m} />
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

      <div style={{ gridRow: row(2), gridColumn: 1 }} className={`${styles.slot} ${styles.territorySlot}`} title='Territorio' onMouseEnter={() => player.field.territory && onHover({ cardId: player.field.territory.cardId, entry: player.field.territory, owner: isOwner ? 'me' : 'enemy', kind: 'support' })}>
        {player.field.territory && (
          <>
            <img src={player.field.territory.image} alt={player.field.territory.name} title={player.field.territory.name} />
            {isOwner && renderEffectButtons(player.field.territory)}
          </>
        )}
      </div>

      {player.field.support.map((s, i) => (
        <div
          key={`s${i}`}
          style={{ gridRow: row(2), gridColumn: i + 2 }}
          className={`${styles.slot} ${isPickable('support', s, i) ? styles.pickable : ''}`}
          title='Soporte'
          onClick={() => (isPickable('support', s, i) ? onPickSlot(i) : s && isOwner && onSupportClick && onSupportClick(s))}
          onMouseEnter={() => s && onHover({ cardId: s.cardId, entry: s, owner: isOwner ? 'me' : 'enemy', kind: 'support' })}
        >
          {s && !s.faceDown && <img src={s.image} alt={s.name} title={s.name} />}
          {s && s.faceDown && <div className={styles.faceDown} />}
          {s && s.equippedToName && (
            <span className={styles.slotTag} title={`Equipada a ${s.equippedToName}`}>
              ✚
            </span>
          )}
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

      <PileSlot style={{ gridRow: row(2), gridColumn: 6 }} label='Mazo' count={player.deckCount} />
    </div>
  );
}

// VP with a bar out of the starting 80 and the last change floating over it. For the rival, while
// a direct attack is possible, it is also the button for that attack.
function VpBadge({ vp, flash, onDirectAttack }) {
  const pct = Math.max(0, Math.min(100, (vp / STARTING_VP) * 100));
  const content = (
    <>
      <span>
        {onDirectAttack ? '⚔ ' : ''}VP {vp}
      </span>
      <span className={styles.vpBar}>
        <span className={`${styles.vpFill} ${pct <= 25 ? styles.vpLow : ''}`} style={{ width: `${pct}%` }} />
      </span>
      <FlashDelta flash={flash} />
    </>
  );
  if (onDirectAttack) {
    return (
      <button className={`${styles.vpBadge} ${styles.directTarget}`} onClick={onDirectAttack} title='Atacar directamente a los VP del rival'>
        {content}
      </button>
    );
  }
  return (
    <span className={styles.vpBadge} title='Puntos de victoria: pierde quien llega a 0 o quien se queda con un tercio o menos de los VP del rival'>
      {content}
    </span>
  );
}

// Small markers on a monster's top-left corner: equips, materials and counters on it.
function SlotTags({ m }) {
  const tags = [];
  if (m.equips && m.equips.length) tags.push({ text: `✚${m.equips.length}`, title: `Equipos: ${m.equips.join(', ')}` });
  if (m.materialCount) tags.push({ text: `◆${m.materialCount}`, title: `Compilado con ${m.materialCount} material(es)` });
  Object.entries(m.counters || {}).forEach(([k, v]) => {
    if (v > 0) tags.push({ text: `⚙${v}`, title: `${k === 'gear' ? 'Engranajes' : k}: ${v}` });
  });
  if (!tags.length) return null;
  return (
    <span className={styles.slotTags}>
      {tags.map((t) => (
        <span key={t.text} className={styles.slotTag} title={t.title}>
          {t.text}
        </span>
      ))}
    </span>
  );
}

// "⚔ 5 ▲" — Atk and Vida on the card, green when above the printed value, red when below.
function StatBar({ m }) {
  const atkTrend = trend(m.atk, m.printedAtk);
  const defTrend = trend(m.def, m.printedDef);
  const cls = (t) => (t === 'up' ? styles.statUp : t === 'down' ? styles.statDown : '');
  const arrow = (t) => (t === 'up' ? '▲' : t === 'down' ? '▼' : '');
  return (
    <span className={`${styles.statBadge} ${m.position === 'defense' ? styles.statBadgeDefense : ''}`}>
      <span className={`${cls(atkTrend)} ${m.position === 'attack' ? styles.statActive : ''}`} title={`Atk ${m.atk}${atkTrend !== 'same' ? ` (impreso ${m.printedAtk})` : ''}`}>
        ⚔{m.atk}
        {arrow(atkTrend)}
      </span>
      <span className={`${cls(defTrend)} ${m.position === 'defense' ? styles.statActive : ''}`} title={`Vida ${m.def}${defTrend !== 'same' ? ` (impresa ${m.printedDef})` : ''}`}>
        ♥{m.def}
        {arrow(defTrend)}
      </span>
    </span>
  );
}

// A single face-down pile with a count badge — Cementerio/Exilio/Mazo-C/Mazo are always exactly
// one board slot each, however many cards they hold (see the rulebook grid). Clickable only when
// `onClick` is given (Cementerio/Exilio are public on both sides; Mazo-C only for its owner).
// The single decision panel: a thumbnail of the card in question, what is being asked, and one button
// per option. It wraps on narrow screens (thumbnail + text on top, buttons below).
function ChoicePanel({ panel }) {
  const variants = { confirm: 'directAttackButton', cancel: 'surrenderButton' };
  return (
    <div className={styles.choiceBar}>
      <div className={styles.choiceInfo}>
        {panel.card && panel.card.image && <img className={styles.choiceThumb} src={panel.card.image} alt={panel.card.name} />}
        <div className={styles.choiceText}>
          {panel.card && panel.card.name && <span className={styles.choiceCardName}>{panel.card.name}</span>}
          <span>{panel.prompt}</span>
          {panel.hint && <span className={styles.choiceHint}>{panel.hint}</span>}
        </div>
      </div>
      <div className={styles.choiceOptions}>
        {panel.options.map((o) => (
          <button key={o.label} className={styles[variants[o.variant] || 'actionButton']} onClick={o.onClick}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

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
    <div className={styles.pileOverlay} onClick={onClose || undefined}>
      <div className={styles.pileModal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.pileModalTitle}>
          {title} ({cards.length})
        </h3>
        <div className={styles.pileModalList}>
          {cards.length === 0 && <p className={styles.pileEmpty}>Vacío.</p>}
          {cards.map((card) => (
            <div key={card.instanceId} className={styles.pileModalCard}>
              {card.image && <img src={card.image} alt={card.name} />}
              <span className={styles.pileModalCardName}>{card.name}</span>
              {renderCardExtra && renderCardExtra(card)}
            </div>
          ))}
        </div>
        {onClose && (
          <button className={styles.surrenderButton} onClick={onClose}>
            Cerrar
          </button>
        )}
      </div>
    </div>
  );
}

// Wide screens (the preview and the log hang beside the board): the board grows into the room the
// window leaves — as wide as fits between the two side columns and as tall as fits without
// scrolling (the two fields are ~0.85 times as tall as the board is wide). Narrower: 700px, as before.
const WIDE_LAYOUT = 1421; // keep in sync with the media query in duel.module.css
const BASE_BOARD = 700;
const MAX_BOARD = 1100;
const SIDE_COLUMN_MIN = 320;

function useBoardWidth(boardRef, fieldsRef, deps) {
  const [width, setWidth] = useState(BASE_BOARD);
  useLayoutEffect(() => {
    const fit = () => {
      const board = boardRef.current;
      const fields = fieldsRef.current;
      if (!board || !fields) return;
      if (window.innerWidth < WIDE_LAYOUT) {
        setWidth(BASE_BOARD);
        return;
      }
      const b = board.getBoundingClientRect();
      const f = fields.getBoundingClientRect();
      const ratio = f.height / b.width;
      // Everything on the page that isn't the two fields: above them, and below them to the page end.
      const pagePadding = parseFloat(getComputedStyle(board.parentElement).paddingBottom) || 0;
      const other = f.top + window.scrollY + (b.bottom - f.bottom) + pagePadding;
      const byHeight = (window.innerHeight - other) / ratio;
      const byWidth = window.innerWidth - 2 * (SIDE_COLUMN_MIN + 48);
      const next = Math.round(Math.max(BASE_BOARD, Math.min(byHeight, byWidth, MAX_BOARD)));
      setWidth((w) => (Math.abs(w - next) > 4 ? next : w));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return width;
}

// The card face is drawn at its natural 480x700 and scaled down (never up) to whatever room the
// viewport leaves to the left of the board.
const FACE_WIDTH = 480;
const FACE_HEIGHT = 700;

function usePreviewScale(boardWidth) {
  const compute = () => {
    const room = (window.innerWidth - boardWidth) / 2 - 20 - 16; // page padding + gap to the board
    return Math.max(0, Math.min(1, room / FACE_WIDTH, (window.innerHeight - 150) / FACE_HEIGHT));
  };
  const [scale, setScale] = useState(compute);
  useEffect(() => {
    const onResize = () => setScale(compute());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardWidth]);
  return scale;
}

// Enlarged card shown to the left of the board for whatever the cursor last rested on.
function CardPreview({ card, boardWidth }) {
  const scale = usePreviewScale(boardWidth);
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

// Compares every field monster's Atk/Vida and each player's VP with the previous view and keeps the
// differences for a couple of seconds: { [instanceId | 'vp0' | 'vp1']: { atk?, def?, vp?, stamp } }.
function useStatFlashes(view) {
  const prevRef = useRef(null);
  const [flashes, setFlashes] = useState({});
  useEffect(() => {
    if (!view) return;
    const current = {};
    view.players.forEach((p, idx) => {
      current[`vp${idx}`] = { vp: p.vp };
      p.field.monsters.forEach((m) => {
        if (m && m.atk != null) current[m.instanceId] = { atk: m.atk, def: m.def };
      });
    });
    const prev = prevRef.current;
    prevRef.current = current;
    if (!prev) return;
    const stamp = Date.now();
    const changed = {};
    Object.entries(current).forEach(([key, now]) => {
      const before = prev[key];
      if (!before) return;
      const diff = {};
      Object.keys(now).forEach((stat) => {
        if (before[stat] != null && now[stat] !== before[stat]) diff[stat] = now[stat] - before[stat];
      });
      if (Object.keys(diff).length) changed[key] = { ...diff, stamp };
    });
    const keys = Object.keys(changed);
    if (!keys.length) return;
    setFlashes((f) => ({ ...f, ...changed }));
    setTimeout(() => {
      setFlashes((f) => {
        const next = { ...f };
        keys.forEach((k) => {
          if (next[k] && next[k].stamp === stamp) delete next[k];
        });
        return next;
      });
    }, 2600);
  }, [view]);
  return flashes;
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

// "+2 Atk", "-1 Vida", "-3 VP" floating over the card or badge that just changed.
function FlashDelta({ flash }) {
  if (!flash) return null;
  const parts = [
    flash.atk ? { text: `${signed(flash.atk)} Atk`, up: flash.atk > 0 } : null,
    flash.def ? { text: `${signed(flash.def)} Vida`, up: flash.def > 0 } : null,
    flash.vp ? { text: `${signed(flash.vp)} VP`, up: flash.vp > 0 } : null,
  ].filter(Boolean);
  return (
    <span className={styles.flashDelta} key={flash.stamp}>
      {parts.map((p) => (
        <span key={p.text} className={p.up ? styles.flashUp : styles.flashDown}>
          {p.text}
        </span>
      ))}
    </span>
  );
}

function humanizeReason(reason) {
  const map = {
    'normal-summon-used': 'Ya has hecho tu invocación normal este turno.',
    'cannot-pay-summon-cost': 'No puedes pagar el coste de invocación.',
    'no-field-space': 'No tienes espacio en el campo.',
    'not-in-hand': 'Esa carta no está en tu mano.',
    'invalid-position': 'Esa combinación de posición no es válida.',
    'not-available': 'Esa carta de compilación no está disponible.',
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
    'no-legal-equip-target': 'No tienes ningún monstruo válido para equipar esta carta.',
    'too-slow': 'Esa carta no es lo bastante rápida para responder ahora mismo.',
    'chain-open': 'Hay una cadena abierta: primero hay que resolverla.',
    'not-your-priority': 'Ahora mismo le toca responder al rival.',
    'no-chain': 'No hay ninguna cadena que pasar.',
    'trigger-choice-pending': 'Primero tienes que elegir la carta para ese efecto.',
    'no-response-window': 'Esa carta solo se puede usar en respuesta a lo que indica su texto.',
    'no-legal-target': 'No hay ningún objetivo válido para ese efecto.',
    'attacks-disabled': 'No puedes atacar este turno.',
    'cannot-be-targeted': 'Ese monstruo no puede ser objetivo de ataques.',
    'unique-card': 'Solo puedes tener una carta con ese nombre en el Campo.',
    'invalid-equip-target': 'Esa carta no se puede equipar a ese monstruo.',
    'not-your-card': 'Esa carta no es tuya.',
    'face-down': 'Una carta boca abajo no puede activar sus efectos.',
    frozen: 'Esa carta está congelada y no puede activar efectos.',
    'attacker-not-found': 'Ese monstruo ya no está en el Campo.',
    'defender-not-found': 'El monstruo atacado ya no está en el Campo.',
    'not-your-choice': 'Esa elección le corresponde al rival.',
    'no-pending-choice': 'No hay ninguna elección pendiente.',
    'no-special-summon-method': 'Esa carta no tiene un método de invocación especial.',
    'special-summon-condition-not-met': 'No cumples la condición para invocarla de forma especial.',
    'cannot-pay-special-summon-cost': 'No puedes pagar el coste de la invocación especial.',
    'invalid-equip-target': 'Ese monstruo no puede llevar este equipo.',
    frozen: 'Ese monstruo está congelado y no puede activar efectos.',
    'not-compiled': 'Ese monstruo no es un monstruo compilado.',
    'compiled-this-turn': 'No puedes descompilar un monstruo el turno en que fue compilado.',
  };
  if (reason && reason.startsWith('missing-material')) return 'Los materiales elegidos no cumplen el requisito de compilación.';
  return map[reason] || 'Acción no válida.';
}

export default DuelPage;
