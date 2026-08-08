require('dotenv').config();
const path = require('path');

const apiId = parseInt(process.env.API_ID, 10);
const apiHash = process.env.API_HASH;
const sessionString = process.env.SESSION_STRING || '';

if (!apiId || !apiHash) {
  console.error('[ERROR] API_ID и API_HASH должны быть указаны в файле .env!');
  process.exit(1);
}

const ownerIds = (process.env.OWNER_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter((id) => id.length > 0)
  .map((id) => BigInt(id));

const maxSpam = parseInt(process.env.MAX_SPAM, 10) || 20;
const spamDelayMs = parseInt(process.env.SPAM_DELAY_MS, 10) || 1000;

const dbPath = path.join(__dirname, 'data', 'database.sqlite');

module.exports = {
  apiId,
  apiHash,
  sessionString,
  ownerIds,
  maxSpam,
  spamDelayMs,
  dbPath,
};
