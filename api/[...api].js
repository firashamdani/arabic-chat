'use strict';
/**
 * نقطة دخول Vercel (Serverless).
 * نفس تطبيق Express المحلي تماماً — يخدم الـ API والملفات الثابتة.
 * على Vercel: /api/* يمر هنا، وما عداه تُخدمه مجلد public/ مباشرة.
 */
const { connectDB, ensureConnected } = require('../server/db');
const { seed } = require('../server/utils/seed');

let bootstrapped = null;
function bootstrap() {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      await ensureConnected();
      await seed();
    })().catch((err) => {
      bootstrapped = null; // نُعيد المحاولة في الطلب التالي
      throw err;
    });
  }
  return bootstrapped;
}

module.exports = async function handler(req, res) {
  try {
    await bootstrap();
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'تعذّر الاتصال بقاعدة البيانات — تحقّق من MONGODB_URI في إعدادات Vercel.',
        detail: err.message
      })
    );
    return;
  }

  const app = require('../server/app');
  return app(req, res);
};

// لتشغيل الملف مباشرة (node api/index.js) في التطوير
if (require.main === module) {
  const cfg = require('../server/config');
  (async () => {
    await bootstrap();
    const app = require('../server/app');
    app.listen(cfg.port, '0.0.0.0', () => console.log(`[listen] http://localhost:${cfg.port}`));
  })();
}
