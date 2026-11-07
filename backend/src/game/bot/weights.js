// Everything the bot "values", in one place. The bot never knows a card by name: it reads the live
// Atk/Vida/VP/pixels on the board, so balance changes to the cards need no change here. These
// numbers are the knobs to tune (by hand now; learned from saved matches later).
module.exports = {
  evaluation: {
    win: 100000, // a won (or lost) duel outweighs everything else
    vp: 1, // per VP of difference between the two players

    // A monster on the field: being there, plus its Atk and Vida.
    monster: 2,
    atk: 1,
    def: 0.5,
    material: 0.5, // per material under a compiled monster (it can be decompiled back)
    // What a rival's face-down monster is assumed to have — the bot can't see it.
    hiddenAtk: 2,
    hiddenDef: 3,
    // Statuses, as a penalty on the monster that has them.
    burning: 2,
    frozen: 1,
    poisoned: 0.5,

    handCard: 1.5, // each card in the bot's hand
    oppHandCard: 1, // each card in the rival's hand (unknown, so a threat)
    pixel: 0.2, // each pixel to spend on activations
    setSupport: 1.6, // a face-down Apoyo (a trap waiting, or a card kept for later)
    faceUpSupport: 1, // a face-up Apoyo/Equipo (its Atk/Vida bonus already counts on the monster)
    territory: 1.5,
    lowDeck: 3, // per card under `lowDeckAt` left in the Mazo (running out loses the duel)
    lowDeckAt: 5,

    // How much the damage the rival could deal next turn weighs (and the bot's own next turn).
    threat: 0.6,
    offense: 0.3,
  },

  search: {
    minGain: 0.05, // an action has to improve the position by this much to be worth doing
    maxOptions: 8, // candidates looked at for the first pick of a choice
    maxDeepOptions: 4, // and for each further pick of the same choice
    maxPickDepth: 4, // picks in a row one action can ask for
    maxSimsPerDecision: 400,
    maxMsPerDecision: 400,
    maxActionsPerTurn: 60,
  },
};
