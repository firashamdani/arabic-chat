#!/usr/bin/env bash
# يشغّل MongoDB في الذاكرة + خادم التطبيق + الاختبار الدخاني، ثم ينظّف كل شيء.
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3999}"
export PORT
# اسم قاعدة بيانات فريد لكل تشغيل ⇒ الاختبار يبدأ دائماً من حالة نظيفة
DB="arabic_chat_test_$$_$RANDOM"
export MONGODB_URI="mongodb://127.0.0.1:27017/$DB"
echo "▶ قاعدة الاختبار: $DB"

echo "▶ تشغيل MongoDB في الذاكرة…"
node scripts/mongo-mem.js > /tmp/mongo.log 2>&1 &
MONGO_PID=$!

cleanup() { kill $MONGO_PID $APP_PID 2>/dev/null; wait 2>/dev/null; }
trap cleanup EXIT

for i in $(seq 1 60); do
  grep -q "MONGO_URI=" /tmp/mongo.log 2>/dev/null && break
  sleep 0.5
done
if ! grep -q "MONGO_URI=" /tmp/mongo.log; then echo "❌ فشل تشغيل MongoDB"; cat /tmp/mongo.log; exit 1; fi
echo "✅ MongoDB جاهز"

echo "▶ تشغيل خادم التطبيق على المنفذ $PORT…"
node server/index.js > /tmp/app.log 2>&1 &
APP_PID=$!

for i in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1 && break
  if ! kill -0 $APP_PID 2>/dev/null; then echo "❌ الخادم توقف"; cat /tmp/app.log; exit 1; fi
  sleep 0.5
done
echo "✅ الخادم يعمل"
echo ""

node scripts/smoke-test.js
CODE=$?

echo ""
echo "──── سجل الخادم ────"
tail -25 /tmp/app.log
exit $CODE
