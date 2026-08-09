const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events/NewMessage");
const dotenv = require("dotenv");
const database = require("./database.js");

dotenv.config();

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.SESSION_STRING || "");

const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
});

async function deleteMessage(peerId, messageId) {
  try {
    await client.deleteMessages(peerId, [messageId], { revoke: true });
  } catch (err) {}
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (database.initDatabase) {
    await database.initDatabase();
  }

  await client.connect();
  console.log("--------------------------------------------------");
  console.log("🚀 Юзербот успешно запущен и слушает команды!");
  console.log("--------------------------------------------------");

  // 1. Обработка ВХОДЯЩИХ сообщений (для мута)
  client.addEventHandler(async (event) => {
    const message = event.message;
    if (!message || message.out) return;

    const chatId = message.peerId;
    if (message.senderId && database.getUser) {
      const senderIdStr = message.senderId.toString();
      const record = await database.getUser(senderIdStr);
      if (record && record.mute_until && record.mute_until > Date.now()) {
        await deleteMessage(chatId, message.id);
      }
    }
  }, new NewMessage({ incoming: true }));

  // 2. Обработка ИСХОДЯЩИХ команд (.mute, .ban, .spam, .info, .menu)
  client.addEventHandler(async (event) => {
    const message = event.message;
    if (!message || !message.text) return;

    const text = message.text.trim();
    if (!text.startsWith(".") && !text.startsWith("/")) return;

    const chatId = message.peerId;
    let peerUser;
    try {
      peerUser = await client.getEntity(chatId);
    } catch (e) {}

    const parts = text.split(/\s+/);
    const rawCmd = parts[0].toLowerCase();
    const command = rawCmd.slice(1);
    const targetUser = peerUser || { id: chatId?.userId || chatId, firstName: "Пользователь" };
    const targetUserId = targetUser.id ? targetUser.id.toString() : chatId.toString();

    try {
      if (command === "mute") {
        const minutes = parseInt(parts[1], 10);
        if (isNaN(minutes) || minutes <= 0) {
          await deleteMessage(chatId, message.id);
          await client.sendMessage(chatId, { message: "❌ Использование: `.mute 5`" });
          return;
        }
        const muteUntilMs = Date.now() + minutes * 60 * 1000;
        if (database.setMute) await database.setMute(targetUserId, chatId, muteUntilMs);
        await deleteMessage(chatId, message.id);
        await client.sendMessage(chatId, { message: `🔇 **Пользователь замучен на ${minutes} мин.**` });

      } else if (command === "unmute") {
        await deleteMessage(chatId, message.id);
        if (database.removeMute) await database.removeMute(targetUserId);
        await client.sendMessage(chatId, { message: "🔊 **Мут снят.**" });

      } else if (command === "ban") {
        const reason = parts.slice(1).join(" ") || "Без причины";
        await deleteMessage(chatId, message.id);
        try {
          await client.invoke(new Api.contacts.Block({ id: targetUser }));
        } catch (e) {}
        if (database.setBanStatus) await database.setBanStatus(targetUserId, chatId, true);
        await client.sendMessage(chatId, { message: `🚫 **Пользователь заблокирован!**\nПричина: ${reason}` });

      } else if (command === "spam") {
        const count = parseInt(parts[1], 10);
        const spamText = parts.slice(2).join(" ");
        await deleteMessage(chatId, message.id);

        if (isNaN(count) || count <= 0 || !spamText) {
          await client.sendMessage(chatId, { message: "❌ Использование: `.spam 5 Текст`" });
          return;
        }

        for (let i = 0; i < count; i++) {
          await client.sendMessage(chatId, { message: spamText });
          await sleep(400);
        }

      } else if (command === "info") {
        await deleteMessage(chatId, message.id);
        let isMuted = false;
        if (database.getUser) {
          const record = await database.getUser(targetUserId);
          if (record && record.mute_until > Date.now()) isMuted = true;
        }
        await client.sendMessage(chatId, {
          message: `👤 **Информация**\nИмя: ${targetUser.firstName || ''}\nID: \`${targetUserId}\` \nСтатус: ${isMuted ? 'Заглушен 🔇' : 'Активен 🔊'}`,
        });

      } else if (command === "menu") {
        await deleteMessage(chatId, message.id);
        const replyMarkup = new Api.ReplyInlineMarkup({
          rows: [
            new Api.KeyboardButtonRow({
              buttons: [
                new Api.KeyboardButtonCallback({ text: '🔇 Мут', data: Buffer.from(`menu_mute:${targetUserId}`) }),
                new Api.KeyboardButtonCallback({ text: '🔊 Размут', data: Buffer.from(`unmute:${targetUserId}`) }),
              ],
            }),
            new Api.KeyboardButtonRow({
              buttons: [
                new Api.KeyboardButtonCallback({ text: '🚫 Бан', data: Buffer.from(`menu_ban:${targetUserId}`) }),
                new Api.KeyboardButtonCallback({ text: '📢 Спам', data: Buffer.from(`menu_spam:${targetUserId}`) }),
              ],
            }),
            new Api.KeyboardButtonRow({
              buttons: [
                new Api.KeyboardButtonCallback({ text: '👤 Info', data: Buffer.from(`info:${targetUserId}`) }),
              ],
            }),
          ],
        });
        await client.sendMessage(chatId, { message: "⚙️ **Управление чатом:**", buttons: replyMarkup });
      }
    } catch (err) {
      console.error("Ошибка команды:", err);
    }
  }, new NewMessage({ outgoing: true }));

  // 3. Обработка нажатий на инлайн-кнопки
  client.addEventHandler(async (event) => {
    if (event.query && event.query.data) {
      const query = event.query;
      const [action, targetUserId] = query.data.toString().split(':');

      try {
        if (action === 'unmute') {
          if (database.removeMute) await database.removeMute(targetUserId);
          await query.answer({ message: 'Мут снят!' });
          await client.sendMessage(query.peer, { message: '🔊 **Мут снят.**' });
        } else if (action === 'info') {
          await query.answer();
          await client.sendMessage(query.peer, { message: `ID пользователя: \`${targetUserId}\`` });
        } else if (action === 'menu_mute') {
          await query.answer();
          await client.sendMessage(query.peer, { message: 'Укажите время командой: `.mute <минуты>`' });
        } else if (action === 'menu_ban') {
          try {
            await client.invoke(new Api.contacts.Block({ id: targetUserId }));
          } catch (e) {}
          if (database.setBanStatus) await database.setBanStatus(targetUserId, query.peer, true);
          await query.answer({ message: 'Заблокирован!' });
          await client.sendMessage(query.peer, { message: '🚫 **Пользователь заблокирован.**' });
        } else if (action === 'menu_spam') {
          await query.answer({ message: 'Используйте команду: .spam <кол-во> <текст>', alert: true });
        }
      } catch (err) {
        console.error("Ошибка кнопки:", err);
      }
    }
  });
}

main().catch(console.error);

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

