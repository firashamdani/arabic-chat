/* ============================================================
   شات العرب — التطبيق الرئيسي
   ============================================================ */
'use strict';

// ---------- أدوات مساعدة ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const store = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} }
};

function toast(msg, type = 'info', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '⛔' : 'ℹ️'}</span><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
}

function beep(kind = 'msg') {
  if (!state.me?.settings?.sound) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = kind === 'msg' ? 880 : 660;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
    o.start(); o.stop(ctx.currentTime + 0.3);
  } catch {}
}

const arTime = (d) =>
  new Date(d).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', hour12: true });
const arDate = (d) => {
  const dt = new Date(d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const y = new Date(today); y.setDate(y.getDate() - 1);
  if (dt >= today) return 'اليوم';
  if (dt >= y) return 'أمس';
  return dt.toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' });
};
const arAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'الآن';
  if (s < 3600) return `قبل ${Math.floor(s / 60)} د`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} س`;
  if (s < 604800) return `قبل ${Math.floor(s / 86400)} يوم`;
  return new Date(d).toLocaleDateString('ar-IQ');
};
const humanSize = (n) => {
  n = Number(n) || 0;
  if (n < 1024) return `${n} بايت`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} ك.ب`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} م.ب`;
  return `${(n / 1073741824).toFixed(2)} ج.ب`;
};
const initial = (name) => (String(name || '؟').trim().charAt(0) || '؟');

// ---------- الحالة ----------
const state = {
  token: store.get('token', null),
  me: store.get('me', null),
  bootstrap: null,
  rooms: [],
  direct: [],
  users: [],
  online: new Set(),
  onlineHere: [],
  currentRoom: null,
  messages: [],
  replyingTo: null,
  editingId: null,
  realtime: null,
  channels: {},
  polling: null,
  pingTimer: null,
  typingTimers: {},
  lastTypingSent: 0,
  search: '',
  theme: store.get('theme', 'dark'),
  pusherOK: false
};

// ---------- واجهة الـ API ----------
async function api(path, { method = 'GET', body, auth: needAuth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (needAuth && state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401 && needAuth) { handleAuthFailure(data.error); }
    const err = new Error(data.error || `خطأ ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function handleAuthFailure(msg) {
  if (!state.token) return;
  state.token = null; state.me = null;
  store.del('token'); store.del('me');
  teardownRealtime();
  toast(msg || 'انتهت الجلسة، سجّل الدخول من جديد', 'error');
  showView('auth');
}

// ---------- التنقل بين الشاشات ----------
function showView(name) {
  $('#view-auth').hidden = name !== 'auth';
  $('#view-app').hidden = name !== 'app';
  $('#view-admin').hidden = name !== 'admin';
  if (name === 'auth') location.hash = '';
  if (name === 'app' && location.hash === '#/admin') location.hash = '';
  if (name === 'admin') location.hash = '#/admin';
}

// ---------- الثيم ----------
function applyTheme(t) {
  const real = t === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : t;
  document.documentElement.dataset.theme = real;
  state.theme = t;
  store.set('theme', t);
  const b = $('#btnTheme');
  if (b) b.textContent = real === 'dark' ? '🌙' : '☀️';
}

// ---------- الإقلاع ----------
async function boot() {
  applyTheme(state.theme);
  try {
    state.bootstrap = await api('/bootstrap', { auth: false });
  } catch (e) {
    $('#bootMsg').textContent = 'تعذّر الاتصال بالخادم: ' + e.message;
    $('#boot').classList.remove('gone');
    return;
  }
  const b = state.bootstrap;

  // نصوص الموقع
  $('#siteTitle').textContent = b.settings.site_title || b.app;
  $('#siteTagline').textContent = b.settings.site_tagline || '';
  $('#brandName').textContent = b.settings.site_title || b.app;
  document.title = b.settings.site_title || b.app;

  if (!b.adminReady) {
    $('#adminHint').innerHTML = `⚠️ لم يُنشأ حساب الأدمن بعد. اسم المستخدم الافتراضي: <b>${esc(b.adminUsername)}</b>`;
  } else {
    $('#adminHint').innerHTML = `👤 للدخول كأدمن استخدم الحساب الذي أُنشئ عند التثبيت.`;
  }

  if (b.settings.maintenance_mode && !state.token) {
    $('#loginErr').textContent = 'الموقع في وضع الصيانة حالياً.';
  }

  if (state.token && state.me) {
    try {
      const { user } = await api('/auth/me');
      state.me = user; store.set('me', user);
      await enterApp();
      finishBoot();
      return;
    } catch (e) {
      console.error('[boot] تعذّر استئناف الجلسة', e);
      // إن كان الخطأ في enterApp (لا في /auth/me) فالجلسة سليمة — نعرض الشات بدلاً من الخروج
      if (state.token && state.me) {
        try { showView('app'); renderMe(); finishBoot(); return; } catch {}
      }
    }
  }
  state.token = null; state.me = null;
  finishBoot();
  showView('auth');
  $('#loginForm [name=username]')?.focus();
}

function finishBoot() {
  const el = $('#boot');
  el.classList.add('gone');
  setTimeout(() => el.remove(), 400);
}

// ---------- تسجيل الدخول / إنشاء حساب ----------
function initAuthForms() {
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
    const isLogin = t.dataset.tab === 'login';
    $('#loginForm').hidden = !isLogin;
    $('#registerForm').hidden = isLogin;
  }));

  $$('.pw-toggle').forEach((btn) => btn.addEventListener('click', () => {
    const inp = btn.previousElementSibling;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? '👁' : '🙈';
  }));

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    $('#loginErr').textContent = '';
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'جارٍ الدخول…';
    try {
      const r = await api('/auth/login', {
        method: 'POST', auth: false,
        body: { username: f.get('username'), password: f.get('password') }
      });
      state.token = r.token; state.me = r.user;
      store.set('token', r.token); store.set('me', r.user);
      await enterApp();
      toast(`أهلاً ${r.user.displayName} 👋`, 'success');
    } catch (err) {
      $('#loginErr').textContent = err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'تسجيل الدخول';
    }
  });

  $('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    $('#regErr').textContent = '';
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'جارٍ الإنشاء…';
    try {
      const r = await api('/auth/register', {
        method: 'POST', auth: false,
        body: {
          username: f.get('username'), email: f.get('email'),
          password: f.get('password'), displayName: f.get('displayName')
        }
      });
      state.token = r.token; state.me = r.user;
      store.set('token', r.token); store.set('me', r.user);
      await enterApp();
      toast(`مرحباً بك ${r.user.displayName} 🎉`, 'success');
    } catch (err) {
      $('#regErr').textContent = err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'إنشاء الحساب';
    }
  });
}

// ---------- دخول التطبيق ----------
async function enterApp() {
  if (location.hash === '#/admin' && state.me?.role === 'admin') {
    showView('admin');
    await initAdmin();
    return;
  }
  showView('app');
  renderMe();
  applyTheme(state.me?.settings?.theme || state.theme);
  showAnnouncement();

  // تحميل الغرف والأعضاء — فشل أحدهما لا يمنع عرض التطبيق
  try { await loadRooms(); } catch (e) { console.error('[enterApp] loadRooms', e); }
  try { await loadUsers(); } catch (e) { console.error('[enterApp] loadUsers', e); }

  try { setupRealtime(); } catch (e) { console.error('[enterApp] realtime', e); }
  try { startPing(); } catch (e) { console.error('[enterApp] ping', e); }

  // افتح آخر غرفة أو الغرفة العامة
  const lastId = store.get('lastRoom');
  const target = state.rooms.find((r) => r.id === lastId) || state.rooms.find((r) => r.slug === 'general') || state.rooms[0];
  if (target) openRoom(target.id);
  else if (state.direct[0]) openRoom(state.direct[0].id);

  if (state.bootstrap?.settings?.welcome_message && !store.get('welcomed')) {
    store.set('welcomed', true);
    setTimeout(() => toast(state.bootstrap.settings.welcome_message.replace('{site}', state.bootstrap.settings.site_title), 'info', 5000), 700);
  }
}

