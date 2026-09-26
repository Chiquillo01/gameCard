// The duel's information panels: the phase tracker and "what to do now" guide, the Pila, the
// details of whatever card the cursor is on (with every Atk/Vida change and where it came from),
// the last battle step by step, and a battle forecast while picking an attack target.
import styles from './duel.module.css';

export const PHASES = [
  { id: 'draw', label: 'Robo' },
  { id: 'standby', label: 'Espera' },
  { id: 'main1', label: 'Principal 1' },
  { id: 'battle', label: 'Batalla' },
  { id: 'main2', label: 'Principal 2' },
  { id: 'end', label: 'Final' },
];

export const PHASE_LABELS = Object.fromEntries(PHASES.map((p) => [p.id, p.label]));

// What "Avanzar fase" leads to (rulebook: the very first turn has no Battle Phase).
export function advanceLabel(phase, turnNumber) {
  if (phase === 'end') return 'Pasar turno ▸';
  if (phase === 'main1' && turnNumber === 1) return 'Ir a Final ▸';
  const idx = PHASES.findIndex((p) => p.id === phase);
  return idx >= 0 && PHASES[idx + 1] ? `Ir a ${PHASES[idx + 1].label} ▸` : 'Avanzar fase ▸';
}

const SUPPORT_SUBTYPES = {
  normal: 'Apoyo Normal',
  continuous: 'Apoyo Continuo',
  equipment: 'Equipo',
  field: 'Territorio',
  instant: 'Apoyo Veloz',
  counter: 'Contraataque',
};

const COUNTER_LABELS = { gear: 'Engranaje' };

const MOD_KINDS = {
  continuous: 'mientras siga en juego',
  turn: 'hasta el final del turno',
  status: 'mientras dure el estado',
  permanent: 'permanente',
};

export const STATUS_ICONS = { Congelado: '❄', Quemadura: '🔥', Veneno: '☠' };

const STATUS_HELP = {
  Congelado: 'No puede activar efectos; si lucha contra un monstruo de Agua, se destruye.',
  Quemadura: 'Recibe el doble de daño en sus batallas y quema 5 VP al final del turno.',
  Veneno: 'Pierde Atk/Vida mientras dure.',
};

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

// ▲ green when the card is above its printed value, ▼ red when below.
export function trend(current, printed) {
  if (current == null || printed == null || current === printed) return 'same';
  return current > printed ? 'up' : 'down';
}

