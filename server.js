require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || '';
const allowedOrigins = (process.env.FRONTEND_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const sweepTimezone = process.env.SWEEP_TIMEZONE || 'America/Chicago';
const required = ['USER1_USERNAME','USER1_PASSWORD','USER2_USERNAME','USER2_PASSWORD'];
const missing = required.filter(k => !process.env[k]);
if (!JWT_SECRET || JWT_SECRET.length < 40 || missing.length || allowedOrigins.length === 0) {
  console.error('Configuration missing. Set JWT_SECRET (40+ chars), both account usernames/passwords, and FRONTEND_ORIGINS in .env.');
  process.exit(1);
}
if (process.env.USER1_USERNAME.toLowerCase() === process.env.USER2_USERNAME.toLowerCase()) {
  console.error('USER1_USERNAME and USER2_USERNAME must be different.'); process.exit(1);
}
if (process.env.USER1_PASSWORD.length < 12 || process.env.USER2_PASSWORD.length < 12) {
  console.error('Each account password must be at least 12 characters.'); process.exit(1);
}

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'chat.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    username TEXT NOT NULL,
    body TEXT NOT NULL CHECK(length(body) <= 1000),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);
`);
const upsertUser = db.prepare(`INSERT INTO users(username,password_hash) VALUES(?,?) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash`);
for (const [u,p] of [[process.env.USER1_USERNAME,process.env.USER1_PASSWORD],[process.env.USER2_USERNAME,process.env.USER2_PASSWORD]]) {
  upsertUser.run(u.trim(), bcrypt.hashSync(p, 12));
}
const findUser = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE');
const userById = db.prepare('SELECT id, username FROM users WHERE id = ?');
const getMessages = db.prepare('SELECT id, user_id AS userId, username, body, created_at AS createdAt FROM messages WHERE created_at >= ? ORDER BY id ASC LIMIT 300');
const insertMessage = db.prepare('INSERT INTO messages(user_id,username,body,created_at) VALUES(?,?,?,?)');
const deleteOldMessages = db.prepare('DELETE FROM messages WHERE created_at < ?');
function sweep() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const result = deleteOldMessages.run(cutoff);
  console.log(`[retention] Deleted ${result.changes} message(s) older than 24 hours.`);
  db.pragma('wal_checkpoint(TRUNCATE)');
}
sweep();
cron.schedule('0 0 * * *', sweep, { timezone: sweepTimezone });

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin(origin, cb) {
  if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
  return cb(new Error('Origin is not allowed by ClockIT chat server.'));
}, methods: ['GET','POST'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '12kb' }));
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes('Origin is not allowed')) return res.status(403).json({ error: 'This website is not allowed to use this chat server.' });
  next(err);
});
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Wait 15 minutes and try again.' } });
const messageLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'You are sending messages too quickly. Wait a moment.' } });
function tokenFor(user) { return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h', issuer: 'clockit-chat' }); }
function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Please sign in again.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: 'clockit-chat' });
    const user = userById.get(Number(payload.sub));
    if (!user) return res.status(401).json({ error: 'Account not found. Please sign in again.' });
    req.user = user; next();
  } catch { return res.status(401).json({ error: 'Your sign-in expired. Please sign in again.' }); }
}
app.get('/health', (req,res) => res.json({ ok: true, service: 'clockit-chat' }));
app.post('/api/login', loginLimiter, (req,res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!username || !password || username.length > 64 || password.length > 200) return res.status(400).json({ error: 'Enter your username and password.' });
  const user = findUser.get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Username or password is incorrect.' });
  res.json({ token: tokenFor(user), username: user.username, expiresIn: 28800 });
});
app.get('/api/messages', authenticate, (req,res) => {
  const messages = getMessages.all(Date.now() - 24 * 60 * 60 * 1000).map(m => ({ id:m.id, userId:m.userId, username:m.username, body:m.body, createdAt:m.createdAt }));
  res.json({ messages });
});
app.post('/api/messages', authenticate, messageLimiter, (req,res) => {
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body) return res.status(400).json({ error: 'Write a message first.' });
  if (body.length > 1000) return res.status(400).json({ error: 'Messages must be 1,000 characters or fewer.' });
  const createdAt = Date.now();
  const info = insertMessage.run(req.user.id, req.user.username, body, createdAt);
  const message = { id:Number(info.lastInsertRowid), userId:req.user.id, username:req.user.username, body, createdAt };
  io.to('private-chat').emit('chat:message', message);
  res.status(201).json({ message });
});
const server = http.createServer(app);
const io = new Server(server, { cors: { origin(origin, cb) { if (!origin || allowedOrigins.includes(origin)) return cb(null,true); return cb(new Error('Origin not allowed')); }, methods:['GET','POST'] }, maxHttpBufferSize: 1e5 });
io.use((socket,next) => {
  try {
    const payload = jwt.verify(socket.handshake.auth && socket.handshake.auth.token, JWT_SECRET, { issuer: 'clockit-chat' });
    const user = userById.get(Number(payload.sub));
    if (!user) return next(new Error('Please sign in again.'));
    socket.data.user = user; next();
  } catch { next(new Error('Please sign in to chat.')); }
});
io.on('connection', socket => { socket.join('private-chat'); socket.emit('chat:ready', { username: socket.data.user.username }); });
server.listen(PORT, '0.0.0.0', () => console.log(`ClockIT chat server listening on port ${PORT}; allowed origins: ${allowedOrigins.join(', ')}`));
function shutdown() { console.log('Shutting down ClockIT chat server…'); server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(1), 5000).unref(); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
