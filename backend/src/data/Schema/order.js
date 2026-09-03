const { Schema, model } = require('mongoose');

const OrderSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    products: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: 'StoreProduct',
          required: true,
        },
        name: { type: String, required: true },
        price: {
          pixelcoins: { type: Number, default: 0 },
          pixelgems: { type: Number, default: 0 },
          euros: { type: Number, default: 0 },
        },
        reward: {
          cards: { type: Number, default: 0 },
          pixelgems: { type: Number, default: 0 },
        },
      },
    ],
    totalPrice: {
      pixelcoins: { type: Number, default: 0 },
      pixelgems: { type: Number, default: 0 },
      euros: { type: Number, default: 0 },
    },
    previousBalance: {
      pixelcoins: { type: Number, default: 0 },
      pixelgems: { type: Number, default: 0 },
    },
    newBalance: {
      pixelcoins: { type: Number, default: 0 },
      pixelgems: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ['completada', 'fallida'],
      default: 'completada',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

const Order = model('Order', OrderSchema);
module.exports = { Order };
