import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import escapeHtml from 'escape-html';
import { Connection, PublicKey, SystemProgram, Transaction, clusterApiUrl } from '@solana/web3.js';
import { setupBot } from './bot.js';

// Connection to devnet
const connection = new Connection(process.env.SOLANA_RPC_URL_DEVNET || clusterApiUrl('devnet'), 'confirmed');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());

const fontRegular = fs.readFileSync(path.join(__dirname, 'Roboto-Regular.ttf'));
const fontBold = fs.readFileSync(path.join(__dirname, 'Roboto-Bold.ttf'));
const logoData = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'blinkFlow.jpg')).toString('base64');
const dealsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'deals.json'), 'utf-8'));

// Setup Telegram Bot
const defaultBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
setupBot(app, defaultBaseUrl, frontendUrl, dealsData);

// Solana Actions require specific CORS headers
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Content-Encoding', 'Accept-Encoding'],
  exposedHeaders: ['X-Action-Version', 'X-Blockchain-Ids']
};

app.use(cors(corsOptions));
app.use(express.json());

// Add required Solana Actions headers
app.use((req, res, next) => {
  res.setHeader('X-Action-Version', '2.1.3'); // Current spec version
  res.setHeader('X-Blockchain-Ids', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'); // Solana mainnet
  next();
});

// Solana Actions root metadata
app.get('/actions.json', (req, res) => {
  res.json({
    rules: [
      {
        pathPattern: "/deal/*",
        apiPath: "/api/deal/*"
      }
    ]
  });
});

// Serve the static logo for Telegram/Twitter previews
app.get('/logo.jpg', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/logo.jpg'));
});

// Serve the BlinkFlow logo for Blink previews
app.get('/blinkFlow.jpg', (req, res) => {
  res.sendFile(path.join(__dirname, 'blinkFlow.jpg'));
});

function detectNetwork(ua) {
  if (!ua) return 'default';
  if (/telegrambot/i.test(ua)) return 'telegram';
  if (/twitterbot/i.test(ua)) return 'twitter';
  if (/facebookexternalhit|facebot/i.test(ua)) return 'facebook';
  if (/linkedinbot/i.test(ua)) return 'linkedin';
  if (/discordbot/i.test(ua)) return 'discord';
  if (/whatsapp/i.test(ua)) return 'whatsapp';
  if (/slackbot/i.test(ua)) return 'slack';
  return 'default';
}

const networkProfiles = {
  telegram: { title: false, description: false, imageSize: false },
  twitter: { title: true, description: false, imageSize: true },
  facebook: { title: true, description: false, imageSize: true },
  linkedin: { title: true, description: false, imageSize: true },
  discord: { title: true, description: false, imageSize: true },
  whatsapp: { title: true, description: false, imageSize: true },
  slack: { title: true, description: false, imageSize: true },
  default: { title: true, description: false, imageSize: true }
};

function buildMetaTags(profile, { safeTitle, safeId, imageUrl, baseUrl }) {
  let tags = `
    <!-- OpenGraph tags for unfurling -->
    <meta property="og:site_name" content="BlinkFlow">
    <meta property="og:type" content="website">
    <meta property="og:image" content="${imageUrl}">
    
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${imageUrl}">

    <!-- CRITICAL: The Solana Action Tag -->
    <meta name="solana:action" content="${baseUrl}/api/deal/${safeId}">`;

  if (profile.title) {
    tags += `
    <meta property="og:title" content="${safeTitle}">
    <meta name="twitter:title" content="${safeTitle}">`;
  }
  
  if (profile.imageSize) {
    tags += `
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:type" content="image/png">`;
  }
  
  return tags;
}

