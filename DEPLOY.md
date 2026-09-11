# ☁️ دليل النشر المجاني الكامل — شات العرب

ستحصل في النهاية على موقع حي على الإنترنت + دومين + دخول كأدمن.
**الوقت المتوقع: 25–35 دقيقة.** كل الخدمات مجانية ولا تحتاج بطاقة ائتمان.

```
الخطة النهائية:
  Vercel (استضافة + API)  ← مجاني
  MongoDB Atlas (قاعدة البيانات)  ← مجاني
  Pusher (البث اللحظي للرسائل)  ← مجاني
  Cloudinary (الصور والملفات)  ← مجاني
  الدومين: yourname.vercel.app (مجاني تلقائياً) أو دومين مجاني اختياري
```

---

## الخطوة 0 — رفع المشروع إلى GitHub (مطلوب لـ Vercel)

1. أنشئ حساباً على **https://github.com** (مجاني).
2. اضغط **New repository** → سمّه `arabic-chat` → اجعله **Private** أو Public → **Create**.
3. ارفع الملفات بإحدى الطريقتين:

**أ) من المتصفح (الأسهل):** اضغط `Add file → Upload files`، واسحب **كل محتويات مجلد `arabic-chat`**
> ⚠️ **لا ترفع**: `node_modules` ولا مجلد `data` ولا ملف `.env` (مستثناة تلقائياً في `.gitignore`)

**ب) بالأوامر:**
```bash
cd arabic-chat
git init && git add . && git commit -m "شات العرب"
git branch -M main
git remote add origin https://github.com/YOUR_USER/arabic-chat.git
git push -u origin main
```

---

## الخطوة 1 — قاعدة البيانات: MongoDB Atlas (مجاني للأبد)

> الخطة المجانية M0: **512 ميجابايت** تخزين، تكفي مئات آلاف الرسائل.

1. اذهب إلى **https://www.mongodb.com/cloud/atlas/register** وسجّل (يمكن بحساب Google).
2. عند سؤال الاستبيان اختر أي إجابات ثم **Finish and close**.
3. اختر **Create a New Cluster** (الخيار المجاني **M0 Free**).
4. Provider: **AWS** · Region: اختر الأقرب للعراق مثل **Frankfurt (eu-central-1)** أو **London**.
5. Cluster name: `chat` → **Create Deployment**.
6. ستظهر نافذة **Connect to chat**:
   - أنشئ مستخدم قاعدة بيانات: Username = `chatadmin` · Password = اضغط **Autogenerate** ثم **انسخه واحفظه**
   - **Create Database User**
7. **Choose a connection method → Drivers**:
   - Driver: **Node.js** · Version: **5.5 or later**
   - انسخ الرابط، يبدو هكذا:
     ```
     mongodb+srv://chatadmin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```
8. **عدّل الرابط** — ضع كلمة المرور الحقيقية، وأضف اسم القاعدة قبل `?`:
   ```
   mongodb+srv://chatadmin:كلمةالمرور@cluster0.xxxxx.mongodb.net/arabic_chat?retryWrites=true&w=majority
   ```
   ✅ **احفظ هذا الرابط — ستحتاجه في الخطوة 5.**

> 💡 ملاحظة: في Atlas اذهب إلى **Network Access** وتأكد من وجود `0.0.0.0/0` (Allow access from anywhere). يُضاف عادةً تلقائياً.

---

## الخطوة 2 — البث اللحظي: Pusher (مجاني)

> **لماذا Pusher؟** خطة Vercel المجانية (Serverless) لا تدعم WebSocket.
> Pusher يمنحك بثاً لحظياً مجانياً: **200,000 رسالة/يوم** وقنوات غير محدودة.
> وإن لم تُضبط مفاتيحه، يعمل التطبيق تلقائياً على تحديث كل 5 ثوانٍ — لا يتوقف شيء.

1. اذهب إلى **https://dashboard.pusher.com/accounts/sign_up** (مجاني، بدون بطاقة).
2. **Create new app** → الاسم: `arabic-chat` → المنطقة: **EU (Ireland)** أو الأقرب لك → **Create app**.
3. من صفحة **App Settings → App keys** انسخ:
   - `app_id`
   - `key`
   - `secret`
   - `cluster` (مثال: `eu`)

---

## الخطوة 3 — رفع الصور: Cloudinary (مجاني)

1. سجّل في **https://cloudinary.com/users/register/free**
2. من لوحة التحكم انسخ **Cloud name** (مثال: `dxy12abcd`).
3. اذهب إلى **Settings → Upload** وانزل إلى **Upload presets** → **Add upload preset**:
   - Name: `chat_uploads`
   - **Signing Mode: Unsigned** ← مهم جداً
   - **Save**

