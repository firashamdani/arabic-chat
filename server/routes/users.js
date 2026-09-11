'use strict';
const express = require('express');
const User = require('../models/User');
const Presence = require('../models/Presence');
const Room = require('../models/Room');
const Message = require('../models/Message');
const { auth, touchPresence } = require('../middleware/auth');
const { safeString, asyncHandler, escapeHtml } = require('../utils/helpers');
const realtime = require('../utils/realtime');

const router = express.Router();

/** GET /api/users — قائمة الأعضاء مع حالة الاتصال */
router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const q = safeString(req.query.q, 40);
    const filter = { status: { $ne: 'banned' } };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ username: rx }, { displayName: rx }];
    }

    const [users, onlineDocs, unread] = await Promise.all([
      User.find(filter).sort({ role: -1, lastSeenAt: -1 }).limit(500),
      Presence.find({}),
      Message.aggregate([
        { $match: { deleted: false, user: { $ne: req.user._id } } },
        { $group: { _id: '$user', count: { $sum: 1 } } }
      ])
    ]);

    const onlineMap = new Map();
    for (const p of onlineDocs) onlineMap.set(p.user.toString(), p.roomId || '');
    const countMap = new Map(unread.map((u) => [u._id.toString(), u.count]));

    const fiveMin = Date.now() - 5 * 60 * 1000;
    const list = users.map((u) => ({
      ...u.toPublic(),
      online: onlineMap.has(u.id),
      currentRoom: onlineMap.get(u.id) || '',
      isMe: u.id === req.user.id,
      messageCount: countMap.get(u.id) || 0,
      lastSeenRecently: new Date(u.lastSeenAt || 0).getTime() > fiveMin
    }));

    res.json({ users: list, onlineCount: onlineMap.size, total: list.length });
  })
);

/** GET /api/users/online — المتصلون الآن فقط */
router.get(
  '/online',
  auth,
  asyncHandler(async (req, res) => {
    const docs = await Presence.find({}).sort({ lastPingAt: -1 });
    res.json({
      online: docs.map((d) => ({
        id: d.user.toString(),
        username: d.username,
        displayName: d.displayName,
        role: d.role,
        avatar: d.avatar,
        color: d.color,
        roomId: d.roomId,
        since: d.lastPingAt
      }))
    });
  })
);

/** نبضة حضور — تُبقي المستخدم "متصلاً" */
router.post(
  '/ping',
  auth,
  asyncHandler(async (req, res) => {
    await touchPresence(req.user, safeString(req.body.roomId, 60));
    req.user.lastSeenAt = new Date();
    await req.user.save();
    res.json({ ok: true, online: true });
  })
);

/** GET /api/users/search?term= — بحث للاقتراحات و @mentions */
router.get(
  '/search',
  auth,
  asyncHandler(async (req, res) => {
    const term = safeString(req.query.term || req.query.q, 40);
    if (!term) return res.json({ users: [] });
    const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({
      status: { $ne: 'banned' },
      $or: [{ username: rx }, { displayName: rx }]
    })
      .limit(10)
      .sort({ role: -1, lastSeenAt: -1 });
    res.json({ users: users.map((u) => u.toPublic()) });
  })
);

/** POST /api/users/:id/dm — يفتح (أو يجلب) محادثة خاصة */
router.post(
  '/:id/dm',
  auth,
  asyncHandler(async (req, res) => {
    const targetId = safeString(req.params.id, 40);
    if (targetId === req.user.id) return res.status(400).json({ error: 'لا يمكنك مراسلة نفسك' });

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (target.isBanned()) return res.status(403).json({ error: 'هذا العضو موقوف' });

    const pair = [req.user.id, target.id].sort();
    const slug = `dm-${pair[0]}-${pair[1]}`;

    let room = await Room.findOne({ slug, type: 'direct' });
    let created = false;
    if (!room) {
      room = await Room.create({
        name: 'محادثة خاصة',
        slug,
        type: 'direct',
        members: pair,
        owner: req.user._id,
        createdBy: req.user._id,
        icon: '🔒',
        hidden: true
      });
      created = true;
    }

    const [messages, onlineDocs] = await Promise.all([
      Message.find({ room: room._id }).sort({ createdAt: -1 }).limit(30).populate('user replyTo'),
      Presence.find({ user: { $in: pair } })
    ]);
    const onlineMap = new Map(onlineDocs.map((d) => [d.user.toString(), true]));

    res.json({
      room: room.toClient(req.user.id),
      created,
      peer: { ...target.toPublic(), online: onlineMap.has(target.id) },
      messages: messages.reverse().map((m) => m.toClient({ viewerId: req.user.id }))
    });
  })
);

module.exports = router;
