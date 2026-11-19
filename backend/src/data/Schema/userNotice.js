const { Schema, model } = require('mongoose');

// A personal notice for one player (for now: "someone bought your card on the Market"). It is
// sent live over the socket when the player is online, and kept here so a player who was offline
// sees it the next time they open the game (services/notices.js, routers/noticeRouter.js).
const NOTICE_KINDS = ['market:sold'];

const userNoticeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: NOTICE_KINDS, required: true },
    message: { type: String, required: true, maxlength: 500 },
    data: { type: Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

userNoticeSchema.index({ user: 1, read: 1, createdAt: -1 });

const UserNotice = model('UserNotice', userNoticeSchema);
module.exports = { UserNotice, NOTICE_KINDS };
