const { Schema, model } = require('mongoose');

const userCollectionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    cards: [
      {
        cardId: {
          type: Schema.Types.ObjectId,
          ref: 'Card',
          required: true,
        },
        amount: {
          type: Number,
          default: 1,
          min: 1,
        },
      },
    ],
    public: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const UserCollection = model('UserCollection', userCollectionSchema);
module.exports = { UserCollection };
