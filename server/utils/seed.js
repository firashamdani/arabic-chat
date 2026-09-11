'use strict';
const bcrypt = require('bcryptjs');
const cfg = require('../config');
const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');
const Settings = require('../models/Settings');

/** إنشاء حساب الأدمن + الغرف الافتراضية عند أول تشغيل */
async function seed() {
  const report = { admin: null, adminCreated: false, rooms: [] };

  // 1) حساب الأدمن
  let admin = await User.findOne({ username: cfg.admin.username });
  if (!admin) {
    admin = new User({
      username: cfg.admin.username,
      email: cfg.admin.email,
      displayName: cfg.admin.displayName,
      role: 'admin',
      color: '#6366f1',
      bio: 'حساب الإدارة الرئيسي'
    });
    admin.setPassword(cfg.admin.password);
    await admin.save();
    report.adminCreated = true;
    console.log(`[seed] ✅ تم إنشاء حساب الأدمن: ${admin.username} / ${cfg.admin.password}`);
  } else {
    if (admin.role !== 'admin') {
      admin.role = 'admin';
      await admin.save();
    }
    console.log(`[seed] حساب الأدمن موجود مسبقاً: ${admin.username}`);
  }
  report.admin = { username: admin.username, password: cfg.admin.password };

  // 2) الغرف الافتراضية
  const defaults = [
    { name: 'الغرفة العامة', slug: 'general', icon: '💬', description: 'حديث عام للجميع', pinned: true },
    { name: 'الترحيب بالأعضاء', slug: 'welcome', icon: '👋', description: 'عرّف بنفسك هنا' },
    { name: 'التقنية والبرمجة', slug: 'tech', icon: '💻', description: 'أسئلة ونقاشات تقنية' },
    { name: 'الأدب والشعر', slug: 'poetry', icon: '📜', description: 'قصائد ونثر وخواطر' },
    { name: 'الرياضة', slug: 'sports', icon: '⚽', description: 'أخبار ومباريات' },
    { name: 'التسلية والألعاب', slug: 'fun', icon: '🎮', description: 'نكت وألعاب وتحديات' }
  ];

  for (const r of defaults) {
    const exists = await Room.findOne({ slug: r.slug, type: 'public' });
    if (!exists) {
      await Room.create({ ...r, type: 'public', owner: admin._id, createdBy: admin._id });
      report.rooms.push(r.slug);
    }
  }

  // 3) رسالة ترحيب في الغرفة العامة
  const general = await Room.findOne({ slug: 'general', type: 'public' });
  if (general) {
    const count = await Message.countDocuments({ room: general._id });
    if (count === 0) {
      await Message.create({
        room: general._id,
        user: admin._id,
        text: 'أهلاً وسهلاً بكم في شات العرب 🌟\nهذه الغرفة عامة للجميع — الالتزام بالاحترام المتبادل شرط أساسي.\nجرّب: إنشاء غرفة جديدة، أو إرسال رسالة خاصة لأي عضو من القائمة الجانبية.',
        system: false
      });
    }
  }

  // 4) ضمان وجود الإعدادات
  await Settings.getAll();

  return report;
}

module.exports = { seed, bcrypt };
