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

function sanitizeTelegramError(msg) {
  return String(msg || '').replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***');
}

function setupBot(app, baseUrl, frontendUrl) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN not found. Telegram bot webhook will not be initialized.");
    return;
  }

  // Create a bot that uses 'webhook'
  const bot = new TelegramBot(token, { webHook: true });

  if (typeof baseUrl === 'string' && baseUrl.startsWith('https://')) {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const webhookUrl = `${cleanBaseUrl}/webhook`;
    bot.setWebHook(webhookUrl)
      .then(() => {
        console.log(`Telegram webhook set to ${webhookUrl}`);
      })
      .catch(err => {
        console.error('Failed to set Telegram webhook:', sanitizeTelegramError(err?.message || err));
      });
  } else {
    console.warn(`Skipping Telegram webhook registration: baseUrl is not https (${baseUrl})`);
  }

  // Webhook endpoint
  app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  try {
    bot.setMyCommands([
      { command: 'start', description: 'Main menu' },
      { command: 'newdeal', description: 'Create a deal' },
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
            [{ text: "➕ New deal", callback_data: "nd" }],
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
          ["➕ New deal"],
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

  const sendHowItWorks = (chatId) => {
    bot.sendMessage(
      chatId,
      "ℹ️ *How it works*\n" +
      "1. Either side creates the deal on the BlinkFlow site. A customer locks USDC in escrow right away. A contractor either proposes the deal to a specific customer wallet, or prepares it and sends the customer a link; the customer reviews it and locks USDC in escrow.\n" +
      "2. Share the deal link in any chat or social network.\n" +
      "3. Customer-created deal: contractors open the link and apply, the customer picks one. Contractor-created deal: the customer opens the link and funds the escrow.\n" +
      "4. The contractor does the work and marks it finished.\n" +
      "5. The customer approves and the payment is released. If there is a disagreement, an arbiter decides." +
      (frontendUrl ? `\n\nFull guide: ${frontendUrl}/guide` : ''),
      { parse_mode: 'Markdown' }
    ).catch(err => console.error("Telegram API Error:", err));
  };

  const finishNewDeal = (chatId, session, days) => {
    const role = session.dealData.role || 'customer';
    let targetUrl;
    try {
      const u = new URL(frontendUrl);
      u.searchParams.set('new', '1');
      u.searchParams.set('role', role);
      u.searchParams.set('title', session.dealData.title);
      u.searchParams.set('amount', session.dealData.amount.toString());
      u.searchParams.set('days', days.toString());
      targetUrl = u.toString();
    } catch {
      const cleanUrl = (frontendUrl || '').replace(/\/+$/, '');
      const queryParams = new URLSearchParams({
        new: '1',
        role,
        title: session.dealData.title,
        amount: session.dealData.amount.toString(),
        days: days.toString()
      }).toString();
      targetUrl = `${cleanUrl}/?${queryParams}`;
    }

    const roleLabel = role === 'contractor' ? 'Contractor' : 'Customer';
    const roleText = role === 'contractor'
      ? `Ready to finalize? Click below to prepare the deal on the website. You can propose it to a specific customer wallet, or get a link to send to your customer.\n\n` +
        `After you prepare the deal, send the deal link from the website to the customer. The customer funds the escrow from that page.`
      : `Ready to finalize? Click below to connect your wallet and lock funds in escrow on the website.\n\n` +
        `After you create the deal on the website, share the deal link from there, not this message.`;

    const buttonText = role === 'contractor' ? "Prepare deal" : "Create & fund on website";

    const summary =
      `📋 *Deal Summary*\n\n` +
      `• *Title:* ${escapeMarkdown(session.dealData.title)}\n` +
      `• *Your role:* ${roleLabel}\n` +
      `• *Amount:* ${session.dealData.amount} USDC\n` +
      `• *Deadline:* ${days} day${days === 1 ? '' : 's'}\n\n` +
      roleText;

    bot.sendMessage(chatId, summary, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: buttonText, url: targetUrl }],
          [{ text: "➕ New deal", callback_data: "nd" }, { text: "🏠 Menu", callback_data: "menu" }]
        ]
      }
    }).catch(err => console.error("Telegram API Error:", err));

    conversations.delete(chatId);
  };

  const askRole = (chatId) => {
    bot.sendMessage(chatId, "Who are you in this deal?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🧾 I'm the customer (I pay)", callback_data: "role:customer" }],
          [{ text: "🛠 I'm the contractor (I do the work)", callback_data: "role:contractor" }],
          [{ text: "❌ Cancel", callback_data: "cancel" }]
        ]
      }
    }).catch(err => console.error("Telegram API Error:", err));
  };

  const startNewDeal = (chatId) => {
    conversations.set(chatId, {
      step: 'AWAITING_ROLE',
      dealData: {},
      lastActive: Date.now()
    });

    askRole(chatId);
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
      case 'AWAITING_ROLE':
        bot.sendMessage(chatId, "Please choose one of the buttons above.").catch(err => console.error("Telegram API Error:", err));
        askRole(chatId);
        break;

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

        finishNewDeal(chatId, session, days);
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

    if (data === 'how') {
      sendHowItWorks(chatId);
      return;
    }

    const session = conversations.get(chatId);
    if (!session) {
      bot.sendMessage(chatId, "Session expired, start again.").catch(err => console.error(err));
      showMenu(chatId);
      return;
    }

    if (data.startsWith('role:') && session.step === 'AWAITING_ROLE') {
      const selectedRole = data.substring(5);
      if (selectedRole === 'customer' || selectedRole === 'contractor') {
        session.dealData.role = selectedRole;
        session.step = 'AWAITING_TITLE';
        bot.sendMessage(chatId, "Let's create a new deal! What is the title of the deal?", {
          reply_markup: { inline_keyboard: [[ { text: "❌ Cancel", callback_data: "cancel" } ]] }
        }).catch(err => console.error("Telegram API Error:", err));
      }
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
        finishNewDeal(chatId, session, days);
      }
      return;
    }
  });
}

export { setupBot };
