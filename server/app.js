'use strict';
const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const cfg = require('./config');
const Settings = require('./models/Settings');
const User = require('./models/User');
const Presence = require('./models/Presence');
const { optionalAuth, auth } = require('./middleware/auth');
const { errorHandler, notFound, asyncHandler } = require('./utils/helpers');
const realtime = require('./utils/realtime');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const roomRoutes = require('./routes/rooms');
const messageRoutes = require('./routes/messages');
const pusherRoutes = require('./routes/pusher');
const adminRoutes = require('./routes/admin');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// حد عام على الـ API
app.use(
  '/api/',
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'طلبات كثيرة جداً، تمهّل قليلاً' }
  })
);

/** فحص الاتصال بقاعدة البيانات */
app.get(
  '/api/health',
  asyncHandler(async (_req, res) => {
    let db = 'disconnected';
    try {
      await mongoose.connection.db.command({ ping: 1 });
      db = 'ok';
    } catch {
      db = 'down';
    }
    res.json({
      ok: db === 'ok',
      db,
      realtime: realtime.enabled(),
      uptime: Math.round(process.uptime()),
      app: cfg.appName,
      time: new Date().toISOString()
    });
  })
);

/**
 * GET /api/bootstrap — كل ما تحتاجه صفحة الدخول:
 * إعدادات الموقع + هل يوجد مستخدمون + هل الأدمن مُهيّأ + إعدادات Realtime
 */
app.get(
  '/api/bootstrap',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const [settings, userCount, adminUser, onlineDocs] = await Promise.all([
      Settings.getAll(),
      User.estimatedDocumentCount(),
      User.findOne({ role: 'admin' }).select('username displayName'),
      Presence.find({})
    ]);
    res.json({
      app: cfg.appName,
      settings,
      hasUsers: userCount > 0,
      adminReady: Boolean(adminUser),
      adminUsername: adminUser ? adminUser.username : cfg.admin.username,
      online: onlineDocs.length,
      realtime: realtime.config(),
      upload: cfg.cloudinary
    });
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/pusher', pusherRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', notFound);

// ===== الواجهة الثابتة =====
const publicDir = path.join(__dirname, '..', 'public');
app.use(
  express.static(publicDir, {
    extensions: ['html'],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      else res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  })
);

// SPA fallback (لا يمسّ /api)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use(errorHandler);

module.exports = app;
