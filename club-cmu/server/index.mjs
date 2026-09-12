import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'node:url';
import { createApplication } from './application.mjs';
import { makeAuthenticator } from './auth.mjs';
dotenv.config({ path: '.env' });
// Load the model module after dotenv has populated the environment.
const { organize } = await import('./organize.mjs');
if (!process.env.MONGODB_URI) throw Error('MONGODB_URI is required.');
const mongo = new MongoClient(process.env.MONGODB_URI);
await mongo.connect();
const db = mongo.db(process.env.MONGODB_DB_NAME || process.env.MONGODB_DB || 'club_cmu');
// New collection: legacy boards/pixels are intentionally untouched.
const collection = db.collection('drawing_boards');
const store = {
  async load(id) { const doc = await collection.findOne({ _id: id }); if (!doc) return null; const { _id, ...state } = doc; return state; },
  async save(id, data) { await collection.replaceOne({ _id: id }, { _id: id, ...data, updatedAt: new Date() }, { upsert: true }); },
  async ping() { await db.command({ ping: 1 }); }
};
const localDemo = process.env.LOCAL_DEMO === 'true' && process.env.NODE_ENV !== 'production';
const application = createApplication({ store, authenticate: makeAuthenticator(), organize, distDirectory: fileURLToPath(new URL('../dist/', import.meta.url)), localDemo });
application.server.listen(Number(process.env.PORT || 3001), '0.0.0.0', () => console.log('Club CMU drawing server ready.'));
let stopping = false;
async function shutdown() { if (stopping) return; stopping = true; await application.close(); await mongo.close(); }
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
