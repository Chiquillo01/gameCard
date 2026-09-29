const { Schema, model } = require('mongoose');

// A listing on the card market: copies of one card a player put up for sale. The copies leave the
// seller's collection when listed (they're held here) and go to whoever buys them, or back to the
// seller if the listing is withdrawn. Prices are per copy, in pixelcoins only.
const MarketProductSchema = new Schema(
  {
    cardId: {
      type: Schema.Types.ObjectId,
      ref: 'Card',
      required: true,
    },
    // The seller.
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    price: {
      pixelcoins: {
        type: Number,
        required: true,
        min: 1,
      },
    },
    // Copies still for sale, and how many were listed to begin with.
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    initialAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['activo', 'vendido', 'retirado'],
      default: 'activo',
    },
    sales: {
      type: [
        {
          _id: false,
          buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          amount: { type: Number, required: true },
          unitPrice: { type: Number, required: true },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

const Market = model('MarketProduct', MarketProductSchema);
module.exports = { Market };
