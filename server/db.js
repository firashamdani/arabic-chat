'use strict';
const mongoose = require('mongoose');
const cfg = require('./config');

let connecting = null;

/**
 * يتصل بقاعدة البيانات مرة واحدة فقط (مهم لبيئة Serverless مثل Vercel).
 * يستخدم globalThis لحفظ الـ promise بين استدعاءات الـ function.
 */
function connectDB() {
  if (!cfg.mongoUri) {
    return Promise.reject(
      new Error('MONGODB_URI غير مضبوط. اضبطه في ملف .env محلياً أو في Environment Variables على Vercel.')
    );
  }
  const g = globalThis;
  if (g.__mongoPromise) return g.__mongoPromise;
  if (connecting) return connecting;

  mongoose.set('strictQuery', true);

  connecting = mongoose
    .connect(cfg.mongoUri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10
    })
    .then((m) => {
      console.log('[db] تم الاتصال بقاعدة البيانات:', m.connection.name);
      return m;
    })
    .catch((err) => {
      connecting = null;
      g.__mongoPromise = undefined;
      console.error('[db] فشل الاتصال:', err.message);
      throw err;
    });

  g.__mongoPromise = connecting;
  return connecting;
}

async function ensureConnected() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  return (await connectDB()).connection;
}

module.exports = { connectDB, ensureConnected, mongoose };
