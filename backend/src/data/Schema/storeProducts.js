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
    enum: ['chest', 'structure', 'pixelgems', 'spEdition'],
  },
  // Exact cards making up a structure deck (category:'structure'); the buyer gets exactly
  // these, unlike chests which draw randomly from an expansion. `amount` lets a deck include
  // several copies of the same card (e.g. 3x "Arboleda") without relying on repeated names,
  // which Mongo's `$in` would silently collapse to one match per name.
  structureCards: {
    type: [
      {
        name: { type: String, required: true },
        amount: { type: Number, required: true, default: 1 },
      },
    ],
    default: [],
  },
});

const StoreProduct = model('StoreProduct', StoreProductSchema);
module.exports = { StoreProduct };
