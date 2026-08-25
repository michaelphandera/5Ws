// Vercel entrypoint: the same Express app, exported as a request handler that
// establishes the MongoDB connection once per instance and reuses it across
// invocations. Local dev keeps using server.js (connect once, then listen).
const mongoose = require('mongoose');
const app = require('./app');

let pending = null;
async function ensureDb() {
  if (mongoose.connection.readyState === 1) return;
  if (!pending) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set');
    pending = mongoose.connect(uri).catch((err) => {
      pending = null; // let the next invocation retry instead of caching the failure
      throw err;
    });
  }
  await pending;
}

module.exports = async (req, res) => {
  try {
    await ensureDb();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Database unavailable' }));
  }
  return app(req, res);
};
