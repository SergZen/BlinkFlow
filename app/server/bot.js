import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const TelegramBotModule = require('node-telegram-bot-api');
const TelegramBot = TelegramBotModule.default || TelegramBotModule;

// In-memory conversation state
// Key: chatId, Value: { step: string, dealData: any, lastActive: number }
const conversations = new Map();

// Session TTL: 1 hour
const SESSION_TTL = 60 * 60 * 1000;

function cleanupSessions() {
  const now = Date.now();
  for (const [chatId, session] of conversations.entries()) {
    if (now - session.lastActive > SESSION_TTL) {
      conversations.delete(chatId);
    }
  }
}

function setupBot(app, baseUrl, dealsData) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN not found. Telegram bot webhook will not be initialized.");
    return;
  }

  // Create a bot that uses 'webhook'
  const bot = new TelegramBot(token, { webHook: true });

  // Webhook endpoint
  app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  bot.onText(/^\/deal(?: (.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const dealId = match[1];

    if (!dealId) {
      bot.sendMessage(chatId, "Please provide a deal ID. Usage: /deal ESC-1001").catch(err => console.error("Telegram API Error:", err));
      return;
    }

    const foundDeal = dealsData.find(d => d.id === dealId);

    if (foundDeal) {
      const rawActionUrl = `${baseUrl}/deal/${dealId}`;
      const ogImageUrl = `${baseUrl}/api/deal/${dealId}/og-image.png`;
      
      const caption = `*${foundDeal.title}*\n\n` +
                      `💰 Amount: ${foundDeal.amount} USDC\n` +
                      `📊 Status: ${foundDeal.status}\n` +
                      `📅 Deadline: ${foundDeal.deadline}\n\n` +
                      `Share this Blink with your counterparty or open it on the website.`;

      bot.sendPhoto(chatId, ogImageUrl, {
        caption,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[ { text: "Open Deal", url: rawActionUrl } ]]
        }
      }).catch(err => {
        console.error("Failed to send photo in Telegram:", err);
        bot.sendMessage(chatId, caption + "\n\nLink: " + rawActionUrl, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[ { text: "Open Deal", url: rawActionUrl } ]] }
        }).catch(err => console.error("Telegram API Error:", err));
      });
    } else {
      bot.sendMessage(chatId, `Deal not found. This might be a deal created after this bot session — try opening it on the website instead:\n${baseUrl}/deal/${dealId}`).catch(err => console.error("Telegram API Error:", err));
    }
  });

  bot.onText(/^\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
      chatId, 
      "Welcome to **BlinkFlow** — the trust layer for deals made in chat.\n\n" +
      "I can help you create a secure escrow deal via Solana Blinks right here. " +
      "Use /newdeal to get started, or visit our website for more info.",
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[ { text: "Visit Website", url: baseUrl } ]] } }
    ).catch(err => console.error("Telegram API Error:", err));
  });

  bot.onText(/^\/newdeal/, (msg) => {
    const chatId = msg.chat.id;
    conversations.set(chatId, {
      step: 'AWAITING_TITLE',
      dealData: {},
      lastActive: Date.now()
    });

    bot.sendMessage(chatId, "Let's create a new deal! What is the title of the deal?").catch(err => console.error("Telegram API Error:", err));
  });

  bot.on('message', (msg) => {
    // Ignore commands
    if (msg.text && msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const session = conversations.get(chatId);

    if (!session) return;

    cleanupSessions();
    session.lastActive = Date.now();

    const text = msg.text ? msg.text.trim() : '';

    switch (session.step) {
      case 'AWAITING_TITLE':
        if (!text) {
          bot.sendMessage(chatId, "Title cannot be empty. Please enter a valid title:").catch(err => console.error("Telegram API Error:", err));
          return;
        }
        session.dealData.title = text;
        session.step = 'AWAITING_AMOUNT';
        bot.sendMessage(chatId, "Great! Now, what is the amount in USDC-Dev? (e.g. 100)").catch(err => console.error("Telegram API Error:", err));
        break;

      case 'AWAITING_AMOUNT':
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) {
          bot.sendMessage(chatId, "Please enter a valid positive number for the amount:").catch(err => console.error("Telegram API Error:", err));
          return;
        }
        session.dealData.amount = amount;
        session.step = 'AWAITING_DEADLINE_DAYS';
        bot.sendMessage(chatId, "Got it. How many days until the deadline? (e.g. 7 for a week)").catch(err => console.error("Telegram API Error:", err));
        break;

      case 'AWAITING_DEADLINE_DAYS':
        const days = parseInt(text, 10);
        if (isNaN(days) || days <= 0) {
          bot.sendMessage(chatId, "Please enter a valid positive whole number of days:").catch(err => console.error("Telegram API Error:", err));
          return;
        }
        
        const dealId = `ESC-${Math.floor(1000 + Math.random() * 9000)}`;
        
        // Build the raw action URL for the Deal Details page with virtual deal query parameters
        const queryParams = new URLSearchParams({
          title: session.dealData.title,
          amount: session.dealData.amount.toString(),
          token: 'USDC-Dev',
          status: 'Awaiting Funding'
        }).toString();

        const rawActionUrl = `${baseUrl}/deal/${dealId}?${queryParams}`;
        const ogImageUrl = `${baseUrl}/api/deal/${dealId}/og-image.png?${queryParams}`;

        bot.sendPhoto(chatId, ogImageUrl, {
          caption: "✅ Deal created! Share this Blink with your counterparty by forwarding this message, or by sending them the link below.",
          reply_markup: {
            inline_keyboard: [[ { text: "Open Deal", url: rawActionUrl } ]]
          }
        }).catch(err => {
          console.error("Failed to send photo in Telegram:", err);
          // Fallback if image fails to generate/send
          bot.sendMessage(chatId, "✅ Deal created!\n\nLink: " + rawActionUrl, {
            reply_markup: { inline_keyboard: [[ { text: "Open Deal", url: rawActionUrl } ]] }
          }).catch(err => console.error("Telegram API Error:", err));
        });

        // End conversation
        conversations.delete(chatId);
        break;
    }
  });
}

export { setupBot };
