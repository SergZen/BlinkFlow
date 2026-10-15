# BlinkFlow

**Trust layer for deals made in chat.** A freelancer and a client agree on a task in Telegram or X. The client creates the deal and funds a non-custodial escrow on Solana, then sends one link back to the chat. The money is released when the work is accepted. If the customer rejects the delivery, an arbiter answers one question: was the agreed work done?

**Status: Solana devnet, test tokens only. Not audited. Not on mainnet.**

- Live app: https://blinkflow-frontend-production.up.railway.app/
- Pitch video: https://youtu.be/M6uh-EREFq8
- Demo video: https://youtu.be/W6kXnhmxcLs
- X: https://x.com/blinkflowapp
- Telegram bot: [@BlinkFlowApp_bot](https://t.me/BlinkFlowApp_bot)
- Escrow program (devnet): [`3vJWWymQCHkntbWTgPfL2ujrquLrYHLneqzebr7bnkik`](https://explorer.solana.com/address/3vJWWymQCHkntbWTgPfL2ujrquLrYHLneqzebr7bnkik?cluster=devnet)

## Try it in 2 minutes
1. Open the live app with Phantom set to **Devnet**.
2. Press **Get USDC/SOL** (TEST MODE) to receive test tokens.
3. Create a deal (task, amount, success criteria), fund it, and copy the deal link.
4. Open the link with a second wallet as the freelancer: apply, accept, deliver. Confirm with the first wallet to release the payment.

Dispute resolution needs the arbiter wallet, so it is shown only in the demo video.

## How it works
1. The customer creates a deal on the website and signs with a wallet. The funds move into an escrow owned by the program.
2. The deal link goes back into the chat and opens as a preview card.
3. The freelancer applies; the customer picks one; the freelancer accepts, delivers, and the customer confirms. One confirmation pays the freelancer.
4. The customer can reject the delivery, which opens a dispute. The arbiter wallet recorded in the deal decides payout or refund; the program can send the funds only to the two parties of the deal and the fee accounts.
5. The Telegram bot (`/newdeal`) collects the title, amount and days and opens the website form pre-filled. It never creates deals itself or touches funds.

## What works today (devnet)
- Wallet connect (Phantom); create and fund a deal (SPL test USDC); apply, assign, accept, deliver, confirm, cancel.
- Dispute and arbiter resolution in both directions (payout to the freelancer or refund to the customer).
- Hashes of the task requirements and of the delivery note are recorded on-chain.
- On-chain log of each step with Explorer links. On-chain reputation attributes (Metaplex Core soulbound token) are updated by the program; the Profile page UI is next.
- Short deal links with preview cards for Telegram, X and Facebook.

## Devnet activity
Test deals on devnet reached every final state: completed (2), cancelled (1), and resolved by the arbiter in both directions: payout to the freelancer and refund to the customer (2).

## Status and roadmap
- Fees are set at protocol initialization and copied into each deal at creation. On devnet: 0.5% protocol fee on release; in a dispute 5% arbitration fee goes to the arbiter, and both fees come out of the winner's payout.
- The arbiter wallet is recorded in each deal at creation; today it is a team wallet. Evidence is exchanged outside the platform; the arbiter's decision is submitted on-chain as a payout or a refund.
- Disputes are opened by the customer rejecting a delivery. First protocol changes: contractor-opened disputes and a timer-based release that does not need the customer's signature.
- The program is upgradeable; a multisig is planned before mainnet. Not audited; devnet and test tokens only.
- Both dispute outcomes were tested on devnet by hand; automated contract tests are next. The program ID and upgrade authority were checked against the deployment.
- Telegram bot: entry point; notifications, deal list and wallet linking are planned.
- Next: evidence for disputes, an arbiter network, task criteria and delivery checks.
- We interviewed five freelancers; four of five raised the conditions under which the money gets released.

## Repository
- `solana-program/`: Anchor 0.32 (Rust) escrow program.
- `app/`: React + TypeScript + Vite web app (wallet-adapter).
- `app/server/`: Node.js/Express: short links, preview cards, Telegram bot.

The repository was prepared on Aug 30 and Sept 1 with an empty scaffold; all working code was written after Sept 14, 2026: the web app from Sept 25, the Anchor program added Oct 10.

## Run locally
```bash
# web app
cd app
cp .env.example .env     # RPC URLs, token mint
pnpm install
pnpm dev

# server and bot
cd app/server
cp .env.example .env     # FRONTEND_URL, PUBLIC_BASE_URL, TELEGRAM_BOT_TOKEN
npm install
node --env-file=.env index.js

# program
cd solana-program
anchor build
```

## Team
Two builders. One built the product, the web app, the server and the Telegram bot; the other developed the Anchor program locally and added it to the repository on Oct 10. Parts of the web app and the bot were written with AI coding assistants (Claude, Gemini).
