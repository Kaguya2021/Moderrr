const { Api } = require('telegram');
const database = require('./database');
const { getClient } = require('./telegram');
const { logInfo, logWarn, logError } = require('./utils');

async function handleIncomingMessage(event) {
  const message = event.message;
  if (!message || message.out) return;

  const client = getClient();
  const senderId = message.senderId;

  if (!senderId || !message.isPrivate) return;

  const userIdStr = senderId.toString();

  try {
    const userRecord = await database.getUser(userIdStr);

    if (!userRecord) return;

    if (userRecord.mute_until > 0) {
      const now = Date.now();

      if (now < userRecord.mute_until) {
        logInfo(`Обнаружено сообщение от замьюченного пользователя ${userIdStr}. Удаление...`);

        try {
          await client.deleteMessages(message.peerId, [message.id], { revoke: true });
          logInfo(`Сообщение ${message.id} от ${userIdStr} успешно удалено.`);
        } catch (err) {
          if (err.errorMessage === 'MESSAGE_DELETE_FORBIDDEN') {
            logWarn(`Не удалось удалить сообщение ${message.id}: истёк лимит времени удаления в личных сообщениях.`);
          } else {
            logError(`Ошибка при удалении сообщения замьюченного пользователя ${userIdStr}`, err);
          }
        }
      } else {
        await database.removeMute(userIdStr);
        logInfo(`Срок действия мута для ${userIdStr} истёк. Пользователь автоматически размьючен.`);
      }
    }
  } catch (err) {
    logError(`Ошибка при обработке входящей модерации для сообщения ${message.id}`, err);
  }
}

async function blockUser(userId) {
  const client = getClient();
  try {
    const entity = await client.getEntity(userId);
    await client.invoke(new Api.contacts.Block({ id: entity }));
    return true;
  } catch (err) {
    logError(`Ошибка MTProto при блокировке пользователя ${userId}`, err);
    throw err;
  }
}

module.exports = {
  handleIncomingMessage,
  blockUser,
};
