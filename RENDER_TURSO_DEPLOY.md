# Deploy to Render + Turso

This setup hosts the CRM on Render and stores data in Turso.

## 1. Create Turso database

Create a free Turso account and database, then copy:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

The app creates tables and seed data automatically on first start.

## 2. Create Render web service

Create a free Render Web Service from this repository.

Use these commands:

```bash
npm install && npm run build
```

```bash
node --no-warnings server/index.mjs
```

Or use the included `render.yaml` blueprint.

## 3. Add Render environment variables

Required:

```env
NODE_ENV=production
COOKIE_SECURE=true
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ADMIN_IDS=...
TELEGRAM_TEACHER_IDS=...
TELEGRAM_SMM_IDS=...
```

Optional:

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash
GEMINI_SEARCH=true
```

## 4. Connect Telegram

After Render deploys, copy the Render URL, for example:

```text
https://level-up-camp-crm.onrender.com
```

Open `@BotFather`, select your bot, configure the Mini App/Web App URL, and paste the Render URL.

Allowed Telegram users will be signed into the CRM automatically based on the IDs in:

- `TELEGRAM_ADMIN_IDS`
- `TELEGRAM_TEACHER_IDS`
- `TELEGRAM_SMM_IDS`