function renderMe() {
  const u = state.me;
  if (!u) return;
  $('#meName').textContent = u.displayName;
  const roleMap = { admin: '🛡️ أدمن', mod: '🔰 مشرف', user: 'عضو' };
  $('#meRole').innerHTML = `<span class="tag ${u.role}">${roleMap[u.role] || 'عضو'}</span>`;
  renderAvatar($('#meAvatar'), u);
  $('#btnProfile').style.display = '';
  // زر لوحة الأدمن يظهر فقط لحساب أدمن
  if (u.role === 'admin' && !$('#btnAdmin')) {
    const b = document.createElement('button');
    b.className = 'icon-btn'; b.id = 'btnAdmin'; b.title = 'لوحة تحكم الأدمن'; b.textContent = '🛡️';
    b.addEventListener('click', () => { showView('admin'); initAdmin(); });
    $('#btnLogout').parentNode.insertBefore(b, $('#btnLogout'));
  } else if (u.role !== 'admin' && $('#btnAdmin')) {
    $('#btnAdmin').remove();
  }
}

function renderAvatar(el, user, presence = null) {
  if (!el) return;
  el.style.background = user.color || '#6366f1';
  el.innerHTML = user.avatar
    ? `<img src="${esc(user.avatar)}" alt="" onerror="this.remove()">`
    : esc(initial(user.displayName));
  if (presence !== null) {
    const d = document.createElement('span');
    d.className = `pres ${presence ? 'on' : ''}`;
    el.appendChild(d);
  }
}

function showAnnouncement() {
  const s = state.bootstrap?.settings;
  const el = $('#announcement');
  if (s?.announcement_active && s?.announcement) {
    $('#announcementText').textContent = s.announcement;
    el.hidden = false;
  } else el.hidden = true;
}

// ---------- الغرف ----------
async function loadRooms() {
  const r = await api('/rooms');
  state.rooms = r.rooms;
  state.direct = r.direct;
  renderRooms();
}

function renderRooms() {
  const q = state.search.trim().toLowerCase();
  const list = $('#roomList');
  list.innerHTML = '';

  const filtered = state.rooms.filter((r) => !q || r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));

  if (!filtered.length) {
    list.innerHTML = `<div class="hint" style="padding:10px">لا توجد غرف مطابقة</div>`;
  }

  for (const r of filtered) {
    const b = document.createElement('button');
    b.className = `nav-item ${state.currentRoom?.id === r.id ? 'active' : ''} ${r.unread ? 'unread' : ''}`;
    b.innerHTML = `
      <span class="ni-icon">${esc(r.icon || '💬')}</span>
      <span class="ni-body">
        <span class="ni-name">${esc(r.name)}${r.locked ? ' 🔒' : ''}</span>
        <span class="ni-sub">${esc(r.lastMessagePreview || r.description || 'لا رسائل بعد')}</span>
      </span>
      ${r.unread ? `<span class="badge">${r.unread > 99 ? '99+' : r.unread}</span>` : ''}`;
    b.addEventListener('click', () => { openRoom(r.id); closeMobileCols(); });
    list.appendChild(b);
  }

  // المحادثات الخاصة
  const dl = $('#dmList');
  dl.innerHTML = '';
  const dms = state.direct.filter((r) => !q || (r.peer?.displayName || '').toLowerCase().includes(q));
  if (!dms.length) dl.innerHTML = `<div class="hint" style="padding:10px">ابدأ محادثة من قائمة الأعضاء 👥</div>`;
  for (const r of dms) {
    const b = document.createElement('button');
    b.className = `nav-item ${state.currentRoom?.id === r.id ? 'active' : ''} ${r.unread ? 'unread' : ''}`;
    const p = r.peer || {};
    b.innerHTML = `
      <span class="ni-icon" style="background:${esc(p.color || '#6366f1')};color:#fff;font-weight:800">${esc(initial(p.displayName))}</span>
      <span class="ni-body">
        <span class="ni-name">${esc(r.name)} ${p.online ? '<span class="dot live"></span>' : ''}</span>
        <span class="ni-sub">${esc(r.lastMessagePreview || 'محادثة خاصة')}</span>
      </span>
      ${r.unread ? `<span class="badge">${r.unread > 99 ? '99+' : r.unread}</span>` : ''}`;
    b.addEventListener('click', () => { openRoom(r.id); closeMobileCols(); });
    dl.appendChild(b);
  }
}

