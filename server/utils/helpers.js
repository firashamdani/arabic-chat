'use strict';

/** حزمة دوال مساعدة عامة */

function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\u0600-\u06FFa-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** استخراج @mentions من نص الرسالة */
function extractMentions(text) {
  const out = new Set();
  const re = /@([a-z0-9_.-]{3,24})/gi;
  let m;
  while ((m = re.exec(String(text || '')))) out.add(m[1].toLowerCase());
  return [...out];
}

function previewOf(text, media) {
  if (media && media.url) {
    const map = { image: '📷 صورة', file: '📎 ملف', audio: '🎵 تسجيل صوتي', video: '🎬 فيديو' };
    return map[media.kind] || '📎 مرفق';
  }
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** تنسيق حجم الملف */
function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} ك.ب`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} م.ب`;
  return `${(n / 1024 ** 3).toFixed(2)} ج.ب`;
}

/** منع NoSQL injection: نرفض أي قيمة ليست نصاً بسيطاً */
function safeString(v, max = 200) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** وسيط أخطاء موحّد */
function errorHandler(err, req, res, _next) {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'صيغة JSON غير صحيحة' });
  }
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'قيمة';
    return res.status(409).json({ error: `${field} مستخدم مسبقاً` });
  }
  if (err && err.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({ error: first ? first.message : 'بيانات غير صالحة' });
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err.message || 'حدث خطأ غير متوقع' });
}

function notFound(req, res) {
  res.status(404).json({ error: 'المسار غير موجود' });
}

module.exports = {
  slugify,
  escapeHtml,
  extractMentions,
  previewOf,
  humanSize,
  safeString,
  asyncHandler,
  errorHandler,
  notFound
};
