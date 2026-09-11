# 🚀 ابدأ هنا — شات العرب

## 1) ثبّت الحزم
```bash
cd arabic-chat
npm install
```

## 2) أنشئ ملف الإعدادات
```bash
cp .env.example .env
```
ثم افتح `.env` وعدّل على الأقل:
- `MONGODB_URI` ← رابط MongoDB Atlas (مجاني: mongodb.com/cloud/atlas)
- `JWT_SECRET` ← ولّده بـ: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `ADMIN_USERNAME` و `ADMIN_PASSWORD` ← بيانات دخولك كأدمن

## 3) شغّل محلياً
```bash
npm start
```
افتح: http://localhost:3000  ·  لوحة الأدمن: http://localhost:3000/#/admin

## 4) اختبر (65 اختباراً جاهزاً)
```bash
npm test              # التشغيل المحلي
npm run test:vercel   # نقطة دخول Vercel نفسها
```
> الاختباران يشغّلان MongoDB في الذاكرة تلقائياً — لا تحتاج تثبيت MongoDB.

## 5) انشر مجاناً على Vercel
اقرأ **`DEPLOY.md`** — فيه الخطوات السبع كاملة:
MongoDB Atlas ← Pusher ← Cloudinary ← Vercel ← المفاتيح ← الدخول كأدمن ← الدومين المجاني

---

## 📂 ما هي هذه الملفات؟

| الملف | الوظيفة |
|---|---|
| `README.md` | وصف المشروع والميزات ومسارات الـ API |
| `DEPLOY.md` | **دليل النشر المجاني خطوة بخطوة** |
| `.env.example` | قالب الإعدادات — انسخه إلى `.env` |
| `vercel.json` | إعدادات Vercel (جاهزة، لا تغيّرها) |
| `api/[...api].js` | نقطة دخول Vercel (Serverless) |
| `server/` | الخادم: Express + النماذج + المسارات + الصلاحيات |
| `public/` | الواجهة: HTML + CSS + JS عربي RTL |
| `scripts/` | الاختبارات + MongoDB في الذاكرة |

---

## ⚠️ ملاحظات مهمة

- **لا ترفع** `node_modules` ولا `.env` إلى GitHub (مستثناة تلقائياً في `.gitignore`).
- **البث اللحظي**: خطة Vercel المجانية لا تدعم WebSocket، لذا يستخدم المشروع **Pusher** (مجاني).
  وإن لم تضع مفاتيح Pusher، يعمل التطبيق تلقائياً بتحديث كل 5 ثوانٍ — لا يتوقف شيء.
- **الدومين المجاني**: `اسمك.vercel.app` (فوري + SSL) أو `اسمك.duckdns.org` أو `اسمك.eu.org` (بطيء).
- **بعد أول دخول كأدمن**: غيّر كلمة المرور فوراً.

---

## 🆘 مشكلة؟

| العَرَض | الحل |
|---|---|
| `MONGODB_URI غير مضبوط` | انسخ `.env.example` إلى `.env` وضع الرابط |
| `Cannot find module` | شغّل `npm install` أولاً |
| `db:"down"` في `/api/health` | الرابط خاطئ، أو كلمة المرور فيها `@` غير مرمّزة، أو Network Access في Atlas |
| الرسائل ليست لحظية | مفاتيح `PUSHER_*` ناقصة |
| رفع الصور يفشل | `CLOUDINARY_UPLOAD_PRESET` يجب أن يكون **Unsigned** |
