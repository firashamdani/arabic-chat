// يشغّل MongoDB في الذاكرة للاختبار المحلي فقط
const path = require('path');
process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '..', 'data', 'mongodb-binaries');
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.14';
const { MongoMemoryServer } = require('mongodb-memory-server-core');
(async () => {
  const srv = await MongoMemoryServer.create({ instance: { port: 27017, ip: '127.0.0.1' } });
  console.log('MONGO_URI=' + srv.getUri('arabic_chat_test'));
  process.on('SIGTERM', async () => { await srv.stop(); process.exit(0); });
  setInterval(() => {}, 1 << 30);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
