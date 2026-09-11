'use strict';
const jwt = require('jsonwebtoken');
const cfg = require('../config');
const User = require('../models/User');
const Presence = require('../models/Presence');

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), username: user.username, role: user.role },
    cfg.jwtSecret,
    { expiresIn: cfg.jwtExpiresIn }
  );
}

function readToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  if (req.query && req.query.token) return String(req.query.token);
  return null;
}

async function loadUser(req) {
  const token = readToken(req);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, cfg.jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user) return null;
    if (user.isBanned()) {
      const err = new Error('حسابك موقوف من قبل الإدارة.');
      err.status = 403;
      err.code = 'BANNED';
      throw err;
    }
    return user;
  } catch (err) {
    if (err.code === 'BANNED') throw err;
    return null;
  }
}

/** يتطلب تسجيل دخول */
async function auth(req, res, next) {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ error: 'الرجاء تسجيل الدخول' });
    req.user = user;
    // نبضة حضور غير حاجزة
    touchPresence(user).catch(() => {});
    next();
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }
}

/** اختياري: يمرّر المستخدم إن وُجد */
async function optionalAuth(req, _res, next) {
  try {
    req.user = await loadUser(req);
  } catch {
    req.user = null;
  }
  next();
}

/** يتطلب أدمن */
async function adminOnly(req, res, next) {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ error: 'الرجاء تسجيل الدخول' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'هذه الصلاحية للأدمن فقط' });
    req.user = user;
    touchPresence(user).catch(() => {});
    next();
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }
}

/** يتطلب أدمن أو مشرف */
async function staffOnly(req, res, next) {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ error: 'الرجاء تسجيل الدخول' });
    if (!['admin', 'mod'].includes(user.role)) {
      return res.status(403).json({ error: 'هذه الصلاحية للإدارة فقط' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }
}

/** تحديث "متصل الآن" — upsert خفيف */
async function touchPresence(user, roomId = '') {
  try {
    await Presence.updateOne(
      { user: user._id },
      {
        $set: {
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          avatar: user.avatar,
          color: user.color,
          roomId,
          lastPingAt: new Date()
        }
      },
      { upsert: true }
    );
  } catch {
    /* غير حرج */
  }
}

async function clearPresence(userId) {
  try {
    await Presence.deleteOne({ user: userId });
  } catch {
    /* غير حرج */
  }
}

module.exports = { signToken, auth, optionalAuth, adminOnly, staffOnly, touchPresence, clearPresence };