async function openRoom(id) {
  try {
    const data = await api(`/rooms/${id}?limit=50`);
    state.currentRoom = data.room;
    state.messages = data.messages;
    state.onlineHere = data.onlineHere || [];
    state.replyingTo = null;
    state.editingId = null;
    $('#replyPreview').hidden = true;
    store.set('lastRoom', id);

    $('#chatIcon').textContent = data.room.icon || (data.room.type === 'direct' ? '🔒' : '💬');
    $('#chatName').textContent = data.room.name;
    updateChatSub();

    $('#emptyState').hidden = true;
    $('#loadMore').hidden = !data.hasMore;
    renderMessages();
    renderRooms();
    renderOnlineHere();
    subscribeRoom(data.room.id);

    api('/messages/read', { method: 'POST', body: { roomId: id } }).catch(() => {});
    ping(data.room.id);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function updateChatSub() {
  const r = state.currentRoom;
  if (!r) return;
  if (r.type === 'direct') {
    const peer = state.direct.find((d) => d.id === r.id)?.peer;
    $('#chatSub').innerHTML = peer?.online
      ? '<span class="dot live"></span> متصل الآن'
      : `آخر ظهور ${peer ? arAgo(peer.lastSeenAt) : ''}`;
  } else {
    const n = state.onlineHere.length;
    $('#chatSub').innerHTML = `<span class="dot ${n ? 'live' : ''}"></span> ${n} متصل هنا${r.locked ? ' · 🔒 مقفلة' : ''}`;
  }
}

function renderOnlineHere() {
  updateChatSub();
}

// ---------- الأعضاء ----------
async function loadUsers() {
  const r = await api('/users');
  state.users = r.users;
  state.online = new Set(r.users.filter((u) => u.online).map((u) => u.id));
  $('#onlineCount').textContent = r.onlineCount;
  renderUsers();
}

function renderUsers() {
  const q = state.search.trim().toLowerCase();
  const online = $('#onlineList');
  const all = $('#allUsersList');
  online.innerHTML = ''; all.innerHTML = '';

  const matches = (u) => !q || u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);

  const onlineUsers = state.users.filter((u) => state.online.has(u.id) && matches(u));
  const others = state.users.filter((u) => !state.online.has(u.id) && matches(u));

  online.innerHTML = onlineUsers.length ? '' : '<div class="hint" style="padding:8px">لا أحد متصل الآن</div>';
  for (const u of onlineUsers) online.appendChild(userRow(u, true));
  all.innerHTML = others.length ? '' : '<div class="hint" style="padding:8px">—</div>';
  for (const u of others) all.appendChild(userRow(u, false));

  $('#membersCount').textContent = `${state.online.size} متصل · ${state.users.length} عضو`;
}

function userRow(u, isOnline) {
  const wrap = document.createElement('div');
  wrap.className = 'user-item';
  const roleTag = u.role !== 'user' ? `<span class="tag ${u.role}">${u.role === 'admin' ? 'أدمن' : 'مشرف'}</span>` : '';
  wrap.innerHTML = `
    <span class="avatar sm" style="background:${esc(u.color)}">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : esc(initial(u.displayName))}
      <span class="pres ${isOnline ? 'on' : ''}"></span></span>
    <span class="ui-body">
      <span class="ui-name">${esc(u.displayName)} ${roleTag} ${u.isMe ? '<span class="tag">أنت</span>' : ''}</span>
      <span class="ui-sub">@${esc(u.username)} · ${isOnline ? 'متصل' : arAgo(u.lastSeenAt)}</span>
    </span>
    ${u.isMe ? '' : '<button class="ui-dm" title="محادثة خاصة">💬</button>'}`;
  const dmBtn = wrap.querySelector('.ui-dm');
  if (dmBtn) dmBtn.addEventListener('click', () => openDM(u.id));
  wrap.addEventListener('click', (e) => { if (!e.target.closest('.ui-dm')) showUserProfile(u); });
  return wrap;
}

function showUserProfile(u) {
  openModal(
    u.displayName,
    `<div style="text-align:center">
      <div class="avatar lg" style="background:${esc(u.color)};margin:0 auto 12px">${u.avatar ? `<img src="${esc(u.avatar)}">` : esc(initial(u.displayName))}</div>
      <h3 style="margin:0 0 4px">${esc(u.displayName)}</h3>
      <div style="color:var(--text-2);font-size:13px;margin-bottom:10px">@${esc(u.username)}</div>
      ${u.role !== 'user' ? `<span class="tag ${u.role}">${u.role === 'admin' ? '🛡️ أدمن' : '🔰 مشرف'}</span>` : ''}
      <p style="color:var(--text-2);font-size:13.5px;margin:12px 0">${esc(u.bio || 'لا توجد نبذة')}</p>
      <div class="kv" style="text-align:start">
        <div><span>تاريخ الانضمام</span><span>${new Date(u.createdAt).toLocaleDateString('ar-IQ')}</span></div>
        <div><span>عدد الرسائل</span><span>${u.messageCount ?? '—'}</span></div>
        <div><span>آخر ظهور</span><span>${arAgo(u.lastSeenAt)}</span></div>
      </div>
    </div>`,
    u.isMe ? [] : [{ label: '💬 محادثة خاصة', primary: true, onClick: () => { closeModal(); openDM(u.id); } }]
  );
}

async function openDM(userId) {
  try {
    const r = await api(`/users/${userId}/dm`, { method: 'POST' });
    if (r.created) await loadRooms();
    else {
      const idx = state.direct.findIndex((d) => d.id === r.room.id);
      if (idx >= 0) state.direct[idx] = { ...state.direct[idx], ...r.room };
      else state.direct.unshift(r.room);
    }
    await openRoom(r.room.id);
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- الرسائل ----------
function renderMessages() {
  const box = $('#msgList');
  box.innerHTML = '';
  let lastUser = null, lastDay = null, lastTime = 0;

  for (const m of state.messages) {
    const day = new Date(m.createdAt); day.setHours(0, 0, 0, 0);
    const dayKey = day.toISOString();
    if (dayKey !== lastDay) {
      lastDay = dayKey; lastUser = null;
      const sep = document.createElement('div');
      sep.className = 'day-sep';
      sep.textContent = arDate(m.createdAt);
      box.appendChild(sep);
    }
    const t = new Date(m.createdAt).getTime();
    const grouped = !m.system && lastUser === m.user?.id && (t - lastTime) < 5 * 60 * 1000;
    lastUser = m.user?.id; lastTime = t;
    box.appendChild(messageEl(m, grouped));
  }
  scrollBottom(true);
}

function messageEl(m, grouped = false) {
  const row = document.createElement('div');
  const mine = m.user?.id === state.me?.id;
  row.className = `msg-row ${m.system ? 'system' : ''} ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`;
  row.dataset.id = m.id;

  const u = m.user || { displayName: 'النظام', color: '#6b7280' };

  let mediaHtml = '';
  if (m.media?.url) {
    if (m.media.kind === 'image') mediaHtml = `<div class="msg-media"><img src="${esc(m.media.url)}" alt="${esc(m.media.name)}" loading="lazy"></div>`;
    else if (m.media.kind === 'video') mediaHtml = `<div class="msg-media"><video src="${esc(m.media.url)}" controls preload="metadata"></video></div>`;
    else if (m.media.kind === 'audio') mediaHtml = `<div class="msg-media"><audio src="${esc(m.media.url)}" controls preload="metadata"></audio></div>`;
    else mediaHtml = `<a class="file-chip" href="${esc(m.media.url)}" target="_blank" rel="noopener"><span class="fc-icon">📎</span><span><span class="fc-name">${esc(m.media.name || 'ملف')}</span><br><span class="fc-size">${humanSize(m.media.size)}</span></span></a>`;
  }

  const quote = m.replyTo
    ? `<div class="msg-quote"><b>${esc(m.replyTo.user || '')}</b><br>${esc(m.replyTo.text || 'رسالة محذوفة')}</div>`
    : '';

  const canDelete = mine || ['admin', 'mod'].includes(state.me?.role);

  row.innerHTML = `
    <div class="msg-avatar">${m.system || grouped ? '' : `<span class="avatar sm" style="background:${esc(u.color)}">${u.avatar ? `<img src="${esc(u.avatar)}">` : esc(initial(u.displayName))}</span>`}</div>
    <div class="bubble">
      ${m.system ? '' : `<div class="msg-head"><span class="msg-name">${esc(u.displayName)}</span><span class="msg-time">${arTime(m.createdAt)}</span></div>`}
      ${quote}
      ${m.deleted
        ? '<div class="msg-deleted">🗑 حُذفت هذه الرسالة</div>'
        : `${m.text ? `<div class="msg-text">${linkify(esc(m.text))}${m.edited ? '<span class="msg-edited">(معدّلة)</span>' : ''}</div>` : ''}${mediaHtml}`}
      ${m.system || m.deleted ? '' : `<div class="msg-actions">
        <button data-a="reply" title="رد">↩️</button>
        ${mine ? '<button data-a="edit" title="تعديل">✏️</button>' : ''}
        ${canDelete ? '<button data-a="delete" title="حذف">🗑</button>' : ''}
      </div>`}
    </div>`;

  // ربط الأزرار
  row.querySelector('[data-a="reply"]')?.addEventListener('click', () => setReply(m));
  row.querySelector('[data-a="edit"]')?.addEventListener('click', () => startEdit(m));
  row.querySelector('[data-a="delete"]')?.addEventListener('click', () => deleteMessage(m));
  row.querySelector('img')?.addEventListener('click', (e) => lightbox(e.target.src));
  row.querySelector('.bubble')?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showCtx(e.clientX, e.clientY, m, { canEdit: mine, canDelete });
  });
  return row;
}

function linkify(escapedText) {
  return escapedText
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/@([a-zA-Z0-9_.-]{3,24})/g, '<span class="mention">@$1</span>');
}

function lightbox(src) {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = `<img src="${esc(src)}" alt="">`;
  el.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
}

function scrollBottom(force = false) {
  const box = $('#messages');
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 220;
  if (force || nearBottom) box.scrollTop = box.scrollHeight;
}

