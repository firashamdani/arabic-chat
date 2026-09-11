'use strict';
const express = require('express');
const Message = require('../models/Message');
const Room = require('../models/Room');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { safeString, asyncHandler, extractMentions, previewOf } = require('../utils/helpers');
const realtime = require('../utils/realtime');

const router = express.Router();

const MAX_LEN = 4000;

async function canAccess(user, room) {
  if (!room) return false;
  if (['admin', 'mod'].includes(user.role)) return true;
  if (room.type === 'public') return !room.hidden;
  return (room.members || []).map(String).includes(user.id);
}

/** POST /api/messages — إرسال رسالة (نص و/أو مرفق) */
router.post(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const roomId = safeString(req.body.roomId, 40);
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
    if (!(await canAccess(req.user, room))) return res.status(403).json({ error: 'لا تملك صلاحية الإرسال هنا' });
    if (room.locked && !['admin', 'mod'].includes(req.user.role)) {
      return res.status(403).json({ error: 'الغرفة مقفلة من الإدارة' });
    }

    let text = String(req.body.text ?? '').replace(/\r\n/g, '\n').trim().slice(0, MAX_LEN);

    const mediaRaw = req.body.media;
    let media = null;
    if (mediaRaw && typeof mediaRaw === 'object' && mediaRaw.url) {
      const kind = ['image', 'file', 'audio', 'video'].includes(mediaRaw.kind) ? mediaRaw.kind : 'file';
      media = {
        kind,
        url: safeString(mediaRaw.url, 600),
        name: safeString(mediaRaw.name, 120),
        size: Number(mediaRaw.size) || 0
      };
    }

    if (!text && !media) return res.status(400).json({ error: 'الرسالة فارغة' });

    // mentions
    const names = extractMentions(text);
    let mentions = [];
    if (names.length) {
      const found = await User.find({ username: { $in: names } }).select('_id');
      mentions = found.map((f) => f._id);
    }

    const replyTo = safeString(req.body.replyTo, 40) || null;

    const msg = await Message.create({
      room: room._id,
      user: req.user._id,
      text,
      media,
      mentions,
      replyTo
    });

    room.lastMessageAt = new Date();
    room.lastMessagePreview = previewOf(text, media);
    // زيادة غير المقروء للآخرين
    const others = room.type === 'direct' ? room.members.filter((m) => m.toString() !== req.user.id) : [];
    for (const o of others) room.unread.set(o.toString(), (room.unread.get(o.toString()) || 0) + 1);
    room.unread.set(req.user.id, 0);
    await room.save();

    const populated = await Message.findById(msg._id).populate('user replyTo');
    const client = populated.toClient({ viewerId: req.user.id });

    await realtime.messageToRoom(room.id, client);

    // إشعار الطرف الآخر في الخاص + إشعار لمن تم عمل منشن له
    if (room.type === 'direct') {
      for (const o of others) await realtime.notify(o.toString(), 'dm:new', { room: room.toClient(o.toString()), message: client });
    }
    for (const m of mentions) {
      if (m.toString() !== req.user.id) {
        await realtime.notify(m.toString(), 'mention', { roomName: room.name, roomId: room.id, message: client });
      }
    }
    await realtime.adminEvent('stats:new-message', { roomId: room.id, userId: req.user.id, at: Date.now() });

    res.status(201).json({ message: client });
  })
);

/** GET /api/messages?roomId=&limit=&before= */
router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const roomId = safeString(req.query.roomId, 40);
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
    if (!(await canAccess(req.user, room))) return res.status(403).json({ error: 'غير مصرّح' });

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = safeString(req.query.before, 40);
    const filter = { room: room._id };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const msgs = await Message.find(filter).sort({ createdAt: -1 }).limit(limit + 1).populate('user replyTo');
    const hasMore = msgs.length > limit;
    const list = msgs.slice(0, limit).reverse();
    res.json({ messages: list.map((m) => m.toClient({ viewerId: req.user.id })), hasMore });
  })
);

/** PATCH /api/messages/:id — تعديل رسالتي */
router.patch(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const msg = await Message.findById(safeString(req.params.id, 40));
    if (!msg) return res.status(404).json({ error: 'الرسالة غير موجودة' });
    if (msg.user.toString() !== req.user.id) return res.status(403).json({ error: 'تعدّل رسائلك فقط' });
    if (msg.deleted) return res.status(400).json({ error: 'الرسالة محذوفة' });

    const text = String(req.body.text ?? '').trim().slice(0, MAX_LEN);
    if (!text) return res.status(400).json({ error: 'لا يمكن التفريغ — استخدم الحذف' });
    msg.text = text;
    msg.edited = true;
    msg.editedAt = new Date();
    await msg.save();

    const populated = await Message.findById(msg._id).populate('user replyTo');
    const client = populated.toClient({ viewerId: req.user.id });
    await realtime.messageEdited(msg.room.toString(), client);
    res.json({ message: client });
  })
);

/** DELETE /api/messages/:id — حذف (صاحبها أو الإدارة) */
router.delete(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const msg = await Message.findById(safeString(req.params.id, 40));
    if (!msg) return res.status(404).json({ error: 'الرسالة غير موجودة' });

    const isStaff = ['admin', 'mod'].includes(req.user.role);
    if (msg.user.toString() !== req.user.id && !isStaff) {
      return res.status(403).json({ error: 'لا تملك صلاحية الحذف' });
    }

    msg.deleted = true;
    msg.text = '';
    msg.media = { kind: null, url: '', name: '', size: 0 };
    msg.deletedBy = req.user._id;
    await msg.save();

    await realtime.messageDeleted(msg.room.toString(), msg.id);
    res.json({ ok: true, id: msg.id });
  })
);

/** POST /api/rooms/:id/typing — مؤشر "يكتب الآن" (يُبث عبر قناة الغرفة) */
router.post(
  '/typing',
  auth,
  asyncHandler(async (req, res) => {
    const roomId = safeString(req.body.roomId, 40);
    const room = await Room.findById(roomId);
    if (!room || !(await canAccess(req.user, room))) return res.status(403).json({ error: 'غير مصرّح' });

    await realtime.typing(room.id, {
      id: req.user.id,
      username: req.user.username,
      displayName: req.user.displayName,
      color: req.user.color
    });
    res.json({ ok: true });
  })
);

/** POST /api/messages/read — تعليم الرسائل كمقروءة */
router.post(
  '/read',
  auth,
  asyncHandler(async (req, res) => {
    const roomId = safeString(req.body.roomId, 40);
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
    if (room.unread && room.unread.get(req.user.id)) {
      room.unread.set(req.user.id, 0);
      await room.save();
    }
    await Message.updateMany(
      { room: room._id, seenBy: { $ne: req.user._id }, user: { $ne: req.user._id } },
      { $push: { seenBy: req.user._id } }
    );
    res.json({ ok: true });
  })
);

module.exports = router;
