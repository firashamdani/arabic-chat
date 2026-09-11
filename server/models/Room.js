'use strict';
const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, default: '', maxlength: 200 },
    icon: { type: String, default: '💬' },
    type: { type: String, enum: ['public', 'direct'], default: 'public', index: true },
    /** لمجالس direct: معرّفاهما مرتّبان أبجدياً */
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    pinned: { type: Boolean, default: false },
    locked: { type: Boolean, default: false },
    hidden: { type: Boolean, default: false },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: '' },
    unread: { type: Map, of: Number, default: {} }
  },
  { timestamps: true }
);

roomSchema.index({ slug: 1, type: 1 });

roomSchema.methods.toClient = function (viewerId) {
  const vid = viewerId ? viewerId.toString() : '';
  return {
    id: this._id.toString(),
    name: this.name,
    slug: this.slug,
    description: this.description,
    icon: this.icon,
    type: this.type,
    pinned: this.pinned,
    locked: this.locked,
    hidden: this.hidden,
    members: (this.members || []).map((m) => m.toString()),
    owner: this.owner ? this.owner.toString() : null,
    lastMessageAt: this.lastMessageAt,
    lastMessagePreview: this.lastMessagePreview,
    unread: (vid && this.unread && this.unread.get(vid)) || 0,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.models.Room || mongoose.model('Room', roomSchema);
