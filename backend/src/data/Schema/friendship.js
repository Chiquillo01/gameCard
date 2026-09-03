const { Schema, model } = require('mongoose');

const friendshipSchema = new Schema(
  {
    userA: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    userB: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
);

const Friendship = model('Friendship', friendshipSchema);
module.exports = { Friendship };
