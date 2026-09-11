'use strict';
require('dotenv').config();

const cfg = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  appName: process.env.APP_NAME || 'شات العرب',
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,

  mongoUri: process.env.MONGODB_URI || '',

  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  admin: {
    username: (process.env.ADMIN_USERNAME || 'admin').toLowerCase(),
    email: (process.env.ADMIN_EMAIL || `${process.env.ADMIN_USERNAME || 'admin'}@example.com`).toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'Admin@12345',
    displayName: process.env.ADMIN_DISPLAY_NAME || 'المدير العام'
  },

  pusher: {
    appId: process.env.PUSHER_APP_ID || '',
    key: process.env.PUSHER_KEY || '',
    secret: process.env.PUSHER_SECRET || '',
    cluster: process.env.PUSHER_CLUSTER || 'eu',
    get enabled() {
      return Boolean(this.appId && this.key && this.secret);
    }
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || ''
  },

  allowSignup: String(process.env.ALLOW_SIGNUP ?? 'true') !== 'false'
};

if (cfg.env === 'production' && cfg.jwtSecret.startsWith('dev-insecure')) {
  // لا نوقف التشغيل، لكن ننبّه بصوت عالٍ
  console.warn('[تحذير] JWT_SECRET ما زال القيمة الافتراضية — غيّره فوراً في إعدادات Vercel!');
}

module.exports = cfg;
