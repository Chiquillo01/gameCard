// Every Atk/Vida change a monster carries, with the card it came from, so the board can show
// "Armadura del poder +2 Atk" instead of just a bigger number.
//
// Two kinds, matching how the engine stores them:
// - `statMods`: changes held in `tempBuff` (continuous effects, equips, "hasta el final del turno",
//   Veneno). Rebuilt from scratch on every recomputeContinuous, like tempBuff itself.
// - `permanentMods`: one-off "gana +X" folded into baseAtk/baseDef; they stay while the card does.
const { getCard } = require('./cardIndex');
const { cardIdFromInstance } = require('./deckUtils');

// The name of the card (or token) behind an instance id, for "de dónde viene" labels.
function sourceName(state, instanceId) {
  if (!instanceId) return 'Efecto';
  if (String(instanceId).startsWith('token:')) return String(instanceId).split(':')[1] || 'Ficha';
  try {
    const card = getCard(cardIdFromInstance(instanceId));
    return (card && card.name) || 'Efecto';
  } catch (e) {
    return 'Efecto';
  }
}

const ctxSource = (ctx) => sourceName(ctx.state, ctx.sourceInstanceId);

// `kind`: 'continuous' | 'turn' (hasta el final del turno) | 'status' | 'set' (Atk fijado).
function addTempMod(m, delta, source, kind = 'continuous') {
  const atk = delta.atk || 0;
  const def = delta.def || 0;
  m.tempBuff = m.tempBuff || { atk: 0, def: 0 };
  m.tempBuff.atk += atk;
  m.tempBuff.def += def;
  if (!atk && !def) return;
  m.statMods = m.statMods || [];
  m.statMods.push({ source, atk, def, kind });
}

function addPermanentMod(m, delta, source) {
  const atk = delta.atk || 0;
  const def = delta.def || 0;
  m.baseAtk += atk;
  m.baseDef += def;
  if (!atk && !def) return;
  m.permanentMods = m.permanentMods || [];
  m.permanentMods.push({ source, atk, def, kind: 'permanent' });
}

function resetTempMods(m) {
  m.tempBuff = { atk: 0, def: 0 };
  m.statMods = [];
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

// "+2 Atk / -1 Vida" — empty when nothing changes.
function describeDelta(delta) {
  const parts = [];
  if (delta.atk) parts.push(`${signed(delta.atk)} Atk`);
  if (delta.def) parts.push(`${signed(delta.def)} Vida`);
  return parts.join(' / ');
}

// A one-off or timed change gets its own log line; continuous ones don't (they are recomputed on
// every board change and would flood the log) — the board shows those on the card instead.
function logStatChange(ctx, instanceId, delta, suffix = '') {
  const text = describeDelta(delta);
  if (!text) return;
  const { log } = require('./zones');
  const source = ctxSource(ctx);
  const target = sourceName(ctx.state, instanceId);
  log(ctx.state, `${target}: ${text}${suffix}${source !== target ? ` (por ${source})` : ''}.`);
}

module.exports = { sourceName, ctxSource, addTempMod, addPermanentMod, resetTempMods, describeDelta, logStatChange };
