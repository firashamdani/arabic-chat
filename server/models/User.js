'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'اسم المستخدم مطلوب'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'اسم المستخدم 3 أحرف على الأقل'],
      maxlength: [24, 'اسم المستخدم 24 حرفاً كحد أقصى'],
      match: [/^[a-z0-9_.-]+$/, 'اسم المستخدم بالإنجليزية: أحرف وأرقام و _ . -']
    },
    email: {
      type: String,
      required: [true, 'البريد الإلكتروني مطلوب'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'بريد إلكتروني غير صالح']
    },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true, maxlength: 40 },
    bio: { type: String, default: '', maxlength: 200 },
    avatar: { type: String, default: '' }, // رابط صورة أو فارغ => نولد حرفاً
    color: { type: String, default: '#6366f1' },
    role: { type: String, enum: ['user', 'mod', 'admin'], default: 'user', index: true },
    status: { type: String, enum: ['active', 'banned'], default: 'active', index: true },
    settings: {
      theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'dark' },
      sound: { type: Boolean, default: true },
      enterSend: { type: Boolean, default: true }
    },
    lastSeenAt: { type: Date, default: Date.now },
    bannedReason: { type: String, default: '' },
    bannedUntil: { type: Date, default: null }
  },
  { timestamps: true }
);

userSchema.methods.setPassword = function (plain) {
  this.passwordHash = bcrypt.hashSync(plain, 10);
  return this;
};

userSchema.methods.verifyPassword = function (plain) {
  try {
    return bcrypt.compareSync(plain, this.passwordHash);
  } catch {
    return false;
  }
};

userSchema.methods.isBanned = function () {
  if (this.status !== 'banned') return false;
  if (this.bannedUntil && this.bannedUntil <= new Date()) return false;
  return true;
};

userSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    username: this.username,
    displayName: this.displayName,
    bio: this.bio || '',
    avatar: this.avatar || '',
    color: this.color,
    role: this.role,
    status: this.status,
    createdAt: this.createdAt,
    lastSeenAt: this.lastSeenAt
  };
};

userSchema.methods.toPrivate = function () {
  return {
    ...this.toPublic(),
    email: this.email,
    settings: this.settings,
    bannedReason: this.bannedReason,
    bannedUntil: this.bannedUntil
  };
};

/** أدمن إحصائيات: عدد رسائل المستخدم + آخر ظهور */
userSchema.methods.toAdmin = function () {
  return {
    ...this.toPublic(),
    email: this.email,
    bannedReason: this.bannedReason,
    bannedUntil: this.bannedUntil,
    updatedAt: this.updatedAt
  };
};

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899'];

userSchema.statics.randomColor = function (seed = '') {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return COLORS[h % COLORS.length];
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
