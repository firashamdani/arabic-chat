'use strict';
/**
 * اختبار دخاني (Smoke Test) — يشغّل تطبيق Express الحقيقي ويمرّ على كل المسارات:
 *   التسجيل، الدخول، الغرف، الرسائل، الخاص، التعديل، الحذف،
 *   التفويض (Pusher auth)، ولوحة الأدمن بالكامل (إحصاءات/أعضاء/غرف/رسائل/إعدادات).
 *
 *   التشغيل:  npm test
 */

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';

let pass = 0, fail = 0;
const results = [];

function ok(name, extra = '') { pass++; results.push(['✅', name, extra]); }
function bad(name, extra = '') { fail++; results.push(['❌', name, extra]); }
function check(name, cond, extra = '') { cond ? ok(name, extra) : bad(name, extra); }

async function req(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (raw) return { status: res.status, headers: res.headers, text: await res.text() };
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

async function main() {
  console.log(`\n🧪 اختبار على ${BASE}\n${'─'.repeat(60)}`);

  // 1) health + bootstrap
  const h = await req('GET', '/api/health');
  check('GET /api/health → 200 و db=ok', h.status === 200 && h.data.db === 'ok', JSON.stringify(h.data));

  const b = await req('GET', '/api/bootstrap');
  check('GET /api/bootstrap → adminReady=true', b.status === 200 && b.data.adminReady === true,
    `admin=${b.data.adminUsername} hasUsers=${b.data.hasUsers}`);
  check('bootstrap يُرجع 6 إعدادات أساسية على الأقل', Object.keys(b.data.settings || {}).length >= 6,
    Object.keys(b.data.settings || {}).join(','));

  // 2) دخول الأدمن
  const login = await req('POST', '/api/auth/login', {
    body: { username: 'admin', password: 'Admin@12345' }
  });
  check('POST /api/auth/login (admin) → 200 + token', login.status === 200 && !!login.data.token,
    login.data.error || `role=${login.data.user?.role}`);
  const adminToken = login.data.token;
  check('حساب الأدمن دوره = admin', login.data.user?.role === 'admin');

  const badLogin = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'wrong' } });
  check('كلمة مرور خاطئة → 401', badLogin.status === 401, badLogin.data.error);

  // 3) تسجيل عضوين
  const u1 = await req('POST', '/api/auth/register', {
    body: { username: 'ahmed', email: 'ahmed@test.com', password: '123456', displayName: 'أحمد' }
  });
  const u2 = await req('POST', '/api/auth/register', {
    body: { username: 'sara', email: 'sara@test.com', password: '123456', displayName: 'سارة' }
  });
  check('تسجيل عضو جديد (أحمد) → 201', u1.status === 201 && !!u1.data.token, u1.data.error || '');
  check('تسجيل عضو جديد (سارة) → 201', u2.status === 201 && !!u2.data.token, u2.data.error || '');
  const t1 = u1.data.token, t2 = u2.data.token;
  const id1 = u1.data.user?.id, id2 = u2.data.user?.id;

  const dup = await req('POST', '/api/auth/register', {
    body: { username: 'ahmed', email: 'other@test.com', password: '123456', displayName: 'مكرر' }
  });
  check('اسم مستخدم مكرر → 409', dup.status === 409, dup.data.error);

  const weak = await req('POST', '/api/auth/register', {
    body: { username: 'xy', email: 'bad-email', password: '1', displayName: 'x' }
  });
  check('بيانات ضعيفة → 400', weak.status === 400, weak.data.error);

  // 4) الحماية: مسار بدون توكن
  const noAuth = await req('GET', '/api/rooms');
  check('GET /api/rooms بدون توكن → 401', noAuth.status === 401);

  const notAdmin = await req('GET', '/api/admin/stats', { token: t1 });
  check('عضو عادي على /api/admin/stats → 403', notAdmin.status === 403, notAdmin.data.error);

  // 5) الغرف المُهيّأة
  const rooms = await req('GET', '/api/rooms', { token: t1 });
  check('GET /api/rooms → 6 غرف عامة مُهيّأة', rooms.status === 200 && rooms.data.rooms.length === 6,
    `count=${rooms.data.rooms?.length}: ${(rooms.data.rooms || []).map(r => r.slug).join(',')}`);
  const general = rooms.data.rooms.find((r) => r.slug === 'general');
  check('توجد غرفة general', !!general);

  // 6) قراءة الرسائل (رسالة الترحيب)
  const msgs = await req('GET', `/api/rooms/${general.id}?limit=50`, { token: t1 });
  check('GET /api/rooms/:id → 200 + رسالة ترحيب', msgs.status === 200 && msgs.data.messages.length >= 1,
    `messages=${msgs.data.messages?.length}`);

  // 7) إرسال رسالة في العامة
  const send = await req('POST', '/api/messages', {
    token: t1, body: { roomId: general.id, text: 'مرحباً بالجميع 👋 من @sara' }
  });
  check('POST /api/messages → 201 + message.user مُعبّأ',
    send.status === 201 && send.data.message?.user?.username === 'ahmed', send.data.error || '');
  check('استخراج @mentions يعمل', (send.data.message?.mentions || []).length === 1,
    JSON.stringify(send.data.message?.mentions));
  const msgId = send.data.message?.id;

  // 8) رسالة بمرفق
  const withMedia = await req('POST', '/api/messages', {
    token: t2,
    body: { roomId: general.id, text: '', media: { kind: 'image', url: 'https://example.com/x.png', name: 'x.png', size: 1234 } }
  });
  check('رسالة بمرفق فقط → 201 + media', withMedia.status === 201 && !!withMedia.data.message?.media?.url);

  const empty = await req('POST', '/api/messages', { token: t1, body: { roomId: general.id, text: '' } });
  check('رسالة فارغة → 400', empty.status === 400, empty.data.error);

  // 9) الرد + التعديل + الحذف
  const reply = await req('POST', '/api/messages', {
    token: t2, body: { roomId: general.id, text: 'أهلاً أحمد!', replyTo: msgId }
  });
  check('الرد على رسالة يُرجع replyTo مُعبّأ', reply.status === 201 && !!reply.data.message?.replyTo,
    JSON.stringify(reply.data.message?.replyTo));

  const edit = await req('PATCH', `/api/messages/${msgId}`, { token: t1, body: { text: 'مرحباً (معدّلة)' } });
  check('PATCH /api/messages/:id (صاحبها) → 200 + edited=true',
    edit.status === 200 && edit.data.message?.edited === true);

  const editOther = await req('PATCH', `/api/messages/${msgId}`, { token: t2, body: { text: 'اختراق' } });
  check('تعديل رسالة الغير → 403', editOther.status === 403);

  const delOther = await req('DELETE', `/api/messages/${reply.data.message.id}`, { token: t1 });
  check('عضو عادي يحذف رسالة غيره → 403', delOther.status === 403);

  const delAdmin = await req('DELETE', `/api/messages/${reply.data.message.id}`, { token: adminToken });
  check('الأدمن يحذف رسالة غيره → 200', delAdmin.status === 200, delAdmin.data.error || '');

  // 10) إنشاء غرفة جديدة + قفلها
  const newRoom = await req('POST', '/api/rooms', {
    token: t1, body: { name: 'غرفة التصميم', description: 'نقاشات التصميم', icon: '🎨' }
  });
  check('POST /api/rooms → 201 + slug عربي مُحوَّل',
    newRoom.status === 201 && /^[\u0600-\u06FFa-z0-9-]+$/.test(newRoom.data.room?.slug || ''),
    `slug=${newRoom.data.room?.slug}`);
  const newRoomId = newRoom.data.room?.id;

  const lock = await req('PATCH', `/api/rooms/${newRoomId}`, { token: adminToken, body: { locked: true } });
  check('الأدمن يقفل الغرفة → 200 + locked', lock.status === 200 && lock.data.room?.locked === true);

  const lockedSend = await req('POST', '/api/messages', { token: t2, body: { roomId: newRoomId, text: 'هل أكتب؟' } });
  check('الإرسال في غرفة مقفلة → 403', lockedSend.status === 403, lockedSend.data.error);

  const unlock = await req('PATCH', `/api/rooms/${newRoomId}`, { token: adminToken, body: { locked: false } });
  check('فتح الغرفة يعيد الإرسال', unlock.status === 200 && unlock.data.room?.locked === false);

  const lockByUser = await req('PATCH', `/api/rooms/${newRoomId}`, { token: t2, body: { locked: true } });
  check('غير المالك لا يستطيع قفل الغرفة → 403', lockByUser.status === 403);

  // 11) محادثة خاصة
  const dm = await req('POST', `/api/users/${id2}/dm`, { token: t1 });
  check('POST /api/users/:id/dm → 200 + غرفة خاصة', dm.status === 200 && dm.data.room?.type === 'direct',
    `created=${dm.data.created} peer=${dm.data.peer?.username}`);
  const dmRoom = dm.data.room.id;

  const dm2 = await req('POST', `/api/users/${id2}/dm`, { token: t1 });
  check('فتح الخاص مرتين يعيد نفس الغرفة (لا تكرار)', dm2.data.room.id === dmRoom && dm2.data.created === false);

  const dmSend = await req('POST', '/api/messages', { token: t1, body: { roomId: dmRoom, text: 'خاص: مرحباً سارة' } });
  check('إرسال في الخاص → 201', dmSend.status === 201);

  // طرف ثالث (الأدمن يستطيع، لكن عضواً آخر لا)
  const u3 = await req('POST', '/api/auth/register', {
    body: { username: 'omar', email: 'omar@test.com', password: '123456', displayName: 'عمر' }
  });
  const intrude = await req('POST', '/api/messages', { token: u3.data.token, body: { roomId: dmRoom, text: 'تطفل' } });
  check('عضو غريب يرسل في خاص الآخرين → 403', intrude.status === 403, intrude.data.error);

  // 12) الحضور
  const ping = await req('POST', '/api/users/ping', { token: t1, body: { roomId: general.id } });
  check('POST /api/users/ping → 200', ping.status === 200);
  const online = await req('GET', '/api/users/online', { token: t1 });
  check('GET /api/users/online يُظهر أحمد', (online.data.online || []).some((o) => o.username === 'ahmed'),
    `online=${online.data.online?.length}`);

  const userList = await req('GET', '/api/users', { token: t1 });
  check('GET /api/users يُرجع الأعضاء + onlineCount', userList.status === 200 && userList.data.users.length >= 4,
    `users=${userList.data.users?.length} online=${userList.data.onlineCount}`);

  // 13) تفويض Pusher — بدون مفاتيح يجب أن يرجع 503 (غير مُهيّأ)
  const pCfg = await req('GET', '/api/pusher/config');
  check('GET /api/pusher/config → 200 + enabled=false (بلا مفاتيح)', pCfg.status === 200 && pCfg.data.enabled === false);
  const pAuth = await req('POST', '/api/pusher/auth', { token: t1, body: { socket_id: '1.1', channel_name: 'private-room-x' } });
  check('POST /api/pusher/auth بلا مفاتيح → 503', pAuth.status === 503, pAuth.data.error);

  // 14) مؤشر الكتابة + تعليم كمقروء
  const typing = await req('POST', '/api/messages/typing', { token: t1, body: { roomId: general.id } });
  check('POST /api/messages/typing → 200', typing.status === 200);
  const read = await req('POST', '/api/messages/read', { token: t2, body: { roomId: dmRoom } });
  check('POST /api/messages/read → 200', read.status === 200);

  // 15) لوحة الأدمن
  const stats = await req('GET', '/api/admin/stats', { token: adminToken });
  check('GET /api/admin/stats → 200', stats.status === 200, JSON.stringify(stats.data.users ? { users: stats.data.users, messages: stats.data.messages, rooms: stats.data.rooms } : stats.data));
  check('stats.activity = 7 أيام', (stats.data.activity || []).length === 7);
  check('stats.topUsers يحتوي أحمد', (stats.data.topUsers || []).some((u) => u.username === 'ahmed'));

  const aUsers = await req('GET', '/api/admin/users', { token: adminToken });
  check('GET /api/admin/users → 200 + 4 أعضاء', aUsers.status === 200 && aUsers.data.users.length >= 4,
    `count=${aUsers.data.users?.length}`);

  // ترقية سارة إلى مشرفة
  const promote = await req('PATCH', `/api/admin/users/${id2}`, { token: adminToken, body: { role: 'mod' } });
  check('ترقية عضو إلى مشرف → 200 + role=mod', promote.status === 200 && promote.data.user?.role === 'mod');

  // إيقاف عمر
  const ban = await req('PATCH', `/api/admin/users/${u3.data.user.id}`, { token: adminToken, body: { action: 'ban', reason: 'سبام', days: 1 } });
  check('إيقاف عضو → 200 + status=banned', ban.status === 200 && ban.data.user?.status === 'banned');

  const bannedLogin = await req('POST', '/api/auth/login', { body: { username: 'omar', password: '123456' } });
  check('دخول عضو موقوف → 403', bannedLogin.status === 403, bannedLogin.data.error);

  const unban = await req('PATCH', `/api/admin/users/${u3.data.user.id}`, { token: adminToken, body: { action: 'unban' } });
  check('رفع الإيقاف → 200 + status=active', unban.status === 200 && unban.data.user?.status === 'active');

  // إعادة تعيين كلمة المرور
  const reset = await req('POST', `/api/admin/users/${id1}/reset-password`, { token: adminToken, body: { password: 'newpass123' } });
  check('إعادة تعيين كلمة مرور → 200', reset.status === 200);
  const newLogin = await req('POST', '/api/auth/login', { body: { username: 'ahmed', password: 'newpass123' } });
  check('الدخول بالكلمة الجديدة يعمل', newLogin.status === 200);

  const aRooms = await req('GET', '/api/admin/rooms', { token: adminToken });
  check('GET /api/admin/rooms → 7 غرف (6 + الجديدة)', aRooms.status === 200 && aRooms.data.rooms.filter(r => r.type === 'public').length === 7,
    `public=${aRooms.data.rooms?.filter(r => r.type === 'public').length}`);

  const aMsgs = await req('GET', '/api/admin/messages?q=مرحباً', { token: adminToken });
  check('البحث في الرسائل (q=مرحباً) يجد نتائج', aMsgs.status === 200 && aMsgs.data.messages.length >= 1,
    `found=${aMsgs.data.messages?.length}`);

  // 16) الإعدادات
  const setPut = await req('PUT', '/api/admin/settings', {
    token: adminToken,
    body: { site_title: 'شات العراق', announcement: 'صيانة غداً', announcement_active: true, allow_signup: false }
  });
  check('PUT /api/admin/settings → 200 + القيم محفوظة',
    setPut.status === 200 && setPut.data.settings.site_title === 'شات العراق' && setPut.data.settings.allow_signup === false);

  const b2 = await req('GET', '/api/bootstrap');
  check('bootstrap يعكس الإعدادات الجديدة', b2.data.settings.site_title === 'شات العراق');

  const blocked = await req('POST', '/api/auth/register', {
    body: { username: 'khalid', email: 'k@test.com', password: '123456', displayName: 'خالد' }
  });
  check('التسجيل مغلق بعد allow_signup=false → 403', blocked.status === 403, blocked.data.error);

  await req('PUT', '/api/admin/settings', { token: adminToken, body: { allow_signup: true, site_title: 'شات العرب', announcement_active: false } });

  // 17) تعديل الملف الشخصي
  const prof = await req('PATCH', '/api/auth/me', { token: t2, body: { displayName: 'سارة أحمد', bio: 'مصممة', settings: { theme: 'light', sound: false } } });
  check('PATCH /api/auth/me → 200 + الاسم مُحدَّث',
    prof.status === 200 && prof.data.user.displayName === 'سارة أحمد' && prof.data.user.settings.theme === 'light');

  const chpw = await req('POST', '/api/auth/change-password', { token: t2, body: { currentPassword: '123456', newPassword: 'sara999' } });
  check('تغيير كلمة المرور → 200', chpw.status === 200, chpw.data.error || '');
  const chpwBad = await req('POST', '/api/auth/change-password', { token: t2, body: { currentPassword: 'nope', newPassword: 'sara999' } });
  check('كلمة حالية خاطئة → 401', chpwBad.status === 401);

  // 18) حذف غرفة
  const delRoom = await req('DELETE', `/api/rooms/${newRoomId}`, { token: adminToken });
  check('DELETE /api/rooms/:id (أدمن) → 200', delRoom.status === 200);
  const roomsAfter = await req('GET', '/api/rooms', { token: t1 });
  check('عدد الغرف عاد إلى 6', roomsAfter.data.rooms.length === 6, `count=${roomsAfter.data.rooms.length}`);

  // 19) ملفات ثابتة (الواجهة)
  const html = await req('GET', '/', { raw: true });
  check('GET / → 200 + HTML عربي RTL', html.status === 200 && html.text.includes('dir="rtl"'), `len=${html.text.length}`);
  const css = await req('GET', '/css/style.css', { raw: true });
  check('GET /css/style.css → 200', css.status === 200 && css.text.length > 1000, `len=${css.text.length}`);
  const js = await req('GET', '/js/app.js', { raw: true });
  check('GET /js/app.js → 200', js.status === 200 && js.text.length > 5000, `len=${js.text.length}`);
  const spa = await req('GET', '/some/spa/route', { raw: true });
  check('SPA fallback → index.html', spa.status === 200 && spa.text.includes('شات'));

  // 20) 404 على API مجهول
  const nf = await req('GET', '/api/nope');
  check('GET /api/nope → 404', nf.status === 404);

  // ===== التقرير =====
  console.log('');
  for (const [icon, name, extra] of results) {
    console.log(`${icon} ${name}${extra ? `  —  ${String(extra).slice(0, 110)}` : ''}`);
  }
  console.log(`${'─'.repeat(60)}`);
  console.log(`النتيجة: ${pass} نجح · ${fail} فشل · المجموع ${pass + fail}\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('💥 فشل الاختبار:', e); process.exit(1); });
