// A short Spanish label for an activatable effect, built from its data ("Descarta esta carta →
// busca un Dragón en el Mazo"), for the effect buttons. The card's own text stays the reference
// (the hover preview shows it); this only has to tell two buttons of the same card apart.

const n = (v, fallback = 1) => (v == null ? fallback : v);

// "un Dragón", "un monstruo de Agua" — whatever the args narrow the pick to.
function what(args = {}) {
  const f = { ...(args.filter || {}), ...args };
  const parts = [];
  if (f.breed) parts.push(f.breed);
  else if (f.nameContains) parts.push(`"${f.nameContains}"`);
  else if (f.category === 'Compilado') parts.push('monstruo compilado');
  else if (f.category === 'support') parts.push('Apoyo');
  else parts.push(f.category === 'monster' || f.attribute || f.atribute ? 'monstruo' : 'carta');
  if (f.attribute || f.atribute) parts.push(`de ${f.attribute || f.atribute}`);
  if (f.level) parts.push(`de nivel ${f.level}`);
  if (f.levelOrLower) parts.push(`de nivel ${f.levelOrLower} o menos`);
  return parts.join(' ');
}

const count = (c, noun) => (n(c) === 1 ? `1 ${noun}` : `${c} ${noun}`);
const stat = (b = {}) => [b.atk ? `${b.atk > 0 ? '+' : ''}${b.atk} Atk` : '', b.def ? `${b.def > 0 ? '+' : ''}${b.def} Vida` : ''].filter(Boolean).join(' / ');

const ACTIONS = {
  negateActivation: () => 'Niega la activación',
  negateAndSendToGraveyard: () => 'Niega la activación y la manda al Cementerio',
  negateEffect: () => 'Niega un efecto',
  negateAttack: () => 'Niega el ataque',
  endBattlePhase: () => 'Termina la Fase de Batalla',
  destroyAndCopyEffect: () => 'Destruye una carta y copia su efecto',
  destroy: (a) => `Destruye ${a.target === 'support' ? 'un Apoyo' : a.target === 'monster' ? 'un monstruo' : 'una carta'}`,
  destroyAndGainVP: () => 'Destruye una carta y gana VP igual a su Atk',
  exileTarget: () => 'Exilia una carta',
  searchFromDeck: (a) => `Busca un ${what(a)} en el Mazo`,
  searchDeck: (a) => `Busca ${count(a.count, what(a))} en el Mazo`,
  addCardToHandFromDeck: (a) => `Añade ${count(a.count, what(a))} del Mazo a la Mano`,
  addCardToHandFromGraveyard: (a) => `Recupera ${count(a.count, what(a))} del Cementerio`,
  recoverCardsToHand: (a) => `Recupera ${count(a.count, what(a))} a la Mano`,
  returnToDeck: (a) => `Devuelve ${count(a.count, what(a))} al Mazo`,
  returnFromGraveyardToDeck: (a) => `Devuelve ${count(a.count, 'carta(s)')} del Cementerio al Mazo`,
  setCardFaceDown: () => 'Pone boca abajo un Apoyo rival',
  applyStatus: (a) => `Aplica ${a.status || 'un estado'}`,
  poisonZone: () => 'Envenena una zona',
  grantExtraAttack: (a) => `+${n(a.amount)} ataque este turno`,
  grantBuff: (a) => `${stat(a.buff || a)}${a.duration === 'endOfTurn' ? ' este turno' : ''}`,
  growSelf: (a) => `Gana ${stat(a)}`,
  grantAbility: (a) => (a.ability === 'attackInDefense' ? 'Pueden atacar en Defensa' : 'Gana una habilidad'),
  damageMonster: (a) => `Quita ${n(a.amount, 0)} de Vida a un monstruo`,
  damageOpponent: (a) => `Inflige ${n(a.amount, 0)} de daño`,
  burnOpponent: (a) => `Inflige ${n(a.amount, 0)} de daño`,
  damageOpponentByDiceRoll: () => 'Tira un dado e inflige daño',
  gainVP: (a) => (a.amount ? `Gana ${a.amount} VP` : 'Gana VP'),
  generatePixels: (a) => `Genera ${n(a.amount)} píxel(es)`,
  generatePixelsPerCreature: () => 'Genera píxeles por monstruo',
  drawCards: (a) => `Roba ${count(a.amount, 'carta(s)')}`,
  discart: (a) => `Descarta ${count(a.count, 'carta(s)')}`,
  summonFromDeck: (a) => `Invoca ${a.level ? `un nivel ${a.level}` : 'un monstruo'} del Mazo`,
  specialSummonFromDeck: (a) => `Invoca un ${what(a)} del Mazo`,
  specialSummonFromGY: (a) => `Invoca un ${what(a)} del Cementerio`,
  summonFromZones: (a) => `Invoca un ${what(a)}`,
  summon: (a) => `Invoca un ${what(a)}`,
  specialSummon: () => 'Se invoca de forma especial',
  summonToken: (a) => `Invoca la ficha ${(a.token && a.token.name) || ''}`.trim(),
  equipMonster: () => 'Equipa un monstruo',
  equipMonsterToSelf: () => 'Se equipa un monstruo',
  relocateSelf: () => 'Se mueve a otra zona',
  changePosition: () => 'Cambia la posición de un monstruo',
  changeBeed: (a) => `Pasa a ser ${a.breed || 'otro tipo'}`,
  addCounter: (a) => `Añade ${n(a.amount)} contador(es)`,
  coinFlip: () => 'Lanza una moneda',
  addExtraTurn: () => 'Juega un turno extra',
  disableAttacks: () => 'No se puede atacar este turno',
  takeControl: () => 'Toma el control de un monstruo',
  banishSelf: () => 'Se exilia',
  mirrorEvent: () => 'Copia lo que haga el rival',
  afterOpponentSearch: () => 'Responde a una búsqueda rival',
  target: (a) => (a.effect && a.effect.fn === 'decompileMonster' ? 'Descompila un monstruo' : 'Elige un objetivo'),
};

