const { Api } = require('telegram');
const config = require('./config');
const database = require('./database');
const moderation = require('./moderation');
const { getClient } = require('./telegram');
const { logInfo, logWarn, logError, sleep, formatTimeString } = require('./utils');

function isOwner(senderId) {
  if (!senderId) return false;
  const id = BigInt(senderId.toString());
  return config.ownerIds.some((ownerId) => ownerId === id);
}

async function handleCommand(event) {
  const message = event.message;
  if (!message || !message.out) return;

  const text = message.text ? message.text.trim() : '';
  if (!text.startsWith('.')) return;

  const senderId = message.senderId || (await message.getSender())?.id;
  if (!isOwner(senderId)) return;

  if (!message.isPrivate) return;

  const client = getClient();
  const chatId = message.peerId;
  const peerUser = await client.getEntity(chatId);

  if (!peerUser || peerUser.className !== 'User') {
    return;
  }

  const targetUser = peerUser;
  const targetUserId = targetUser.id.toString();

  await database.upsertUser(targetUser, targetUserId);

  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase();

  try {
    switch (command) {
      case '.mute':
        await processMuteCommand(client, message, targetUser, parts.slice(1));
        break;
      case '.unmute':
        await processUnmuteCommand(client, message, targetUser);
        break;
      case '.ban':
        await processBanCommand(client, message, targetUser, text.substring(command.length).trim());
        break;
      case '.spam':
        await processSpamCommand(client, message, parts.slice(1));
        break;
      case '.info':
        await processInfoCommand(client, message, targetUser);
        break;
      case '.menu':
        await processMenuCommand(client, message, targetUser);
        break;
    }
  } catch (err) {
    logError(`Ошибка выполнения команды ${command}`, err);
  }
}

async function processMuteCommand(client, message, targetUser, args) {
  if (args.length === 0) {
    await sendTempResponse(client, message.peerId, `❌ Использование:\n.mute <минуты>\n\nНапример:\n.mute 5`);
    await deleteMessage(client, message.peerId, message.id);
    return;
  }

  const minutes = parseInt(args[0], 10);

  if (isNaN(minutes)) {
    await sendTempResponse(client, message.peerId, `❌ Время должно быть числом.`);
    await deleteMessage(client, message.peerId, message.id);
    return;
  }

  if (minutes <= 0) {
    await sendTempResponse(client, message.peerId, `❌ Время должно быть положительным.`);
    await deleteMessage(client, message.peerId, message.id);
    return;
  }

  const now = Date.now();
  const muteUntilMs = now + minutes * 60 * 1000;
  const endDate = new Date(muteUntilMs);

  await database.setMute(targetUser.id, message.peerId, muteUntilMs);
  await deleteMessage(client, message.peerId, message.id);

  const usernameText = targetUser.username ? `@${targetUser.username}` : 'Отсутствует';
  const responseText = `🔇 **Мут активирован**\n\nСобеседник заглушен на **${minutes}** минут.\n\nПользователь: ${usernameText}\nID: \`${targetUser.id}\` \n\nВремя окончания: **${formatTimeString(endDate)}**`;

  const replyMarkup = new Api.ReplyInlineMarkup({
    rows: [
      new Api.KeyboardButtonRow({
        buttons: [
          new Api.KeyboardButtonCallback({
            text: '🔊 Снять мут',
            data: Buffer.from(`unmute:${targetUser.id}`),
          }),
        ],
      }),
    ],
  });

  await client.sendMessage(message.peerId, {
    message: responseText,
    buttons: replyMarkup,
  });

  logInfo(`Мут активирован для пользователя ${targetUser.id} на ${minutes} минут.`);
}

async function processUnmuteCommand(client, message, targetUser) {
  const userRecord = await database.getUser(targetUser.id);
  await deleteMessage(client, message.peerId, message.id);

  if (!userRecord || userRecord.mute_until <= Date.now()) {
    await client.sendMessage(message.peerId, {
      message: `ℹ️ Пользователь сейчас не замьючен.`,
    });
    return;
  }

  await database.removeMute(targetUser.id);

  const replyMarkup = new Api.ReplyInlineMarkup({
    rows: [
      new Api.KeyboardButtonRow({
        buttons: [
          new Api.KeyboardButtonCallback({
            text: '🔇 Замутить снова',
            data: Buffer.from(`mute_prompt:${targetUser.id}`),
          }),
        ],
      }),
    ],
  });

  await client.sendMessage(message.peerId, {
    message: `🔊 **Мут снят**\n\nТеперь пользователь снова может отправлять сообщения.`,
    buttons: replyMarkup,
  });

  logInfo(`Мут успешно снят с пользователя ${targetUser.id}.`);
}

