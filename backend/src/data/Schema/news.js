const { Schema, model } = require('mongoose');

// A notice for every player: game news, balance changes, events, maintenance. Admins publish them
// (controllers/newsController.js); each player sees which ones are new since they last looked
// (User.newsSeenAt).
const NEWS_KINDS = ['news', 'balance', 'event', 'maintenance'];

const newsSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    kind: { type: String, enum: NEWS_KINDS, default: 'news' },
    author: { type: Schema.Types.ObjectId, ref: 'User' },
    // Set when an admin edits it; the publish date (createdAt) stays as it was.
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

newsSchema.index({ createdAt: -1 });

const News = model('News', newsSchema);
module.exports = { News, NEWS_KINDS };
