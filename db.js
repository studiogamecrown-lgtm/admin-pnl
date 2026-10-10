const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data.db');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, label TEXT, model TEXT,
  sdk INTEGER, last_seen INTEGER, created INTEGER);
CREATE TABLE IF NOT EXISTS photos (id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT, filename TEXT, path TEXT, size INTEGER, ts INTEGER, created INTEGER);
CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT, number TEXT, name TEXT, type TEXT, duration INTEGER,
  date INTEGER, created INTEGER);
CREATE TABLE IF NOT EXISTS call_events (id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT, number TEXT, duration INTEGER, ts INTEGER);
CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT, name TEXT, number TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT, lat REAL, lon REAL, accuracy REAL, ts INTEGER);
CREATE TABLE IF NOT EXISTS recordings (id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT, number TEXT, duration INTEGER, filename TEXT, path TEXT, ts INTEGER);
`);

module.exports = { db, UPLOAD_DIR };
