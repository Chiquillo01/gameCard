const { Schema, model } = require('mongoose');

const StoreProductSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: {
    pixelcoins: { type: Number, required: false },
    pixelgems: { type: Number, required: false },
    euros: { type: Number, required: false },
  },
  reward: {
    cards: { type: Number, default: 0 },
    pixelgems: { type: Number, default: 0 },
  },
  imageUrl: { type: String, required: true },
  expansion: { type: String },
  category: {
    type: String,
    required: true,
    enum: ['chest', 'structure', 'pixelgems'],
  },
});

const StoreProduct = model('StoreProduct', StoreProductSchema);
module.exports = { StoreProduct };
