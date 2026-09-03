const { Schema, model } = require('mongoose');

const cardSchema = new Schema(
  {
    number: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
      default: 'assets/CardImg/cardplaceholdertcg.png',
    },
    // Kept as a free string (not enum) so new elemental attributes from the design doc
    // (Natura, Metal, Hielo, Electricidad, Arcano, Hypnosis, Tiempo) don't need a schema
    // migration. The 6 original values (water/fire/earth/light/darkness/wind) are the ones
    // the existing collection UI has icons/filters for; anything else still saves fine, it
    // just won't have an icon yet.
    attribute: {
      type: String,
      default: 'none',
    },
    // Historically doubled as both "creature species" and "support card subtype". Kept as a
    // free string for backward compatibility with the deck-builder's Tipo filter. The game
    // engine itself reads `breed`/`family` below, which are always the faithful source value.
    type: {
      type: String,
    },
    // Specific species used by effect filters (e.g. "Dragón", "Zombi", "Licano", "Héroe").
    breed: {
      type: String,
    },
    // Optional broad grouping (e.g. "Bestia", "Insectoide", "Celestial") — only meaningful
    // when a card effect explicitly filters by the broad group rather than the species.
    family: {
      type: String,
    },
    description: {
      type: String,
      required: true,
    },
    rarity: {
      type: String,
      required: true,
      enum: ['common', 'rare', 'epic', 'legendary'],
    },
    category: {
      type: String,
      required: true,
      enum: ['monster', 'support', 'fusion'],
    },
    // Apoyo (support) card subtype: normal | instant (Veloz) | equipment | continuous | field (Reino) | counter
    subtype: {
      type: String,
    },
    expansion: {
      type: String,
      required: true,
    },
    atk: { type: Number },
    def: { type: Number },
    effect: {
      type: String,
      required: true,
    },
    level: { type: Number },
    foil: {
      type: Boolean,
      default: false,
    },
    estado: {
      type: Number,
      required: true,
    },
    // Structured rules data for the game engine (backend/src/game) — replaces free-text `effect`
    // as the thing the engine actually reads. `effect` above stays as the human-readable text.
    summonCost: {
      fn: { type: String },
      args: { type: Schema.Types.Mixed },
    },
    activationCost: {
      fn: { type: String },
      args: { type: Schema.Types.Mixed },
    },
    effectCodes: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

const Card = model('Card', cardSchema);
module.exports = { Card };