async function processBanCommand(client, message, targetUser, reason) {
  if (!reason) {
    reason = 'Не указана';
  }

  await deleteMessage(client, message.peerId, message.id);

  try {
    await moderation.blockUser(targetUser.id);
    await database.setBanStatus(targetUser.id, message.peerId, true);

    const sentMessage = await client.sendMessage(message.peerId, {
      message: `🚫 **Пользователь заблокирован**\n\nПричина:\n${reason}`,
    });

    logInfo(`Пользователь ${targetUser.id} заблокирован по причине: ${reason}`);

    setTimeout(async () => {
      await deleteMessage(client, message.peerId, sentMessage.id);
    }, 10000);
  } catch (err) {
    await client.sendMessage(message.peerId, {
      message: `⚠️ Не удалось заблокировать пользователя через MTProto API. Состояние обновлено в локальной базе.`,
    });
  }
}

async function processSpamCommand(client, message, args) {
  if (args.length < 2) {
    await sendTempResponse(client, message.peerId, `❌ Использование:\n.spam <количество> <текст>`);
    await deleteMessage(client, message.peerId, message.id);
    return;
  }

  const count = parseInt(args[0], 10);
  const textToSend = args.slice(1).join(' ');

  if (isNaN(count)) {
    await sendTempResponse(client, message.peerId, `❌ Количество сообщений должно быть числом.`);
    await deleteMessage(client, message.peerId, message.id);
    return;
  }

  if (count <= 0) {
    await sendTempResponse(client, message.peerId, `❌ Количество сообщений должно быть больше 0.`);
    await deleteMessage(client, message.peerId, message.id);
    return;
  }

  if (count > config.maxSpam) {
    await sendTempResponse(
      client,
      message.peerId,
      `❌ Превышен лимит! Максимально разрешено отправлять: ${config.maxSpam} сообщений.`
    );
    await deleteMessage(client, message.peerId, message.id);
    return;
  }

  await deleteMessage(client, message.peerId, message.id);

  logInfo(`Запуск рассылки из ${count} сообщений в чат ${message.peerId.userId}`);

  for (let i = 0; i < count; i++) {
    await client.sendMessage(message.peerId, { message: textToSend });
    await sleep(config.spamDelayMs);
  }
}

async function processInfoCommand(client, message, targetUser) {
  await deleteMessage(client, message.peerId, message.id);

  const userRecord = await database.getUser(targetUser.id);
  const isMuted = userRecord && userRecord.mute_until > Date.now();
  const muteUntilStr = isMuted ? formatTimeString(new Date(userRecord.mute_until)) : 'Нет';

  const infoText = `👤 **Информация о собеседнике**\n\n` +
    `Имя: ${targetUser.firstName || ''} ${targetUser.lastName || ''}\n` +
    `Username: ${targetUser.username ? '@' + targetUser.username : 'Отсутствует'}\n` +
    `Telegram ID: \`${targetUser.id}\` \n` +
    `Chat ID: \`${message.peerId.userId}\` \n` +
    `Статус мута: ${isMuted ? 'Заглушен 🔇' : 'Активен 🔊'}\n` +
    `Окончание мута: ${muteUntilStr}`;

  await client.sendMessage(message.peerId, { message: infoText });
}

async function processMenuCommand(client, message, targetUser) {
  await deleteMessage(client, message.peerId, message.id);

  const replyMarkup = new Api.ReplyInlineMarkup({
    rows: [
      new Api.KeyboardButtonRow({
        buttons: [
          new Api.KeyboardButtonCallback({ text: '🔇 Мут', data: Buffer.from(`menu_mute:${targetUser.id}`) }),
          new Api.KeyboardButtonCallback({ text: '🔊 Размут', data: Buffer.from(`unmute:${targetUser.id}`) }),
        ],
      }),
      new Api.KeyboardButtonRow({
        buttons: [
          new Api.KeyboardButtonCallback({ text: '🚫 Бан', data: Buffer.from(`menu_ban:${targetUser.id}`) }),
          new Api.KeyboardButtonCallback({ text: '📢 Спам', data: Buffer.from(`menu_spam:${targetUser.id}`) }),
        ],
      }),
      new Api.KeyboardButtonRow({
        buttons: [
          new Api.KeyboardButtonCallback({ text: '👤 Информация', data: Buffer.from(`info:${targetUser.id}`) }),
        ],
      }),
    ],
  });

  await client.sendMessage(message.peerId, {
    message: `⚙️ **Управление чатом**`,
    buttons: replyMarkup,
  });
}

