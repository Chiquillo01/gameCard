const { Schema, model } = require('mongoose');

// One shared step shape used by trigger / conditions / cost / actions — {fn, args} — so the
// game engine's dispatcher (backend/src/game/effectEngine.js) always reads the same field
// names regardless of which of the old 6 spreadsheet tabs an effect used to live in.
const stepSchema = new Schema(
  {
    fn: { type: String, required: true },
    args: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const effectSchema = new Schema(
  {
    _id: { type: String, required: true }, // human key, e.g. "ABOLETH_DEATH_TOKENS"
    type: {
      type: String,
      required: true,
      enum: ['continuous', 'triggered', 'trigger', 'quick', 'ignition', 'summon_rule', 'rule', 'activated'],
    },
    oncePerTurn: { type: Boolean, default: false },
    // "Puedes activar uno de estos efectos": the actions are alternatives — the player picks one.
    choice: { type: Boolean, default: false },
    trigger: { type: stepSchema, default: null }, // WHEN this can/does fire
    conditions: { type: [stepSchema], default: [] }, // extra checks that must hold
    cost: { type: stepSchema, default: null }, // what the activating player pays
    requiresTarget: { type: Boolean, default: false },
    targetSelector: { type: String },
    actions: { type: [stepSchema], default: [] }, // what happens, in order
    source: { type: String }, // which legacy sheet this was migrated from, or "authored"
  },
  { timestamps: true, _id: false },
);

const Effect = model('Effect', effectSchema);
module.exports = { Effect };
