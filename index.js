const { NewMessage, CallbackQuery } = require('telegram/events');
const config = require('./config');
const database = require('./database');
const telegram = require('./telegram');
const moderation = require('./moderation');
const commands = require('./commands');
const { logInfo, logError, sleep } = require('./utils');

async function startApp() {
  try {
    logInfo('Запуск Telegram Chat Manager...');

    await database.initDatabase();

    const client = await telegram.initTelegramClient();

    client.addEventHandler(moderation.handleIncomingMessage, new NewMessage({ incoming: true }));
    client.addEventHandler(commands.handleCommand, new NewMessage({ outgoing: true }));
    client.addEventHandler(commands.handleCallbackQuery, new CallbackQuery());

    logInfo('Слушатели событий Telegram MTProto успешно зарегистрированы');

    setInterval(async () => {
      try {
        await database.cleanExpiredMutes();
      } catch (err) {
        logError('Ошибка при плановой очистке мутов', err);
      }
    }, 30000);

    logInfo('Система автоматизации успешно запущена и готова к работе!');
  } catch (err) {
    logError('Критическая ошибка при запуске приложения', err);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  logError('Неперехваченное исключение (uncaughtException)', err);
});

process.on('unhandledRejection', (reason) => {
  logError('Необработанный отказ Промиса (unhandledRejection)', reason);
});

startApp();