function appendMessage(m) {
  if (state.messages.some((x) => x.id === m.id)) {
    replaceMessage(m);
    return;
  }
  const last = state.messages[state.messages.length - 1];
  const sameDay = last && new Date(last.createdAt).toDateString() === new Date(m.createdAt).toDateString();
  if (!sameDay) {
    const sep = document.createElement('div');
    sep.className = 'day-sep';
    sep.textContent = arDate(m.createdAt);
    $('#msgList').appendChild(sep);
  }
  const grouped = last && !m.system && last.user?.id === m.user?.id &&
    (new Date(m.createdAt) - new Date(last.createdAt)) < 5 * 60 * 1000;
  state.messages.push(m);
  $('#msgList').appendChild(messageEl(m, grouped));
  scrollBottom();
}

function replaceMessage(m) {
  const idx = state.messages.findIndex((x) => x.id === m.id);
  if (idx >= 0) state.messages[idx] = m;
  const old = $(`#msgList .msg-row[data-id="${m.id}"]`);
  if (old) old.replaceWith(messageEl(m, old.classList.contains('grouped')));
}

function removeMessage(id) {
  const i = state.messages.findIndex((x) => x.id === id);
  if (i >= 0) state.messages[i] = { ...state.messages[i], deleted: true, text: '', media: null };
  const old = $(`#msgList .msg-row[data-id="${id}"]`);
  if (old) old.replaceWith(messageEl(state.messages[i], old.classList.contains('grouped')));
}

// ---------- الإرسال ----------
function setReply(m) {
  state.replyingTo = m;
  $('#replyTo').textContent = m.user?.displayName || '';
  $('#replyText').textContent = m.text || (m.media ? '📎 مرفق' : '');
  $('#replyPreview').hidden = false;
  $('#msgInput').focus();
}

async function startEdit(m) {
  state.editingId = m.id;
  const inp = $('#msgInput');
  inp.value = m.text;
  inp.dataset.editing = m.id;
  inp.placeholder = 'تعديل الرسالة… (Enter للحفظ، Esc للإلغاء)';
  inp.focus();
  autoGrow(inp);
}

function cancelEdit() {
  state.editingId = null;
  const inp = $('#msgInput');
  inp.value = '';
  inp.dataset.editing = '';
  inp.placeholder = 'اكتب رسالتك… (Enter للإرسال، Shift+Enter لسطر جديد)';
  autoGrow(inp);
}

async function deleteMessage(m) {
  if (!confirm('حذف هذه الرسالة؟')) return;
  try {
    await api(`/messages/${m.id}`, { method: 'DELETE' });
    removeMessage(m.id);
    toast('حُذفت الرسالة', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

function initComposer() {
  const inp = $('#msgInput');

  const send = async () => {
    const text = inp.value.trim();
    const editing = inp.dataset.editing;
    if (!text) return;
    if (!state.currentRoom) return toast('اختر غرفة أولاً', 'error');

    if (editing) {
      try {
        const { message } = await api(`/messages/${editing}`, { method: 'PATCH', body: { text } });
        replaceMessage(message);
        cancelEdit();
        toast('تم التعديل', 'success');
      } catch (e) { toast(e.message, 'error'); }
      return;
    }

    const payload = { roomId: state.currentRoom.id, text };
    if (state.replyingTo) { payload.replyTo = state.replyingTo.id; state.replyingTo = null; $('#replyPreview').hidden = true; }
    if (pendingMedia) { payload.media = pendingMedia; pendingMedia = null; }

    inp.value = ''; autoGrow(inp);
    try {
      const { message } = await api('/messages', { method: 'POST', body: payload });
      if (!state.messages.some((m) => m.id === message.id)) appendMessage(message);
      updateRoomPreview(message);
    } catch (e) {
      inp.value = text;
      toast(e.message, 'error');
    }
  };

  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); send(); });

  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && inp.dataset.editing) { cancelEdit(); return; }
    const enterSend = state.me?.settings?.enterSend !== false;
    if (e.key === 'Enter' && !e.shiftKey && enterSend) { e.preventDefault(); send(); }
    if (e.key === 'Enter' && e.shiftKey && !enterSend) { e.preventDefault(); send(); }
  });

  inp.addEventListener('input', () => { autoGrow(inp); sendTyping(); });

  // لصق صورة مباشرة
  inp.addEventListener('paste', (e) => {
    const items = [...(e.clipboardData?.items || [])];
    const img = items.find((i) => i.type.startsWith('image/'));
    if (img) { e.preventDefault(); uploadFile(img.getAsFile()); }
  });

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }
}

function updateRoomPreview(m) {
  const r = state.rooms.find((x) => x.id === m.roomId) || state.direct.find((x) => x.id === m.roomId);
  if (!r) return;
  r.lastMessagePreview = m.text || (m.media ? '📎 مرفق' : '');
  r.lastMessageAt = m.createdAt;
  renderRooms();
}

async function sendTyping() {
  if (!state.currentRoom || Date.now() - state.lastTypingSent < 2500) return;
  state.lastTypingSent = Date.now();
  try { await api('/messages/typing', { method: 'POST', body: { roomId: state.currentRoom.id } }); } catch {}
}

// ---------- رفع الملفات ----------
let pendingMedia = null;

function initUpload() {
  $('#btnAttach').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) uploadFile(f);
    e.target.value = '';
  });
}

async function uploadFile(file) {
  const up = state.bootstrap?.upload;
  if (!up?.cloudName || !up?.uploadPreset) {
    return toast('رفع الملفات غير مُفعّل — أضف إعدادات Cloudinary في Vercel', 'error', 5000);
  }
  if (file.size > 10 * 1024 * 1024) return toast('الحد الأقصى 10 ميجابايت', 'error');

  $('#uploading').hidden = false;
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', up.uploadPreset);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${up.cloudName}/auto/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'فشل الرفع');

    const kind = file.type.startsWith('image/') ? 'image'
      : file.type.startsWith('video/') ? 'video'
      : file.type.startsWith('audio/') ? 'audio' : 'file';

    pendingMedia = { kind, url: data.secure_url, name: file.name, size: file.size };

    // إرسال فوري إذا كانت الغرفة مفتوحة
    if (state.currentRoom) {
      const { message } = await api('/messages', {
        method: 'POST',
        body: { roomId: state.currentRoom.id, text: '', media: pendingMedia }
      });
      pendingMedia = null;
      appendMessage(message);
      updateRoomPreview(message);
    } else {
      toast('تم تجهيز الملف — اضغط إرسال', 'success');
    }
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    $('#uploading').hidden = true;
  }
}