export function PhaseTracker({ phase, isMyTurn, turnNumber, turnPlayerName }) {
  const current = PHASES.findIndex((p) => p.id === phase);
  return (
    <div className={styles.phaseTracker}>
      <span className={`${styles.turnTag} ${isMyTurn ? styles.turnTagMine : styles.turnTagRival}`}>
        Turno {turnNumber} · {isMyTurn ? 'Tu turno' : `Turno de ${turnPlayerName}`}
      </span>
      <ol className={styles.phaseSteps}>
        {PHASES.map((p, i) => (
          <li
            key={p.id}
            className={`${styles.phaseStep} ${i < current ? styles.phaseDone : ''} ${i === current ? styles.phaseCurrent : ''}`}
          >
            {p.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

// The next step, in plain words, for whatever the duel is waiting on right now.
export function guideFor({ view, me, enemy, isMyTurn, attacker, canAttackDirectly, choicePending }) {
  const you = view.you;
  if (view.status !== 'active') return null;
  if (choicePending) return { tone: 'action', text: 'Tienes que elegir: responde a la ventana abierta para seguir.' };
  if (view.chain) {
    const top = view.chain.links[view.chain.links.length - 1];
    const topIsRival = top.controllerIndex !== you;
    if (view.chain.priorityPlayer === you) {
      const what = top.kind === 'attack' ? `${topIsRival ? 'El rival declara' : 'Declaras'} "${top.cardName}"` : `${topIsRival ? 'El rival activa' : 'Activas'} ${top.cardName}`;
      return {
        tone: 'action',
        text: `${what}. Puedes responder con una carta de Velocidad ${Math.max(2, top.speed)} o más (Apoyo Veloz, Contraataque o un efecto rápido) o pulsar "Pasar" para que se resuelva.`,
      };
    }
    return { tone: 'wait', text: 'Esperando a que el rival responda o pase…' };
  }
  if (!isMyTurn) return { tone: 'wait', text: `Turno de ${enemy.name}. Espera a que termine; si ataca, podrás responder.` };

  const next = advanceLabel(view.phase, view.turnNumber).replace(" ▸", "");
  const summon = me.normalSummonUsed ? 'ya usaste tu invocación normal' : 'aún tienes tu invocación normal';
  switch (view.phase) {
    case 'draw':
    case 'standby':
      return { tone: 'info', text: `Pulsa "${next}" hasta llegar a tu Fase Principal.` };
    case 'main1':
      return {
        tone: 'info',
        text: `Fase Principal 1: invoca monstruos (${summon}), coloca o activa Apoyos y compila desde tu Mazo-C. Pulsa un monstruo tuyo para cambiar su posición. ${view.turnNumber === 1 ? 'En el primer turno de la partida no hay Batalla.' : 'Después viene la Batalla.'}`,
      };
    case 'battle': {
      if (attacker) {
        const target = canAttackDirectly ? 'Pulsa los VP del rival (arriba) para atacarle directamente.' : 'Pulsa un monstruo rival para atacarlo.';
        return { tone: 'action', text: `Atacante: ${attacker.name} (Atk ${attacker.atk}). ${target} Pasa el cursor por un monstruo rival para ver cómo acabaría. Vuelve a pulsar a tu monstruo para cancelar.` };
      }
      const ready = me.field.monsters.filter((m) => m && !m.faceDown && m.attacksLeft > 0 && m.position === 'attack').length;
      return ready
        ? { tone: 'action', text: `Fase de Batalla: pulsa uno de tus monstruos en Ataque para elegirlo como atacante (${ready} pueden atacar). "${next}" termina la batalla.` }
        : { tone: 'info', text: `Fase de Batalla: no te queda ningún monstruo que pueda atacar. Pulsa "${next}".` };
    }
    case 'main2':
      return { tone: 'info', text: `Fase Principal 2: aún puedes invocar (${summon}) y jugar Apoyos. "${next}" y luego "Pasar turno" terminan tu turno.` };
    case 'end':
      return { tone: 'info', text: `Fase Final: pulsa "${next}" para ceder el turno al rival.` };
    default:
      return null;
  }
}

export function GuideBar({ guide, forecast, className = '' }) {
  if (!guide && !forecast) return null;
  return (
    <div className={`${styles.guideBar} ${guide ? styles['guide_' + guide.tone] : ''} ${className}`}>
      {guide && (
        <p className={styles.guideText}>
          <span className={styles.guideIcon}>{guide.tone === 'wait' ? '⌛' : guide.tone === 'action' ? '👉' : 'ℹ'}</span>
          {guide.text}
        </p>
      )}
      {forecast && (
        <div className={styles.forecast}>
          <span className={styles.forecastTitle}>Previsión del combate</span>
          {forecast.lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
          <span className={styles.forecastNote}>Los efectos que se activen pueden cambiar el resultado.</span>
        </div>
      )}
    </div>
  );
}

// What a battle between these two would do by the rulebook's numbers (the server decides; this is
// only a preview).
export function forecastBattle(attacker, defender, cardsById) {
  const a = attacker.atk;
  const burn = (m) => (m.statuses || []).includes('Quemadura');
  const hit = (amount, m) => (burn(m) ? amount * 2 : amount);
  const lines = [];
  if (defender.faceDown || defender.def == null) {
    lines.push(`${attacker.name} (Atk ${a}) contra un monstruo boca abajo: se revelará y su Vida decidirá el resultado.`);
    return { lines };
  }
  const water = (m) => cardsById[m.cardId]?.attribute === 'Agua';
  const frozen = (m) => (m.statuses || []).includes('Congelado');
  if ((frozen(attacker) && water(defender)) || (frozen(defender) && water(attacker))) {
    lines.push(`${frozen(attacker) ? attacker.name : defender.name} está Congelado contra un monstruo de Agua: se destruye sin daño.`);
    return { lines };
  }
  if (defender.position === 'attack') {
    const d = defender.atk;
    lines.push(`${attacker.name} Atk ${a} contra ${defender.name} Atk ${d} (en Ataque).`);
    if (a > d) lines.push(`→ Destruyes a ${defender.name} y el rival pierde ${hit(a - d, defender)} VP.`);
    else if (a < d) lines.push(`→ ${attacker.name} es destruido y pierdes ${hit(d - a, attacker)} VP.`);
    else if (a > 0) lines.push('→ Empate: se destruyen los dos. Nadie pierde VP.');
    else lines.push('→ No pasa nada (0 contra 0).');
  } else {
    const d = defender.def;
    lines.push(`${attacker.name} Atk ${a} contra ${defender.name} Vida ${d} (en Defensa).`);
    if (a > d) lines.push(`→ Destruyes a ${defender.name}. En Defensa no hay daño a VP.`);
    else if (a < d) lines.push(`→ No lo destruyes y pierdes ${hit(d - a, attacker)} VP.`);
    else lines.push('→ Ninguno se destruye y nadie pierde VP.');
  }
  if (burn(attacker) || burn(defender)) lines.push('🔥 Quemadura: el daño de ese monstruo cuenta doble.');
  return { lines };
}

export function ChainBar({ chain, you, names, onPass, className = '' }) {
  const myPriority = chain.priorityPlayer === you;
  return (
    <div className={`${styles.chainBar} ${className}`}>
      <div className={styles.chainInfo}>
        <span className={styles.chainTitle}>🔗 Pila abierta — se resuelve de la última a la primera</span>
        <ol className={styles.chainList}>
          {chain.links.map((l, i) => (
            <li key={i} className={`${styles.chainLink} ${l.controllerIndex === you ? styles.chainMine : styles.chainRival} ${i === chain.links.length - 1 ? styles.chainTop : ''}`}>
              <span className={styles.chainIndex}>{i + 1}</span>
              <span>
                {l.controllerIndex === you ? 'Tú' : names[l.controllerIndex]}: {l.cardName}
              </span>
              <span className={styles.chainSpeed}>Vel. {l.speed}</span>
              {i === chain.links.length - 1 && <span className={styles.chainNext}>se resuelve primero</span>}
            </li>
          ))}
        </ol>
      </div>
      <div className={styles.chainActions}>
        <span>{myPriority ? 'Te toca: responde o pasa' : 'Esperando al rival…'}</span>
        {myPriority && (
          <button className={styles.actionButton} onClick={onPass}>
            Pasar
          </button>
        )}
      </div>
    </div>
  );
}

function ModLine({ mod }) {
  if (mod.kind === 'set') {
    return (
      <li className={styles.modSet}>
        {mod.source}: Atk fijado en {mod.value} (anula los otros cambios de Atk)
      </li>
    );
  }
  const parts = [];
  if (mod.atk) parts.push(`${signed(mod.atk)} Atk`);
  if (mod.def) parts.push(`${signed(mod.def)} Vida`);
  const positive = (mod.atk || 0) + (mod.def || 0) >= 0;
  return (
    <li className={positive ? styles.modUp : styles.modDown}>
      <strong>{parts.join(' / ')}</strong> · {mod.source} <span className={styles.modKind}>({MOD_KINDS[mod.kind] || mod.kind})</span>
    </li>
  );
}

function StatRow({ label, icon, printed, current }) {
  const t = trend(current, printed);
  return (
    <div className={styles.detailStat}>
      <span>
        {icon} {label}
      </span>
      {t === 'same' ? (
        <strong>{current}</strong>
      ) : (
        <span>
          <span className={styles.statPrinted}>{printed}</span> → <strong className={t === 'up' ? styles.statUp : styles.statDown}>{current}</strong>{' '}
          <span className={t === 'up' ? styles.statUp : styles.statDown}>
            ({t === 'up' ? '▲' : '▼'}
            {signed(current - printed)})
          </span>
        </span>
      )}
    </div>
  );
}

// Everything about the card under the cursor that the card face itself doesn't say.
export function DetailsPanel({ hovered, isMyBattle }) {
  const entry = hovered && hovered.entry;
  if (!entry) {
    return (
      <div className={styles.detailsPanel}>
        <span className={styles.panelTitle}>Detalles</span>
        <p className={styles.detailsEmpty}>Pasa el cursor por una carta del Campo para ver su Atk/Vida, de dónde vienen los cambios, estados y equipos.</p>
      </div>
    );
  }
  const owner = hovered.owner === 'me' ? 'Tuya' : 'Del rival';
  if (hovered.kind === 'support') {
    return (
      <div className={styles.detailsPanel}>
        <span className={styles.panelTitle}>
          {entry.faceDown && hovered.owner !== 'me' ? 'Apoyo boca abajo' : entry.name} <span className={styles.detailsOwner}>{owner}</span>
        </span>
        {entry.subtype && <p className={styles.detailsLine}>{SUPPORT_SUBTYPES[entry.subtype] || entry.subtype}{entry.faceDown ? ' · boca abajo' : ''}</p>}
        {entry.equippedToName && <p className={styles.detailsLine}>Equipada a: {entry.equippedToName}</p>}
        <Counters counters={entry.counters} />
      </div>
    );
  }
  if (entry.faceDown && entry.atk == null) {
    return (
      <div className={styles.detailsPanel}>
        <span className={styles.panelTitle}>
          Monstruo boca abajo <span className={styles.detailsOwner}>{owner}</span>
        </span>
        <p className={styles.detailsLine}>En Defensa. Si lo atacas se revela y su Vida decide el combate.</p>
      </div>
    );
  }
  const mods = entry.statMods || [];
  return (
    <div className={styles.detailsPanel}>
      <span className={styles.panelTitle}>
        {entry.name} <span className={styles.detailsOwner}>{owner}</span>
      </span>
      <p className={styles.detailsLine}>
        {entry.position === 'attack' ? '⚔ En Ataque' : '🛡 En Defensa'}
        {entry.faceDown ? ' · boca abajo' : ''}
        {entry.isToken ? ' · Ficha' : ''}
        {isMyBattle && hovered.owner === 'me' ? ` · ${entry.attacksLeft > 0 ? `puede atacar (${entry.attacksLeft})` : 'ya no puede atacar'}` : ''}
      </p>
      <StatRow label='Atk' icon='⚔' printed={entry.printedAtk} current={entry.atk} />
      <StatRow label='Vida' icon='♥' printed={entry.printedDef} current={entry.def} />
      {mods.length > 0 ? (
        <ul className={styles.modList}>
          {mods.map((m, i) => (
            <ModLine key={i} mod={m} />
          ))}
        </ul>
      ) : (
        <p className={styles.detailsMuted}>Sin cambios de Atk/Vida.</p>
      )}
      {(entry.statusInfo || []).map((s) => (
        <p key={s.type} className={styles.detailsLine} title={STATUS_HELP[s.type]}>
          {STATUS_ICONS[s.type] || '•'} {s.type} ({s.until === 'nextTurn' ? 'hasta el final del próximo turno' : 'hasta el final del turno'}) — {STATUS_HELP[s.type]}
        </p>
      ))}
      {entry.equips && entry.equips.length > 0 && <p className={styles.detailsLine}>Equipos: {entry.equips.join(', ')}</p>}
      {entry.materialCount > 0 && <p className={styles.detailsLine}>Compilado con {entry.materialCount} material(es)</p>}
      <Counters counters={entry.counters} />
    </div>
  );
}

function Counters({ counters }) {
  const list = Object.entries(counters || {}).filter(([, v]) => v > 0);
  if (!list.length) return null;
  return <p className={styles.detailsLine}>Contadores: {list.map(([k, v]) => `${COUNTER_LABELS[k] || k} ×${v}`).join(', ')}</p>;
}

export function LastBattlePanel({ battle, you, names }) {
  if (!battle) return null;
  const who = battle.controllerIndex === you ? 'Tú' : names[battle.controllerIndex];
  return (
    <details className={styles.battlePanel} open>
      <summary className={styles.panelTitle}>
        ⚔ Último combate · Turno {battle.turn}
      </summary>
      <p className={styles.battleHeadline}>
        {who}: {battle.attacker.name} (Atk {battle.attacker.atk}) →{' '}
        {battle.defender
          ? `${battle.defender.name} (${battle.defender.stat === 'atk' ? 'Atk' : 'Vida'} ${battle.defender.value})`
          : 'ataque directo'}
      </p>
      <ol className={styles.battleSteps}>
        {battle.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </details>
  );
}
