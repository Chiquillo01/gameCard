const { Schema, model } = require('mongoose');

const MarketProductSchema = new Schema(
  {
    cardId: {
      type: Schema.Types.ObjectId,
      ref: 'Card',
      required: true,
    },
    foil: {
      type: String,
      enum: ['normal', 'superRara', 'secreta', 'collector'],
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    price: {
      pixelcoins: {
        type: Number,
        required: true,
        min: 0,
      },
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
    },
    status: {
      type: String,
      enum: ['activo', 'comprado', 'retirado', 'inactivo'],
      default: 'activo',
    },
  },
  { timestamps: true },
);

const Market = model('MarketProduct', MarketProductSchema);
module.exports = { Market };
