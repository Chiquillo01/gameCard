import { Fragment } from 'react';
import styles from './duel.module.css';

// The options of a pick (a target, a cost, a card to discard...) grouped by where they are, each
// with whose it is, its zone number, position and Atk/Vida, and a small map of that side of the
// board with its zone lit — so two copies of the same card can't be mixed up. The server sends
// that location as `where` on each option.

const MONSTER_ZONES = 5;
const SUPPORT_ZONES = 4;
const FIELD = ['monster', 'support', 'territory'];

const GROUPS = [
  { owner: 'self', zone: 'field', label: 'Tu Campo' },
  { owner: 'rival', zone: 'field', label: 'Campo del rival' },
  { owner: 'self', zone: 'hand', label: 'Tu Mano' },
  { owner: 'self', zone: 'graveyard', label: 'Tu Cementerio' },
  { owner: 'rival', zone: 'graveyard', label: 'Cementerio del rival' },
  { owner: 'self', zone: 'banished', label: 'Tu Exilio' },
  { owner: 'rival', zone: 'banished', label: 'Exilio del rival' },
  { owner: 'self', zone: 'deck', label: 'Tu Mazo' },
  { owner: 'self', zone: 'extra', label: 'Tu Mazo-C' },
  { owner: 'rival', zone: 'hand', label: 'Mano del rival' },
];

const groupZone = (where) => (FIELD.includes(where.zone) ? 'field' : where.zone);

// Zone number counted left to right as the board shows it (the rival's side is turned 180°).
function zoneNumber(where) {
  const count = where.zone === 'monster' ? MONSTER_ZONES : SUPPORT_ZONES;
  return where.owner === 'self' ? where.slot + 1 : count - where.slot;
}

// Board order inside "Campo": monsters, then supports, then the Territorio, left to right.
function fieldOrder(where) {
  const kind = FIELD.indexOf(where.zone);
  return kind * 10 + (where.slot === null ? 0 : zoneNumber(where));
}

export function groupOptions(cards) {
  const groups = GROUPS.map((g) => ({
    ...g,
    cards: cards.filter((c) => c.where && c.where.owner === g.owner && groupZone(c.where) === g.zone),
  })).filter((g) => g.cards.length);
  groups.forEach((g) => {
    if (g.zone === 'field') g.cards.sort((a, b) => fieldOrder(a.where) - fieldOrder(b.where));
  });
  const rest = cards.filter((c) => !c.where || !groups.some((g) => g.cards.includes(c)));
  if (rest.length) groups.push({ label: null, cards: rest });
  return groups;
}

export function describeWhere(where) {
  if (where.zone === 'monster') {
    const position = where.faceDown ? 'Boca abajo (Defensa)' : where.position === 'attack' ? '⚔ En Ataque' : '🛡 En Defensa';
    const stats = where.atk != null ? ` · Atk ${where.atk} / Vida ${where.def}` : '';
    return `Monstruo · Zona ${zoneNumber(where)} · ${position}${stats}`;
  }
  if (where.zone === 'support') {
    return `Apoyo · Zona ${zoneNumber(where)}${where.faceDown ? ' · Boca abajo' : ''}${where.equippedTo ? ` · Equipada a ${where.equippedTo}` : ''}`;
  }
  if (where.zone === 'territory') return 'Territorio';
  return null;
}

// That player's half of the board in miniature (same layout as the real one: monsters, then
// Apoyos with the Territorio on the left, piles on the right), with the option's zone lit.
function MiniBoard({ where }) {
  const flip = where.owner === 'rival';
  let target = null;
  if (where.zone === 'monster') target = [1, where.slot + 1];
  if (where.zone === 'support') target = [2, where.slot + 2];
  if (where.zone === 'territory') target = [2, 1];
  const place = ([r, c]) => (flip ? [3 - r, 8 - c] : [r, c]);
  const [tr, tc] = place(target);
  const cells = [];
  for (let r = 1; r <= 2; r++) {
    for (let c = 1; c <= 7; c++) {
      const [vr, vc] = place([r, c]);
      const pile = c >= 6;
      const lit = vr === tr && vc === tc;
      cells.push(<span key={`${r}${c}`} style={{ gridRow: vr, gridColumn: vc }} className={`${styles.miniCell} ${pile ? styles.miniPile : ''} ${lit ? styles.miniLit : ''}`} />);
    }
  }
  return (
    <span className={styles.miniBoard} title={describeWhere(where)} aria-hidden='true'>
      {cells}
    </span>
  );
}

export function ChoiceOptionList({ cards, renderCardExtra }) {
  return groupOptions(cards).map((group) => (
    <Fragment key={group.label || 'rest'}>
      {group.label && <h4 className={styles.choiceGroupTitle}>{group.label}</h4>}
      {group.cards.map((card) => {
        const where = card.where;
        const ownerClass = where ? (where.owner === 'self' ? styles.optionMine : styles.optionRival) : '';
        return (
          <div key={card.instanceId} className={`${styles.pileModalCard} ${ownerClass}`}>
            {card.image ? <img src={card.image} alt={card.name} /> : where && <span className={styles.optionCardBack}>?</span>}
            <span className={styles.optionText}>
              <span className={styles.pileModalCardName}>{card.name}</span>
              {where && describeWhere(where) && <span className={styles.optionDetails}>{describeWhere(where)}</span>}
            </span>
            {where && FIELD.includes(where.zone) && <MiniBoard where={where} />}
            {renderCardExtra && renderCardExtra(card)}
          </div>
        );
      })}
    </Fragment>
  ));
}
