const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { logInfo, logError } = require('./utils');

let db = null;

async function initDatabase() {
  try {
    const SQL = await initSqlJs();
    const dbPath = config.dbPath;
    const dir = path.dirname(dbPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(dbPath)) {
      const filebuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(filebuffer);
    } else {
      db = new SQL.Database();
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        chat_id TEXT NOT NULL,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        mute_until INTEGER DEFAULT 0,
        is_banned INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
      CREATE INDEX IF NOT EXISTS idx_users_chat_id ON users(chat_id);
    `);

    saveDb();
    logInfo('База данных SQLite (Pure JS) успешно инициализирована');
  } catch (err) {
    logError('Ошибка при инициализации базы данных', err);
    throw err;
  }
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(config.dbPath, buffer);
}

async function upsertUser(user, chatId) {
  const now = Date.now();
  const userIdStr = user.id.toString();
  const chatIdStr = chatId.toString();

  const stmt = db.prepare('SELECT * FROM users WHERE user_id = :uid');
  const existing = stmt.getAsObject({ ':uid': userIdStr });
  stmt.free();

  if (existing && existing.user_id) {
    db.run(
      `UPDATE users SET chat_id = ?, username = ?, first_name = ?, last_name = ?, updated_at = ? WHERE user_id = ?`,
      [chatIdStr, user.username || null, user.firstName || null, user.lastName || null, now, userIdStr]
    );
  } else {
    db.run(
      `INSERT INTO users (user_id, chat_id, username, first_name, last_name, mute_until, is_banned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [userIdStr, chatIdStr, user.username || null, user.firstName || null, user.lastName || null, now, now]
    );
  }
  saveDb();
}

async function setMute(userId, chatId, muteUntilMs) {
  const now = Date.now();
  const userIdStr = userId.toString();
  const chatIdStr = chatId.toString();

  db.run(
    `INSERT INTO users (user_id, chat_id, mute_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, mute_until = excluded.mute_until, updated_at = excluded.updated_at`,
    [userIdStr, chatIdStr, muteUntilMs, now, now]
  );
  saveDb();
}

async function removeMute(userId) {
  const now = Date.now();
  db.run(`UPDATE users SET mute_until = 0, updated_at = ? WHERE user_id = ?`, [now, userId.toString()]);
  saveDb();
}

async function setBanStatus(userId, chatId, isBanned) {
  const now = Date.now();
  const userIdStr = userId.toString();
  const chatIdStr = chatId.toString();

  db.run(
    `INSERT INTO users (user_id, chat_id, is_banned, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, is_banned = excluded.is_banned, updated_at = excluded.updated_at`,
    [userIdStr, chatIdStr, isBanned ? 1 : 0, now, now]
  );
  saveDb();
}

async function getUser(userId) {
  const stmt = db.prepare('SELECT * FROM users WHERE user_id = :uid');
  const res = stmt.getAsObject({ ':uid': userId.toString() });
  stmt.free();
  return res && res.user_id ? res : null;
}

async function cleanExpiredMutes() {
  const now = Date.now();
  db.run(`UPDATE users SET mute_until = 0, updated_at = ? WHERE mute_until > 0 AND mute_until <= ?`, [now, now]);
  saveDb();
}

module.exports = {
  initDatabase,
  upsertUser,
  setMute,
  removeMute,
  setBanStatus,
  getUser,
  cleanExpiredMutes,
};