---

## الخطوة 4 — النشر على Vercel

1. اذهب إلى **https://vercel.com/signup** وسجّل بحساب **GitHub** (الأسهل).
2. اضغط **Add New… → Project**.
3. اختر مستودع `arabic-chat` → **Import**.
4. **لا تغيّر شيئاً** في إعدادات البناء — المشروع مضبوط مسبقاً في `vercel.json`:
   - Framework Preset: **Other**
   - Build Command: **فارغ**
   - Output Directory: **public**
   - Install Command: `npm install` (افتراضي)
5. اضغط **Deploy** وانتظر ~40 ثانية → **🎉 Congratulations!**
6. ستحصل على رابط مثل: `https://arabic-chat-xxxx.vercel.app`

> في هذه اللحظة الموقع يعمل، لكن ينقصه المفاتيح. أكمل الخطوة 5.

---

## الخطوة 5 — إضافة المفاتيح (Environment Variables)

في لوحة Vercel: **Project → Settings → Environment Variables**

أضف هذه المتغيرات (اختر **Production** و **Preview** و **Development**):

| Key | Value | من أين |
|---|---|---|
| `MONGODB_URI` | `mongodb+srv://...arabic_chat?...` | الخطوة 1 |
| `JWT_SECRET` | نص عشوائي طويل (انظر الأسفل) | توليده |
| `ADMIN_USERNAME` | `admin` (أو ما تشاء) | اختيارك |
| `ADMIN_EMAIL` | `admin@example.com` | اختيارك |
| `ADMIN_PASSWORD` | `كلمة_مرور_قوية` ← **غيّرها!** | اختيارك |
| `ADMIN_DISPLAY_NAME` | `المدير العام` | اختيارك |
| `PUSHER_APP_ID` | `1234567` | الخطوة 2 |
| `PUSHER_KEY` | `abc123def456` | الخطوة 2 |
| `PUSHER_SECRET` | `xyz789...` | الخطوة 2 |
| `PUSHER_CLUSTER` | `eu` | الخطوة 2 |
| `CLOUDINARY_CLOUD_NAME` | `dxy12abcd` | الخطوة 3 |
| `CLOUDINARY_UPLOAD_PRESET` | `chat_uploads` | الخطوة 3 |
| `APP_URL` | `https://arabic-chat-xxxx.vercel.app` | رابط موقعك |

**توليد `JWT_SECRET` آمن:**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

ثم: **Deployments → آخر نشر → ⋯ → Redeploy** (لتفعيل المتغيرات).

---

## الخطوة 6 — ✅ الدخول كأدمن

افتح رابط موقعك ثم أضف `/#/admin`:

```
https://arabic-chat-xxxx.vercel.app/#/admin
```

وسجّل الدخول بـ:
```
اسم المستخدم : ADMIN_USERNAME الذي اخترته (افتراضياً: admin)
كلمة المرور : ADMIN_PASSWORD الذي اخترته
```

> 🔐 **مهم جداً:** الحساب يُنشأ تلقائياً عند أول طلب للموقع. إن لم ينجح الدخول،
> افتح `https://موقعك/api/health` — يجب أن ترى `"db":"ok"`.
> ثم `https://موقعك/api/bootstrap` — يجب أن ترى `"adminReady":true`.

> ⚠️ **بعد أول دخول**: افتح **لوحة الأدمن** وغيّر كلمة المرور من صفحة الدخول/الملف الشخصي.

---

## الخطوة 7 — الدومين المجاني

### الخيار أ (الأسهل والموصى به): دومين Vercel المجاني
رابطك `https://arabic-chat-xxxx.vercel.app` **مجاني للأبد مع شهادة SSL تلقائية**.
لتغيير الاسم: **Project → Settings → Domains → ⋯ → Edit** → اجعله `arabic-chat.vercel.app`.

### الخيار ب: نطاق `eu.org` — دومين حقيقي مجاني 100%
- اذهب إلى **https://nic.eu.org/arf/en/register/** وأنشئ حساباً (مجاني، غير تجاري).
- اطلب نطاقاً مثل `myarabchat.eu.org`.
- ⚠️ الموافقة **يدوية** وقد تستغرق أياماً أو أسابيع.

### الخيار ج: DuckDNS (فوري ومجاني)
1. سجّل في **https://www.duckdns.org** (بحساب Google/GitHub).
2. أنشئ نطاقاً مثل `myarabchat.duckdns.org`.
3. في **DNS** اختر نوع السجل **CNAME** ووجّهه إلى: `cname.vercel-dns.com`
4. في Vercel: **Settings → Domains → Add** → `myarabchat.duckdns.org` → سيُفعّل SSL تلقائياً.

