// Rulebook, "Método de invocación": a monster whose summoning-method line is empty is a plain
// Normal Summon; if it says anything, the card needs that requirement met and is summoned
// especially instead — and "No puede ser invocado" means it can never be summoned by hand at all.
function invocationRequirement(card) {
  return ((card && card.invocationText) || '').trim();
}

function cannotBeSummoned(card) {
  return /^no puede ser invocad/i.test(invocationRequirement(card));
}

function canBeNormalSummoned(card) {
  return card.category === 'monster' && !invocationRequirement(card);
}

module.exports = { invocationRequirement, cannotBeSummoned, canBeNormalSummoned };
