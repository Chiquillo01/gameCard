const { Schema, model } = require('mongoose');

const notificationSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['INVITATION_RECIVED', 'INVITATION_ACCEPTED', 'INVITATION_REJECTED'],
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true },
);

const Notification = model('notification', notificationSchema);
module.exports = { Notification };
