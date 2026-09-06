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
  // exact card names making up a structure deck (category:'structure'); the buyer
  // gets exactly these cards, unlike chests which draw randomly from an expansion
  structureCards: { type: [String], default: [] },
});

const StoreProduct = model('StoreProduct', StoreProductSchema);
module.exports = { StoreProduct };
