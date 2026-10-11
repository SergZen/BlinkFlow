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

function escapeMarkdown(text) {
  return text.replace(/([_*`\[\]])/g, '\\$1');
}

function setupBot(app, baseUrl, frontendUrl, dealsData) {
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

  try {
    bot.setMyCommands([
      { command: 'start', description: 'Main menu' },
      { command: 'newdeal', description: 'Create a deal' },
      { command: 'deal', description: 'Find a deal by ID' },
      { command: 'cancel', description: 'Cancel' }
    ]).catch(err => console.error("Failed to set commands:", err));
  } catch (e) {
    console.error(e);
  }

  const showMenu = (chatId) => {
    bot.sendMessage(
      chatId, 
      "Welcome to *BlinkFlow* — the trust layer for deals made in chat.\n\n" +
      "Create and track escrow deals on Solana. " +
      "Use /newdeal to get started, or visit our website for more info.",
      { 
        parse_mode: 'Markdown', 
        reply_markup: { 
          inline_keyboard: [
            [{ text: "➕ New deal", callback_data: "nd" }, { text: "📂 Demo deals", callback_data: "demo" }],
            [{ text: "🌐 Website", url: frontendUrl }, { text: "ℹ️ How it works", callback_data: "how" }]
          ] 
        } 
      }
    ).catch(err => console.error("Telegram API Error:", err));
  };

  bot.onText(/^\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "👇 Choose an option below:", {
      reply_markup: {
        keyboard: [
          ["➕ New deal", "📂 Demo deals"],
          ["ℹ️ How it works", "🌐 Website"]
        ],
        resize_keyboard: true,
        is_persistent: true
      }
    }).then(() => {
      showMenu(chatId);
    }).catch(err => console.error("Telegram API Error:", err));
  });

  bot.onText(/^\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    conversations.delete(chatId);
    showMenu(chatId);
  });

  const sendDemoDeals = (chatId) => {
    const keyboard = dealsData.map(d => ([{ text: `${d.title} · ${d.id}`, callback_data: `dl:${d.id}` }]));
    bot.sendMessage(chatId, "Select a demo deal:", {
      reply_markup: { inline_keyboard: keyboard }
    }).catch(err => console.error("Telegram API Error:", err));
  };

  const sendHowItWorks = (chatId) => {
    bot.sendMessage(
      chatId,
      "ℹ️ *How it works*\n" +
      "1. Customer creates a deal on the BlinkFlow site and locks USDC in escrow.\n" +
      "2. Customer shares the deal link in any chat or social network.\n" +
      "3. Contractors open the link and apply; the customer picks one.\n" +
      "4. Contractor accepts, does the work and marks it finished.\n" +
      "5. Customer approves and the payment is released. If there is a disagreement, an arbiter decides.",
      { parse_mode: 'Markdown' }
    ).catch(err => console.error("Telegram API Error:", err));
  };

  bot.onText(/^\/deal(?: (.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const dealId = match[1];

    if (!dealId) {
      sendDemoDeals(chatId);
      return;
    }

    sendDealCard(chatId, dealId);
  });

  const sendDealCard = (chatId, dealId) => {
    const foundDeal = dealsData.find(d => d.id === dealId);

    if (foundDeal) {
      const rawActionUrl = `${baseUrl}/deal/${dealId}`;
      const ogImageUrl = `${baseUrl}/api/deal/${dealId}/og-image.png`;
      
      const caption = `*${escapeMarkdown(foundDeal.title)}*\n\n` +
                      `💰 Amount: ${foundDeal.amount} USDC\n` +
                      `📊 Status: ${foundDeal.status}\n` +
                      `📅 Deadline: ${foundDeal.deadline}\n\n` +
                      `Share this deal link with your counterparty or open it on the website.`;

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
  };

  const startNewDeal = (chatId) => {
    conversations.set(chatId, {
      step: 'AWAITING_TITLE',
      dealData: {},
      lastActive: Date.now()
    });

    bot.sendMessage(chatId, "Let's create a new deal! What is the title of the deal?", {
      reply_markup: { inline_keyboard: [[ { text: "❌ Cancel", callback_data: "cancel" } ]] }
    }).catch(err => console.error("Telegram API Error:", err));
  };

  bot.onText(/^\/newdeal/, (msg) => {
    startNewDeal(msg.chat.id);
  });

  bot.on('message', (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : '';

    if (text === "➕ New deal") {
      conversations.delete(chatId);
      startNewDeal(chatId);
      return;
    }
    if (text === "📂 Demo deals") {
      conversations.delete(chatId);
      sendDemoDeals(chatId);
      return;
    }
    if (text === "ℹ️ How it works") {
      conversations.delete(chatId);
      sendHowItWorks(chatId);
      return;
    }
    if (text === "🌐 Website") {
      conversations.delete(chatId);
      bot.sendMessage(chatId, frontendUrl).catch(err => console.error("Telegram API Error:", err));
      return;
    }

    const session = conversations.get(chatId);

    if (!session) return;

    cleanupSessions();
    session.lastActive = Date.now();

    switch (session.step) {
      case 'AWAITING_TITLE':
        if (!text) {
          bot.sendMessage(chatId, "Title cannot be empty. Please enter a valid title:").catch(err => console.error("Telegram API Error:", err));
          return;
        }
        if (text.length > 100) {
          bot.sendMessage(chatId, "Title is too long (max 100 characters). Please try again:").catch(err => console.error("Telegram API Error:", err));
          return;
        }
        session.dealData.title = text;
        session.step = 'AWAITING_AMOUNT';
        bot.sendMessage(chatId, "Great! Now, what is the amount in USDC-Dev? (e.g. 100)", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "50", callback_data: "amt:50" }, { text: "100", callback_data: "amt:100" }],
              [{ text: "250", callback_data: "amt:250" }, { text: "500", callback_data: "amt:500" }],
              [{ text: "❌ Cancel", callback_data: "cancel" }]
            ]
          }
        }).catch(err => console.error("Telegram API Error:", err));
        break;

      case 'AWAITING_AMOUNT':
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0 || amount > 1000000) {
          bot.sendMessage(chatId, "Please enter a valid amount between 0 and 1,000,000:").catch(err => console.error("Telegram API Error:", err));
          return;
        }
        session.dealData.amount = amount;
        session.step = 'AWAITING_DEADLINE_DAYS';
        bot.sendMessage(chatId, "Got it. How many days until the deadline?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "3 days", callback_data: "days:3" }, { text: "7 days", callback_data: "days:7" }],
              [{ text: "14 days", callback_data: "days:14" }, { text: "30 days", callback_data: "days:30" }],
              [{ text: "❌ Cancel", callback_data: "cancel" }]
            ]
          }
        }).catch(err => console.error("Telegram API Error:", err));
        break;

      case 'AWAITING_DEADLINE_DAYS':
        const days = parseInt(text, 10);
        if (isNaN(days) || days < 1 || days > 365) {
          bot.sendMessage(chatId, "Please enter a valid number of days between 1 and 365:").catch(err => console.error("Telegram API Error:", err));
          return;
        }
        
        const dealId = `ESC-${Math.floor(1000 + Math.random() * 9000)}`;
        
        const queryParams = new URLSearchParams({
          title: session.dealData.title,
          amount: session.dealData.amount.toString(),
          token: 'USDC-Dev',
          status: 'Awaiting Funding'
        }).toString();

        const rawActionUrl = `${baseUrl}/deal/${dealId}?${queryParams}`;
        const ogImageUrl = `${baseUrl}/api/deal/${dealId}/og-image.png?${queryParams}`;

        bot.sendPhoto(chatId, ogImageUrl, {
          caption: "✅ Deal created! Share this deal link with your counterparty by forwarding this message, or by sending them the link below.",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔗 Open deal", url: rawActionUrl }],
              [{ text: "➕ New deal", callback_data: "nd" }, { text: "🏠 Menu", callback_data: "menu" }]
            ]
          }
        }).catch(err => {
          console.error("Failed to send photo in Telegram:", err);
          bot.sendMessage(chatId, "✅ Deal created!\n\nLink: " + rawActionUrl, {
            reply_markup: { 
              inline_keyboard: [
                [{ text: "🔗 Open deal", url: rawActionUrl }],
                [{ text: "➕ New deal", callback_data: "nd" }, { text: "🏠 Menu", callback_data: "menu" }]
              ] 
            }
          }).catch(err => console.error("Telegram API Error:", err));
        });

        conversations.delete(chatId);
        break;
    }
  });

  bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    bot.answerCallbackQuery(query.id).catch(err => console.error(err));

    if (data === 'menu') {
      showMenu(chatId);
      return;
    }

    if (data === 'nd') {
      startNewDeal(chatId);
      return;
    }

    if (data === 'cancel') {
      conversations.delete(chatId);
      showMenu(chatId);
      return;
    }

    if (data === 'demo') {
      sendDemoDeals(chatId);
      return;
    }

    if (data === 'how') {
      sendHowItWorks(chatId);
      return;
    }

    if (data.startsWith('dl:')) {
      const dealId = data.substring(3);
      sendDealCard(chatId, dealId);
      return;
    }

    const session = conversations.get(chatId);
    if (!session) {
      bot.sendMessage(chatId, "Session expired, start again.").catch(err => console.error(err));
      showMenu(chatId);
      return;
    }

    if (data.startsWith('amt:') && session.step === 'AWAITING_AMOUNT') {
      const amount = parseFloat(data.substring(4));
      if (!isNaN(amount) && amount > 0 && amount <= 1000000) {
        session.dealData.amount = amount;
        session.step = 'AWAITING_DEADLINE_DAYS';
        bot.sendMessage(chatId, "Got it. How many days until the deadline?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "3 days", callback_data: "days:3" }, { text: "7 days", callback_data: "days:7" }],
              [{ text: "14 days", callback_data: "days:14" }, { text: "30 days", callback_data: "days:30" }],
              [{ text: "❌ Cancel", callback_data: "cancel" }]
            ]
          }
        }).catch(err => console.error("Telegram API Error:", err));
      }
      return;
    }

    if (data.startsWith('days:') && session.step === 'AWAITING_DEADLINE_DAYS') {
      const days = parseInt(data.substring(5), 10);
      if (!isNaN(days) && days >= 1 && days <= 365) {
        const dealId = `ESC-${Math.floor(1000 + Math.random() * 9000)}`;
        
        const queryParams = new URLSearchParams({
          title: session.dealData.title,
          amount: session.dealData.amount.toString(),
          token: 'USDC-Dev',
          status: 'Awaiting Funding'
        }).toString();

        const rawActionUrl = `${baseUrl}/deal/${dealId}?${queryParams}`;
        const ogImageUrl = `${baseUrl}/api/deal/${dealId}/og-image.png?${queryParams}`;

        bot.sendPhoto(chatId, ogImageUrl, {
          caption: "✅ Deal created! Share this deal link with your counterparty by forwarding this message, or by sending them the link below.",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔗 Open deal", url: rawActionUrl }],
              [{ text: "➕ New deal", callback_data: "nd" }, { text: "🏠 Menu", callback_data: "menu" }]
            ]
          }
        }).catch(err => {
          console.error("Failed to send photo in Telegram:", err);
          bot.sendMessage(chatId, "✅ Deal created!\n\nLink: " + rawActionUrl, {
            reply_markup: { 
              inline_keyboard: [
                [{ text: "🔗 Open deal", url: rawActionUrl }],
                [{ text: "➕ New deal", callback_data: "nd" }, { text: "🏠 Menu", callback_data: "menu" }]
              ] 
            }
          }).catch(err => console.error("Telegram API Error:", err));
        });

        conversations.delete(chatId);
      }
      return;
    }
  });
}

export { setupBot };
