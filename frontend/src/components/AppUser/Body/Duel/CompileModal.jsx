import CardFace from '../CreateNewDeck/CardModal/CardFace';
import styles from './duel.module.css';

// The Mazo-C: each Compilación as the whole card next to its recipe, one requirement per line
// (✓ / ✗, how many the player has, and which of their cards fit), and a "Compilar" button that
// starts the compilation with a suggested set of materials already picked on the board.

const FACE_WIDTH = 480;
const FACE_HEIGHT = 700;
const FACE_SCALE = 0.38;
const FROM = { Campo: 'del Campo', Mano: 'de la Mano', Cementerio: 'del Cementerio' };

// Copies of the same Compilación share one row ("×2"); the first copy is the one compiled.
function groupCopies(cards) {
  const groups = new Map();
  cards.forEach((card) => {
    const g = groups.get(card.cardId);
    if (g) g.copies += 1;
    else groups.set(card.cardId, { card, copies: 1 });
  });
  return [...groups.values()];
}

function MaterialChip({ material }) {
  const where = material.zone === 'field' && material.slot != null ? `Campo · Zona ${material.slot + 1}` : material.zoneLabel;
  return (
    <span className={styles.compileChip} title={material.atk != null ? `Atk ${material.atk} / Vida ${material.def}` : undefined}>
      {material.name} <span className={styles.compileChipWhere}>({where})</span>
    </span>
  );
}

function Requirement({ req }) {
  const met = req.have >= req.count;
  return (
    <li className={`${styles.compileReq} ${met ? styles.compileReqMet : styles.compileReqMissing}`}>
      <span className={styles.compileReqHead}>
        <span className={styles.compileReqIcon}>{met ? '✓' : '✗'}</span>
        <span className={styles.compileReqLabel}>{req.label}</span>
        <span className={styles.compileReqZones}>{req.zones.map((z) => FROM[z] || z).join(' o ')}</span>
        <span className={styles.compileReqCount}>
          tienes {req.have}/{req.count}
        </span>
      </span>
      {req.candidates.length > 0 && (
        <span className={styles.compileChips}>
          {req.candidates.map((m) => (
            <MaterialChip key={m.instanceId} material={m} />
          ))}
        </span>
      )}
    </li>
  );
}

export default function CompileModal({ cards, cardsById, canCompileNow, onCompile, onClose }) {
  const sorted = groupCopies(cards).sort((a, b) => Number(!!(b.card.compile && b.card.compile.ready)) - Number(!!(a.card.compile && a.card.compile.ready)));
  const readyCount = sorted.filter((g) => g.card.compile && g.card.compile.ready).length;
  return (
    <div className={styles.pileOverlay} onClick={onClose}>
      <div className={`${styles.pileModal} ${styles.compileModal}`} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.pileModalTitle}>Mazo-C ({cards.length})</h3>
        <p className={styles.compileSummary}>
          {readyCount ? `Puedes compilar ${readyCount === 1 ? '1 carta' : `${readyCount} cartas`} ahora.` : 'Ahora no tienes materiales para ninguna.'}
          {!canCompileNow && ' Solo se compila en tu Fase Principal.'}
        </p>
        <div className={styles.pileModalList}>
          {cards.length === 0 && <p className={styles.pileEmpty}>Vacío.</p>}
          {sorted.map(({ card, copies }) => {
            const full = cardsById[card.cardId] || card;
            const info = card.compile || { requirements: [], ready: false, blockedBy: null, suggested: [] };
            const reason = !canCompileNow ? 'Solo en tu Fase Principal' : info.blockedBy;
            return (
              <div key={card.instanceId} className={`${styles.compileRow} ${info.ready ? styles.compileRowReady : ''}`}>
                <div className={styles.compileFace} style={{ width: FACE_WIDTH * FACE_SCALE, height: FACE_HEIGHT * FACE_SCALE }}>
                  <div style={{ width: FACE_WIDTH, height: FACE_HEIGHT, transform: `scale(${FACE_SCALE})`, transformOrigin: 'top left' }}>
                    <CardFace card={full} />
                  </div>
                </div>
                <div className={styles.compileInfo}>
                  <div className={styles.compileHeader}>
                    <span className={styles.compileName}>
                      {card.name}
                      {copies > 1 && <span className={styles.compileCopies}> ×{copies}</span>}
                    </span>
                    <span className={`${styles.compileStatus} ${info.ready ? styles.compileStatusReady : styles.compileStatusBlocked}`}>
                      {info.ready ? '✓ Lista para compilar' : `✗ ${info.blockedBy || 'No disponible'}`}
                    </span>
                  </div>
                  {full.atk != null && (
                    <span className={styles.compileStats}>
                      Nivel {full.level ?? '—'} · ⚔ Atk {full.atk} · ♥ Vida {full.def}
                    </span>
                  )}
                  <span className={styles.compileRecipeTitle}>Materiales</span>
                  <ul className={styles.compileReqs}>
                    {info.requirements.map((req) => (
                      <Requirement key={req.label} req={req} />
                    ))}
                  </ul>
                  <button
                    className={styles.directAttackButton}
                    disabled={!info.ready || !canCompileNow}
                    title={reason || 'Se marcan los materiales sugeridos en tu Campo: puedes cambiarlos antes de confirmar.'}
                    onClick={() => onCompile(card, info.suggested)}
                  >
                    Compilar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button className={styles.surrenderButton} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
