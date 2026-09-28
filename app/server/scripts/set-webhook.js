import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the app root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set in .env");
  process.exit(1);
}

const bot = new TelegramBot(token);

// Replace this with your actual Railway production URL once deployed
const WEBHOOK_URL = process.env.VITE_ACTIONS_API_URL || 'https://blinkflow-server-production.up.railway.app';
const fullUrl = `${WEBHOOK_URL}/webhook`;

bot.setWebHook(fullUrl, { allowed_updates: ['message', 'callback_query'] })
  .then(() => {
    console.log(`Webhook successfully set to: ${fullUrl}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to set webhook:", err);
    process.exit(1);
  });
