const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { logInfo, logError, promptInput } = require('./utils');

let client = null;

async function saveSessionToEnv(sessionStr) {
  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = '';

    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    if (envContent.includes('SESSION_STRING=')) {
      envContent = envContent.replace(/SESSION_STRING=.*/g, `SESSION_STRING="${sessionStr}"`);
    } else {
      envContent += `\nSESSION_STRING="${sessionStr}"`;
    }

    fs.writeFileSync(envPath, envContent, 'utf8');
    logInfo('Новая SESSION_STRING успешно сохранена в файл .env');
  } catch (err) {
    logError('Не удалось автоматически записать SESSION_STRING в .env', err);
  }
}

async function initTelegramClient() {
  const stringSession = new StringSession(config.sessionString);

  client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
    connectionRetries: 5,
  });

  logInfo('Подключение к Telegram MTProto API...');

  await client.start({
    phoneNumber: async () => await promptInput('Введите ваш номер телефона (в международном формате): '),
    password: async () => await promptInput('Введите пароль двухэтапной аутентификации (2FA): '),
    phoneCode: async () => await promptInput('Введите код подтверждения из Telegram: '),
    onError: (err) => logError('Ошибка в процессе авторизации', err),
  });

  logInfo('Успешное подключение к Telegram!');

  const currentSession = client.session.save();
  if (currentSession !== config.sessionString) {
    await saveSessionToEnv(currentSession);
  }

  const me = await client.getMe();
  logInfo(`Авторизован аккаунт: ${me.firstName} (ID: ${me.id})`);

  if (config.ownerIds.length === 0) {
    config.ownerIds.push(BigInt(me.id.toString()));
    logInfo(`OWNER_IDS не был передан в .env. Ваш ID (${me.id}) автоматически установлен как владелец.`);
  }

  return client;
}

function getClient() {
  if (!client) {
    throw new Error('Telegram client ещё не инициализирован!');
  }
  return client;
}

module.exports = {
  initTelegramClient,
  getClient,
};
