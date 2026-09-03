const { Schema, model } = require('mongoose');

const deckSchema = new Schema(
  {
    deckTitle: {
      type: String,
      trim: true,
      required: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    cards: [
      {
        card: {
          type: Schema.Types.ObjectId,
          ref: 'Card',
          required: true,
        },
        amount: {
          type: Number,
          required: true,
          max: [4], // real per-rarity limits (1/2/3/4 for Legendaria/Épica/Rara/Común) are
          // enforced in deckController, which has the card's rarity available; this is just
          // the loosest ceiling so no legal deck is rejected at the schema level.
        },
      },
    ],
    fusionCards: [
      {
        card: {
          type: Schema.Types.ObjectId,
          ref: 'Card',
          required: true,
        },
        amount: {
          type: Number,
          required: true,
          max: [4], // real per-rarity limits (1/2/3/4 for Legendaria/Épica/Rara/Común) are
          // enforced in deckController, which has the card's rarity available; this is just
          // the loosest ceiling so no legal deck is rejected at the schema level.
        },
      },
    ],
    public: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const Deck = model('Deck', deckSchema);
module.exports = { Deck };
