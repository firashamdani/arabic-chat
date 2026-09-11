'use strict';
const cfg = require('../config');

/**
 * طبقة الـ Realtime مبنية على Pusher Channels.
 * السبب: Vercel (الخطة المجانية) لا يدعم اتصالات WebSocket طويلة الأمد،
 * بينما Pusher يوفّر طبقة Realtime مجانية (200 ألف رسالة/يوم، عدد قنوات غير محدود).
 * كل الدوال "آمنة": إن لم تُضبط مفاتيح Pusher تعمل بصمت دون تعطيل الموقع.
 */

let pusher = null;
if (cfg.pusher.enabled) {
  try {
    const Pusher = require('pusher');
    pusher = new Pusher({
      appId: cfg.pusher.appId,
      key: cfg.pusher.key,
      secret: cfg.pusher.secret,
      cluster: cfg.pusher.cluster,
      useTLS: true
    });
  } catch (err) {
    console.error('[realtime] تعذّر تهيئة Pusher:', err.message);
  }
}

function enabled() {
  return Boolean(pusher);
}

function config() {
  return {
    enabled: enabled(),
    key: cfg.pusher.key,
    cluster: cfg.pusher.cluster,
    authEndpoint: '/api/pusher/auth'
  };
}

/** إرسال حدث إلى قناة أو أكثر */
async function trigger(channels, event, data) {
  if (!pusher) return null;
  const list = (Array.isArray(channels) ? channels : [channels]).filter(Boolean);
  if (!list.length) return null;
  try {
    // Pusher يقبل حتى 10 قنوات في الطلب الواحد
    for (let i = 0; i < list.length; i += 10) {
      await pusher.trigger(list.slice(i, i + 10), event, data);
    }
    return true;
  } catch (err) {
    console.error('[realtime] فشل الإرسال:', err.message);
    return null;
  }
}

// ===== أسماء القنوات =====
const roomChannel = (roomId) => `private-room-${roomId}`;
const userChannel = (userId) => `private-user-${userId}`;
const adminChannel = 'presence-admin';
const globalChannel = 'presence-global';

async function messageToRoom(roomId, message) {
  return trigger(roomChannel(roomId), 'message:new', message);
}
async function messageEdited(roomId, message) {
  return trigger(roomChannel(roomId), 'message:edited', message);
}
async function messageDeleted(roomId, id) {
  return trigger(roomChannel(roomId), 'message:deleted', { id, roomId });
}
async function roomUpdated(room) {
  return trigger([globalChannel, adminChannel], 'room:updated', room);
}
async function typing(roomId, user) {
  return trigger(roomChannel(roomId), 'typing', { user, at: Date.now() });
}
async function notify(userId, event, data) {
  return trigger(userChannel(userId), event, data);
}
async function adminEvent(event, data) {
  return trigger([adminChannel, globalChannel], event, data);
}

/**
 * تفويض اشتراك القنوات الخاصة — يُستدعى من POST /api/pusher/auth
 */
async function authorize({ socketId, channelName, user, roomMembership }) {
  if (!pusher) return null;

  // القنوات العامة (presence-global) لا تحتاج تفويضاً
  if (!channelName.startsWith('private-') && !channelName.startsWith('presence-')) {
    return { auth: pusher.authorizeChannel(socketId, channelName) };
  }

  if (channelName === 'presence-admin') {
    if (!user || user.role !== 'admin') return null;
    return {
      auth: pusher.authorizeChannel(socketId, channelName, {
        user_id: user.id,
        user_info: { name: user.displayName, role: 'admin' }
      })
    };
  }

  if (channelName === 'presence-global') {
    if (!user) return null;
    return {
      auth: pusher.authorizeChannel(socketId, channelName, {
        user_id: user.id,
        user_info: { name: user.displayName, role: user.role }
      })
    };
  }

  if (channelName.startsWith('private-user-')) {
    const targetId = channelName.replace('private-user-', '');
    if (!user || user.id !== targetId) return null;
    return { auth: pusher.authorizeChannel(socketId, channelName) };
  }

  if (channelName.startsWith('private-room-')) {
    const roomId = channelName.replace('private-room-', '');
    const allowed = await roomMembership(user, roomId);
    if (!allowed) return null;
    return { auth: pusher.authorizeChannel(socketId, channelName) };
  }

  return null;
}

module.exports = {
  enabled,
  config,
  trigger,
  authorize,
  roomChannel,
  userChannel,
  adminChannel,
  globalChannel,
  messageToRoom,
  messageEdited,
  messageDeleted,
  roomUpdated,
  typing,
  notify,
  adminEvent
};