// ---------- Realtime ----------
function setupRealtime() {
  const cfg = state.bootstrap?.realtime;
  if (!cfg?.enabled || typeof window.Pusher === 'undefined') {
    startPolling();
    if (typeof window.Pusher === 'undefined' && cfg?.enabled) {
      console.warn('[realtime] مكتبة Pusher لم تُحمّل — تم تفعيل التحديث التلقائي كبديل');
    }
    return;
  }
  try {
    const pusher = new Pusher(cfg.key, {
      cluster: cfg.cluster,
      authEndpoint: cfg.authEndpoint,
      auth: { headers: { Authorization: `Bearer ${state.token}` } }
    });
    state.realtime = pusher;
    state.pusherOK = true;

    pusher.connection.bind('state_change', ({ current }) => {
      const sub = $('#chatSub');
      if (current !== 'connected' && current !== 'initialized') {
        sub.innerHTML = `<span class="dot"></span> جارٍ إعادة الاتصال…`;
      } else if (state.currentRoom) updateChatSub();
    });
    pusher.connection.bind('unavailable', startPolling);
    pusher.connection.bind('failed', startPolling);

    // قناة المستخدم: إشعارات خاصة
    const userCh = pusher.subscribe(`private-user-${state.me.id}`);
    userCh.bind('pusher:subscription_succeeded', () => {});
    userCh.bind('dm:new', ({ room, message }) => {
      const idx = state.direct.findIndex((d) => d.id === room.id);
      if (idx >= 0) { state.direct[idx] = { ...state.direct[idx], ...room }; state.direct[idx].peer = state.direct[idx].peer; }
      else state.direct.unshift(room);
      if (state.currentRoom?.id === room.id) {
        appendMessage(message);
        api('/messages/read', { method: 'POST', body: { roomId: room.id } }).catch(() => {});
      } else {
        room.unread = (room.unread || 0) + 1;
        notifyDesktop(`${message.user?.displayName || 'رسالة جديدة'}`, message.text || '📎 مرفق');
        beep('dm');
      }
      renderRooms();
    });
    userCh.bind('mention', ({ roomName, message }) => {
      toast(`📣 ${message.user?.displayName} ذكرك في ${roomName}`, 'info');
      notifyDesktop('تم ذكرك في ' + roomName, message.text);
      beep();
    });
    userCh.bind('account:updated', ({ status, reason }) => {
      if (status === 'banned') {
        alert(`تم إيقاف حسابك.\nالسبب: ${reason || 'غير محدد'}`);
        handleAuthFailure('تم إيقاف حسابك');
      }
    });

    // القناة العامة: تحديثات الغرف والإعدادات
    const globalCh = pusher.subscribe('presence-global');
    globalCh.bind('pusher:subscription_error', () => {
      const pub = pusher.subscribe('public-global');
      bindGlobal(pub);
    });
    bindGlobal(globalCh);

    // قناة الأدمن
    if (state.me.role === 'admin' || state.me.role === 'mod') {
      const adminCh = pusher.subscribe('presence-admin');
      adminCh.bind('pusher:subscription_error', () => {});
      adminCh.bind('admin:user-updated', () => { if (!$('#view-admin').hidden) loadAdminUsers(); });
      adminCh.bind('admin:user-deleted', () => { if (!$('#view-admin').hidden) loadAdminUsers(); });
      adminCh.bind('stats:new-message', () => { if (!$('#view-admin').hidden) loadAdminStats(); });
      adminCh.bind('room:created', () => { if (!$('#view-admin').hidden) loadAdminRooms(); });
      adminCh.bind('room:deleted', () => { if (!$('#view-admin').hidden) loadAdminRooms(); });
    }
  } catch (e) {
    console.error(e);
    startPolling();
  }
}

function bindGlobal(ch) {
  ch.bind('room:created', (room) => {
    if (!state.rooms.some((r) => r.id === room.id)) { state.rooms.push(room); renderRooms(); }
    toast(`🚪 غرفة جديدة: ${room.name}`, 'info');
  });
  ch.bind('room:updated', (room) => {
    const i = state.rooms.findIndex((r) => r.id === room.id);
    if (i >= 0) { state.rooms[i] = { ...state.rooms[i], ...room }; renderRooms(); }
    if (state.currentRoom?.id === room.id) { state.currentRoom = { ...state.currentRoom, ...room }; updateChatSub(); }
  });
  ch.bind('room:deleted', ({ id, name }) => {
    state.rooms = state.rooms.filter((r) => r.id !== id);
    renderRooms();
    toast(`حُذفت الغرفة: ${name}`, 'info');
    if (state.currentRoom?.id === id) { state.currentRoom = null; $('#msgList').innerHTML = ''; }
  });
  ch.bind('settings:updated', (s) => {
    state.bootstrap.settings = s;
    document.title = s.site_title || 'شات العرب';
    $('#brandName').textContent = s.site_title || 'شات العرب';
    $('#siteTitle').textContent = s.site_title || 'شات العرب';
    showAnnouncement();
  });
}

function subscribeRoom(roomId) {
  if (!state.pusherOK) return;
  try {
    // إلغاء الاشتراك في الغرف السابقة
    for (const name of Object.keys(state.channels)) {
      if (name.startsWith('private-room-') && name !== `private-room-${roomId}`) {
        state.realtime.unsubscribe(name);
        delete state.channels[name];
      }
    }
    const name = `private-room-${roomId}`;
    if (state.channels[name]) return;
    const ch = state.realtime.subscribe(name);
    state.channels[name] = ch;

    ch.bind('pusher:subscription_error', () => { startPolling(); });
    ch.bind('pusher:subscription_succeeded', stopPolling);

    ch.bind('message:new', (m) => {
      if (state.currentRoom?.id !== m.roomId) {
        const r = state.rooms.find((x) => x.id === m.roomId) || state.direct.find((x) => x.id === m.roomId);
        if (r) { r.unread = (r.unread || 0) + 1; r.lastMessagePreview = m.text || '📎 مرفق'; r.lastMessageAt = m.createdAt; renderRooms(); }
        if (!document.hasFocus()) notifyDesktop(m.user?.displayName, m.text || '📎 مرفق');
        beep();
        return;
      }
      appendMessage(m);
      if (m.user?.id !== state.me.id) beep();
      updateRoomPreview(m);
      api('/messages/read', { method: 'POST', body: { roomId: m.roomId } }).catch(() => {});
    });

    ch.bind('message:edited', (m) => {
      if (state.currentRoom?.id === m.roomId) replaceMessage(m);
    });

    ch.bind('message:deleted', ({ id }) => {
      if (state.messages.some((x) => x.id === id)) removeMessage(id);
    });

    ch.bind('typing', ({ user }) => {
      if (user.id === state.me.id) return;
      showTyping(user.displayName);
    });
  } catch (e) { console.error(e); }
}

function showTyping(name) {
  const bar = $('#typingBar');
  $('#typingText').textContent = `${name} يكتب الآن…`;
  bar.hidden = false;
  clearTimeout(state.typingTimers[name]);
  state.typingTimers[name] = setTimeout(() => { bar.hidden = true; }, 3000);
}

function startPolling() {
  if (state.polling) return;
  state.polling = setInterval(async () => {
    if (!state.currentRoom) return;
    try {
      const last = state.messages[state.messages.length - 1];
      const r = await api(`/messages?roomId=${state.currentRoom.id}&limit=25`);
      let added = 0;
      for (const m of r.messages) {
        if (!state.messages.some((x) => x.id === m.id)) { appendMessage(m); added++; }
      }
      if (added) beep();
    } catch {}
  }, 5000);
}
function stopPolling() { if (state.polling) { clearInterval(state.polling); state.polling = null; } }

function teardownRealtime() {
  stopPolling();
  clearInterval(state.pingTimer);
  if (state.realtime) { try { state.realtime.disconnect(); } catch {} }
  state.realtime = null; state.channels = {}; state.pusherOK = false;
}

// ---------- الحضور ----------
function startPing() {
  ping();
  state.pingTimer = setInterval(() => ping(state.currentRoom?.id), 60000);
  window.addEventListener('beforeunload', () => {
    navigator.sendBeacon?.('/api/users/ping?logout=1', new Blob([JSON.stringify({})], { type: 'application/json' }));
  });
}
async function ping(roomId) {
  try { await api('/users/ping', { method: 'POST', body: { roomId: roomId || '' } }); } catch {}
}

// ---------- إشعارات سطح المكتب ----------
function initNotifications() {
  try {
    if (typeof window.Notification === 'undefined' || !window.Notification) return;
    if (window.Notification.permission === 'default' && window.Notification.requestPermission) {
      setTimeout(() => {
        try { Promise.resolve(window.Notification.requestPermission()).catch(() => {}); } catch {}
      }, 4000);
    }
  } catch { /* الإشعارات غير حرجة — لا تُعطّل التطبيق */ }
}
function notifyDesktop(title, body) {
  try {
    if (typeof window.Notification === 'undefined' || !window.Notification) return;
    if (window.Notification.permission !== 'granted') return;
    if (document.hasFocus()) return;
    new window.Notification(title, { body: String(body || '').slice(0, 120) });
  } catch { /* غير حرج */ }
}

