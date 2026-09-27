import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const fontRegular = fs.readFileSync(path.join(__dirname, 'Roboto-Regular.ttf'));
const fontBold = fs.readFileSync(path.join(__dirname, 'Roboto-Bold.ttf'));
const logoData = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'blinkFlow.jpg')).toString('base64');

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

app.get('/deal/:id', (req, res) => {
  const { id } = req.params;
  const protocol = req.hostname === 'localhost' ? 'http' : 'https';
  const baseUrl = `${protocol}://${req.get('host')}`;
  
  const queryString = Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query).toString() : '';
  const title = req.query.title ? req.query.title : `BlinkFlow Deal: ${id}`;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const localAppUrl = `${frontendUrl}/deal/${id}`;
  
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BlinkFlow Escrow: ${id}</title>
    
    <!-- OpenGraph tags for Telegram & Twitter Unfurling -->
    <meta property="og:site_name" content="BlinkFlow">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="Secure non-custodial escrow deal on Solana.">
    <meta property="og:image" content="${baseUrl}/api/deal/${id}/og-image.png${queryString}">
    <meta property="og:type" content="website">
    
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="Secure non-custodial escrow deal on Solana.">
    <meta name="twitter:image" content="${baseUrl}/api/deal/${id}/og-image.png${queryString}">

    <!-- CRITICAL: The Solana Action Tag -->
    <meta name="solana:action" content="${baseUrl}/api/deal/${id}">
    
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
        <p>Redirecting you to the secure payment page for deal <strong>${id}</strong>.</p>
        <a id="fallback-link" href="#" class="btn">Click here if not redirected</a>
    </div>

    <script>
        // dial.to is currently down globally (Vercel 503).
        // Redirecting to the local BlinkFlow React app instead.
        const localAppUrl = "${localAppUrl}";
        
        document.getElementById('fallback-link').href = localAppUrl;
        
        setTimeout(() => {
            window.location.href = localAppUrl;
        }, 1500); 
    </script>
</body>
</html>`);
});



app.get('/api/deal/:id/og-image.png', async (req, res) => {
  try {
    const { id } = req.params;
    const { title = 'Escrow Deal', amount = '', status = 'Pending', customerWallet = '', contractorWallet = '' } = req.query;

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
            backgroundColor: '#030712',
            padding: '80px',
            fontFamily: 'Roboto',
          },
          children: [
            // Top row: Logo + BlinkFlow (left), Status Badge (right)
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
                          type: 'img',
                          props: {
                            src: logoData,
                            style: { width: '110px', height: '110px', borderRadius: '50%' },
                          },
                        },
                        {
                          type: 'span',
                          props: {
                            style: { fontSize: '60px', color: '#fff', fontWeight: 700 },
                            children: 'BlinkFlow',
                          },
                        },
                      ],
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '12px 24px',
                        borderRadius: '30px',
                        backgroundColor: 'rgba(168, 85, 247, 0.1)',
                        border: '2px solid rgba(168, 85, 247, 0.5)',
                        color: '#a855f7',
                        fontSize: '32px',
                        fontWeight: 700,
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: { 
                              marginRight: '16px', 
                              width: '16px', 
                              height: '16px', 
                              borderRadius: '50%', 
                              backgroundColor: '#a855f7' 
                            },
                          },
                        },
                        status
                      ],
                    },
                  }
                ],
              },
            },
            
            // Middle: Title + ID (left) and Amount (right)
            {
              type: 'div',
              props: {
                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: amount ? '65%' : '100%' },
                      children: [
                        {
                          type: 'h1',
                          props: {
                            style: { 
                              fontSize: '64px', 
                              color: '#fff', 
                              margin: 0, 
                              fontWeight: 700,
                              lineHeight: 1.1,
                            },
                            children: title,
                          },
                        },
                        {
                          type: 'span',
                          props: {
                            style: { fontSize: '36px', color: '#6b7280', margin: 0 },
                            children: `ID: ${id}`,
                          },
                        },
                      ],
                    },
                  },
                  amount ? {
                    type: 'div',
                    props: {
                      style: { fontSize: '64px', color: '#a855f7', fontWeight: 700, whiteSpace: 'nowrap' },
                      children: `${amount} USDC`,
                    },
                  } : null,
                ].filter(Boolean),
              },
            },
            
            // Bottom
            {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', marginTop: '40px' },
                children: [
                  walletText ? {
                    type: 'div',
                    props: {
                      style: { fontSize: '32px', color: '#9ca3af', fontFamily: 'monospace' },
                      children: walletText,
                    },
                  } : null,
                  {
                    type: 'p',
                    props: {
                      style: { fontSize: '32px', color: '#6b7280', margin: 0 },
                      children: 'Secure non-custodial escrow on Solana',
                    },
                  }
                ].filter(Boolean),
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
    res.sendFile(path.join(__dirname, '../public/logo.jpg'));
  }
});

app.get('/api/deal/:id', (req, res) => {
  const protocol = req.hostname === 'localhost' ? 'http' : 'https';
  const baseUrl = `${protocol}://${req.get('host')}`;
  res.json({
    icon: `${baseUrl}/logo.jpg`,
    title: `Fund Escrow: ${req.params.id}`,
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

app.post('/api/deal/:id/tx', (req, res) => {
  // In a real blink, this returns the base64 encoded transaction and message
  res.json({
    transaction: "mock_base64_transaction_data",
    message: "Escrow funded successfully via Blink!"
  });
});

app.options('*', cors(corsOptions));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`BlinkFlow mock action server running on port ${PORT}`);
});
