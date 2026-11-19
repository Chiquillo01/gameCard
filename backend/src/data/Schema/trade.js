const { Schema, model } = require('mongoose');

// A card swap one player proposes to a friend: the copies they give (`offer`) for the copies they
// want back (`request`). Nothing moves until the friend accepts (services/trades.js).
const tradeLineSchema = new Schema(
  {
    cardId: { type: Schema.Types.ObjectId, ref: 'Card', required: true },
    amount: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const tradeSchema = new Schema(
  {
    proposer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    offer: { type: [tradeLineSchema], default: [] },
    request: { type: [tradeLineSchema], default: [] },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING',
    },
  },
  { timestamps: true },
);

tradeSchema.index({ receiver: 1, status: 1 });
tradeSchema.index({ proposer: 1, status: 1 });

const Trade = model('Trade', tradeSchema);
module.exports = { Trade };
