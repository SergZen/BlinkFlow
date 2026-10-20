export function friendlyError(e: unknown): string {
  const msg = (e as any)?.message || '';
  const name = (e as any)?.name || '';
  const code = (e as any)?.code !== undefined ? String((e as any).code) : '';
  const logsArr = (e as any)?.logs ?? (e as any)?.transactionLogs;
  const logs = Array.isArray(logsArr) ? logsArr.join(' ') : '';
  const str = typeof e === 'string' ? e : (e ? String(e) : '');

  const raw = [msg, name, code, logs, str].filter(Boolean).join(' ');
  const text = raw.toLowerCase();
  const logsLower = logs.toLowerCase();

  // a) user rejected the wallet popup: code 4001, or text contains "user rejected" / "rejected the request" / "user denied" / "declined"
  if (
    code === '4001' ||
    text.includes('user rejected') ||
    text.includes('rejected the request') ||
    text.includes('user denied') ||
    text.includes('declined')
  ) {
    return 'You cancelled the request in Phantom. Nothing was sent.';
  }

  // b) not enough SOL: text contains "insufficient lamports", "insufficient funds for fee", "attempt to debit an account but found no record of a prior credit"
  if (
    text.includes('insufficient lamports') ||
    text.includes('insufficient funds for fee') ||
    text.includes('attempt to debit an account but found no record of a prior credit')
  ) {
    return 'Not enough SOL to pay network fees. Get devnet SOL with the button in the header, then try again.';
  }

  // c) not enough USDC / token account missing: text contains "custom program error: 0x1" and "token" in logs, or "insufficient funds" together with "token", or "accountnotinitialized" / "account not initialized" / "could not find account"
  const isCustom0x1WithToken = text.includes('custom program error: 0x1') && (logsLower.includes('token') || text.includes('token'));
  const isInsufficientFundsWithToken = text.includes('insufficient funds') && text.includes('token');
  const isAccountMissing =
    text.includes('accountnotinitialized') ||
    text.includes('account not initialized') ||
    text.includes('could not find account');

  if (isAccountMissing) {
    return 'A required USDC account does not exist yet. If it is yours, use "Get USDC-Dev" in the header. Otherwise ask the other person to get USDC first.';
  }

  if (isCustom0x1WithToken || isInsufficientFundsWithToken) {
    return 'Not enough USDC-Dev on this wallet. Use "Get USDC-Dev" in the header and try again.';
  }

  // d) expired blockhash / slow network: "blockhash not found", "block height exceeded", "transaction was not confirmed", "timed out"
  if (
    text.includes('blockhash not found') ||
    text.includes('block height exceeded') ||
    text.includes('transaction was not confirmed') ||
    text.includes('timed out')
  ) {
    return 'The network was slow and the transaction was not confirmed. Please try again.';
  }

  // e) RPC rate limit: "429", "too many requests", "rate limit"
  if (text.includes('429') || text.includes('too many requests') || text.includes('rate limit')) {
    return 'The network is busy right now. Wait a few seconds and try again.';
  }

  // f) invalid address: "non-base58", "invalid public key", "invalid contractor wallet"
  if (
    text.includes('non-base58') ||
    text.includes('invalid public key') ||
    text.includes('invalid contractor wallet')
  ) {
    return 'This does not look like a valid wallet address.';
  }

  // g) contract errors, found in logs as "Error Code: <Name>" or in the message: map
  const contractErrors: Record<string, string> = {
    unauthorized: 'This wallet is not allowed to do this action. Switch Phantom to the right account.',
    invalidtaskstatus: 'The deal is not in the right state for this action. Refresh the page and check its status.',
    contractormustbepending: 'The customer has not picked this wallet as the contractor.',
    protocolpaused: 'The protocol is paused by the admin. Try again later.',
    trustauthorityrolemismatch: 'The arbiter wallet cannot take part in this deal as a contractor.',
    contractormustbeempty: 'This deal already has a contractor.',
    invaliddeadline: 'The deadline must be between 1 and 365 days from now.',
    invalidmint: 'This deal uses a token the protocol does not support.',
    selfdealingnotallowed: 'The customer and the contractor must be different wallets.',
  };

  for (const [key, cleanMsg] of Object.entries(contractErrors)) {
    if (text.includes(`error code: ${key}`) || text.includes(key)) {
      return cleanMsg;
    }
  }

  // h) our own already-clean messages (they start with "Switch Phantom", "The contractor", "The customer", "This deal", "Connect Phantom", "Invalid", "The transaction") → return e.message unchanged.
  const cleanPrefixes = [
    'Switch Phantom',
    'The contractor',
    'The customer',
    'This deal',
    'Connect Phantom',
    'Invalid',
    'The transaction',
    'The deadline',
    'You cannot',
    'A required USDC account',
  ];
  const origMsg = (e as any)?.message || (typeof e === 'string' ? e : '');
  if (typeof origMsg === 'string' && cleanPrefixes.some((p) => origMsg.startsWith(p))) {
    return origMsg;
  }

  // i) fallback → "The transaction failed. Please try again." (do NOT append raw technical text; instead console.error the original error so it stays debuggable).
  console.error('[friendlyError fallback]', e);
  return 'The transaction failed. Please try again.';
}

export function isTechnicalMessage(msg: string): boolean {
  if (!msg || msg.trim().length === 0 || msg.length > 200) return true;
  const lower = msg.toLowerCase();
  return (
    lower.includes('0x') ||
    lower.includes('custom program error') ||
    lower.includes('error code') ||
    lower.includes('simulation failed') ||
    lower.includes('failed to send') ||
    lower.includes('failed to get') ||
    lower.includes('fetch failed') ||
    msg.includes('{')
  );
}

export function getActionErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message && !isTechnicalMessage(err.message)) {
    return err.message;
  }
  return friendlyError(err);
}
