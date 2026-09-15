const { Schema, model } = require('mongoose');

// Single source of truth for the "state" (banlist) default, so both the schema and anything
// that builds a Card document by hand (e.g. the seed script) agree on the rarity fallback.
const DEFAULT_STATE_BY_RARITY = { legendary: 1, epic: 2, rare: 3, common: 4 };

const cardSchema = new Schema(
  {
    // Stable unique identifier — preserved across re-imports by the seed script (looked up by
    // `name`), never re-derived from spreadsheet row order.
    number: {
      type: Number,
      required: true,
      unique: true,
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
    // `token` cards are created by another card's effect (never drawn, bought, or placed in a
    // deck) and don't go to the graveyard or exile when they leave the field — they just vanish.
    category: {
      type: String,
      required: true,
      enum: ['monster', 'support', 'fusion', 'token'],
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
    // Human-readable summon/activation/fusion-material text (e.g. "Compilación - 2 Monstruos
    // Insecto"). Kept separate from `effect` and from the structured summonCost/activationCost
    // below, which is what the engine actually reads.
    invocationText: {
      type: String,
    },
    level: { type: Number },
    foil: {
      type: Boolean,
      default: false,
    },
    // Banlist value: how many copies of this card are allowed in a deck. Defaults to the
    // standard limit for its rarity, but stays per-card so a specific card can be banned (0),
    // limited or semi-limited (1-2) without touching deck-building code — deckController reads
    // this field directly instead of a hardcoded rarity table.
    state: {
      type: Number,
      required: true,
      default: function () {
        return DEFAULT_STATE_BY_RARITY[this.rarity] ?? 3;
      },
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
module.exports = { Card, DEFAULT_STATE_BY_RARITY };
