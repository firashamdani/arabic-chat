'use strict';
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, default: '', maxlength: 4000 },
    media: {
      kind: { type: String, enum: ['image', 'file', 'audio', 'video'], default: null },
      url: { type: String, default: '' },
      name: { type: String, default: '' },
      size: { type: Number, default: 0 }
    },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    edited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    system: { type: Boolean, default: false },
    seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  { timestamps: true }
);

messageSchema.index({ room: 1, createdAt: -1 });
messageSchema.index({ user: 1, createdAt: -1 });
messageSchema.index({ createdAt: -1 });

messageSchema.methods.toClient = function (opts = {}) {
  const u = this.user && typeof this.user === 'object' ? this.user.toPublic() : null;
  let reply = null;
  if (this.replyTo && typeof this.replyTo === 'object') {
    const r = this.replyTo;
    reply = {
      id: r._id.toString(),
      text: r.deleted ? '' : String(r.text || '').slice(0, 120),
      user: r.user && typeof r.user === 'object' ? r.user.displayName : ''
    };
  }
  return {
    id: this._id.toString(),
    roomId: this.room && typeof this.room === 'object' ? this.room._id.toString() : String(this.room),
    user: u,
    text: this.deleted ? '' : this.text,
    media: this.media && this.media.url ? this.media : null,
    replyTo: reply,
    mentions: (this.mentions || []).map((m) => m.toString()),
    edited: this.edited,
    deleted: this.deleted,
    system: this.system,
    isMine: opts.viewerId && u ? u.id === opts.viewerId.toString() : false,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
