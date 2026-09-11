#!/usr/bin/env bash
# يختبر نقطة دخول Vercel (api/[...api].js) بدلاً من server/index.js
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-4001}"
export PORT
DB="arabic_chat_vercel_$$_$RANDOM"
export MONGODB_URI="mongodb://127.0.0.1:27017/$DB"
echo "▶ اختبار مدخل Vercel · قاعدة: $DB"

node scripts/mongo-mem.js > /tmp/mongo2.log 2>&1 &
MONGO_PID=$!
cleanup() { kill $MONGO_PID $APP_PID 2>/dev/null; wait 2>/dev/null; }
trap cleanup EXIT

for i in $(seq 1 60); do grep -q "MONGO_URI=" /tmp/mongo2.log 2>/dev/null && break; sleep 0.5; done
grep -q "MONGO_URI=" /tmp/mongo2.log || { echo "❌ MongoDB فشل"; cat /tmp/mongo2.log; exit 1; }
echo "✅ MongoDB جاهز"

node scripts/vercel-entry-test.js > /tmp/vercel.log 2>&1 &
APP_PID=$!

for i in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1 && break
  kill -0 $APP_PID 2>/dev/null || { echo "❌ المدخل توقف"; cat /tmp/vercel.log; exit 1; }
  sleep 0.5
done
echo "✅ مدخل Vercel يعمل"
echo ""

TEST_URL="http://127.0.0.1:$PORT" node scripts/smoke-test.js
CODE=$?

echo ""
echo "──── سجل مدخل Vercel ────"
tail -12 /tmp/vercel.log
exit $CODE