app.get('/deal/:id', (req, res) => {
  const { id } = req.params;
  const ua = req.get('user-agent') || '';
  const network = detectNetwork(ua);
  
  if (network === 'default' && /bot|crawler|spider|preview/i.test(ua)) {
    console.log(`[Deal ${id}] Crawler detected (default profile): ${ua.substring(0, 80)}`);
  } else {
    console.log(`[Deal ${id}] Detected network: ${network}, UA: ${ua.substring(0, 80)}`);
  }
  
  res.setHeader('Vary', 'User-Agent');

  const protocol = req.hostname === 'localhost' ? 'http' : 'https';
  const baseUrl = `${protocol}://${req.get('host')}`;
  
  const queryString = Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query).toString() : '';
  const foundDeal = dealsData.find(d => d.id === id);
  const title = foundDeal ? foundDeal.title : (req.query.title ? req.query.title : `BlinkFlow Deal: ${id}`);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const localAppUrl = `${frontendUrl}/deal/${id}${queryString}`;
  const safeId = escapeHtml(id);
  const safeQueryString = escapeHtml(queryString);
  const titleParam = req.query.title ? req.query.title : 'BlinkFlow';
  const safeTitle = escapeHtml(titleParam);
  const imageUrl = `${baseUrl}/api/deal/${safeId}/og-image.png${safeQueryString}`;
  
  const profile = networkProfiles[network] || networkProfiles.default;
  const metaTags = buildMetaTags(profile, { safeTitle, safeId, imageUrl, baseUrl });
  
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BlinkFlow</title>
    ${metaTags}
    
    <style>
        body { font-family: system-ui, sans-serif; background: #030712; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
        .card { background: #111827; padding: 2.5rem; border-radius: 1rem; border: 1px solid #1f2937; max-width: 400px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
        h1 { margin-top: 0; color: #a855f7; font-size: 1.5rem; }
        p { color: #9ca3af; line-height: 1.5; margin-bottom: 1.5rem; }
        .btn { display: inline-block; background: #a855f7; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 500; transition: background 0.2s; }
        .btn:hover { background: #9333ea; }
        .spinner { border: 3px solid rgba(168, 85, 247, 0.2); border-top-color: #a855f7; border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="card">
        <div class="spinner"></div>
        <h1>Opening BlinkFlow...</h1>
        <p>Redirecting you to the secure payment page for deal <strong>${safeId}</strong>.</p>
        <a id="fallback-link" href="#" class="btn">Click here if not redirected</a>
    </div>

    <script>
        // dial.to is currently down globally (Vercel 503).
        // Redirecting to the local BlinkFlow React app instead.
        const localAppUrl = ${JSON.stringify(localAppUrl).replace(/</g, '\\u003c')};
        
        document.getElementById('fallback-link').href = localAppUrl;
        
        setTimeout(() => {
            window.location.href = localAppUrl;
        }, 1500); 
    </script>
</body>
</html>`);
});



const shortlinksPath = process.env.RAILWAY_ENVIRONMENT ? '/data/shortlinks.json' : path.join(__dirname, 'shortlinks.json');
let shortLinks = {};
try {
  shortLinks = JSON.parse(fs.readFileSync(shortlinksPath, 'utf-8'));
} catch (e) {
  shortLinks = {};
}

function isAllowedUrl(urlString) {
  try {
    const parsedUrl = new URL(urlString);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
    
    const allowedOrigins = [
      new URL(frontendUrl).origin,
      new URL(publicBaseUrl).origin
    ];
    
    return allowedOrigins.includes(parsedUrl.origin);
  } catch (e) {
    return false;
  }
}

app.get('/api/shorten', (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing or invalid url parameter' });
  
  if (url.length > 2000) {
    return res.status(400).json({ error: 'URL too long' });
  }

  if (!isAllowedUrl(url)) {
    return res.status(400).json({ error: 'URL origin not allowed for shortening' });
  }

  const protocol = req.hostname === 'localhost' ? 'http' : 'https';
  const baseUrl = `${protocol}://${req.get('host')}`;

  // De-duplicate: check if url already shortened
  for (const [existingCode, existingUrl] of Object.entries(shortLinks)) {
    if (existingUrl === url) {
      return res.json({ shortUrl: `${baseUrl}/s/${existingCode}`, shortened: true });
    }
  }

  if (Object.keys(shortLinks).length >= 5000) {
    return res.status(400).json({ error: 'Shortlink database full' });
  }
  
  try {
    let code;
    do {
      code = crypto.randomBytes(4).toString('hex').slice(0, 6);
    } while (shortLinks[code]);
    
    shortLinks[code] = url;
    fs.writeFileSync(shortlinksPath, JSON.stringify(shortLinks, null, 2));
    
    const shortUrl = `${baseUrl}/s/${code}`;
    return res.json({ shortUrl, shortened: true });
  } catch (error) {
    console.error('Local shortener error:', error);
    return res.json({ shortUrl: url, shortened: false });
  }
});

app.get('/s/:code', (req, res) => {
  const { code } = req.params;
  const targetUrl = shortLinks[code];
  if (targetUrl && isAllowedUrl(targetUrl)) {
    res.redirect(301, targetUrl);
  } else {
    res.status(404).send('Short URL not found, expired, or invalid');
  }
});

app.get('/api/deal/:id/og-image.png', async (req, res) => {
  try {
    const { id } = req.params;
    const foundDeal = dealsData.find(d => d.id === id);
    
    const baseTitle = foundDeal ? foundDeal.title : 'Escrow Deal';
    const baseAmount = foundDeal ? foundDeal.amount.toString() : '';
    const baseStatus = foundDeal ? foundDeal.status : 'Pending';
    const baseCustomer = foundDeal ? foundDeal.customer : '';
    const baseContractor = foundDeal ? (foundDeal.contractor || '') : '';

    const title = req.query.title || baseTitle;
    const amount = req.query.amount || baseAmount;
    const status = req.query.status || baseStatus;
    const customerWallet = req.query.customerWallet || baseCustomer;
    const contractorWallet = req.query.contractorWallet || baseContractor;

    const shorten = (addr) => addr && addr.length > 8 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;

    let walletText = null;
    if (customerWallet && contractorWallet) {
      walletText = `Customer: ${shorten(customerWallet)}  ->  Contractor: ${shorten(contractorWallet)}`;
    } else if (customerWallet) {
      walletText = `Customer: ${shorten(customerWallet)}`;
    } else if (contractorWallet) {
      walletText = `Contractor: ${shorten(contractorWallet)}`;
    }

    const svg = await satori(
      {
        type: 'div',
        props: {
          style: {
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundImage: 'linear-gradient(135deg, #0F172A 0%, #020617 100%)',
            padding: '80px 80px 115px',
            fontFamily: 'Roboto',
          },
          children: [
            // Top row
            {
              type: 'div',
              props: {
                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', alignItems: 'center', gap: '20px' },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              width: '140px', height: '140px', borderRadius: '50%', overflow: 'hidden', display: 'flex',
                              border: '2px solid rgba(255,255,255,0.15)'
                            },
                            children: [{ type: 'img', props: { src: logoData, style: { width: '100%', height: '100%', objectFit: 'cover' } } }]
                          }
                        },
                        {
                          type: 'span',
                          props: { 
                            style: { 
                              fontSize: '70px', color: '#e9d5ff', fontWeight: 700, 
                              letterSpacing: '4px', textShadow: '0 0 20px rgba(168, 85, 247, 0.6)'
                            }, 
                            children: 'BlinkFlow' 
                          }
                        }
                      ]
                    }
                  },
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex', alignItems: 'center', padding: '16px 32px', borderRadius: '40px',
                        border: '2px solid rgba(255,255,255,0.15)',
                        color: '#fff', fontSize: '32px', fontWeight: 700,
                      },
                      children: [
                        { type: 'div', props: { style: { marginRight: '16px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#fff' } } },
                        status
                      ]
                    }
                  }
                ]
              }
            },
            // Middle
            {
              type: 'div',
              props: {
                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '40px' },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', flexDirection: 'column', maxWidth: '65%' },
                      children: [
                        { type: 'span', props: { style: { color: '#94a3b8', fontSize: '28px', fontWeight: 700, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '2px' }, children: 'Escrow Deal' } },
                        { type: 'span', props: { style: { fontSize: '64px', color: '#f8fafc', fontWeight: 700, lineHeight: 1.1 }, children: title } },
                        { type: 'span', props: { style: { fontSize: '32px', color: '#64748b', marginTop: '16px' }, children: `ID: ${id}` } }
                      ]
                    }
                  },
                  amount ? {
                    type: 'div',
                    props: {
                      style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
                      children: [
                        { type: 'span', props: { style: { fontSize: '32px', color: '#94a3b8', marginBottom: '8px' }, children: 'Amount' } },
                        { type: 'span', props: { style: { fontSize: '80px', color: '#38bdf8', fontWeight: 700, lineHeight: 1 }, children: amount } },
                        { type: 'span', props: { style: { fontSize: '36px', color: '#e0f2fe', fontWeight: 400, marginTop: '8px' }, children: 'USDC' } }
                      ]
                    }
                  } : null
                ].filter(Boolean)
              }
            },
            // Bottom
            {
              type: 'div',
              props: {
                style: { display: 'flex', justifyContent: 'center', width: '100%', borderTop: '2px solid rgba(255,255,255,0.1)', paddingTop: '32px' },
                children: [
                  walletText ? { type: 'span', props: { style: { fontSize: '28px', color: '#94a3b8', fontFamily: 'monospace' }, children: walletText } } : null
                ].filter(Boolean)
              }
            }
          ],
        },
      },
      {
        width: 1200,
        height: 630,
        fonts: [
          { name: 'Roboto', data: fontRegular, weight: 400, style: 'normal' },
          { name: 'Roboto', data: fontBold, weight: 700, style: 'normal' },
        ],
      }
    );

    const resvg = new Resvg(svg, {
      background: 'rgba(3, 7, 18, 1)',
      fitTo: { mode: 'width', value: 1200 },
    });
    
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(pngBuffer);
  } catch (error) {
    console.error('OG Image generation error:', error);
    res.sendFile(path.join(__dirname, 'blinkFlow.jpg'));
  }
});

