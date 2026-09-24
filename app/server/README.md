# BlinkFlow Mock Server

This is a local mock backend for Solana Actions (Blinks). It serves metadata and transaction endpoints to simulate the Anchor program.

## Running the Server

1. Start the server locally:
```bash
npm start
```

2. Expose it to the internet for Dialect Inspector (`dial.to`) testing:
```bash
npx cloudflared tunnel --url http://localhost:3001
```
*(Cloudflare Tunnel is recommended because `localtunnel` is often down and `ngrok` requires an auth token. The command above will give you a temporary `.trycloudflare.com` domain.)*

The server exposes `GET /actions.json` and the Blink metadata endpoints.
