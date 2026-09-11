'use strict';
const express = require('express');
const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');
const Presence = require('../models/Presence');
const Settings = require('../models/Settings');
const { adminOnly, staffOnly, clearPresence } = require('../middleware/auth');
const { safeString, asyncHandler } = require('../utils/helpers');
const realtime = require('../utils/realtime');

const router = express.Router();

/** GET /api/admin/stats — لوحة المؤشرات */
router.get(
  '/stats',
  adminOnly,
  asyncHandler(async (_req, res) => {
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const [users, rooms, messages, messagesToday, banned, onlineDocs] = await Promise.all([
      User.countDocuments(),
      Room.countDocuments({ type: 'public' }),
      Message.countDocuments(),
      Message.countDocuments({ createdAt: { $gte: startToday } }),
      User.countDocuments({ status: 'banned' }),
      Presence.find({})
    ]);

    // نشاط آخر 7 أيام
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({ date: d.toISOString().slice(0, 10), count: 0 });
    }
    const from = new Date(days[0].date);
    const agg = await Message.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      }
    ]);
    const map = new Map(agg.map((a) => [a._id, a.count]));
    for (const d of days) d.count = map.get(d.date) || 0;

    // أنشط 5 غرف
    const topRooms = await Message.aggregate([
      { $group: { _id: '$room', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'rooms', localField: '_id', foreignField: '_id', as: 'room' } },
      { $unwind: '$room' },
      { $project: { _id: 0, name: '$room.name', icon: '$room.icon', count: 1 } }
    ]);

    // أنشط 5 أعضاء
    const topUsers = await Message.aggregate([
      { $group: { _id: '$user', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
      { $unwind: '$u' },
      { $project: { _id: 0, name: '$u.displayName', username: '$u.username', color: '$u.color', count: 1 } }
    ]);

    // توزيع الأدوار
    const byRole = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);

    res.json({
      users,
      rooms,
      messages,
      messagesToday,
      banned,
      online: onlineDocs.length,
      activity: days,
      topRooms,
      topUsers,
      byRole: byRole.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), { user: 0, mod: 0, admin: 0 }),
      realtime: realtime.enabled()
    });
  })
);

/** GET /api/admin/users — إدارة الأعضاء */
router.get(
  '/users',
  adminOnly,
  asyncHandler(async (req, res) => {
    const q = safeString(req.query.q, 40);
    const filter = {};
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ username: rx }, { displayName: rx }, { email: rx }];
    }
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(500);
    const online = await Presence.find({});
    const onlineSet = new Set(online.map((d) => d.user.toString()));
    res.json({ users: users.map((u) => ({ ...u.toAdmin(), online: onlineSet.has(u.id) })) });
  })
);

/** PATCH /api/admin/users/:id — تعديل الصلاحية / الحظر / رفع الحظر */
router.patch(
  '/users/:id',
  adminOnly,
  asyncHandler(async (req, res) => {
    const target = await User.findById(safeString(req.params.id, 40));
    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'لا يمكنك تعديل حسابك من هنا' });

    if (req.body.role && ['user', 'mod', 'admin'].includes(req.body.role)) target.role = req.body.role;
    if (req.body.action === 'ban') {
      target.status = 'banned';
      target.bannedReason = safeString(req.body.reason, 200) || 'مخالفة شروط الاستخدام';
      const days = Number(req.body.days) || 0;
      target.bannedUntil = days > 0 ? new Date(Date.now() + days * 864e5) : null;
      await clearPresence(target._id);
    }
    if (req.body.action === 'unban') {
      target.status = 'active';
      target.bannedReason = '';
      target.bannedUntil = null;
    }
    if (req.body.displayName !== undefined) {
      const dn = safeString(req.body.displayName, 40);
      if (dn) target.displayName = dn;
    }
    await target.save();

    await realtime.notify(target.id, 'account:updated', {
      status: target.status,
      role: target.role,
      reason: target.bannedReason
    });
    await realtime.adminEvent('admin:user-updated', { id: target.id });

    res.json({ user: target.toAdmin() });
  })
);

/** POST /api/admin/users/:id/reset-password */
router.post(
  '/users/:id/reset-password',
  adminOnly,
  asyncHandler(async (req, res) => {
    const target = await User.findById(safeString(req.params.id, 40));
    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const pw = String(req.body.password || '');
    if (pw.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
    target.setPassword(pw);
    await target.save();
    res.json({ ok: true, message: `تم تعيين كلمة مرور جديدة لـ ${target.username}` });
  })
);

/** DELETE /api/admin/users/:id — حذف العضو نهائياً */
router.delete(
  '/users/:id',
  adminOnly,
  asyncHandler(async (req, res) => {
    const target = await User.findById(safeString(req.params.id, 40));
    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'لا يمكنك حذف حسابك' });
    if (target.role === 'admin') return res.status(400).json({ error: 'لا يمكن حذف حساب أدمن' });

    await Message.deleteMany({ user: target._id });
    await Room.deleteMany({ type: 'direct', members: target._id });
    await Presence.deleteOne({ user: target._id });
    await target.deleteOne();
    await realtime.adminEvent('admin:user-deleted', { id: target.id });
    res.json({ ok: true });
  })
);

