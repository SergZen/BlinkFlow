import express from 'express';
import cors from 'cors';

const app = express();

// Solana Actions require specific CORS headers
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Content-Encoding', 'Accept-Encoding'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Solana Actions root metadata
app.get('/actions.json', (req, res) => {
  res.json({
    rules: [
      {
        pathPattern: "/api/deal/*",
        apiPath: "/api/deal/*"
      }
    ]
  });
});


app.get('/api/deal/:id', (req, res) => {
  res.json({
    // TODO: replace with real hosted BlinkFlow logo URL
    icon: "https://placehold.co/300x300/png?text=BlinkFlow",
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
