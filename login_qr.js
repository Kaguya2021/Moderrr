const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions/index.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const dotenv = require("dotenv");

dotenv.config();

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;

async function main() {
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();

  console.log("🔄 Генерируем QR-код для входа...");

  await client.signInUserWithQrCode(
    { apiId, apiHash },
    {
      qrCode: async (code) => {
        const url = `tg://login?token=${code.token.toString("base64url")}`;
        console.clear();
        console.log("==========================================");
        console.log("📸 Отсканируй QR-код через Telegram:");
        console.log("Настройки -> Устройства -> Подключить устройство");
        console.log("==========================================\n");
        qrcode.generate(url, { small: true });
      },
      password: async (hint) => {
        const readline = require("readline").createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        return new Promise((resolve) => {
          readline.question(`🔐 Введите 2FA пароль (${hint || "Облачный пароль"}): `, (pass) => {
            readline.close();
            resolve(pass);
          });
        });
      },
    }
  );

  console.log("\n✅ Успешная авторизация по QR-коду!");
  const newSession = client.session.save();

  let envContent = fs.readFileSync(".env", "utf8");
  if (envContent.includes("SESSION_STRING=")) {
    envContent = envContent.replace(/SESSION_STRING=.*/g, `SESSION_STRING="${newSession}"`);
  } else {
    envContent += `\nSESSION_STRING="${newSession}"`;
  }

  fs.writeFileSync(".env", envContent);
  console.log("🔑 Новая сессия сохранена в .env!");
  process.exit(0);
}

main().catch(console.error);