// ---------- نافذة عامة ----------
function openModal(title, bodyHtml, actions = []) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  const f = $('#modalFooter');
  f.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = `btn ${a.primary ? 'primary' : a.danger ? 'danger' : 'ghost'}`;
    b.textContent = a.label;
    b.addEventListener('click', a.onClick);
    f.appendChild(b);
  }
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }

// ---------- قائمة السياق ----------
function showCtx(x, y, m, perms) {
  const el = $('#ctx');
  el.hidden = false;
  el.querySelector('[data-act="edit"]').style.display = perms.canEdit ? '' : 'none';
  el.querySelector('[data-act="delete"]').style.display = perms.canDelete ? '' : 'none';
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = Math.min(x, innerWidth - w - 10) + 'px';
  el.style.top = Math.min(y, innerHeight - h - 10) + 'px';
  el.onclick = (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    el.hidden = true;
    if (act === 'reply') setReply(m);
    if (act === 'edit') startEdit(m);
    if (act === 'delete') deleteMessage(m);
    if (act === 'copy') { navigator.clipboard?.writeText(m.text); toast('نُسخت الرسالة', 'success'); }
  };
}

// ---------- الإيموجي ----------
const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😜','🤩','🥳','😎','🤔','🙄','😴','😢','😭','😡','🤯','🥺','😇','🤗','🤝','👍','👎','👏','🙏','💪','👌','✌️','🤲','❤️','🧡','💛','💚','💙','💜','🖤','💯','🔥','✨','🌟','⭐','🎉','🎊','🎁','🏆','⚽','🏀','🎮','📚','💻','📱','☕','🍕','🌹','🌸','🍀','☀️','🌙','⛅','🌧️','❄️','🚗','✈️','🏠','💼','💡','🔔','✅','❌','⚠️','🔒'];

function initEmoji() {
  const pop = $('#emojiPop');
  pop.innerHTML = EMOJIS.map((e) => `<button type="button">${e}</button>`).join('');
  pop.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    const inp = $('#msgInput');
    inp.value += e.target.textContent;
    inp.focus();
    pop.hidden = true;
  });
  $('#btnEmoji').addEventListener('click', (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    pop.hidden = !pop.hidden;
    pop.style.left = Math.min(r.left, innerWidth - 320) + 'px';
    pop.style.top = (r.top - 270) + 'px';
  });
}

// ---------- أزرار عامة ----------
function initGlobalUI() {
  $('#btnLogout').addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    teardownRealtime();
    state.token = null; state.me = null;
    store.del('token'); store.del('me');
    showView('auth');
    toast('تم تسجيل الخروج', 'info');
  });

  $('#btnTheme').addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    api('/auth/me', { method: 'PATCH', body: { settings: { theme: state.theme } } }).catch(() => {});
  });

  $('#btnProfile').addEventListener('click', showProfileModal);
  $('#btnNewRoom').addEventListener('click', newRoomModal);
  $('#btnNewRoom2').addEventListener('click', newRoomModal);
  $('#btnRoomInfo').addEventListener('click', roomInfoModal);
  $('#replyCancel').addEventListener('click', () => { state.replyingTo = null; $('#replyPreview').hidden = true; });
  $('#annClose').addEventListener('click', () => { $('#announcement').hidden = true; });
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  $('#roomSearch').addEventListener('input', (e) => { state.search = e.target.value; renderRooms(); renderUsers(); });
  $('#loadMore').addEventListener('click', loadOlder);
  $('#btnToggleMembers').addEventListener('click', () => $('#membersCol').classList.toggle('open'));
  $('#openRoomsCol').addEventListener('click', () => $('#roomsCol').classList.add('open'));
  $('#openUserCol').addEventListener('click', () => $('#membersCol').classList.add('open'));
  $('#closeUserCol').addEventListener('click', closeMobileCols);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#ctx')) $('#ctx').hidden = true;
    if (!e.target.closest('#emojiPop') && !e.target.closest('#btnEmoji')) $('#emojiPop').hidden = true;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); $('#ctx').hidden = true; $('#emojiPop').hidden = true; } });

  $('#btnBackToChat')?.addEventListener('click', () => { showView('app'); });
}

function closeMobileCols() { $('#roomsCol').classList.remove('open'); $('#membersCol').classList.remove('open'); }

async function loadOlder() {
  const first = state.messages[0];
  if (!first || !state.currentRoom) return;
  try {
    const r = await api(`/messages?roomId=${state.currentRoom.id}&limit=50&before=${encodeURIComponent(first.createdAt)}`);
    const box = $('#msgList');
    const h = box.parentElement.scrollHeight;
    for (const m of r.messages) if (!state.messages.some((x) => x.id === m.id)) state.messages.unshift(m);
    renderMessages();
    box.parentElement.scrollTop = box.parentElement.scrollHeight - h;
    $('#loadMore').hidden = !r.hasMore;
  } catch (e) { toast(e.message, 'error'); }
}

function newRoomModal() {
  openModal('غرفة جديدة', `
    <label class="field"><span>اسم الغرفة</span><input id="nrName" class="input" maxlength="40" placeholder="مثال: غرفة التصميم"></label>
    <label class="field"><span>الوصف</span><input id="nrDesc" class="input" maxlength="200" placeholder="وصف قصير"></label>
    <label class="field"><span>الأيقونة</span><input id="nrIcon" class="input" maxlength="4" value="💬"></label>
    <div class="err" id="nrErr"></div>`, [
    { label: 'إنشاء', primary: true, onClick: async () => {
        try {
          const r = await api('/rooms', { method: 'POST', body: {
            name: $('#nrName').value, description: $('#nrDesc').value, icon: $('#nrIcon').value
          }});
          closeModal();
          await loadRooms();
          openRoom(r.room.id);
          toast('تم إنشاء الغرفة 🎉', 'success');
        } catch (e) { $('#nrErr').textContent = e.message; }
      } }
  ]);
  setTimeout(() => $('#nrName').focus(), 50);
}

function roomInfoModal() {
  const r = state.currentRoom;
  if (!r) return;
  openModal('معلومات الغرفة', `
    <div style="text-align:center">
      <div style="font-size:40px">${esc(r.icon || '💬')}</div>
      <h3 style="margin:8px 0 4px">${esc(r.name)}</h3>
      <p style="color:var(--text-2);font-size:13px;margin:0 0 12px">${esc(r.description || 'بدون وصف')}</p>
      <div class="kv" style="text-align:start">
        <div><span>النوع</span><span>${r.type === 'direct' ? 'محادثة خاصة' : 'غرفة عامة'}</span></div>
        <div><span>عدد الرسائل</span><span>${state.messages.length}+ (معروض)</span></div>
        <div><span>الحالة</span><span>${r.locked ? '🔒 مقفلة' : '🟢 مفتوحة'}</span></div>
        <div><span>أُنشئت</span><span>${new Date(r.createdAt).toLocaleDateString('ar-IQ')}</span></div>
      </div>
    </div>`);
}

