'use strict';
/**
 * يتحقّق من نقطة دخول Vercel الفعلية (api/[...api].js) بنفس طريقة استدعاء Vercel لها:
 * خادم HTTP خام يمرّر (req, res) إلى الـ handler المُصدَّر.
 * يشغّل نفس الـ 65 اختباراً ضد هذا المدخل.
 */
const http = require('http');
const path = require('path');

process.env.MONGOMS_SKIP = '1';

const entry = require(path.join(__dirname, '..', 'api', '[...api].js'));
if (typeof entry !== 'function') {
  console.error('❌ api/[...api].js لا يُصدّر دالة handler');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  // Vercel تستدعي handler(req, res) مباشرة
  Promise.resolve(entry(req, res)).catch((err) => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Internal', detail: err.message }));
    }
  });
});

const PORT = process.env.PORT || 4001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[vercel-entry] يستمع على http://0.0.0.0:${PORT}`);
});
