'use strict';
const cfg = require('./config');
const app = require('./app');
const { connectDB } = require('./db');
const { seed } = require('./utils/seed');
const realtime = require('./utils/realtime');

async function main() {
  console.log('========================================');
  console.log(`  ${cfg.appName} — تشغيل محلي`);
  console.log('========================================');

  if (!cfg.mongoUri) {
    console.error('\n❌ MONGODB_URI غير مضبوط.');
    console.error('   انسخ .env.example إلى .env ثم ضع رابط MongoDB Atlas.\n');
    process.exit(1);
  }

  await connectDB();
  const report = await seed();

  console.log('\n[ready] Realtime (Pusher):', realtime.enabled() ? '✅ مفعّل' : '⚠️  غير مفعّل — أضف مفاتيح PUSHER_* لتفعيل البث الحي');
  console.log('[ready] الموقع يعمل على:', cfg.appUrl);
  console.log('[ready] لوحة الأدمن:', `${cfg.appUrl}/#/admin`);
  if (report.adminCreated) {
    console.log('\n┌─────────────────────────────────────');
    console.log(`│  حساب الأدمن : ${report.admin.username}`);
    console.log(`│  كلمة المرور : ${report.admin.password}`);
    console.log('└─────────────────────────────────────\n');
  }

  app.listen(cfg.port, '0.0.0.0', () => {
    console.log(`[listen] http://0.0.0.0:${cfg.port}`);
  });
}

main().catch((err) => {
  console.error('\n❌ فشل التشغيل:', err.message);
  process.exit(1);
});