async function showProfileModal() {
  const u = state.me;
  openModal('الملف الشخصي', `
    <div style="text-align:center;margin-bottom:14px">
      <div class="avatar lg" style="background:${esc(u.color)};margin:0 auto 10px">${u.avatar ? `<img src="${esc(u.avatar)}">` : esc(initial(u.displayName))}</div>
    </div>
    <label class="field"><span>الاسم الظاهر</span><input id="pfName" class="input" value="${esc(u.displayName)}" maxlength="40"></label>
    <label class="field"><span>النبذة</span><input id="pfBio" class="input" value="${esc(u.bio || '')}" maxlength="200"></label>
    <label class="field"><span>رابط صورة (اختياري)</span><input id="pfAvatar" class="input" value="${esc(u.avatar || '')}" placeholder="https://…"></label>
    <label class="field"><span>اللون</span><input id="pfColor" type="color" class="input" value="${esc(u.color)}" style="height:42px;padding:4px"></label>
    <hr style="border:none;border-top:1px solid var(--border);margin:14px 0">
    <label class="check"><input type="checkbox" id="pfSound" ${u.settings?.sound !== false ? 'checked' : ''}><span>تشغيل صوت الرسائل</span></label>
    <label class="check"><input type="checkbox" id="pfEnter" ${u.settings?.enterSend !== false ? 'checked' : ''}><span>Enter للإرسال (Shift+Enter لسطر جديد)</span></label>
    <div class="err" id="pfErr"></div>`, [
    { label: 'حفظ', primary: true, onClick: async () => {
        try {
          const { user } = await api('/auth/me', { method: 'PATCH', body: {
            displayName: $('#pfName').value, bio: $('#pfBio').value, avatar: $('#pfAvatar').value, color: $('#pfColor').value,
            settings: { sound: $('#pfSound').checked, enterSend: $('#pfEnter').checked }
          }});
          state.me = user; store.set('me', user);
          renderMe(); closeModal(); toast('تم الحفظ ✅', 'success');
        } catch (e) { $('#pfErr').textContent = e.message; }
      } }
  ]);
}

// ============================================================
//  لوحة الأدمن
// ============================================================
let adminLoaded = false;
async function initAdmin() {
  if (state.me?.role !== 'admin') { showView('app'); return toast('لوحة الأدمن للمشرفين فقط', 'error'); }
  $('#adminSub').textContent = state.me.displayName || '';
  try {
    if (!adminLoaded) {
      adminLoaded = true;
      $$('.atab').forEach((t) => t.addEventListener('click', () => {
        $$('.atab').forEach((x) => x.classList.toggle('active', x === t));
        $$('.admin-body .panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === t.dataset.panel));
        refreshPanel(t.dataset.panel).catch((e) => console.error('[admin]', e));
      }));
      $('#adminUserSearch').addEventListener('input', debounce(() => loadAdminUsers(), 350));
      $('#adminMsgSearch').addEventListener('input', debounce(() => loadAdminMessages(), 350));
      $('#adminNewRoom').addEventListener('click', newRoomModal);
      $('#settingsForm').addEventListener('submit', saveSettings);
      $('#btnBackToChat').addEventListener('click', () => showView('app'));
    }
    await refreshPanel('stats');
  } catch (e) {
    console.error('[initAdmin] فشل', e);
    toast('تعذّر تحميل لوحة الأدمن: ' + e.message, 'error', 6000);
  }
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function refreshPanel(name) {
  if (name === 'stats') return loadAdminStats();
  if (name === 'users') return loadAdminUsers();
  if (name === 'rooms') return loadAdminRooms();
  if (name === 'messages') return loadAdminMessages();
  if (name === 'settings') return loadAdminSettings();
}

async function loadAdminStats() {
  try {
    const s = await api('/admin/stats');
    $('#statCards').innerHTML = [
      ['👥', 'الأعضاء', s.users], ['🚪', 'الغرف', s.rooms], ['💬', 'الرسائل', s.messages],
      ['📈', 'رسائل اليوم', s.messagesToday], ['🟢', 'متصل الآن', s.online], ['⛔', 'موقوفون', s.banned]
    ].map(([i, l, v]) => `<div class="stat-card"><span class="sc-icon">${i}</span><div class="sc-label">${l}</div><div class="sc-value">${v}</div></div>`).join('');

    const max = Math.max(...s.activity.map((a) => a.count), 1);
    $('#chartActivity').innerHTML = s.activity.map((a) => `
      <div class="bar" title="${a.date}: ${a.count}">
        <b>${a.count}</b>
        <i style="height:${Math.max((a.count / max) * 100, 2)}%"></i>
        <span>${a.date.slice(5)}</span>
      </div>`).join('');

    const rm = Math.max(...s.topRooms.map((r) => r.count), 1);
    $('#chartRooms').innerHTML = s.topRooms.length ? s.topRooms.map((r) => `
      <div class="bar-row"><span class="br-name">${esc(r.icon || '')} ${esc(r.name)}</span>
      <span class="br-track"><i class="br-fill" style="width:${(r.count / rm) * 100}%"></i></span>
      <span class="br-val">${r.count}</span></div>`).join('') : '<div class="hint">لا بيانات بعد</div>';

    const um = Math.max(...s.topUsers.map((u) => u.count), 1);
    $('#chartUsers').innerHTML = s.topUsers.length ? s.topUsers.map((u) => `
      <div class="bar-row"><span class="br-name">${esc(u.name)}</span>
      <span class="br-track"><i class="br-fill" style="width:${(u.count / um) * 100}%;background:${esc(u.color || '#6366f1')}"></i></span>
      <span class="br-val">${u.count}</span></div>`).join('') : '<div class="hint">لا بيانات بعد</div>';

    $('#systemInfo').innerHTML = `
      <div><span>البث المباشر (Pusher)</span><span>${s.realtime ? '✅ مفعّل' : '⚠️ غير مفعّل'}</span></div>
      <div><span>أدمن</span><span>${s.byRole.admin || 0}</span></div>
      <div><span>مشرفون</span><span>${s.byRole.mod || 0}</span></div>
      <div><span>أعضاء</span><span>${s.byRole.user || 0}</span></div>
      <div><span>متوسط الرسائل/عضو</span><span>${s.users ? Math.round(s.messages / s.users) : 0}</span></div>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function loadAdminUsers() {
  try {
    const q = $('#adminUserSearch')?.value || '';
    const { users } = await api(`/admin/users?q=${encodeURIComponent(q)}`);
    $('#adminUsersBody').innerHTML = users.map((u) => `
      <tr>
        <td><div class="u-cell"><span class="avatar sm" style="background:${esc(u.color)}">${esc(initial(u.displayName))}</span>
          <span>${esc(u.displayName)} ${u.online ? '<span class="dot live"></span>' : ''}</span></div></td>
        <td>@${esc(u.username)}</td>
        <td style="color:var(--text-2)">${esc(u.email)}</td>
        <td><select data-role="${u.id}">
          ${['user','mod','admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r === 'admin' ? 'أدمن' : r === 'mod' ? 'مشرف' : 'عضو'}</option>`).join('')}
        </select></td>
        <td>${u.status === 'banned' ? `<span class="tag banned">موقوف</span>` : '<span class="tag ok">نشط</span>'}</td>
        <td style="color:var(--text-3);font-size:12px">${arAgo(u.lastSeenAt)}</td>
        <td><div class="acts">
          ${u.status === 'banned'
            ? `<button class="ok" data-act="unban" data-id="${u.id}">رفع الإيقاف</button>`
            : `<button class="danger" data-act="ban" data-id="${u.id}">إيقاف</button>`}
          <button data-act="pw" data-id="${u.id}">كلمة مرور</button>
          <button class="danger" data-act="del" data-id="${u.id}" data-name="${esc(u.username)}">حذف</button>
        </div></td>
      </tr>`).join('');

    // ربط الأحداث
    $$('#adminUsersBody select').forEach((sel) => sel.addEventListener('change', async () => {
      try { await api(`/admin/users/${sel.dataset.role}`, { method: 'PATCH', body: { role: sel.value } }); toast('تم تحديث الصلاحية', 'success'); }
      catch (e) { toast(e.message, 'error'); }
    }));
    $$('#adminUsersBody [data-act]').forEach((b) => b.addEventListener('click', () => adminUserAction(b.dataset.act, b.dataset.id, b.dataset.name)));
  } catch (e) { toast(e.message, 'error'); }
}

async function adminUserAction(act, id, name) {
  try {
    if (act === 'ban') {
      const reason = prompt('سبب الإيقاف:', 'مخالفة شروط الاستخدام');
      if (reason === null) return;
      const days = Number(prompt('عدد أيام الإيقاف (0 = دائم):', '0')) || 0;
      await api(`/admin/users/${id}`, { method: 'PATCH', body: { action: 'ban', reason, days } });
      toast('تم إيقاف العضو', 'success');
    }
    if (act === 'unban') { await api(`/admin/users/${id}`, { method: 'PATCH', body: { action: 'unban' } }); toast('تم رفع الإيقاف', 'success'); }
    if (act === 'pw') {
      const pw = prompt(`كلمة مرور جديدة لـ @${name} (6 أحرف+):`);
      if (!pw) return;
      const r = await api(`/admin/users/${id}/reset-password`, { method: 'POST', body: { password: pw } });
      toast(r.message, 'success');
    }
    if (act === 'del') {
      if (!confirm(`حذف @${name} نهائياً مع كل رسائله؟`)) return;
      await api(`/admin/users/${id}`, { method: 'DELETE' });
      toast('حُذف العضو', 'success');
    }
    loadAdminUsers(); loadAdminStats();
  } catch (e) { toast(e.message, 'error'); }
}

async function loadAdminRooms() {
  try {
    const { rooms } = await api('/admin/rooms');
    $('#adminRoomsBody').innerHTML = rooms.map((r) => `
      <tr>
        <td><div class="u-cell"><span>${esc(r.icon || '💬')}</span><span>${esc(r.name)}<br><small style="color:var(--text-3)">/${esc(r.slug)}</small></span></div></td>
        <td>${r.type === 'direct' ? '<span class="tag">خاصة</span>' : '<span class="tag ok">عامة</span>'}</td>
        <td>${esc(r.ownerName)}</td>
        <td>${r.messageCount}</td>
        <td>${r.locked ? '🔒 مقفلة' : '🟢 مفتوحة'}${r.pinned ? ' · 📌' : ''}${r.hidden ? ' · مخفية' : ''}</td>
        <td><div class="acts">
          <button data-act="lock" data-id="${r.id}" data-v="${!r.locked}">${r.locked ? 'فتح' : 'قفل'}</button>
          <button data-act="pin" data-id="${r.id}" data-v="${!r.pinned}">${r.pinned ? 'إلغاء التثبيت' : 'تثبيت'}</button>
          <button class="danger" data-act="del" data-id="${r.id}" data-name="${esc(r.name)}">حذف</button>
        </div></td>
      </tr>`).join('');

    $$('#adminRoomsBody [data-act]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const id = b.dataset.id;
        if (b.dataset.act === 'lock') await api(`/rooms/${id}`, { method: 'PATCH', body: { locked: b.dataset.v === 'true' } });
        if (b.dataset.act === 'pin') await api(`/rooms/${id}`, { method: 'PATCH', body: { pinned: b.dataset.v === 'true' } });
        if (b.dataset.act === 'del') {
          if (!confirm(`حذف الغرفة "${b.dataset.name}" مع كل رسائلها؟`)) return;
          await api(`/admin/rooms/${id}`, { method: 'DELETE' });
        }
        loadAdminRooms(); loadAdminStats();
      } catch (e) { toast(e.message, 'error'); }
    }));
  } catch (e) { toast(e.message, 'error'); }
}

async function loadAdminMessages() {
  try {
    const q = $('#adminMsgSearch')?.value || '';
    const { messages } = await api(`/admin/messages?q=${encodeURIComponent(q)}`);
    $('#adminMsgsBody').innerHTML = messages.length ? messages.map((m) => `
      <tr>
        <td>${esc(m.user?.displayName || '—')}</td>
        <td>${esc(m.room?.name || '—')} ${m.room?.type === 'direct' ? '🔒' : ''}</td>
        <td class="cell-text" title="${esc(m.text)}">${m.deleted ? '<i style="color:var(--text-3)">محذوفة</i>' : esc(m.text) || (m.media ? '📎 مرفق' : '')}</td>
        <td style="color:var(--text-3);font-size:12px;white-space:nowrap">${arAgo(m.createdAt)}</td>
        <td><div class="acts">${m.deleted ? '' : `<button class="danger" data-id="${m.id}">حذف</button>`}</div></td>
      </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-3)">لا رسائل</td></tr>';

    $$('#adminMsgsBody button').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('حذف هذه الرسالة؟')) return;
      try { await api(`/admin/messages/${b.dataset.id}`, { method: 'DELETE' }); toast('حُذفت', 'success'); loadAdminMessages(); }
      catch (e) { toast(e.message, 'error'); }
    }));
  } catch (e) { toast(e.message, 'error'); }
}

