const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions/index.js");
const readline = require("readline");
const fs = require("fs");
const dotenv = require("dotenv");

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  const apiId = Number(process.env.API_ID);
  const apiHash = process.env.API_HASH;

  if (!apiId || !apiHash) {
    console.error("❌ Ошибка: API_ID или API_HASH не найдены в .env!");
    process.exit(1);
  }

  const stringSession = new StringSession("");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await question("📱 Введите номер телефона (например, +79...): "),
    password: async () => await question("🔐 Введите 2FA пароль (если включен, иначе Enter): "),
    phoneCode: async () => await question("📩 Введите код из Telegram: "),
    onError: (err) => console.log("Ошибка авторизации:", err.message),
  });

  console.log("\n✅ Успешная авторизация!");
  const newSession = client.session.save();

  let envContent = fs.readFileSync(".env", "utf8");
  if (envContent.includes("SESSION_STRING=")) {
    envContent = envContent.replace(/SESSION_STRING=.*/g, `SESSION_STRING="${newSession}"`);
  } else {
    envContent += `\nSESSION_STRING="${newSession}"`;
  }

  fs.writeFileSync(".env", envContent);
  console.log("🔑 Новая сессия автоматически сохранена в .env!");

  rl.close();
  await client.disconnect();
  process.exit(0);
}

main().catch(console.error);
