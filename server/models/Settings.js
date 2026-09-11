'use strict';
const mongoose = require('mongoose');

/** إعدادات عامة للموقع يديرها الأدمن من لوحة التحكم. */
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

const DEFAULTS = {
  site_title: 'شات العرب',
  site_tagline: 'تواصل عربي بلا حدود',
  announcement: '',
  announcement_active: false,
  welcome_message: 'أهلاً بك في {site}! التزم بالاحترام المتبادل 🌟',
  allow_signup: true,
  maintenance_mode: false,
  max_message_length: 4000,
  allow_media: true
};

settingsSchema.statics.getAll = async function () {
  const docs = await this.find({});
  const out = { ...DEFAULTS };
  for (const d of docs) out[d.key] = d.value;
  return out;
};

settingsSchema.statics.setMany = async function (obj) {
  const ops = [];
  for (const [key, value] of Object.entries(obj || {})) {
    if (!(key in DEFAULTS)) continue; // لا نسمح بمفاتيح مجهولة
    ops.push(this.updateOne({ key }, { $set: { value } }, { upsert: true }));
  }
  await Promise.all(ops);
  return this.getAll();
};

module.exports = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
