const { Schema, model } = require('mongoose');

const invitationSchema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
    },
  },
  { timestamps: true },
);

const Invitation = model('invitation', invitationSchema);
module.exports = { Invitation };