async function handleCallbackQuery(event) {
  const query = event.query;
  if (!query || !query.data) return;

  const senderId = query.userId;
  if (!isOwner(senderId)) {
    await query.answer({ message: '⚠️ У вас нет прав для управления этой системой.', alert: true });
    return;
  }

  const dataStr = query.data.toString();
  const [action, targetUserIdStr] = dataStr.split(':');
  const client = getClient();

  try {
    if (action === 'unmute') {
      await database.removeMute(targetUserIdStr);
      await query.answer({ message: 'Мут успешно снят!' });
      await client.sendMessage(query.peer, { message: '🔊 Мут снят через меню управления.' });
    } else if (action === 'mute_prompt' || action === 'menu_mute') {
      const replyMarkup = new Api.ReplyInlineMarkup({
        rows: [
          new Api.KeyboardButtonRow({
            buttons: [
              new Api.KeyboardButtonCallback({ text: '1 мин', data: Buffer.from(`set_mute:1:${targetUserIdStr}`) }),
              new Api.KeyboardButtonCallback({ text: '5 мин', data: Buffer.from(`set_mute:5:${targetUserIdStr}`) }),
              new Api.KeyboardButtonCallback({ text: '10 мин', data: Buffer.from(`set_mute:10:${targetUserIdStr}`) }),
            ],
          }),
          new Api.KeyboardButtonRow({
            buttons: [
              new Api.KeyboardButtonCallback({ text: '30 мин', data: Buffer.from(`set_mute:30:${targetUserIdStr}`) }),
              new Api.KeyboardButtonCallback({ text: '60 мин', data: Buffer.from(`set_mute:60:${targetUserIdStr}`) }),
            ],
          }),
        ],
      });

      await query.answer();
      await client.sendMessage(query.peer, {
        message: 'Выберите время мута:',
        buttons: replyMarkup,
      });
    } else if (action === 'set_mute') {
      const [, minutesStr, targetId] = dataStr.split(':');
      const minutes = parseInt(minutesStr, 10);
      const muteUntilMs = Date.now() + minutes * 60 * 1000;

      await database.setMute(targetId, query.peer.userId || query.peer, muteUntilMs);
      await query.answer({ message: `Установлен мут на ${minutes} мин.` });
      await client.sendMessage(query.peer, {
        message: `🔇 **Мут активирован** на ${minutes} минут.`,
      });
    } else if (action === 'menu_ban') {
      await moderation.blockUser(targetUserIdStr);
      await database.setBanStatus(targetUserIdStr, query.peer, true);
      await query.answer({ message: 'Пользователь заблокирован!' });
      await client.sendMessage(query.peer, { message: `🚫 Пользователь заблокирован.` });
    } else if (action === 'menu_spam') {
      await query.answer({ message: 'Используйте команду: .spam <кол-во> <текст>', alert: true });
    } else if (action === 'info') {
      const targetUser = await client.getEntity(targetUserIdStr);
      const userRecord = await database.getUser(targetUserIdStr);
      const isMuted = userRecord && userRecord.mute_until > Date.now();

      await query.answer();
      await client.sendMessage(query.peer, {
        message: `👤 **Информация о пользователя**\nID: \`${targetUser.id}\` \nСтатус мута: ${isMuted ? 'Заглушен' : 'Активен'}`,
      });
    }
  } catch (err) {
    logError('Ошибка при обработке нажатия кнопки (CallbackQuery)', err);
  }
}

async function sendTempResponse(client, peerId, text, timeoutMs = 5000) {
  try {
    const msg = await client.sendMessage(peerId, { message: text });
    setTimeout(() => {
      deleteMessage(client, peerId, msg.id);
    }, timeoutMs);
  } catch (err) {
    logError('Не удалось отправить временное сообщение', err);
  }
}

async function deleteMessage(client, peerId, messageId) {
  try {
    await client.deleteMessages(peerId, [messageId], { revoke: true });
  } catch (err) {
    if (err.errorMessage !== 'MESSAGE_DELETE_FORBIDDEN') {
      logWarn(`Сообщение ${messageId} не удалось удалить: ${err.message}`);
    }
  }
}

module.exports = {
  handleCommand,
  handleCallbackQuery,
};
