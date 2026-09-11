'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { signToken, auth, clearPresence, touchPresence } = require('../middleware/auth');
const { safeString, asyncHandler } = require('../utils/helpers');
const cfg = require('../config');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات كثيرة جداً، حاول بعد دقائق' }
});

/** POST /api/auth/register */
router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const settings = await Settings.getAll();
    // التسجيل مسموح فقط إذا كان مُفعّلاً في الإعدادات (لوحة الأدمن) وفي متغير البيئة معاً
    const signupAllowed = settings.allow_signup !== false && cfg.allowSignup;
    if (!signupAllowed) {
      return res.status(403).json({ error: 'التسجيل مغلق حالياً من قبل الإدارة' });
    }
    if (settings.maintenance_mode) {
      return res.status(503).json({ error: 'الموقع في وضع الصيانة' });
    }

    const username = safeString(req.body.username, 24).toLowerCase();
    const email = safeString(req.body.email, 120).toLowerCase();
    const password = String(req.body.password || '');
    const displayName = safeString(req.body.displayName, 40) || username;

    if (!/^[a-z0-9_.-]{3,24}$/.test(username)) {
      return res.status(400).json({ error: 'اسم المستخدم: 3-24 حرفاً إنجليزياً (أرقام و _ . - مسموحة)' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
    }

    const exists = await User.findOne({ $or: [{ username }, { email }] });
    if (exists) {
      return res.status(409).json({
        error: exists.username === username ? 'اسم المستخدم محجوز' : 'البريد مستخدم مسبقاً'
      });
    }

    const user = new User({ username, email, displayName, color: User.randomColor(username) });
    user.setPassword(password);
    await user.save();

    const token = signToken(user);
    await touchPresence(user);
    res.status(201).json({ token, user: user.toPrivate() });
  })
);

/** POST /api/auth/login */
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const id = safeString(req.body.username, 120).toLowerCase();
    const password = String(req.body.password || '');

    const user = await User.findOne({ $or: [{ username: id }, { email: id }] });
    if (!user || !user.verifyPassword(password)) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    if (user.isBanned()) {
      const until = user.bannedUntil ? ` حتى ${user.bannedUntil.toLocaleString('ar-IQ')}` : '';
      return res.status(403).json({ error: `حسابك موقوف${until}. ${user.bannedReason || ''}`.trim() });
    }

    const token = signToken(user);
    user.lastSeenAt = new Date();
    await user.save();
    await touchPresence(user);
    res.json({ token, user: user.toPrivate() });
  })
);

/** GET /api/auth/me */
router.get(
  '/me',
  auth,
  asyncHandler(async (req, res) => {
    req.user.lastSeenAt = new Date();
    await req.user.save();
    res.json({ user: req.user.toPrivate() });
  })
);

/** PATCH /api/auth/me — تعديل الملف الشخصي */
router.patch(
  '/me',
  auth,
  asyncHandler(async (req, res) => {
    const u = req.user;
    if (req.body.displayName !== undefined) {
      const dn = safeString(req.body.displayName, 40);
      if (dn.length < 2) return res.status(400).json({ error: 'الاسم الظاهر حرفان على الأقل' });
      u.displayName = dn;
    }
    if (req.body.bio !== undefined) u.bio = safeString(req.body.bio, 200);
    if (req.body.avatar !== undefined) u.avatar = safeString(req.body.avatar, 500);
    if (req.body.color !== undefined && /^#[0-9a-f]{6}$/i.test(String(req.body.color))) {
      u.color = String(req.body.color);
    }
    if (req.body.settings && typeof req.body.settings === 'object') {
      const s = req.body.settings;
      if (['light', 'dark', 'auto'].includes(s.theme)) u.settings.theme = s.theme;
      if (typeof s.sound === 'boolean') u.settings.sound = s.sound;
      if (typeof s.enterSend === 'boolean') u.settings.enterSend = s.enterSend;
    }
    await u.save();
    res.json({ user: u.toPrivate() });
  })
);

/** POST /api/auth/change-password */
router.post(
  '/change-password',
  auth,
  asyncHandler(async (req, res) => {
    const u = req.user;
    const current = String(req.body.currentPassword || '');
    const next = String(req.body.newPassword || '');
    if (!u.verifyPassword(current)) return res.status(401).json({ error: 'كلمة المرور الحالية خاطئة' });
    if (next.length < 6) return res.status(400).json({ error: 'كلمة المرور الجديدة 6 أحرف على الأقل' });
    u.setPassword(next);
    await u.save();
    res.json({ ok: true, message: 'تم تغيير كلمة المرور' });
  })
);

/** POST /api/auth/logout */
router.post(
  '/logout',
  auth,
  asyncHandler(async (req, res) => {
    req.user.lastSeenAt = new Date();
    await req.user.save();
    await clearPresence(req.user._id);
    res.json({ ok: true });
  })
);

module.exports = router;
