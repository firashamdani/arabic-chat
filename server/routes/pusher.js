'use strict';
const express = require('express');
const Room = require('../models/Room');
const { loadUser } = require('../middleware/auth');
const realtime = require('../utils/realtime');
const { safeString, asyncHandler } = require('../utils/helpers');

const router = express.Router();

/** GET /api/pusher/config — يعطي المفتاح والـ cluster للمتصفح */
router.get('/config', (_req, res) => {
  res.json(realtime.config());
});

/**
 * POST /api/pusher/auth — تفويض اشتراك القنوات الخاصة
 * يستقبله Pusher JS تلقائياً عند الاشتراك في قناة private-/presence-
 */
router.post(
  '/auth',
  asyncHandler(async (req, res) => {
    if (!realtime.enabled()) return res.status(503).json({ error: 'Pusher غير مُهيّأ' });

    const socketId = safeString(req.body.socket_id, 100);
    const channelName = safeString(req.body.channel_name, 120);
    if (!socketId || !channelName) return res.status(400).json({ error: 'بيانات ناقصة' });

    let user = null;
    try {
      user = await loadUser(req);
    } catch {
      user = null;
    }
    if (!user) return res.status(403).json({ error: 'غير مصرّح' });

    const roomMembership = async (u, roomId) => {
      if (!u) return false;
      if (['admin', 'mod'].includes(u.role)) return true;
      const room = await Room.findById(roomId);
      if (!room) return false;
      if (room.type === 'public') return true;
      return (room.members || []).map(String).includes(u.id);
    };

    const result = await realtime.authorize({ socketId, channelName, user, roomMembership });
    if (!result) return res.status(403).json({ error: 'ممنوع' });
    res.json(result);
  })
);

module.exports = router;