### الخيار رابع (إن اشتريت دوميناً لاحقاً ~$3/سنة)
**Settings → Domains → Add** → أضف `chat.yoursite.com` → Vercel يعطيك سجلات:
```
A      @     76.76.21.21
CNAME  www   cname.vercel-dns.com
```
أضفها عند مزوّد الدومين وانتظر دقائق.

---

## ✅ قائمة التحقق النهائية

- [ ] `https://موقعك/api/health` يعيد `{"ok":true,"db":"ok","realtime":true}`
- [ ] الدخول بحساب الأدمن يعمل
- [ ] الغرف الست جاهزة مع رسالة الترحيب
- [ ] إرسال رسالة من عضوين في نافذتين يوصل **لحظياً** (ليس بعد 5 ثوانٍ)
- [ ] رفع صورة يعمل
- [ ] لوحة الأدمن `/#/admin` تعرض المخططات
- [ ] `ADMIN_PASSWORD` تغيّر إلى كلمة قوية

---

## 🧪 التأكد قبل النشر (اختباران جاهزان)

المشروع فيه **65 اختباراً** تغطي كل المسارات. شغّلها قبل الرفع:

```bash
npm test          # يختبر التشغيل المحلي (server/index.js)  → 65/65
npm run test:vercel   # يختبر نقطة دخول Vercel نفسها (api/[...api].js) → 65/65
```

كلاهما يشغّل MongoDB في الذاكرة تلقائياً، فلا تحتاج تثبيت شيء.
الاختبار الثاني مهم لأنه يمرّ على **نفس الكود الذي سيعمل على Vercel**.

---

## 🩺 حل المشاكل الشائعة

| المشكلة | السبب والحل |
|---|---|
| `"db":"down"` في `/api/health` | `MONGODB_URI` خاطئ، أو كلمة المرور فيها `@` أو `:` غير مرمّزة. استخدم **URI encoding**. أو IP خادم Vercel غير مسموح في **Network Access** → أضف `0.0.0.0/0` |
| الرسائل تصل بعد 5 ثوانٍ لا لحظياً | مفاتيح `PUSHER_*` ناقصة، أو `PUSHER_CLUSTER` خاطئ. تحقّق من `/api/bootstrap` ← `"realtime":{"enabled":true}` |
| رفع الصور يفشل | `CLOUDINARY_UPLOAD_PRESET` غير **Unsigned**، أو اسم الـ preset خاطئ |
| 404 على الصفحات الداخلية | تأكد أن `vercel.json` مرفوع وأن **Output Directory = public** |
| الدخول كأدمن يفشل | تأكد أن `ADMIN_USERNAME`/`ADMIN_PASSWORD` مضافة **قبل** أول نشر، أو احذف مستند `User` للأدمن من Atlas ليُعاد إنشاؤه |
| `"adminReady":false` | لم يعمل الـ seed بعد — افتح `/api/bootstrap` مرة أخرى بعد دقيقة |
| الموقع بطيء في أول طلب | طبيعة Serverless المجانية (Cold Start ~1–2 ثانية). طبيعي |

---

## 🔒 نصائح أمنية بعد النشر

1. **غيّر كلمة مرور الأدمن** فوراً من الملف الشخصي.
2. **اجعل `ALLOW_SIGNUP=false`** في المتغيرات إن أردت شاتاً مغلقاً لأشخاص محددين (أو أغلقه من لوحة الأدمن ← الإعدادات).
3. **لا ترفع `.env`** إلى GitHub أبداً.
4. راقب الاستهلاك من **Vercel → Usage** (الحد المجاني: 100 جيجابايت نقل / مليون استدعاء دالة شهرياً).
5. إن كبر الموقع: خطّة **Flex** في MongoDB Atlas تبدأ من ~$8/شهر، و **Pusher Startup** $49/شهر.

---

## 🎁 بدائل استضافة مجانية (إن أردت تغيير Vercel)

| المنصة | تصلح؟ | ملاحظة |
|---|---|---|
| **Vercel** | ✅ الأفضل هنا | يحتاج Pusher للبث اللحظي (مضبوط مسبقاً) |
| **Render** | ✅ ممتاز | يدعم WebSocket أصلاً — غيّر `PUSHER_*` إلى مفاتيح Socket.IO إن أردت |
| **Railway** | ✅ | 500 ساعة/شهر مجانية |
| **Koyeb** | ✅ | خطة مجانية صغيرة |
| **Glitch** | ⚠️ | ينام بعد خمول |

> للتشغيل على Render: أضف **Build** = `npm install` · **Start** = `npm start` · وارفع نفس متغيرات البيئة.