app.get('/api/deal/:id', (req, res) => {
  const { id } = req.params;
  const foundDeal = dealsData.find(d => d.id === id);
  const title = foundDeal ? foundDeal.title : (req.query.title || id);

  const protocol = req.hostname === 'localhost' ? 'http' : 'https';
  const baseUrl = `${protocol}://${req.get('host')}`;
  res.json({
    icon: `${baseUrl}/blinkFlow.jpg`,
    title: `Fund Escrow: ${title}`,
    description: "Deposit funds into the BlinkFlow escrow to start the deal.",
    label: "Fund Escrow",
    links: {
      actions: [
        {
          label: "Fund Escrow (USDC)",
          href: `/api/deal/${req.params.id}/tx`
        }
      ]
    }
  });
});

app.post('/api/deal/:id/tx', async (req, res) => {
  try {
    const { account } = req.body;
    if (!account) {
      return res.status(400).json({ error: "No account provided" });
    }

    const userPubkey = new PublicKey(account);

    // TODO: replace with real escrow instruction once Anchor program is deployed
    // For now, this is a mock transaction that transfers 0 SOL to the user themselves
    // so it's structurally valid for devnet without losing funds.
    const ix = SystemProgram.transfer({
      fromPubkey: userPubkey,
      toPubkey: userPubkey,
      lamports: 0,
    });

    const tx = new Transaction();
    tx.add(ix);
    tx.feePayer = userPubkey;
    
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    tx.recentBlockhash = blockhash;

    // Serialize unsigned transaction
    const serializedTx = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });

    res.json({
      transaction: serializedTx.toString('base64'),
      message: "Demo transaction: no funds were moved. The escrow contract is in development."
    });
  } catch (error) {
    console.error("Error creating transaction in /api/deal/:id/tx:", error);
    res.status(500).json({ error: "Internal server error building transaction" });
  }
});

app.options('*', cors(corsOptions));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`BlinkFlow mock action server running on port ${PORT}`);
});