/** GET /api/admin/rooms */
router.get(
  '/rooms',
  staffOnly,
  asyncHandler(async (_req, res) => {
    const rooms = await Room.find().sort({ type: 1, lastMessageAt: -1 }).limit(500);
    const counts = await Message.aggregate([{ $group: { _id: '$room', count: { $sum: 1 } } }]);
    const map = new Map(counts.map((c) => [c._id.toString(), c.count]));
    const owners = await User.find({ _id: { $in: rooms.map((r) => r.owner).filter(Boolean) } });
    const ownerMap = new Map(owners.map((o) => [o.id, o.displayName]));
    res.json({
      rooms: rooms.map((r) => ({
        ...r.toClient(),
        messageCount: map.get(r.id) || 0,
        ownerName: r.owner ? ownerMap.get(r.owner.toString()) || '—' : '—'
      }))
    });
  })
);

/** DELETE /api/admin/rooms/:id */
router.delete(
  '/rooms/:id',
  staffOnly,
  asyncHandler(async (req, res) => {
    const room = await Room.findById(safeString(req.params.id, 40));
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
    await Message.deleteMany({ room: room._id });
    await room.deleteOne();
    await realtime.adminEvent('room:deleted', { id: room.id, name: room.name });
    res.json({ ok: true });
  })
);

/** GET /api/admin/messages — سجل الرسائل مع بحث وفلترة */
router.get(
  '/messages',
  staffOnly,
  asyncHandler(async (req, res) => {
    const q = safeString(req.query.q, 80);
    const roomId = safeString(req.query.roomId, 40);
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const filter = {};
    if (q) filter.text = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (roomId) filter.room = roomId;

    const msgs = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user room');

    res.json({
      messages: msgs.map((m) => ({
        id: m.id,
        text: m.text,
        user: m.user ? { id: m.user.id, displayName: m.user.displayName, username: m.user.username } : null,
        room: m.room ? { id: m.room.id, name: m.room.name, type: m.room.type } : null,
        deleted: m.deleted,
        media: m.media && m.media.url ? m.media : null,
        createdAt: m.createdAt
      }))
    });
  })
);

/** DELETE /api/admin/messages/:id */
router.delete(
  '/messages/:id',
  staffOnly,
  asyncHandler(async (req, res) => {
    const msg = await Message.findById(safeString(req.params.id, 40));
    if (!msg) return res.status(404).json({ error: 'الرسالة غير موجودة' });
    msg.deleted = true;
    msg.text = '';
    msg.media = { kind: null, url: '', name: '', size: 0 };
    msg.deletedBy = req.user._id;
    await msg.save();
    await realtime.messageDeleted(msg.room.toString(), msg.id);
    res.json({ ok: true });
  })
);

/** GET /api/admin/settings */
router.get(
  '/settings',
  adminOnly,
  asyncHandler(async (_req, res) => {
    res.json({ settings: await Settings.getAll(), realtime: realtime.enabled() });
  })
);

/** PUT /api/admin/settings */
router.put(
  '/settings',
  adminOnly,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const patch = {};
    if (body.site_title !== undefined) patch.site_title = safeString(body.site_title, 60);
    if (body.site_tagline !== undefined) patch.site_tagline = safeString(body.site_tagline, 100);
    if (body.announcement !== undefined) patch.announcement = safeString(body.announcement, 300);
    if (typeof body.announcement_active === 'boolean') patch.announcement_active = body.announcement_active;
    if (body.welcome_message !== undefined) patch.welcome_message = safeString(body.welcome_message, 300);
    if (typeof body.allow_signup === 'boolean') patch.allow_signup = body.allow_signup;
    if (typeof body.maintenance_mode === 'boolean') patch.maintenance_mode = body.maintenance_mode;
    if (typeof body.allow_media === 'boolean') patch.allow_media = body.allow_media;

    const settings = await Settings.setMany(patch);
    await realtime.adminEvent('settings:updated', settings);
    res.json({ settings });
  })
);

/** GET /api/admin/online */
router.get(
  '/online',
  staffOnly,
  asyncHandler(async (_req, res) => {
    const docs = await Presence.find({}).sort({ lastPingAt: -1 });
    res.json({
      online: docs.map((d) => ({
        id: d.user.toString(),
        displayName: d.displayName,
        username: d.username,
        role: d.role,
        roomId: d.roomId,
        since: d.lastPingAt
      }))
    });
  })
);

module.exports = router;
