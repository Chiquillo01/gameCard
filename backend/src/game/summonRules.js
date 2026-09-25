// Rulebook, "Método de invocación": a monster whose summoning-method line is empty is a plain
// Normal Summon. If it says anything, the wording decides:
//   - "No puede ser invocado"        -> can never be summoned from hand;
//   - "Solo puede/puedes/se ..."     -> an actual restriction: only special summon works;
//   - anything else (an optional "Puedes...", a condition like "Si controlas X, se puede...", or
//     an imperative like "Descarta 2 Dragones para invocarlo especial" / "invocarlo
//     inmediatamente") -> describes an ADDITIONAL way to summon the card, not a replacement for
//     Normal Summon — the card can still be Normal Summoned as usual, too.
// "Solo una vez por turno" (Golpeador/Machacador de Engranaje) isn't a summon-method restriction,
// so the "solo" check requires a possibility verb right after it ("solo puede/puedes/se").
// The text is free-form, so this reads the wording rather than a structured field.
function invocationRequirement(card) {
  return ((card && card.invocationText) || '').trim();
}

function cannotBeSummoned(card) {
  return /^no puede ser invocad/i.test(invocationRequirement(card));
}

function isSpecialSummonOnly(card) {
  return /\bsolo\s+(puede|puedes|se)\b/i.test(invocationRequirement(card));
}

function canBeNormalSummoned(card) {
  if (card.category !== 'monster' || cannotBeSummoned(card)) return false;
  return !isSpecialSummonOnly(card);
}

module.exports = { invocationRequirement, cannotBeSummoned, isSpecialSummonOnly, canBeNormalSummoned };
