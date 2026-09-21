// Rulebook, "Método de invocación": a monster whose summoning-method line is empty is a plain
// Normal Summon. If it says anything, the wording decides:
//   - "No puede ser invocado"            -> can never be summoned from hand;
//   - "Puedes ... / Se puede ... / Se permite ..." (no "solo") -> an OPTIONAL special summon: the
//     card can be Normal Summoned as usual, or special summoned through that text;
//   - anything else ("Solo puede...", "Descarta 2 Dragones para invocarlo especial", "Si ...,
//     invocarlo") -> a requirement: it can only be special summoned.
// The text is free-form, so this reads the wording rather than a structured field.
function invocationRequirement(card) {
  return ((card && card.invocationText) || '').trim();
}

function cannotBeSummoned(card) {
  return /^no puede ser invocad/i.test(invocationRequirement(card));
}

function isOptionalSpecialSummon(card) {
  const text = invocationRequirement(card);
  // "Solo puede ..." restricts the card to special summons; "solo una vez por turno" doesn't.
  if (!text || /\bsolo\s+(puede|puedes|se)\b/i.test(text)) return false;
  return /\b(puedes?|se permite)\b/i.test(text);
}

function canBeNormalSummoned(card) {
  if (card.category !== 'monster' || cannotBeSummoned(card)) return false;
  return !invocationRequirement(card) || isOptionalSpecialSummon(card);
}

module.exports = { invocationRequirement, cannotBeSummoned, isOptionalSpecialSummon, canBeNormalSummoned };
