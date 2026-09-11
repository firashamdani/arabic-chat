'use strict';
const express = require('express');
const Room = require('../models/Room');
const Message = require('../models/Message');
const User = require('../models/User');
const Presence = require('../models/Presence');
const { auth, staffOnly, touchPresence } = require('../middleware/auth');
const { safeString, slugify, asyncHandler } = require('../utils/helpers');
const realtime = require('../utils/realtime');

const router = express.Router();

/** هل يحق للمستخدم دخول الغرفة؟ */
async function canAccess(user, room) {
  if (!room) return false;
  if (['admin', 'mod'].includes(user.role)) return true;
  if (room.type === 'public') return !room.hidden;
  return (room.members || []).map(String).includes(user.id);
}

/** GET /api/rooms — غرفي + العامة */
router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const me = req.user.id;
    const rooms = await Room.find({ type: 'public' }).sort({ pinned: -1, lastMessageAt: -1 });

    const dms = await Room.find({ type: 'direct', members: req.user._id }).sort({ lastMessageAt: -1 }).limit(50);

    const otherIds = [...new Set(dms.flatMap((r) => (r.members || []).map(String).filter((id) => id !== me)))];
    const peers = await User.find({ _id: { $in: otherIds } });
    const peerMap = new Map(peers.map((p) => [p.id, p]));
    const onlineDocs = await Presence.find({});
    const onlineSet = new Set(onlineDocs.map((d) => d.user.toString()));

    const dmList = dms.map((r) => {
      const peerId = (r.members || []).map(String).find((id) => id !== me);
      const peer = peerId ? peerMap.get(peerId) : null;
      const obj = r.toClient(me);
      obj.peer = peer ? { ...peer.toPublic(), online: onlineSet.has(peer.id) } : null;
      obj.name = peer ? peer.displayName : 'محادثة';
      obj.icon = peer ? '' : '🔒';
      return obj;
    });

    res.json({
      rooms: rooms.map((r) => r.toClient(me)),
      direct: dmList
    });
  })
);

/** POST /api/rooms — إنشاء غرفة (أي عضو) */
router.post(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const name = safeString(req.body.name, 40);
    if (name.length < 2) return res.status(400).json({ error: 'اسم الغرفة حرفان على الأقل' });

    let slug = slugify(req.body.slug || name);
    if (!slug) slug = `room-${Date.now().toString(36)}`;

    // ضمان عدم التكرار
    if (await Room.findOne({ slug, type: 'public' })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const room = await Room.create({
      name,
      slug,
      description: safeString(req.body.description, 200),
      icon: safeString(req.body.icon, 8) || '💬',
      type: 'public',
      owner: req.user._id,
      createdBy: req.user._id,
      locked: false
    });

    await Message.create({
      room: room._id,
      user: req.user._id,
      text: `أنشأ ${req.user.displayName} هذه الغرفة 🎉`,
      system: true
    });

    const client = room.toClient(req.user.id);
    await realtime.adminEvent('room:created', client);
    res.status(201).json({ room: client });
  })
);

/** GET /api/rooms/:id — تفاصيل + آخر الرسائل */
router.get(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const room = await Room.findById(safeString(req.params.id, 40));
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
    if (!(await canAccess(req.user, room))) return res.status(403).json({ error: 'لا تملك صلاحية دخول هذه الغرفة' });

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = safeString(req.query.before, 40);
    const filter = { room: room._id };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user replyTo');

    const onlineDocs = await Presence.find({ roomId: room.id });
    const members = room.type === 'direct' ? await User.find({ _id: { $in: room.members } }) : [];

    // تصفير غير المقروء
    if (room.unread && room.unread.get(req.user.id)) {
      room.unread.set(req.user.id, 0);
      await room.save();
    }

    await touchPresence(req.user, room.id);

    res.json({
      room: room.toClient(req.user.id),
      messages: messages.reverse().map((m) => m.toClient({ viewerId: req.user.id })),
      hasMore: messages.length === limit,
      onlineHere: onlineDocs.map((d) => ({
        id: d.user.toString(),
        displayName: d.displayName,
        username: d.username,
        role: d.role,
        color: d.color,
        avatar: d.avatar
      })),
      directMembers: members.map((m) => m.toPublic())
    });
  })
);

/** PATCH /api/rooms/:id — تعديل (المالك أو الإدارة) */
router.patch(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const room = await Room.findById(safeString(req.params.id, 40));
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });

    const isStaff = ['admin', 'mod'].includes(req.user.role);
    const isOwner = room.owner && room.owner.toString() === req.user.id;
    if (!isStaff && !isOwner) return res.status(403).json({ error: 'التعديل للمالك أو الإدارة فقط' });

    if (req.body.name !== undefined && (isStaff || isOwner)) {
      const n = safeString(req.body.name, 40);
      if (n.length >= 2) room.name = n;
    }
    if (req.body.description !== undefined) room.description = safeString(req.body.description, 200);
    if (req.body.icon !== undefined) room.icon = safeString(req.body.icon, 8) || room.icon;
    if (isStaff) {
      if (typeof req.body.pinned === 'boolean') room.pinned = req.body.pinned;
      if (typeof req.body.locked === 'boolean') room.locked = req.body.locked;
      if (typeof req.body.hidden === 'boolean') room.hidden = req.body.hidden;
    }
    await room.save();

    const client = room.toClient(req.user.id);
    await realtime.roomUpdated(client);
    res.json({ room: client });
  })
);

/** DELETE /api/rooms/:id — حذف (الإدارة أو مالك الغرفة) */
router.delete(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const room = await Room.findById(safeString(req.params.id, 40));
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });

    const isStaff = ['admin', 'mod'].includes(req.user.role);
    const isOwner = room.owner && room.owner.toString() === req.user.id;
    if (!isStaff && !isOwner) return res.status(403).json({ error: 'الحذف للمالك أو الإدارة فقط' });

    await Message.deleteMany({ room: room._id });
    await room.deleteOne();
    await realtime.adminEvent('room:deleted', { id: room.id, name: room.name });
    res.json({ ok: true });
  })
);

/** GET /api/rooms/:id/members — أعضاء الغرفة (للغرف الخاصة) */
router.get(
  '/:id/members',
  auth,
  asyncHandler(async (req, res) => {
    const room = await Room.findById(safeString(req.params.id, 40));
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
    if (room.type !== 'direct') return res.json({ members: [] });
    if (!room.members.map(String).includes(req.user.id)) {
      return res.status(403).json({ error: 'غير مصرّح' });
    }
    const users = await User.find({ _id: { $in: room.members } });
    const onlineDocs = await Presence.find({ user: { $in: room.members } });
    const onlineSet = new Set(onlineDocs.map((d) => d.user.toString()));
    res.json({ members: users.map((u) => ({ ...u.toPublic(), online: onlineSet.has(u.id) })) });
  })
);

module.exports = router;