async function loadAdminSettings() {
  try {
    const { settings } = await api('/admin/settings');
    const f = $('#settingsForm');
    f.site_title.value = settings.site_title || '';
    f.site_tagline.value = settings.site_tagline || '';
    f.announcement.value = settings.announcement || '';
    f.announcement_active.checked = !!settings.announcement_active;
    f.welcome_message.value = settings.welcome_message || '';
    f.allow_signup.checked = settings.allow_signup !== false;
    f.allow_media.checked = settings.allow_media !== false;
    f.maintenance_mode.checked = !!settings.maintenance_mode;
  } catch (e) { toast(e.message, 'error'); }
}

async function saveSettings(e) {
  e.preventDefault();
  const f = e.target;
  $('#settingsErr').textContent = '';
  try {
    const r = await api('/admin/settings', { method: 'PUT', body: {
      site_title: f.site_title.value,
      site_tagline: f.site_tagline.value,
      announcement: f.announcement.value,
      announcement_active: f.announcement_active.checked,
      welcome_message: f.welcome_message.value,
      allow_signup: f.allow_signup.checked,
      allow_media: f.allow_media.checked,
      maintenance_mode: f.maintenance_mode.checked
    }});
    state.bootstrap.settings = r.settings;
    $('#brandName').textContent = r.settings.site_title;
    document.title = r.settings.site_title;
    showAnnouncement();
    toast('حُفظت الإعدادات ✅', 'success');
  } catch (err) { $('#settingsErr').textContent = err.message; }
}

// ---------- التهيئة ----------
document.addEventListener('DOMContentLoaded', () => {
  // كل تهيئة معزولة: فشل إحداها لا يمنع البقية ولا يوقف الإقلاع
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[init] فشل تهيئة ' + name, e); } };
  safe('authForms', initAuthForms);
  safe('composer', initComposer);
  safe('upload', initUpload);
  safe('emoji', initEmoji);
  safe('globalUI', initGlobalUI);
  safe('notifications', initNotifications);

  // الإقلاع نفسه محمي: حتى لو فشل، تُزال شاشة التحميل ويظهر سبب الفشل
  Promise.resolve()
    .then(() => boot())
    .catch((e) => {
      console.error('[boot] فشل الإقلاع', e);
      try {
        finishBoot();
        showView('auth');
        const el = $('#loginErr');
        if (el) el.textContent = 'تعذّر تحميل التطبيق: ' + (e && e.message ? e.message : e);
      } catch {}
    });
});
