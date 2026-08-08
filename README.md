# Telegram Chat Manager (MTProto Userbot)

Полноценная система автоматизации и модерации личных чатов Telegram на базе **Node.js**, библиотеки **GramJS** и протокола **MTProto**.

---

## 🚀 Требования

- **Node.js**: Версия `18.0.0` или выше.
- **Telegram API Credentials**: `API_ID` и `API_HASH`.

---

## 🛠️ Инструкция по установке

### 1. Получение API ID и API HASH

1. Перейдите на официальный портал Telegram: [https://my.telegram.org](https://my.telegram.org).
2. Авторизуйтесь по номеру телефона.
3. Перейдите в раздел **"API development tools"**.
4. Создайте новое приложение (заполните любое имя и короткое имя).
5. Сохраните полученные **`api_id`** и **`api_hash`**.

---

### 2. Подготовка проекта

Создайте директорию, установите зависимости и подготовьте `.env` файл:

```bash
npm install
cp .env.example .env
