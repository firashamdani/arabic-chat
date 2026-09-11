'use strict';
const mongoose = require('mongoose');

/** سجل "متصل الآن" — يُحذف تلقائياً بعد 5 دقائق من آخر نبضة. */
const presenceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    username: String,
    displayName: String,
    role: { type: String, default: 'user' },
    avatar: { type: String, default: '' },
    color: { type: String, default: '#6366f1' },
    roomId: { type: String, default: '' },
    lastPingAt: { type: Date, default: Date.now, expires: 300 } // TTL 5 دقائق
  },
  { timestamps: false }
);

presenceSchema.index({ lastPingAt: -1 });

module.exports = mongoose.models.Presence || mongoose.model('Presence', presenceSchema);