const COSTS = {
  discardSelf: () => 'Descarta esta carta',
  discardSelfAndCard: (a) => `Descarta esta carta y ${count(a.count, what(a))}`,
  discart: (a) => `Descarta ${count(a.count, 'carta(s)')}`,
  discardCard: (a) => `Descarta ${count(a.count, 'carta(s)')}`,
  discardCards: (a) => `Descarta ${count(a.count, what(a))}`,
  spendCounter: (a) => `Gasta ${n(a.amount)} contador(es)`,
  tributeSelf: () => 'Sacrifica esta carta',
  tributeMonster: (a) => `Sacrifica ${count(a.count, 'monstruo(s)')}`,
  destroyOwnMonster: () => 'Destruye un monstruo tuyo',
  banishSelf: () => 'Exilia esta carta',
  revealCards: () => 'Revela cartas',
  payVP: (a) => `Paga ${n(a.amount, 0)} VP`,
};

const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// "Se exilia, genera 2 píxeles": one sentence, each phrase once, no "inflige 0 de daño".
function sentence(phrases) {
  const unique = [...new Set(phrases.filter((p) => p && !/\b0 de daño\b/.test(p)))];
  return unique.map((p, i) => (i ? lower(p) : p)).join(', ');
}

function describeEffect(effect) {
  if (!effect) return null;
  const actions = sentence((effect.actions || []).map((a) => ACTIONS[a.fn] && ACTIONS[a.fn](a.args || {})));
  if (!actions) return null;
  const costs = sentence([].concat(effect.cost || []).map((c) => c && COSTS[c.fn] && COSTS[c.fn](c.args || {})));
  return costs ? `${costs} → ${lower(actions)}` : actions;
}

module.exports = { describeEffect };
