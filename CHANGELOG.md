# Changelog

BlinkFlow is an escrow trust layer for deals made in chat: USDC escrow on Solana, soulbound reputation (SBT) and an arbiter.

**Current state:** Devnet only, test USDC, not audited, not on mainnet. The arbiter is a representative of the team.

`BF-NN` in commit titles is the number of a work item (a small, reviewed task). Every item is one commit. Contract commits are made by the contract author and are described by what they change.

## 2026-10-20

- **BF-43** Site matches contract `e6d9645`: the customer's USDC account is passed and checked when a contractor opens a deal, deadlines are limited to 1-365 days in forms and transactions, friendly texts for the new contract errors, one wallet cannot play both roles, USDC account checks before creating a deal and before Approve. (`b3abc95`)

## 2026-10-18 (contract)

- The deal mint must equal the protocol mint, the customer and the contractor must be different wallets, and the deadline is limited to 1-365 days when a customer creates a deal. (`e6d9645`)
- A contractor-created deal requires the customer's USDC token account. (`2cf3b94`)

## 2026-10-17

Site:
- **BF-41** Several stages in Create Deal: the deal and up to 5 stages in one transaction. (`73107c5`)
- **BF-40** The bot asks for the role, the website opens the create form in that role. (`664be27`)
- **BF-39a / BF-39** Add Task form matches Create Deal, requirements file for added tasks, USDC warning before funding, toasts for every wallet action, safe amount fields, rent deposit info. (`fda15fc`, `d964fc5`)
- **BF-38** A contractor opens a deal on-chain, the customer funds it. (`d72e2c4`)
- **BF-37** RPC failover across Devnet providers, honest UI when the network is down. (`92c3d6a`)
- **BF-36** Add tasks (milestones) on-chain, start and fund per task. (`b721b49`)
- **BF-35** On-chain actions for every task index, no silent mock fallback. (`7fc439a`)
- **BF-34** Profile shows the real on-chain reputation (SBT). (`5d8f653`)

Contract (stage 2): reputation counters, a contractor can withdraw an unpaid proposal, the rent of the deal vault returns to the creator's wallet when a deal is closed, and after the 14-day review period only the contractor signs the release. (`d740ad3`, `bcfd97b`, `0f73d74`)

## 2026-10-16

- **BF-33** Real Public Dispute Log and the real deal id in the share panel. (`a71a60b`)
- Contract: preparation for LiteSVM tests and small fixes. (`cacc087`, `2482350`)

## 2026-10-11 to 2026-10-15 (hackathon submission)

- Clean-up and documentation: README for the hackathon, demo video link, removed demo data and unused scaffolding, removed misleading "Demo data" badges on real deals. (`077d2b0`, `1a2d900`, `eca5e21`, `3fead1e`)
- **BF-26 to BF-31** Demo seed deals removed, the bot hands off to the website create form, links back to the dashboard on admin and arbiter pages. (`e86dd31`, `3069853`, `6d45c56`, `b90e348`, `2baacf8`)
- **BF-18 to BF-25** Actions shown only for the matching wallet, admin and arbiter pages with real `set_trust_authority` and `resolve_dispute`, dashboard counts only the connected wallet's deals. (`a52c2d4`, `2e139b1`, `37caf98`, `330ed83`, `fcd27f9`)
- **BF-08 to BF-17** Friendly error messages and USDC balance check, own Devnet RPC with retries and cache, transaction status check after a confirm timeout, priority fee and rebroadcast so transactions land on Devnet, faucet button and popup, bot texts aligned with the real flow. (`bc5aa40`, `888c93d`, `cc60820`, `deb9394`, `a1ec16c`, `28f4e20`)
- On-chain cancel and refund, open dispute (`complete_task_by_customer` with `approved = false`), requirements file with a SHA-256 fingerprint in the task hash and a Verify file check. (`d954ab7`, `cefdd60`, `2dc5e38`)
- Contractor applications (apply, choose, accept and start) and persistence of deals and applications on a Railway volume. (`c519aba`, `e56e1d5`, `d913b8c`, `68a7087`)
- Devnet mode on by default (set by environment variable). (`aa00d9e`, `83a6dea`)

## 2026-10-10

- The site is connected to the Devnet contract (`chainClient`) with server-side deal sync; the Solana program is added to the repository. (`fedaf6b`, `49ea72a`)
- Synchronisation: monotonic progress, the server is the source of truth after a reload, final state is pushed after every step. (`4d487bb`, `a0571d1`, `3db9f0c`)
- Cookie consent for Google Analytics, Terms and Privacy pages, About link, Telegram bot reply keyboard. (`062b65f`, `7a5386d`)
