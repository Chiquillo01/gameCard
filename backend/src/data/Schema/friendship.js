const { Schema, model } = require('mongoose');

// One document per pair of friends. The two ids are always stored in the same order (the smaller
// one in userA, see services/friends.js), so the unique index stops a pair being saved twice.
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

friendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });

const Friendship = model('Friendship', friendshipSchema);
module.exports = { Friendship };
