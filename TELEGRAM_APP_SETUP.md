# Telegram Mini App setup

CRM is ready to run inside Telegram as a Mini App.

## 1. Create a Telegram bot

Open Telegram, message `@BotFather`, create a bot, and copy the bot token.

## 2. Configure `.env`

Put the bot token into `.env`:

```env
TELEGRAM_BOT_TOKEN=123456:ABC...
```

Add Telegram user IDs that may enter the CRM. IDs are mapped to the existing CRM roles:

```env
TELEGRAM_ADMIN_IDS=111111111
TELEGRAM_TEACHER_IDS=222222222,333333333
TELEGRAM_SMM_IDS=444444444
```

You can get your Telegram ID from bots such as `@userinfobot`.

## 3. Start the app

```bash
npm run app
```

## 4. Publish on HTTPS

Telegram Mini Apps require a public HTTPS URL. `localhost` and local Wi-Fi addresses do not work inside Telegram.

After publishing, open `@BotFather`, go to your bot settings, and set the Mini App/Web App URL to your public HTTPS app URL.

When an allowed user opens the app from Telegram, the server verifies Telegram's signed `initData` and signs the user into the matching CRM role automatically.
